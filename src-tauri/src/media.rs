use super::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;
#[cfg(desktop)]
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;
#[derive(Default)]
pub struct DownloadState {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
    history: Mutex<HashMap<String, Value>>,
    history_file: Mutex<PathBuf>,
    completed: Mutex<HashMap<String, PathBuf>>,
    pub slots: Mutex<Option<Arc<tokio::sync::Semaphore>>>,
    reserved: Mutex<std::collections::HashSet<PathBuf>>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    id: String,
    name: String,
    #[serde(default)]
    course_id: String,
    #[serde(default)]
    rp_id: String,
    url: Option<String>,
    download_allowed: Option<bool>,
    #[serde(default)]
    relative_path: Vec<String>,
    kind: String,
    view: Option<String>,
    teacher_id: Option<String>,
}
fn course<'a>(smart: &'a SmartSession, id: &str) -> Result<&'a Value, String> {
    smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == id)
        .ok_or("该课程不属于当前账号，请刷新课程列表".into())
}
// 参考来源：参考回放课程、录制列表及播放链接接口；下载通过本项目原生队列执行。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js
pub(super) async fn replay_data(
    session: &Session,
    smart: &SmartSession,
    id: &str,
) -> Result<Vec<Value>, String> {
    course(smart, id)?;
    let root = smart_json(
        session,
        "rp/common/teachCalendar.shtml",
        &[
            ("method", "toDisplyTeachCourses".into()),
            ("courseId", id.into()),
        ],
        Some(&smart.id),
    )
    .await?;
    parsers::replay_list(&root, id)
}
#[tauri::command]
pub async fn course_replays(
    username: String,
    course_id: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let result = match replay_data(&session, &smart, &course_id).await {
        Err(e) if e.contains("登录状态已失效") => {
            let smart = prepare_smart(&session).await?;
            replay_data(&session, &smart, &course_id).await
        }
        r => r,
    };
    save_session(&state, &username, &session)?;
    result
}
pub(crate) async fn ticket(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    rp_id: &str,
    teacher_id: &str,
) -> Result<Value, String> {
    let item = if course_id.is_empty() {
        &Value::Null
    } else {
        course(smart, course_id)?
    };
    let mut referer = Url::parse(&format!("{SMART}/coursePlatform/coursePlatform.shtml")).unwrap();
    referer.query_pairs_mut().extend_pairs([
        ("method", "toCoursePlatform"),
        ("courseToPage", "10480"),
        ("courseId", &string(&item["course_num"])),
        ("cId", course_id),
        ("xkhId", &string(&item["fz_id"])),
        ("xqCode", &smart.term),
        ("teacherId", teacher_id),
    ]);
    let response = session
        .client
        .post(format!("{SMART}/resourceSpace.shtml"))
        .header("Referer", referer.as_str())
        .header("sessionid", &smart.id)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&[("method", "rpinfoDownloadUrl"), ("rpId", rp_id)])
        .send()
        .await
        .map_err(network_error)?;
    if is_login_url(response.url()) || matches!(response.status().as_u16(), 401 | 403) {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response
        .error_for_status()
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    let root = parsers::smart_response(&body)?;
    let message = format!("{} {}", string(&root["ERRMSG"]), string(&root["message"]));
    if message.contains("登录") || message.contains("不合法") {
        return Err(AUTH_EXPIRED.into());
    }
    if root["flag"] == false {
        return Err("此资源尚未开放或当前账号没有访问权限".into());
    }
    Ok(root)
}
#[tauri::command]
pub async fn replay_links(
    username: String,
    course_id: String,
    video_id: String,
    teacher_id: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let root = match ticket(&session, &smart, &course_id, &video_id, &teacher_id).await {
        Err(e) if e.contains("登录状态已失效") => {
            let smart = prepare_smart(&session).await?;
            ticket(&session, &smart, &course_id, &video_id, &teacher_id).await?
        }
        r => r?,
    };
    save_session(&state, &username, &session)?;
    parsers::replay_links(&root)
}
fn safe_name(raw: &str) -> String {
    let cleaned = raw
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect::<String>();
    let cleaned = cleaned.trim().trim_matches('.');
    if cleaned.is_empty() {
        "资料".into()
    } else {
        cleaned.chars().take(160).collect()
    }
}
fn unique_path(folder: &Path, name: &str) -> PathBuf {
    let path = folder.join(safe_name(name));
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    for i in 2.. {
        let candidate = folder.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}
fn emit(
    app: &tauri::AppHandle,
    username: &str,
    item: &DownloadItem,
    state: &str,
    loaded: u64,
    total: u64,
    error: Option<&str>,
    path: Option<&Path>,
) {
    publish(
        app,
        json!({"id":item.id,"accountId":username,"name":item.name,"state":state,"loaded":loaded,"total":total,"error":error,"path":path.map(|p|p.to_string_lossy().to_string())}),
    );
}
async fn stream_file(
    session: &Session,
    url: &str,
    fallback: Option<&str>,
    destination: &Path,
    app: &tauri::AppHandle,
    username: &str,
    item: &DownloadItem,
) -> Result<(), String> {
    let response = match download_response(session, url).await {
        Ok(response) => response,
        Err(first) => match fallback.filter(|fb| *fb != url) {
            Some(fallback) => download_response(session, fallback)
                .await
                .map_err(|_| first)?,
            None => return Err(first),
        },
    };
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if content_type.contains("text/html") && !item.name.to_lowercase().ends_with(".html") {
        return Err("学校返回了网页，请刷新登录后重试；回放网页可在播放器中查看".into());
    }
    let mut previous = (0, std::time::Instant::now());
    write_response(response, destination, |loaded, total| {
        let now=std::time::Instant::now();
        let elapsed=now.duration_since(previous.1).as_secs_f64();
        let speed=if elapsed>0.0 {loaded.saturating_sub(previous.0) as f64 / elapsed} else {0.0};
        if loaded>previous.0 { previous=(loaded,now); }
        let eta=if speed>0.0 && total>loaded {Some((total-loaded) as f64/speed)}else{None};
        publish(app,json!({"id":item.id,"accountId":username,"name":item.name,"state":"downloading","loaded":loaded,"total":total,"speed":speed,"eta":eta}));
    })
    .await
}

async fn download_response(session: &Session, url: &str) -> Result<reqwest::Response, String> {
    let referer = if Url::parse(url).is_ok_and(|u| u.host_str() == Some("mail.bjtu.edu.cn")) {
        format!(
            "https://mail.bjtu.edu.cn/coremail/main.jsp?sid={}",
            campus::mail_session(session).await?
        )
    } else {
        "http://123.121.147.7:88/ve/".into()
    };
    let mut last_error: Option<String> = None;
    for attempt in 0..3u32 {
        let response = session
            .client
            .get(url)
            .header("Referer", &referer)
            .timeout(Duration::from_secs(3600))
            .send()
            .await
            .map_err(network_error)?;
        if is_login_url(response.url()) {
            return Err(AUTH_EXPIRED.into());
        }
        let status = response.status().as_u16();
        if (500..=599).contains(&status) {
            last_error = Some(format!("学校系统返回 HTTP {status}，请稍后重试"));
            if attempt < 2 {
                tokio::time::sleep(Duration::from_secs(1u64 << attempt)).await;
                continue;
            }
            return Err(last_error.unwrap_or_default());
        }
        return response.error_for_status().map_err(network_error);
    }
    Err(last_error.unwrap_or_else(|| "下载失败".into()))
}
async fn write_response(
    mut response: reqwest::Response,
    destination: &Path,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let total = response.content_length().unwrap_or(0);
    let mut loaded = 0u64;
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|e| format!("无法创建下载文件：{e}"))?;
    let mut last = std::time::Instant::now();
    on_progress(0, total);
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败：{e}"))?;
        loaded += chunk.len() as u64;
        if last.elapsed() >= Duration::from_millis(200) {
            on_progress(loaded, total);
            last = std::time::Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    if total > 0 && loaded != total {
        return Err("下载未完成，请重试".into());
    }
    on_progress(loaded, if total == 0 { loaded } else { total });
    Ok(())
}
struct Resolved {
    url: String,
    fallback: Option<String>,
    pdf: bool,
}

async fn resolve_download(session: &Session, item: &DownloadItem) -> Result<Resolved, String> {
    if let Some(url) = item.url.as_deref().filter(|u| !u.is_empty()) {
        let prefs = session.preferences.lock().map_err(|e| e.to_string())?;
        let (url, fallback) = resolved_pair(url, item.download_allowed, &prefs);
        return Ok(Resolved {
            url,
            fallback,
            pdf: false,
        });
    }
    let smart = smart_session(session).await?;
    // 未开放下载的资源：学校把原始文件转成 PDF 供预览，这里优先取转换版地址。
    if item.download_allowed == Some(false) && item.kind == "resource" {
        match stream_open_path(
            session,
            &smart,
            &item.course_id,
            &item.rp_id,
            item.teacher_id.as_deref().unwrap_or(""),
        )
        .await
        {
            Ok(path) if !path.is_empty() => {
                return Ok(Resolved {
                    url: learning::absolute_url(&path),
                    fallback: None,
                    pdf: true,
                });
            }
            Err(error) if error.contains("登录状态已失效") => return Err(error),
            _ => {}
        }
    }
    let root = match ticket(
        session,
        &smart,
        &item.course_id,
        &item.rp_id,
        item.teacher_id.as_deref().unwrap_or(""),
    )
    .await
    {
        Err(e) if e.contains("登录状态已失效") => {
            let smart = prepare_smart(session).await?;
            ticket(
                session,
                &smart,
                &item.course_id,
                &item.rp_id,
                item.teacher_id.as_deref().unwrap_or(""),
            )
            .await?
        }
        r => r?,
    };
    if item.kind == "replay" {
        let links = parsers::replay_links(&root)?;
        return links
            .iter()
            .find(|v| string(&v["view"]) == item.view.as_deref().unwrap_or("teacher"))
            .map(|v| Resolved {
                url: string(&v["url"]),
                fallback: None,
                pdf: false,
            })
            .ok_or("此回放未提供所选视角".into());
    }
    let url = parsers::required(&root, "rpUrl")?;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("学校未提供有效下载地址".into());
    }
    let prefs = session.preferences.lock().map_err(|e| e.to_string())?;
    let (url, fallback) = resolved_pair(&url, item.download_allowed, &prefs);
    Ok(Resolved {
        url,
        fallback,
        pdf: false,
    })
}

