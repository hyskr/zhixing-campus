use super::*;
use tauri_plugin_notification::NotificationExt;
#[derive(Default)]
pub struct Features {
    pub directory: Mutex<PathBuf>,
    pub baselines: Mutex<HashMap<String, Vec<String>>>,
    pub network: Mutex<Value>,
}
// 参考来源：参考 MIS 邮箱 SSO、Coremail.sid 及 mbox:listThreads；原生 WebView 登录态由本项目衔接。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/mail/system.js
pub async fn mail_session(session: &Session) -> Result<String, String> {
    let _login = session.mail_gate.lock().await;
    mail_session_locked(session, false).await
}
fn cached_mail_sid(session: &Session) -> Result<Option<String>, String> {
    let url = Url::parse("https://mail.bjtu.edu.cn/coremail/").unwrap();
    let jar = session.cookies.lock().map_err(|e| e.to_string())?;
    let sid = jar
        .get_request_values(&url)
        .find(|(name, _)| *name == "Coremail.sid")
        .map(|(_, value)| value.to_string());
    Ok(sid)
}
// FA_SECURITY 只为可重放的读取操作更新一次邮箱会话；发送操作不自动重试。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/c1e19cdcbe4c6579c099bbe9ffebadf1f6104533/modules/mail/system.js
pub async fn renew_mail_session(session: &Session, old_sid: &str) -> Result<String, String> {
    let _login = session.mail_gate.lock().await;
    if let Some(sid) = cached_mail_sid(session)? {
        if sid != old_sid {
            return Ok(sid);
        }
    }
    mail_session_locked(session, true).await
}
async fn mail_session_locked(session: &Session, force: bool) -> Result<String, String> {
    // Coremail 的重新 SSO 会更换 sid，使正在编辑的 compose id 失效。
    // 先验证当前 Cookie 会话，仅在服务器确认过期后重新进入邮箱。
    let cached = if force {
        None
    } else {
        cached_mail_sid(session)?
    };
    if let Some(sid) = cached {
        let root = session
            .client
            .post("https://mail.bjtu.edu.cn/coremail/XT/jsp/mail.jsp")
            .query(&[
                ("func", "getAllFolders"),
                ("sid", sid.as_str()),
                ("stats", "false"),
                ("threads", "false"),
            ])
            .header(
                "Referer",
                format!("https://mail.bjtu.edu.cn/coremail/main.jsp?sid={sid}"),
            )
            .send()
            .await
            .map_err(network_error)?;
        #[cfg(test)]
        if std::env::var("CAMPUS_PROBE_MODULE").as_deref() == Ok("mail") {
            eprintln!("mail cached check HTTP {}", root.status());
        }
        // 保存的 Coremail.sid 失效时，目录检查也可能返回 HTTP 500 而非 JSON 会话错误。
        // 此检查不修改邮件；重新经 MIS 换取 sid 后由调用者继续原读取操作。
        if root.status() != reqwest::StatusCode::INTERNAL_SERVER_ERROR {
            let root = root
                .error_for_status()
                .map_err(network_error)?
                .json::<Value>()
                .await
                .map_err(network_error)?;
            match root["code"].as_str() {
                Some("S_OK") => return Ok(sid),
                Some(
                    "FA_INVALID_SESSION" | "S_INVALID_SESSION" | "S_SESSION_TIMEOUT"
                    | "FA_SECURITY",
                ) => {}
                Some(code) => return Err(format!("邮箱会话检查失败：{code}")),
                None => return Err("邮箱会话检查未返回有效结果".into()),
            }
        }
    }
    let response = get(session, "https://mis.bjtu.edu.cn/osys_sso_email/", None).await?;
    #[cfg(test)]
    if std::env::var("CAMPUS_PROBE_MODULE").as_deref() == Ok("mail") {
        eprintln!(
            "mail SSO HTTP {} host={} path={}",
            response.status(),
            response.url().host_str().unwrap_or(""),
            response.url().path()
        );
    }
    if is_login_url(response.url()) || response.url().host_str() != Some("mail.bjtu.edu.cn") {
        return Err(AUTH_EXPIRED.into());
    }
    let sid = response
        .url()
        .query_pairs()
        .find(|(k, _)| k == "sid")
        .map(|(_, v)| v.into_owned())
        .or_else(|| {
            let url = Url::parse("https://mail.bjtu.edu.cn/").unwrap();
            let jar = session.cookies.lock().ok()?;
            let value = jar
                .get_request_values(&url)
                .find(|(n, _)| *n == "Coremail.sid")
                .map(|(_, v)| v.into());
            value
        });
    sid.ok_or("邮箱未返回登录会话，请重新登录校园账号".into())
}
pub fn normalize_mail(root: &Value) -> Result<Value, String> {
    if mailbox::expired_code(&root) {
        return Err(AUTH_EXPIRED.into());
    }
    if root["code"] != "S_OK" {
        return Err(format!("收件箱读取失败：{}", string(&root["code"])));
    }
    let rows:Vec<_>=root["var"].as_array().unwrap_or(&Vec::new()).iter().map(|v|json!({"id":string(&v["id"]),"subject":string(&v["subject"]),"from":string(&v["from"]),"summary":string(&v["summary"]),"date":string(&v["receivedDate"]),"read":v["flags"]["read"]==true,"attached":v["flags"]["attached"]==true})).collect();
    let unread = rows.iter().filter(|v| v["read"] != true).count();
    Ok(
        json!({"rows":rows,"total":root["total"].as_u64().unwrap_or(rows.len() as u64),"unread":unread}),
    )
}
pub async fn inbox(session: &Session) -> Result<Value, String> {
    let sid = mail_session(session).await?;
    let root=mailbox::json_call(session,&sid,"mbox:listThreads",json!({"start":0,"limit":100,"summaryWindowSize":100,"mode":"count","order":"date","desc":true,"returnTotal":true,"returnTag":false,"fid":1,"mboxa":"","topFirst":true})).await?;
    let mut result = normalize_mail(&root)?;
    let sid = cached_mail_sid(session)?.unwrap_or(sid);
    let folders = session
        .client
        .post("https://mail.bjtu.edu.cn/coremail/XT/jsp/mail.jsp")
        .header("Origin", "https://mail.bjtu.edu.cn")
        .header(
            "Referer",
            format!("https://mail.bjtu.edu.cn/coremail/main.jsp?sid={sid}"),
        )
        .query(&[
            ("func", "getAllFolders"),
            ("sid", sid.as_str()),
            ("stats", "true"),
            ("threads", "true"),
        ])
        .send()
        .await
        .map_err(network_error)?
        .json::<Value>()
        .await
        .map_err(network_error)?;
    if let Some(count) = folders["var"]
        .as_array()
        .and_then(|rows| rows.get(1))
        .and_then(|v| v["stats"]["unreadMessageCount"].as_u64())
    {
        result["unread"] = json!(count)
    }
    Ok(result)
}
pub fn shortcut(name: &str) -> Option<&'static str> {
    match name {
        "mis" => Some("https://mis.bjtu.edu.cn/home/"),
        "academic" => Some("https://mis.bjtu.edu.cn/module/module/10/"),
        "courses" => {
            Some("http://123.121.147.7:88/ve/back/core/main/index.shtml?method=index&type=qxkt")
        }
        "vpn" => Some("https://webvpn.bjtu.edu.cn/"),
        "recharge" => Some("https://weixin.bjtu.edu.cn/pay/wap/network/recharge.html"),
        // 用户中心先经过票据兑换接口建立 UC 会话。
        // https://github.com/s1y4x1/BJTU-course-assistant/commit/81b9fb0f660236337c6dacc6c0de2b3df221ac28
        "sso" => Some(
            "https://uc.bjtu.edu.cn/api/login?target=https%3A%2F%2Fuc.bjtu.edu.cn%2Fuser%2Flogin",
        ),
        _ => None,
    }
}
// 保留 CookieStore 计算的绝对过期时间，避免导入旧 Max-Age 时延长有效期。
fn school_webview_cookies(store: &CookieStore) -> Vec<tauri::webview::Cookie<'static>> {
    store
        .iter_unexpired()
        .filter_map(|source| {
            let mut cookie = tauri::webview::Cookie::parse(source.to_string())
                .ok()?
                .into_owned();
            if let Some(domain) = source.domain.as_cow() {
                cookie.set_domain(domain.into_owned());
            }
            cookie.set_path(source.path.as_ref().to_string());
            cookie.set_max_age(None);
            match source.expires {
                cookie_store::CookieExpiration::AtUtc(time) => cookie.set_expires(time),
                cookie_store::CookieExpiration::SessionEnd => cookie.unset_expires(),
            }
            Some(cookie)
        })
        .collect()
}
// 入口导航前刷新 MIS 与目标平台的 Cookie，随后由网页窗口接收更新后的会话。
async fn refresh_school_session(session: &Session, target: &str) -> Result<(), String> {
    let response = get(
        session,
        &format!("{MIS}/home/"),
        Some(&format!("{MIS}/home/")),
    )
    .await?;
    if is_login_url(response.url()) || response.url().host_str() != Some("mis.bjtu.edu.cn") {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response.text().await.map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    match target {
        "academic" => ensure_aa(session).await?,
        "courses" => {
            // 完成课程认证和业务初始化后，网页直接进入首页，避免重复 MIS/OAuth 跳转。
            // 首页落地地址参考 SmartPlatformHandshake.kt，固定来源见 SMART-SESSION.md。
            prepare_smart(session).await?;
            *session.smart.lock().map_err(|e| e.to_string())? = None;
        }
        "vpn" | "sso" | "recharge" => {
            get(
                session,
                shortcut(target).ok_or("未知校园入口")?,
                Some(&format!("{MIS}/home/")),
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}
#[tauri::command]
pub async fn open_school_page(
    username: String,
    target: String,
    message_id: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    if target != "mail" && shortcut(&target).is_none() {
        return Err("未知校园入口".into());
    }
    let session = get_session(&state, &username)?;
    refresh_school_session(&session, &target).await?;
    let address = if target == "mail" {
        let sid = mail_session(&session).await?;
        let mut url = Url::parse("https://mail.bjtu.edu.cn/coremail/main.jsp").unwrap();
        url.query_pairs_mut().append_pair("sid", &sid);
        if let Some(mid) = message_id {
            url = Url::parse("https://mail.bjtu.edu.cn/coremail/XT/jsp/readMessage.jsp").unwrap();
            url.query_pairs_mut()
                .extend_pairs([("sid", sid.as_str()), ("mid", mid.as_str())]);
        }
        url.to_string()
    } else {
        shortcut(&target).ok_or("未知校园入口")?.into()
    };
    save_session(&state, &username, &session)?;
    // Cookies are installed before navigating to the school page.
    let cookies = school_webview_cookies(&*session.cookies.lock().map_err(|e| e.to_string())?);
    let directory = state
        .directory
        .parent()
        .unwrap()
        .join("webviews")
        .join(&username);
    let window = if let Some(window) = app.get_webview_window("school-browser") {
        window
            .navigate(Url::parse("about:blank").unwrap())
            .map_err(|e| e.to_string())?;
        window
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "school-browser",
            tauri::WebviewUrl::External(Url::parse("about:blank").unwrap()),
        )
        .title("交大网站 · 知行 Campus")
        .inner_size(1180.0, 820.0)
        .data_directory(directory)
        .build()
        .map_err(|e| e.to_string())?
    };
    for cookie in window.cookies().map_err(|e| e.to_string())? {
        window.delete_cookie(cookie).map_err(|e| e.to_string())?;
    }
    for cookie in cookies {
        window.set_cookie(cookie).map_err(|e| e.to_string())?;
    }
    window
        .navigate(Url::parse(&address).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn network_credentials(account: String, password: String) -> Result<(), String> {
    if account.trim().is_empty() || password.is_empty() {
        return Err("请填写上网账号和密码".into());
    }
    keyring::Entry::new("cn.zhixing.bjtu.network", &account)
        .map_err(|e| e.to_string())?
        .set_password(&password)
        .map_err(|e| e.to_string())
}
pub fn network_response(body: &str) -> Result<Value, String> {
    let text = body.trim();
    let text = text
        .strip_prefix("jsonpReturn(")
        .and_then(|s| s.strip_suffix(");").or_else(|| s.strip_suffix(')')))
        .unwrap_or(text);
    let root: Value = serde_json::from_str(text).map_err(|_| "校园网认证未返回有效数据")?;
    let online = root["result"] == 1 || (root["result"] == 0 && root["ret_code"] == 2);
    Ok(
        json!({"online":online,"connected":root["result"]==1,"message":string(&root["msg"]),"checkedAt":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()}),
    )
}
// 参考来源：参考 eportal 登录参数、定时认证与成功通知；使用 Tokio 和系统钥匙串。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/campusnet/background.js
pub async fn reconnect(
    app: &tauri::AppHandle,
    prefs: &settings::Preferences,
) -> Result<Value, String> {
    let password = keyring::Entry::new("cn.zhixing.bjtu.network", &prefs.network_account)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|_| "请先保存校园网上网密码")?;
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(network_error)?;
    let response = client
        .get("https://login.bjtu.edu.cn:802/eportal/portal/login")
        .query(&[
            ("login_method", "1"),
            ("user_account", prefs.network_account.as_str()),
            ("user_password", password.as_str()),
        ])
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    let result = network_response(&response)?;
    let state = app.state::<Features>();
    let was_online = state.network.lock().unwrap()["online"] == true;
    if result["connected"] == true && !was_online {
        let _ = app
            .notification()
            .builder()
            .title("校园网已连接")
            .body("已恢复交大校园网络连接")
            .show();
    }
    *state.network.lock().unwrap() = result.clone();
    let _ = app.emit("campus-network-status", &result);
    Ok(result)
}
#[tauri::command]
pub async fn reconnect_network(
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let prefs = state.preferences.lock().unwrap().clone();
    reconnect(&app, &prefs).await
}
#[tauri::command]
pub fn network_status(state: tauri::State<'_, Features>) -> Value {
    state.network.lock().unwrap().clone()
}
// 参考来源：首次建立邮件基线，后续仅提醒新增未读邮件。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/mail/system.js
pub fn new_unread(rows: &[Value], previous: Option<&Vec<String>>) -> Vec<String> {
    let Some(previous) = previous else {
        return vec![];
    };
    rows.iter()
        .filter(|v| v["read"] != true && !previous.contains(&string(&v["id"])))
        .map(|v| string(&v["subject"]))
        .collect()
}
pub fn start_background(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_mail = std::time::Instant::now();
        let mut last_network = std::time::Instant::now();
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let prefs = app
                .state::<CampusState>()
                .preferences
                .lock()
                .unwrap()
                .clone();
            if prefs.network_reconnect && last_network.elapsed().as_secs() >= prefs.network_interval
            {
                last_network = std::time::Instant::now();
                if let Err(error) = reconnect(&app, &prefs).await {
                    let status = json!({"online":false,"message":error});
                    *app.state::<Features>().network.lock().unwrap() = status.clone();
                    let _ = app.emit("campus-network-status", status);
                }
            }
            if prefs.mail_notifications
                && !prefs.mail_account.is_empty()
                && last_mail.elapsed().as_secs() >= prefs.mail_interval * 60
            {
                last_mail = std::time::Instant::now();
                let session = get_session(&app.state::<CampusState>(), &prefs.mail_account);
                if let Ok(session) = session {
                    match inbox(&session).await {
                        Ok(mail) => {
                            let feature = app.state::<Features>();
                            let rows = mail["rows"].as_array().unwrap();
                            let mut baseline = feature.baselines.lock().unwrap();
                            let fresh = new_unread(rows, baseline.get(&prefs.mail_account));
                            baseline.insert(
                                prefs.mail_account.clone(),
                                rows.iter().map(|v| string(&v["id"])).collect(),
                            );
                            let path = feature
                                .directory
                                .lock()
                                .unwrap()
                                .join("mail-baselines.json");
                            if let Ok(bytes) = serde_json::to_vec(&*baseline) {
                                let _ = fs::write(path, bytes);
                            }
                            if !fresh.is_empty() {
                                let _ = app
                                    .notification()
                                    .builder()
                                    .title(format!("校园邮箱 · {} 封新邮件", fresh.len()))
                                    .body(
                                        fresh
                                            .iter()
                                            .take(3)
                                            .cloned()
                                            .collect::<Vec<_>>()
                                            .join("\n"),
                                    )
                                    .show();
                            }
                            let _ = app.emit(
                                "campus-mail-updated",
                                json!({"accountId":prefs.mail_account,"mail":mail}),
                            );
                        }
                        Err(error) => {
                            let _ = app.emit(
                                "campus-mail-error",
                                json!({"accountId":prefs.mail_account,"message":error}),
                            );
                        }
                    }
                }
            }
        }
    });
}
#[tauri::command]
pub async fn environment_diagnostics(
    username: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let mut results = vec![];
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    for (id, name, url) in [
        (
            "mis",
            "学校认证连接",
            "https://mis.bjtu.edu.cn/auth/sso/?next=/",
        ),
        ("smart", "智慧课程连接", "http://123.121.147.7:88/ve/"),
    ] {
        let now = std::time::Instant::now();
        let r = client.get(url).send().await;
        results.push(json!({"id":id,"name":name,"ok":r.as_ref().is_ok_and(|r|r.status().is_success()),"detail":r.map(|r|format!("HTTP {} · {} ms",r.status(),now.elapsed().as_millis())).unwrap_or_else(|_|"网络不可达，请检查校园网或 VPN".into())}));
    }
    let check = state.directory.join(".write-check");
    let write = fs::write(&check, b"ok");
    let _ = fs::remove_file(&check);
    results.push(json!({"id":"directory","name":"数据目录","ok":write.is_ok(),"detail":state.directory.parent().unwrap().to_string_lossy()}));
    if let Some(id) = username {
        results.push(json!({"id":"credentials","name":"登录凭据","ok":state.credentials.password(&id).is_some(),"detail":format!("保存方式：{}",state.credentials.mode(&id))}));
    }
    Ok(results)
}

#[tauri::command]
pub async fn prime_mail_baseline(
    username: String,
    state: tauri::State<'_, CampusState>,
    features: tauri::State<'_, Features>,
) -> Result<(), String> {
    let session = get_session(&state, &username)?;
    let mail = inbox(&session).await?;
    let mut baseline = features.baselines.lock().unwrap();
    baseline.insert(
        username,
        mail["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| string(&v["id"]))
            .collect(),
    );
    let path = features
        .directory
        .lock()
        .unwrap()
        .join("mail-baselines.json");
    fs::write(
        path,
        serde_json::to_vec(&*baseline).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn concurrent_mail_recovery_reuses_sid_rotated_by_another_request() {
        let session = new_session(
            CookieStore::default(),
            "10001",
            Arc::new(Mutex::new(settings::Preferences::default())),
            Arc::new(credentials::Store::default()),
        )
        .unwrap();
        session
            .cookies
            .lock()
            .unwrap()
            .parse(
                "Coremail.sid=new-test-sid; Path=/; Secure",
                &Url::parse("https://mail.bjtu.edu.cn/").unwrap(),
            )
            .unwrap();
        let (first, second) = tokio::join!(
            renew_mail_session(&session, "old-test-sid"),
            renew_mail_session(&session, "old-test-sid")
        );
        assert_eq!(first.unwrap(), "new-test-sid");
        assert_eq!(second.unwrap(), "new-test-sid");
        let url = Url::parse(shortcut("sso").unwrap()).unwrap();
        assert_eq!(url.host_str(), Some("uc.bjtu.edu.cn"));
        assert_eq!(url.path(), "/api/login");
        assert!(url
            .query_pairs()
            .any(|(name, value)| name == "target" && value == "https://uc.bjtu.edu.cn/user/login"));
    }
    #[test]
    fn academic_window_uses_mis_sso_and_only_live_cookies() {
        assert_eq!(
            shortcut("academic"),
            Some("https://mis.bjtu.edu.cn/module/module/10/")
        );
        let url = Url::parse("https://aa.bjtu.edu.cn/notice/item/").unwrap();
        let mut store = CookieStore::default();
        store
            .parse("sessionid=current; Path=/; HttpOnly; SameSite=Lax", &url)
            .unwrap();
        store
            .parse("csrftoken=csrf; Path=/; Max-Age=3600", &url)
            .unwrap();
        let mut expired =
            cookie_store::Cookie::parse("obsolete=gone; Path=/; Max-Age=60", &url).unwrap();
        expired.expire();
        let mut saved = store.iter_any().cloned().collect::<Vec<_>>();
        saved.push(expired);
        let store = CookieStore::from_cookies(
            saved.into_iter().map(Ok::<_, std::convert::Infallible>),
            true,
        )
        .unwrap();
        assert_eq!(store.iter_any().count(), 3);
        let cookies = school_webview_cookies(&store);
        assert_eq!(cookies.len(), 2);
        assert!(cookies.iter().all(|cookie| cookie.name() != "obsolete"));
        let session = cookies
            .iter()
            .find(|cookie| cookie.name() == "sessionid")
            .unwrap();
        assert_eq!(session.domain(), Some("aa.bjtu.edu.cn"));
        assert_eq!(session.http_only(), Some(true));
        let csrf = cookies
            .iter()
            .find(|cookie| cookie.name() == "csrftoken")
            .unwrap();
        assert!(csrf.max_age().is_none());
        assert!(csrf.expires_datetime().is_some());
    }

    use super::*;
    #[test]
    fn new_mail_notifications_ignore_baseline_and_read_messages() {
        let rows = vec![
            json!({"id":"old","subject":"旧邮件","read":false}),
            json!({"id":"new","subject":"新通知","read":false}),
            json!({"id":"read","subject":"已读","read":true}),
        ];
        assert!(new_unread(&rows, None).is_empty());
        assert_eq!(new_unread(&rows, Some(&vec!["old".into()])), vec!["新通知"]);
    }
    #[test]
    fn understands_campus_network_jsonp_and_online_state() {
        assert_eq!(
            network_response(r#"jsonpReturn({"result":0,"ret_code":2,"msg":"已经在线"});"#)
                .unwrap()["online"],
            true
        );
        assert_eq!(
            network_response(r#"jsonpReturn({"result":1,"msg":"认证成功"})"#).unwrap()["connected"],
            true
        );
        assert_eq!(
            network_response(r#"{"result":0,"msg":"密码错误"}"#).unwrap()["online"],
            false
        );
    }
    #[test]
    fn mailbox_rows_keep_subject_sender_summary_and_flags() {
        let v=normalize_mail(&json!({"code":"S_OK","total":1,"var":[{"id":"m1","subject":"课程通知","from":"教务","summary":"本周教学安排","flags":{"read":false,"attached":true}}]})).unwrap();
        assert_eq!(v["rows"][0]["summary"], "本周教学安排");
        assert_eq!(v["rows"][0]["attached"], true);
        assert_eq!(v["unread"], 1);
    }
    #[tokio::test]
    #[ignore = "读取本人校园邮箱、余额与教学日历，不更改校园数据"]
    async fn live_campus_services() {
        let dir = PathBuf::from(std::env::var("CAMPUS_APP_DIR").expect("CAMPUS_APP_DIR"));
        let sessions = dir.join("sessions");
        let file = fs::read_dir(&sessions)
            .unwrap()
            .find_map(|f| {
                let f = f.ok()?;
                let name = f.file_name().to_string_lossy().to_string();
                name.ends_with(".cookies.json").then_some(name)
            })
            .unwrap();
        let id = file.trim_end_matches(".cookies.json");
        let state = CampusState {
            directory: sessions,
            credentials: Arc::new(credentials::Store::load(dir.join("credentials.json"))),
            preferences: Arc::new(Mutex::new(settings::Preferences::default())),
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
        };
        let session = get_session(&state, id).unwrap();
        let mail = inbox(&session).await.unwrap();
        assert!(mail["rows"].is_array());
        assert!(mail["unread"].is_number());
        let status: Value = serde_json::from_str(
            &data_text(&session, &format!("{MIS}/osys_ajax_wrap/"))
                .await
                .unwrap(),
        )
        .unwrap();
        assert!(status.get("ecard_yuer").is_some());
        assert!(status.get("net_fee").is_some());
        eprintln!(
            "live campus services: {} mail rows; unread and both balance fields present",
            mail["rows"].as_array().unwrap().len()
        );
    }
}

#[tauri::command]
pub async fn refresh_mailbox(
    username: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
    features: tauri::State<'_, Features>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let mail = inbox(&session).await?;
    let rows = mail["rows"].as_array().unwrap();
    let mut baseline = features.baselines.lock().unwrap();
    let fresh = new_unread(rows, baseline.get(&username));
    baseline.insert(
        username.clone(),
        rows.iter().map(|v| string(&v["id"])).collect(),
    );
    let path = features
        .directory
        .lock()
        .unwrap()
        .join("mail-baselines.json");
    fs::write(
        path,
        serde_json::to_vec(&*baseline).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let prefs = state.preferences.lock().unwrap().clone();
    if prefs.mail_notifications && prefs.mail_account == username && !fresh.is_empty() {
        let _ = app
            .notification()
            .builder()
            .title(format!("校园邮箱 · {} 封新邮件", fresh.len()))
            .body(fresh.iter().take(3).cloned().collect::<Vec<_>>().join("\n"))
            .show();
    }
    let _ = app.emit(
        "campus-mail-updated",
        json!({"accountId":username,"mail":mail}),
    );
    save_session(&state, &session.username, &session)?;
    Ok(mail)
}
