// 参考来源：用户提供的《校园网设备管理器》HTML（已粘贴的文本.txt）。
// 借鉴 online_list/logout 接口及设备选择、循环操作交互；当前账号校验、原生请求、取消与进度由本项目实现。
use super::*;
use tokio::sync::watch;
#[derive(Default)]
pub struct DeviceJobs {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
}
pub fn portal_json(body: &str) -> Result<Value, String> {
    let text = body.trim();
    let content = if text.starts_with('{') {
        text
    } else {
        let start = text.find('(').ok_or("校园网未返回有效数据")?;
        let end = text.rfind(')').ok_or("校园网未返回有效数据")?;
        &text[start + 1..end]
    };
    serde_json::from_str(content).map_err(|_| "校园网未返回有效数据".into())
}
pub fn normalize_devices(root: &Value) -> Result<Vec<Value>, String> {
    if string(&root["result"]) != "1" {
        return Err(if string(&root["msg"]).is_empty() {
            "设备查询失败，请在校园网内重试".into()
        } else {
            string(&root["msg"])
        });
    }
    Ok(root["list"].as_array().unwrap_or(&Vec::new()).iter().map(|d|{let mac=string(&d["online_mac"]);let ip=string(&d["online_ip"]);json!({"id":if mac.is_empty(){ip.clone()}else{mac.clone()},"name":if string(&d["dhcp_host"]).is_empty(){"未命名设备".into()}else{string(&d["dhcp_host"])},"ip":ip,"mac":mac,"since":string(&d["online_time"]),"state":"online"})}).collect())
}
async fn own_session(state: &CampusState, username: &str) -> Result<Session, String> {
    let session = get_session(state, username)?;
    let response = get(&session, &format!("{MIS}/home/"), None).await?;
    if is_login_url(response.url()) {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response.text().await.map_err(network_error)?;
    let profile = parsers::student(&body, username)?;
    if string(&profile["studentId"]) != username {
        return Err("校园账号不匹配，请重新登录".into());
    }
    Ok(session)
}
async fn devices(session: &Session) -> Result<Vec<Value>, String> {
    let response = session
        .client
        .get("https://login.bjtu.edu.cn:802/eportal/portal/online_list")
        .query(&[
            ("callback", "jsonpReturn"),
            ("user_account", session.username.as_str()),
        ])
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    normalize_devices(&portal_json(&response)?)
}
#[tauri::command]
pub async fn network_devices(
    username: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = own_session(&state, &username).await?;
    devices(&session).await
}
fn selected_devices(rows: &[Value], ids: &[String]) -> Vec<Value> {
    rows.iter()
        .filter(|d| ids.contains(&string(&d["id"])))
        .cloned()
        .collect()
}
fn report(
    app: &tauri::AppHandle,
    username: &str,
    job: &str,
    completed: usize,
    total: usize,
    device: Value,
    message: &str,
    state: &str,
) {
    let _=app.emit("campus-device-job",json!({"accountId":username,"jobId":job,"completed":completed,"total":total,"device":device,"message":message,"state":state}));
}
#[tauri::command]
pub async fn logout_network_devices(
    username: String,
    device_ids: Vec<String>,
    rounds: u32,
    job_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    if device_ids.is_empty() {
        return Err("请先选择设备".into());
    }
    let rounds = rounds.clamp(1, 100);
    let session = own_session(&state, &username).await?;
    let rows = devices(&session).await?;
    let targets = selected_devices(&rows, &device_ids);
    if targets.len() != device_ids.len() {
        return Err("设备列表已变化，请刷新后重新选择".into());
    }
    let total = targets.len() * rounds as usize;
    let (tx, mut cancelled) = watch::channel(false);
    app.state::<DeviceJobs>()
        .active
        .lock()
        .unwrap()
        .insert(job_id.clone(), tx);
    report(
        &app,
        &username,
        &job_id,
        0,
        total,
        Value::Null,
        "正在下线所选设备",
        "running",
    );
    tauri::async_runtime::spawn(async move {
        let mut completed = 0;
        let mut aborted = false;
        for round in 0..rounds {
            let latest = if round == 0 {
                rows.clone()
            } else {
                match devices(&session).await {
                    Ok(rows) => rows,
                    Err(e) => {
                        report(
                            &app,
                            &username,
                            &job_id,
                            completed,
                            total,
                            Value::Null,
                            &e,
                            "failed",
                        );
                        aborted = true;
                        break;
                    }
                }
            };
            for target in &targets {
                if *cancelled.borrow() {
                    aborted = true;
                    break;
                }
                let device = latest.iter().find(|row| row["id"] == target["id"]);
                let result = if let Some(device) = device {
                    let request = session
                        .client
                        .get("https://login.bjtu.edu.cn:802/eportal/portal/logout")
                        .query(&[
                            ("callback", "dr1004"),
                            ("user_account", "drcom"),
                            ("user_password", "123"),
                            ("wlan_user_ip", string(&device["ip"]).as_str()),
                        ])
                        .timeout(Duration::from_secs(12))
                        .send();
                    tokio::select! {_=cancelled.changed()=>{aborted=true;break},result=async{let response=request.await.map_err(network_error)?.error_for_status().map_err(network_error)?;let body=response.text().await.map_err(network_error)?;let root=portal_json(&body)?;if string(&root["result"])=="1"{Ok("设备已下线".to_string())}else{Err(string(&root["msg"]))}}=>result}
                } else {
                    Ok("设备已离线".into())
                };
                completed += 1;
                match result {
                    Ok(message) => report(
                        &app,
                        &username,
                        &job_id,
                        completed,
                        total,
                        target.clone(),
                        &message,
                        "success",
                    ),
                    Err(message) => report(
                        &app,
                        &username,
                        &job_id,
                        completed,
                        total,
                        target.clone(),
                        &message,
                        "error",
                    ),
                }
            }
            if aborted {
                break;
            }
            if round + 1 < rounds {
                tokio::select! {_=cancelled.changed()=>{aborted=true;break},_=tokio::time::sleep(Duration::from_millis(500))=>{}}
            }
        }
        report(
            &app,
            &username,
            &job_id,
            completed,
            total,
            Value::Null,
            if aborted {
                "操作已停止"
            } else {
                "下线请求已处理完毕"
            },
            if aborted { "stopped" } else { "finished" },
        );
        app.state::<DeviceJobs>()
            .active
            .lock()
            .unwrap()
            .remove(&job_id);
    });
    Ok(())
}
#[tauri::command]
pub fn cancel_device_job(job_id: String, state: tauri::State<'_, DeviceJobs>) {
    if let Some(tx) = state.active.lock().unwrap().get(&job_id) {
        let _ = tx.send(true);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_jsonp_and_maps_owned_devices() {
        let root=portal_json(r#"jsonpReturn({"result":1,"list":[{"dhcp_host":"我的电脑","online_ip":"10.0.0.1","online_mac":"ABC","online_time":"2026-10-18 09:00"}]});"#).unwrap();
        let rows = normalize_devices(&root).unwrap();
        assert_eq!(rows[0]["name"], "我的电脑");
        assert_eq!(selected_devices(&rows, &vec!["ABC".into()]).len(), 1);
        assert!(selected_devices(&rows, &vec!["OTHER".into()]).is_empty());
        assert_eq!(portal_json(r#"dr1004({"result":1})"#).unwrap()["result"], 1);
    }
}