// 参考来源：学校课件预览接口，返回 PDF 转换版地址 openPath；下载该地址以绕过原始文件的 500。
pub(crate) async fn stream_open_path(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    rp_id: &str,
    teacher_id: &str,
) -> Result<String, String> {
    let course = course(smart, course_id)?;
    let mut referer = Url::parse(&format!("{SMART}/coursePlatform/coursePlatform.shtml")).unwrap();
    referer.query_pairs_mut().extend_pairs([
        ("method", "toCoursePlatform"),
        ("courseId", &string(&course["course_num"])),
        ("cId", course_id),
        ("xkhId", &string(&course["fz_id"])),
        ("xqCode", &smart.term),
        ("teacherId", teacher_id),
    ]);
    let response = session
        .client
        .post(format!("{SMART}/course/courseInfo.shtml"))
        .query(&[("method", "getStreamUrlByRpId")])
        .header("Referer", referer.as_str())
        .header("sessionid", &smart.id)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&[("rpId", rp_id), ("uLevel", "1")])
        .send()
        .await
        .map_err(network_error)?;
    if is_login_url(response.url()) || matches!(response.status().as_u16(), 401 | 403) {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response
        .error_for_status()
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    let root = parsers::smart_response(&body)?;
    Ok(string(&root["result"]["openPath"]))
}

fn resolved_pair(
    raw: &str,
    download_allowed: Option<bool>,
    prefs: &settings::Preferences,
) -> (String, Option<String>) {
    let absolute = learning::absolute_url(raw);
    let main = resource_url(raw, download_allowed, prefs);
    let fallback = if main != absolute {
        Some(absolute)
    } else {
        None
    };
    (main, fallback)
}

fn pdf_name(name: &str) -> String {
    let stem = name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name);
    format!("{stem}.pdf")
}

#[tauri::command]
pub async fn download_items(
    username: String,
    items: Vec<DownloadItem>,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    if items.is_empty() {
        return Err("请先选择要下载的文件".into());
    }
    #[cfg(target_os = "android")]
    let folder = {
        let folder = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("downloads");
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        folder
    };
    #[cfg(desktop)]
    let folder = {
        let picker = app.clone();
        let folder = tauri::async_runtime::spawn_blocking(move || {
            picker
                .dialog()
                .file()
                .set_title("选择下载保存文件夹")
                .blocking_pick_folder()
        })
        .await
        .map_err(|e| e.to_string())?;
        let Some(folder) = folder else {
            return Ok(false);
        };
        folder.into_path().map_err(|e| e.to_string())?
    };
    run_downloads(username, items, folder, app, state).await
}

async fn run_downloads(
    username: String,
    items: Vec<DownloadItem>,
    folder: PathBuf,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    let session = get_session(&state, &username)?;
    let downloads = app.state::<DownloadState>();
    // 保存下载参数与目标目录，供失败后直接重试。
    {
        let mut history = downloads.history.lock().map_err(|e| e.to_string())?;
        for item in &items {
            let entry = history.entry(item.id.clone()).or_insert_with(|| json!({}));
            entry["accountId"] = json!(username);
            entry["name"] = json!(item.name);
            entry["item"] = serde_json::to_value(item).map_err(|e| e.to_string())?;
            entry["folder"] = json!(folder.to_string_lossy().to_string());
        }
        persist_history(&downloads, &history);
    }
    let mut receivers = Vec::new();
    for item in &items {
        let (tx, rx) = watch::channel(false);
        downloads
            .active
            .lock()
            .map_err(|e| e.to_string())?
            .insert(item.id.clone(), tx);
        receivers.push(rx);
        emit(&app, &username, item, "queued", 0, 0, None, None);
    }
    let slots = {
        let mut slots = downloads.slots.lock().map_err(|e| e.to_string())?;
        slots
            .get_or_insert_with(|| {
                Arc::new(tokio::sync::Semaphore::new(
                    state.preferences.lock().unwrap().download_concurrency,
                ))
            })
            .clone()
    };
    for (item, mut cancelled) in items.into_iter().zip(receivers) {
        let app = app.clone();
        let username = username.clone();
        let session = session.clone();
        let slots = slots.clone();
        let folder = folder.clone();
        tauri::async_runtime::spawn(async move {
            let outcome: Result<(PathBuf, DownloadItem), String> = if *cancelled.borrow() {
                Err("已取消".into())
            } else {
                tokio::select! {
                    _ = cancelled.changed() => Err("已取消".into()),
                    result = download_one(&session, &app, &username, &slots, &folder, &item) => result,
                }
            };
            let downloads = app.state::<DownloadState>();
            match outcome {
                Ok((final_path, display)) => {
                    let size = fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
                    if let Ok(mut completed) = downloads.completed.lock() {
                        completed.insert(display.id.clone(), final_path.clone());
                    }
                    emit(
                        &app,
                        &username,
                        &display,
                        "completed",
                        size,
                        size,
                        None,
                        Some(&final_path),
                    );
                }
                Err(error) => {
                    emit(
                        &app,
                        &username,
                        &item,
                        if error == "已取消" {
                            "cancelled"
                        } else {
                            "failed"
                        },
                        0,
                        0,
                        Some(&error),
                        None,
                    );
                }
            }
            if let Ok(mut active) = downloads.active.lock() {
                active.remove(&item.id);
            };
        });
    }
    Ok(true)
}

async fn download_one(
    session: &Session,
    app: &tauri::AppHandle,
    username: &str,
    slots: &Arc<tokio::sync::Semaphore>,
    folder: &Path,
    item: &DownloadItem,
) -> Result<(PathBuf, DownloadItem), String> {
    let _permit = slots.acquire().await.map_err(|e| e.to_string())?;
    let resolved = resolve_download(session, item).await?;
    let mut display = item.clone();
    if resolved.pdf {
        display.name = pdf_name(&item.name);
    }
    let downloads = app.state::<DownloadState>();
    let final_path = {
        let mut reserved = downloads.reserved.lock().map_err(|e| e.to_string())?;
        let target_folder = display
            .relative_path
            .iter()
            .fold(folder.to_path_buf(), |path, part| {
                path.join(safe_name(part))
            });
        fs::create_dir_all(&target_folder).map_err(|e| e.to_string())?;
        let original = unique_path(&target_folder, &display.name);
        let mut path = original.clone();
        let mut index = 2;
        while reserved.contains(&path) || path.exists() {
            let stem = original.file_stem().unwrap_or_default().to_string_lossy();
            let ext = original
                .extension()
                .map(|s| format!(".{}", s.to_string_lossy()))
                .unwrap_or_default();
            path = target_folder.join(format!("{stem} ({index}){ext}"));
            index += 1;
        }
        reserved.insert(path.clone());
        path
    };
    let partial = final_path.with_file_name(format!(
        ".{}.{}.part",
        final_path.file_name().unwrap().to_string_lossy(),
        safe_name(&display.id)
    ));
    let result = stream_file(
        session,
        &resolved.url,
        resolved.fallback.as_deref(),
        &partial,
        app,
        username,
        &display,
    )
    .await;
    {
        if let Ok(mut reserved) = downloads.reserved.lock() {
            reserved.remove(&final_path);
        }
    }
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(error);
    }
    tokio::fs::rename(&partial, &final_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok((final_path, display))
}

#[tauri::command]
pub async fn retry_download(
    username: String,
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    let downloads = app.state::<DownloadState>();
    let (item, folder) = {
        let history = downloads.history.lock().map_err(|e| e.to_string())?;
        let entry = history.get(&id).ok_or("找不到这条下载记录，请重新下载")?;
        if string(&entry["accountId"]) != username {
            return Err("该下载记录属于其他账号".into());
        }
        let item: DownloadItem = serde_json::from_value(entry["item"].clone())
            .map_err(|_| "这条记录缺少重试信息，请重新下载")?;
        let folder = entry["folder"]
            .as_str()
            .map(PathBuf::from)
            .ok_or("这条记录缺少保存目录，请重新下载")?;
        (item, folder)
    };
    run_downloads(username, vec![item], folder, app, state).await
}
#[tauri::command]
pub fn cancel_download(id: String, state: tauri::State<'_, DownloadState>) -> Result<(), String> {
    if let Some(tx) = state.active.lock().map_err(|e| e.to_string())?.get(&id) {
        let _ = tx.send(true);
    }
    Ok(())
}
#[tauri::command]
pub async fn open_download(
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, DownloadState>,
) -> Result<(), String> {
    let path = state
        .completed
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .or_else(|| {
            state.history.lock().ok().and_then(|h| {
                h.get(&id)
                    .and_then(|v| v["path"].as_str())
                    .map(PathBuf::from)
            })
        })
        .ok_or("此下载记录没有文件路径")?;
    #[cfg(desktop)]
    {
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "android")]
    {
        mobile::open_file(&app, &path)
    }
}
#[tauri::command]
pub async fn export_download(
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, DownloadState>,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let path = state
            .history
            .lock()
            .map_err(|e| e.to_string())?
            .get(&id)
            .and_then(|v| v["path"].as_str())
            .map(PathBuf::from)
            .ok_or("此下载记录没有文件路径")?;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("downloads");
        let relative = path
            .strip_prefix(root)
            .ok()
            .and_then(|p| p.parent())
            .unwrap_or(std::path::Path::new(""))
            .to_string_lossy();
        mobile::export_file(&app, &path, &relative)
    }
    #[cfg(desktop)]
    {
        let _ = (id, app, state);
        Err("请使用显示文件打开下载目录".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filename_keeps_chinese_and_replaces_path_separators() {
        assert_eq!(safe_name("课程/第一章:概述.pdf"), "课程_第一章_概述.pdf");
    }
    fn fixture_server(body: &'static [u8], declared: usize) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0; 2048];
            let _ = stream.read(&mut buffer);
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\nContent-Length: {declared}\r\nConnection: close\r\n\r\n").unwrap();
            stream.write_all(body).unwrap();
        });
        format!("http://{address}/lecture.pdf")
    }
    #[tokio::test]
    async fn streamed_download_writes_complete_file_and_reports_bytes() {
        let response = Client::new()
            .get(fixture_server(b"%PDF-lecture-content", 20))
            .send()
            .await
            .unwrap();
        let path =
            std::env::temp_dir().join(format!("zhixing-download-{}.pdf", std::process::id()));
        let mut updates = Vec::new();
        write_response(response, &path, |loaded, total| {
            updates.push((loaded, total))
        })
        .await
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"%PDF-lecture-content");
        assert_eq!(updates.last(), Some(&(20, 20)));
        fs::remove_file(path).unwrap();
    }
    #[tokio::test]
    async fn truncated_download_is_reported_as_failure() {
        let response = Client::new()
            .get(fixture_server(b"short", 100))
            .send()
            .await
            .unwrap();
        let path =
            std::env::temp_dir().join(format!("zhixing-download-short-{}", std::process::id()));
        assert!(write_response(response, &path, |_, _| {}).await.is_err());
        let _ = fs::remove_file(path);
    }
    #[test]
    fn existing_download_is_preserved_with_a_new_filename() {
        let directory =
            std::env::temp_dir().join(format!("zhixing-download-name-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("lecture.pdf"), b"keep").unwrap();
        assert_eq!(
            unique_path(&directory, "lecture.pdf"),
            directory.join("lecture (2).pdf")
        );
        assert_eq!(fs::read(directory.join("lecture.pdf")).unwrap(), b"keep");
        fs::remove_dir_all(directory).unwrap();
    }
}

// 参考来源：参考资源真实地址读取；1936 端口及 /kk/rp 路径也见教学日历实现，端口由本项目设置项控制。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/resource-download.js
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift
pub fn resource_url(
    raw: &str,
    download_allowed: Option<bool>,
    preferences: &settings::Preferences,
) -> String {
    let raw = learning::absolute_url(raw);
    if download_allowed != Some(false) {
        return raw;
    }
    let Ok(mut url) = Url::parse(&raw) else {
        return raw;
    };
    if url.host_str() != Some("123.121.147.7") {
        return raw;
    }
    let path = url.path().to_string();
    if path.starts_with("/rp/") {
        url.set_path(&format!("/kk{path}"));
    } else if !path.starts_with("/kk/rp/") {
        return raw;
    }
    if url.set_port(Some(preferences.resource_port)).is_err() {
        return raw;
    }
    url.to_string()
}
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
fn restore_history(bytes: &[u8]) -> HashMap<String, Value> {
    let mut items: HashMap<String, Value> = serde_json::from_slice(bytes).unwrap_or_default();
    for item in items.values_mut() {
        if matches!(item["state"].as_str(), Some("queued" | "downloading")) {
            item["state"] = json!("failed");
            item["error"] = json!("应用关闭，下载已中断");
            item["speed"] = json!(0);
            item["eta"] = Value::Null;
        }
    }
    items
}
pub fn init_history(state: &DownloadState, path: PathBuf) {
    let items = fs::read(&path)
        .map(|bytes| restore_history(&bytes))
        .unwrap_or_default();
    *state.history.lock().unwrap() = items;
    *state.history_file.lock().unwrap() = path;
}
fn persist_history(state: &DownloadState, history: &HashMap<String, Value>) {
    let path = state.history_file.lock().unwrap();
    if !path.as_os_str().is_empty() {
        if let Ok(bytes) = serde_json::to_vec(history) {
            if let Err(error) = fs::write(path.as_path(), bytes) {
                eprintln!("下载记录保存失败：{error}")
            }
        }
    }
}
fn merge_download_progress(mut item: Value, previous: Option<&Value>, now: u64) -> Value {
    item["createdAt"] = json!(previous
        .and_then(|v| v["createdAt"].as_u64())
        .filter(|time| *time > 0)
        .unwrap_or(now));
    item["updatedAt"] = json!(now);
    let state = string(&item["state"]);
    item["startedAt"] = if state == "queued" {
        Value::Null
    } else {
        previous
            .and_then(|v| v["startedAt"].as_u64())
            .map(|value| json!(value))
            .unwrap_or_else(|| {
                if state == "downloading" {
                    json!(now)
                } else {
                    Value::Null
                }
            })
    };
    item["finishedAt"] = if matches!(state.as_str(), "completed" | "failed" | "cancelled") {
        json!(now)
    } else {
        Value::Null
    };
    if matches!(state.as_str(), "failed" | "cancelled") {
        if let Some(previous) = previous {
            item["loaded"] = previous["loaded"].clone();
            item["total"] = previous["total"].clone();
        }
    }
    for field in ["item", "folder"] {
        if item.get(field).is_none() {
            if let Some(value) = previous.and_then(|p| p.get(field)) {
                item[field] = value.clone();
            }
        }
    }
    item
}
fn publish(app: &tauri::AppHandle, item: Value) {
    let state = app.state::<DownloadState>();
    let key = string(&item["id"]);
    let mut history = state.history.lock().unwrap();
    let item = merge_download_progress(item, history.get(&key), now_ms());
    history.insert(key, item.clone());
    if item["state"] != "downloading" {
        persist_history(&state, &history)
    }
    drop(history);
    let _ = app.emit("campus-download-progress", item);
}
#[tauri::command]
pub fn download_history(state: tauri::State<'_, DownloadState>) -> Vec<Value> {
    state.history.lock().unwrap().values().cloned().collect()
}
#[tauri::command]
pub fn clear_download_history(username: String, state: tauri::State<'_, DownloadState>) {
    let mut history = state.history.lock().unwrap();
    history.retain(|_, item| {
        string(&item["accountId"]) != username
            || matches!(item["state"].as_str(), Some("queued" | "downloading"))
    });
    persist_history(&state, &history);
}
#[cfg(test)]
mod history_tests {
    #[test]
    fn queued_progress_fills_timestamp_after_parameters_are_saved() {
        let previous = json!({"id":"task","item":{"relativePath":["课程","电子课件","章节"]},"folder":"/Downloads"});
        let queued =
            merge_download_progress(json!({"id":"task","state":"queued"}), Some(&previous), 1000);
        assert_eq!(queued["createdAt"], 1000);
        let first = merge_download_progress(
            json!({"id":"task","state":"downloading"}),
            Some(&queued),
            2000,
        );
        let progress = merge_download_progress(
            json!({"id":"task","state":"downloading"}),
            Some(&first),
            3000,
        );
        let completed = merge_download_progress(
            json!({"id":"task","state":"completed"}),
            Some(&progress),
            5000,
        );
        assert_eq!(completed["createdAt"], 1000);
        assert_eq!(completed["startedAt"], 2000);
        assert_eq!(completed["finishedAt"], 5000);
        assert_eq!(completed["item"]["relativePath"][2], "章节");
        let retry = merge_download_progress(
            json!({"id":"task","state":"queued"}),
            Some(&completed),
            6000,
        );
        assert!(retry["startedAt"].is_null());
        assert!(retry["finishedAt"].is_null());
    }

    use super::*;
    #[test]
    fn closed_material_uses_configured_port_and_kk_path() {
        let mut prefs = settings::Preferences::default();
        assert!(prefs.quick_login);
        assert_eq!(
            resource_url(
                "http://123.121.147.7:8081/rp/2026/a.pdf",
                Some(false),
                &prefs
            ),
            "http://123.121.147.7:1936/kk/rp/2026/a.pdf"
        );
        prefs.resource_port = 1940;
        assert_eq!(
            resource_url("http://123.121.147.7:1936/kk/rp/a.pdf", Some(false), &prefs),
            "http://123.121.147.7:1940/kk/rp/a.pdf"
        );
        assert_eq!(
            resource_url("http://123.121.147.7:8081/rp/a.pdf", Some(true), &prefs),
            "http://123.121.147.7:8081/rp/a.pdf"
        );
    }
    #[test]
    fn closed_resource_keeps_original_address_as_fallback() {
        let prefs = settings::Preferences::default();
        let (main, fallback) = resolved_pair(
            "http://123.121.147.7:8081/rp/2026/a.pptx",
            Some(false),
            &prefs,
        );
        assert_eq!(main, "http://123.121.147.7:1936/kk/rp/2026/a.pptx");
        assert_eq!(
            fallback.as_deref(),
            Some("http://123.121.147.7:8081/rp/2026/a.pptx")
        );
        let (main, fallback) = resolved_pair(
            "http://123.121.147.7:8081/rp/2026/a.pdf",
            Some(true),
            &prefs,
        );
        assert_eq!(main, "http://123.121.147.7:8081/rp/2026/a.pdf");
        assert_eq!(fallback, None);
    }
    #[test]
    fn pdf_conversion_renames_extension_and_parses_open_path() {
        assert_eq!(
            pdf_name("1新时代工程（工程伦理）.pptx"),
            "1新时代工程（工程伦理）.pdf"
        );
        let body = r#"{"result":{"openPath":"http://123.121.147.7:88/ve/pdf/rp/2026/10/09/swf/20261009075704296280.pdf","pdfb":true},"pointStatus":"no","STATUS":"0"}"#;
        let root = parsers::smart_response(body).unwrap();
        assert_eq!(
            string(&root["result"]["openPath"]),
            "http://123.121.147.7:88/ve/pdf/rp/2026/10/09/swf/20261009075704296280.pdf"
        );
    }
    #[test]
    fn restart_keeps_completed_files_and_marks_interrupted_tasks() {
        let items=restore_history(br#"{"a":{"id":"a","state":"completed","path":"/tmp/course.pdf"},"b":{"id":"b","state":"downloading","loaded":12,"total":40}}"#);
        assert_eq!(items["a"]["path"], "/tmp/course.pdf");
        assert_eq!(items["a"]["state"], "completed");
        assert_eq!(items["b"]["state"], "failed");
        assert_eq!(items["b"]["loaded"], 12);
    }
}

#[cfg(test)]
mod persistence_test {
    use super::*;
    #[test]
    fn history_is_restored_from_disk_after_a_new_app_state() {
        let path = std::env::temp_dir().join(format!(
            "campus-download-history-{}.json",
            std::process::id()
        ));
        let first = DownloadState::default();
        init_history(&first, path.clone());
        let history = HashMap::from([(
            "record".into(),
            json!({"id":"record","accountId":"10001","name":"课程资料.pdf","state":"completed","loaded":123,"total":123,"path":"/Downloads/课程资料.pdf","createdAt":12}),
        )]);
        persist_history(&first, &history);
        let restarted = DownloadState::default();
        init_history(&restarted, path.clone());
        let saved = restarted.history.lock().unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved["record"]["path"], "/Downloads/课程资料.pdf");
        assert_eq!(saved["record"]["accountId"], "10001");
        fs::remove_file(path).unwrap();
    }
}
