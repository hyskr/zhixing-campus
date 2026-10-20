mod campus;
mod classrooms;
mod credentials;
mod devices;
mod files;
mod learning;
mod mailbox;
mod media;
mod parsers;
mod quick_login;
mod settings;
mod sso;
use base64::{engine::general_purpose::STANDARD, Engine};
use parsers::{selector, string, text};
use reqwest::{Client, Url};
use reqwest_cookie_store::{CookieStore, CookieStoreMutex};
use scraper::Html;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufReader, BufWriter},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager};

const MIS: &str = "https://mis.bjtu.edu.cn";
const AA: &str = "https://aa.bjtu.edu.cn";
const SMART: &str = "http://123.121.147.7:88/ve/back";
const AUTH_EXPIRED: &str = "登录状态已失效，请重新登录校园账号";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0";

#[derive(Clone)]
struct Session {
    username: String,
    quick: Arc<Mutex<Option<String>>>,
    preferences: Arc<Mutex<settings::Preferences>>,
    credentials: Arc<credentials::Store>,
    client: Client,
    cookies: Arc<CookieStoreMutex>,
    smart: Arc<Mutex<Option<SmartSession>>>,
}
#[derive(Clone)]
struct SmartSession {
    id: String,
    courses: Vec<Value>,
    term: String,
}
struct Pending {
    session: Session,
    url: String,
    csrf: String,
    captcha_id: String,
}
struct CampusState {
    directory: PathBuf,
    preferences: Arc<Mutex<settings::Preferences>>,
    credentials: Arc<credentials::Store>,
    sessions: Mutex<HashMap<String, Session>>,
    pending: Mutex<HashMap<String, Pending>>,
}

fn valid_username(username: &str) -> Result<(), String> {
    if username.is_empty()
        || !username
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err("请输入有效的学号".into());
    }
    Ok(())
}
fn new_session(
    cookies: CookieStore,
    username: &str,
    preferences: Arc<Mutex<settings::Preferences>>,
    credentials: Arc<credentials::Store>,
) -> Result<Session, String> {
    let cookies = Arc::new(CookieStoreMutex::new(cookies));
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        "zh-CN,zh;q=0.9,en;q=0.8".parse().unwrap(),
    );
    let client = Client::builder()
        .cookie_provider(cookies.clone())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(35))
        .user_agent(USER_AGENT)
        .default_headers(headers)
        .build()
        .map_err(|_| "无法初始化校园连接".to_string())?;
    let quick = None;
    Ok(Session {
        credentials,
        preferences,
        username: username.into(),
        quick: Arc::new(Mutex::new(quick)),
        client,
        cookies,
        smart: Arc::new(Mutex::new(None)),
    })
}
fn get_session(state: &CampusState, username: &str) -> Result<Session, String> {
    valid_username(username)?;
    if let Some(session) = state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .get(username)
        .cloned()
    {
        return Ok(session);
    }
    let file = fs::File::open(state.directory.join(format!("{username}.cookies.json")))
        .map_err(|_| AUTH_EXPIRED.to_string())?;
    let cookies = cookie_store::serde::json::load(BufReader::new(file))
        .map_err(|_| AUTH_EXPIRED.to_string())?;
    let session = new_session(
        cookies,
        username,
        state.preferences.clone(),
        state.credentials.clone(),
    )?;
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(username.into(), session.clone());
    Ok(session)
}
fn save_session(state: &CampusState, username: &str, session: &Session) -> Result<(), String> {
    if state.credentials.mode(username) == "session" {
        return Ok(());
    }
    let path = state.directory.join(format!("{username}.cookies.json"));
    let file = fs::File::create(&path).map_err(|e| format!("登录状态保存失败：{e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    let cookies = session.cookies.lock().map_err(|e| e.to_string())?;
    cookie_store::serde::json::save_incl_expired_and_nonpersistent(
        &cookies,
        &mut BufWriter::new(file),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "学校系统响应超时，请稍后重试".into();
    }
    if let Some(status) = error.status() {
        return format!("学校系统返回 HTTP {}，请稍后重试", status.as_u16());
    }
    "无法连接学校系统，请检查网络或校园 VPN".into()
}
fn is_login_url(url: &Url) -> bool {
    url.host_str() == Some("cas.bjtu.edu.cn") && url.path().starts_with("/auth/")
        || url.host_str() == Some("sso.bjtu.edu.cn")
            && (url.path().starts_with("/o/authorize") || url.path().starts_with("/sso/login"))
        || url.path().contains("/login/")
}
async fn get(
    session: &Session,
    url: &str,
    referer: Option<&str>,
) -> Result<reqwest::Response, String> {
    let mut request = session.client.get(url);
    if let Some(referer) = referer {
        request = request.header("Referer", referer);
    }
    request
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)
}
async fn data_text(session: &Session, url: &str) -> Result<String, String> {
    let response = get(session, url, Some(&format!("{AA}/notice/item/"))).await?;
    if is_login_url(response.url()) {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response.text().await.map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    Ok(body)
}
// 参考来源：参考 CAS 挑战获取、MIS 登录和教务模块跳转流程；HTTP 与会话管理以 Rust 实现。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SchoolLoginProtocol.kt
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift
async fn challenge(session: Session) -> Result<(Pending, Vec<u8>), String> {
    let sso = get(&session, &format!("{MIS}/auth/sso/?next=/"), None).await?;
    let url = sso.url().to_string();
    if !url.starts_with("https://cas.bjtu.edu.cn/auth/login/") {
        return Err("学校认证入口未返回登录页面，请稍后重试".into());
    }
    let page = get(&session, &url, Some(&format!("{MIS}/auth/sso/?next=/")))
        .await?
        .text()
        .await
        .map_err(network_error)?;
    let (csrf, captcha_id) = parsers::login_form(&page)?;
    let response = get(
        &session,
        &format!("https://cas.bjtu.edu.cn/image/{captcha_id}/"),
        Some(&url),
    )
    .await?;
    let image = response.bytes().await.map_err(network_error)?.to_vec();
    if image.is_empty() {
        return Err("学校未返回验证码图片，请刷新重试".into());
    }
    Ok((
        Pending {
            session,
            url,
            csrf,
            captcha_id,
        },
        image,
    ))
}
#[tauri::command]
async fn begin_login(
    username: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    valid_username(&username)?;
    let (pending, image) = challenge(new_session(
        CookieStore::default(),
        &username,
        state.preferences.clone(),
        state.credentials.clone(),
    )?)
    .await?;
    state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .insert(username, pending);
    Ok(json!({"image":STANDARD.encode(image)}))
}
#[tauri::command]
async fn finish_login(
    username: String,
    password: String,
    answer: String,
    remember: bool,
    credential_mode: Option<String>,
    login_method: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    valid_username(&username)?;
    let pending = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&username)
        .ok_or("验证码已过期，请刷新重试")?;
    let response = pending
        .session
        .client
        .post(&pending.url)
        .header("Referer", &pending.url)
        .header("Origin", "https://cas.bjtu.edu.cn")
        .form(&[
            ("csrfmiddlewaretoken", pending.csrf.as_str()),
            ("captcha_0", pending.captcha_id.as_str()),
            ("captcha_1", answer.as_str()),
            ("loginname", username.as_str()),
            ("password", password.as_str()),
        ])
        .send()
        .await
        .map_err(network_error)?;
    let mut final_url = response.url().clone();
    let mut body = response.text().await.map_err(network_error)?;
    if !(final_url.host_str() == Some("mis.bjtu.edu.cn")
        && final_url.path().trim_end_matches('/') == "/home")
    {
        let message = Html::parse_document(&body)
            .select(&selector(".alert-danger,.errorlist,.form-error,.error"))
            .map(text)
            .collect::<Vec<_>>()
            .join(" ");
        if message.contains("密码") || message.contains("账号") || message.contains("用户") {
            return Err("账号或密码错误，请检查后重试".into());
        }
        if !message.is_empty() {
            return Err(format!("验证码未通过，请刷新后重试：{message}"));
        }
        let home = get(
            &pending.session,
            &format!("{MIS}/home/"),
            Some(&pending.url),
        )
        .await?;
        final_url = home.url().clone();
        body = home.text().await.map_err(network_error)?;
    }
    if final_url.host_str() != Some("mis.bjtu.edu.cn")
        || final_url.path().trim_end_matches('/') != "/home"
        || parsers::expired_page(&body)
    {
        return Err("验证码未通过，请刷新后重试".into());
    }
    let profile = parsers::student(&body, &username)?;
    let existing = state
        .credentials
        .records
        .lock()
        .unwrap()
        .get(&username)
        .cloned();
    let mode = credential_mode.unwrap_or_else(|| {
        existing
            .as_ref()
            .map(|r| r.mode.clone())
            .unwrap_or_else(|| {
                if remember {
                    "keychain".into()
                } else {
                    "session".into()
                }
            })
    });
    let method = login_method.unwrap_or_else(|| {
        existing
            .map(|r| r.login_method)
            .unwrap_or_else(|| "cas".into())
    });
    state
        .credentials
        .put(&username, &password, &mode, &method)?;
    if mode == "session" {
        let _ = fs::remove_file(state.directory.join(format!("{username}.cookies.json")));
    }
    if method == "sso" {
        let source = state.sessions.lock().unwrap().get(&username).cloned();
        if let Some(source) = source {
            sso::merge_sessions(&pending.session, &source)?;
        }
    }
    save_session(&state, &username, &pending.session)?;
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(username, pending.session);
    Ok(profile)
}
fn authenticated_aa_page(url: &Url, body: &str) -> bool {
    url.host_str() == Some("aa.bjtu.edu.cn")
        && url.path().trim_end_matches('/') == "/notice/item"
        && !parsers::expired_page(body)
}
// 参考 AA 认证完成地址与 MIS 跳转表单：
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift
async fn ensure_aa(session: &Session) -> Result<(), String> {
    let module_url = format!("{MIS}/module/module/10/");
    let response = get(session, &module_url, Some(&format!("{MIS}/home/"))).await?;
    let base = response.url().clone();
    let body = response.text().await.map_err(network_error)?;
    if authenticated_aa_page(&base, &body) {
        return Ok(());
    }
    if is_login_url(&base) || parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    let action = Html::parse_document(&body)
        .select(&selector("form#redirect"))
        .next()
        .and_then(|e| e.value().attr("action"))
        .map(str::to_string)
        .ok_or("教务系统未提供登录跳转，请稍后重试")?;
    let target = base.join(&action).map_err(|_| "教务跳转地址无效")?;
    let response = get(session, target.as_str(), Some(&module_url)).await?;
    let final_url = response.url().clone();
    let body = response.text().await.map_err(network_error)?;
    if !authenticated_aa_page(&final_url, &body) {
        return Err(AUTH_EXPIRED.into());
    }
    Ok(())
}
async fn fetch_grades(session: &Session) -> Result<Vec<Value>, String> {
    let mut groups = Vec::new();
    for kind in ["ln", "lr"] {
        let body = data_text(
            session,
            &format!("{AA}/score/scores/stu/view/?page=1&perpage=500&ctype={kind}"),
        )
        .await?;
        groups.push(parsers::grades(&body)?);
    }
    Ok(parsers::merge_grades(groups))
}
async fn fetch_courses(session: &Session) -> Result<Vec<Value>, String> {
    let teacher_body = data_text(
        session,
        &format!("{AA}/course_selection/courseselectabsent/absent_list/"),
    )
    .await?;
    let teachers = parsers::teachers(&teacher_body);
    let mut items = Vec::new();
    let mut colors = HashMap::new();
    for (path, selection) in [
        ("courseselect/stuschedule/", false),
        ("courseselecttask/schedule/", true),
    ] {
        let body = data_text(session, &format!("{AA}/course_selection/{path}")).await?;
        for mut item in parsers::schedule(&body, selection, &teachers)? {
            let next = ["blue", "purple", "teal", "orange", "rose"][colors.len() % 5];
            let color = colors.entry(string(&item["name"])).or_insert(next);
            item["color"] = json!(color);
            items.push(item);
        }
    }
    Ok(items)
}
async fn smart_json(
    session: &Session,
    path: &str,
    query: &[(&str, String)],
    session_id: Option<&str>,
) -> Result<Value, String> {
    let mut request = session
        .client
        .get(format!("{SMART}/{path}"))
        .query(query)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", "http://123.121.147.7:88");
    if let Some(id) = session_id {
        let current = session
            .smart
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref()
            .map(|smart| smart.id.clone())
            .unwrap_or_else(|| id.into());
        request = request.header("sessionid", current);
    }
    let response = request.send().await.map_err(network_error)?;
    if is_login_url(response.url()) || matches!(response.status().as_u16(), 401 | 403) {
        return Err(AUTH_EXPIRED.into());
    }
    let response = response.error_for_status().map_err(network_error)?;
    let fresh_session_id = response
        .headers()
        .get("sessionid")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    if let Some(id) = &fresh_session_id {
        if let Some(smart) = session.smart.lock().map_err(|e| e.to_string())?.as_mut() {
            smart.id = id.clone();
        }
    }
    let body = response.text().await.map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    let mut value = parsers::smart_response(&body)?;
    if value.get("sessionId").is_none() {
        if let Some(id) = fresh_session_id {
            value["sessionId"] = json!(id);
        }
    }
    let message = format!("{} {}", string(&value["ERRMSG"]), string(&value["message"]));
    if message.contains("未登录") || message.contains("重新登录") || message.contains("不合法")
    {
        return Err(AUTH_EXPIRED.into());
    }
    Ok(value)
}
// 参考来源：参考 MIS 模块 28、sessionid、学期及课程列表的请求顺序。
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt
async fn prepare_smart(session: &Session) -> Result<SmartSession, String> {
    *session.smart.lock().map_err(|e| e.to_string())? = None;
    if !quick_login::current_user(&session).await.unwrap_or(false)
        && !quick_login::restore(&session).await.unwrap_or(false)
    {
        quick_login::enter_from_mis(&session).await?;
    }
    let cookie_id = {
        let url = Url::parse("http://123.121.147.7:88/ve/").unwrap();
        let jar = session.cookies.lock().map_err(|e| e.to_string())?;
        let value = jar
            .get_request_values(&url)
            .find(|(name, _)| name.eq_ignore_ascii_case("JSESSIONID"))
            .map(|(_, value)| value.to_string());
        value
    };
    let article = smart_json(
        session,
        "coursePlatform/message.shtml",
        &[("method", "getArticleList".into())],
        None,
    )
    .await?;
    let id = if !string(&article["sessionId"]).is_empty() {
        string(&article["sessionId"])
    } else {
        cookie_id.ok_or("智慧课程平台未提供会话信息")?
    };
    let semester = smart_json(
        session,
        "rp/common/teachCalendar.shtml",
        &[("method", "queryCurrentXq".into())],
        Some(&id),
    )
    .await?;
    let rows = parsers::list(&semester, "result")?;
    let code = parsers::current_term(rows);
    if !rows.is_empty() && code.is_empty() {
        return Err("智慧课程学期信息不完整，已保留上次数据".into());
    }
    let courses = if code.is_empty() {
        Vec::new()
    } else {
        let object = smart_json(
            session,
            "coursePlatform/course.shtml",
            &[
                ("method", "getCourseList".into()),
                ("pagesize", "100".into()),
                ("page", "1".into()),
                ("xqCode", code.clone()),
            ],
            Some(&id),
        )
        .await?;
        parsers::smart_courses(&object)?
    };
    let smart = SmartSession {
        id,
        courses,
        term: code,
    };
    *session.smart.lock().map_err(|e| e.to_string())? = Some(smart.clone());
    Ok(smart)
}
// 参考来源：参考 getHomeWorkList 的三类 subType 及按接口总数补齐列表。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js
async fn fetch_homework_type(
    session: &Session,
    smart: &SmartSession,
    course: &Value,
    kind: usize,
) -> Result<Vec<Value>, String> {
    let mut page = 1usize;
    let page_size = 100usize;
    let mut all = Vec::new();
    loop {
        let object = smart_json(
            session,
            "coursePlatform/homeWork.shtml",
            &[
                ("method", "getHomeWorkList".into()),
                ("cId", string(&course["id"])),
                ("subType", kind.to_string()),
                ("page", page.to_string()),
                ("pagesize", page_size.to_string()),
            ],
            Some(&smart.id),
        )
        .await?;
        let items = parsers::homework(&object, kind, course)?;
        let total = string(&object["total"])
            .parse::<usize>()
            .unwrap_or(items.len());
        if items.is_empty() && all.len() < total {
            return Err("学校作业列表不完整，请重试该课程".into());
        }
        let count = items.len();
        all.extend(items);
        if all.len() >= total || count == 0 {
            break;
        }
        page += 1;
    }
    Ok(all)
}
async fn homework_patches(
    session: &Session,
    smart: &SmartSession,
    courses: &[Value],
    app: &tauri::AppHandle,
    username: &str,
) -> (Vec<Value>, Vec<Value>) {
    let mut patches = Vec::new();
    let mut errors = Vec::new();
    for course in courses {
        for (kind, label) in ["作业", "课程设计", "实验"].iter().enumerate() {
            let course_id = string(&course["id"]);
            let name = string(&course["name"]);
            progress(app, username, &format!("正在同步 {name} · {label}"));
            match fetch_homework_type(session, smart, course, kind).await {
                Ok(items) => {
                    let patch =
                        json!({"courseId":course_id,"course":name,"type":label,"items":items});
                    let _ = app.emit(
                        "campus-homework-patch",
                        json!({"accountId":username,"patch":patch}),
                    );
                    patches.push(patch);
                }
                Err(message) => errors.push(
                    json!({"courseId":course_id,"course":name,"type":label,"message":message}),
                ),
            }
        }
    }
    (patches, errors)
}
#[tauri::command]
async fn sync_homework_course(
    username: String,
    course_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let course = smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == course_id)
        .ok_or("找不到该课程，请重新同步课程列表")?
        .clone();
    let (patches, errors) = homework_patches(&session, &smart, &[course], &app, &username).await;
    save_session(&state, &username, &session)?;
    Ok(
        json!({"homeworkPatches":patches,"homeworkErrors":errors,"retriedCourseId":course_id,"failures":errors.iter().map(|e|format!("{} · {}：{}",string(&e["course"]),string(&e["type"]),string(&e["message"]))).collect::<Vec<_>>()}),
    )
}
async fn smart_session(session: &Session) -> Result<SmartSession, String> {
    let cached = session.smart.lock().map_err(|e| e.to_string())?.clone();
    match cached {
        Some(smart) => Ok(smart),
        None => prepare_smart(session).await,
    }
}
// 参考来源：参考课程资源列表与父目录请求字段；扩展为五类目录。
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js
async fn fetch_children(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    parent_id: &str,
    doc_type: &str,
) -> Result<Vec<Value>, String> {
    let course = smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == course_id)
        .ok_or("该课程不在当前账号的课程列表中，请重新同步")?;
    let number = parsers::required(course, "course_num")?;
    let group = parsers::required(course, "fz_id")?;
    let term = parsers::required(course, "xq_code")?;
    let root = smart_json(
        session,
        "coursePlatform/courseResource.shtml",
        &[
            ("method", "stuQueryUploadResourceForCourseList".into()),
            ("courseId", number.clone()),
            ("cId", number),
            ("xkhId", group),
            ("xqCode", term),
            ("docType", doc_type.into()),
            ("up_id", parent_id.into()),
            ("searchName", "".into()),
        ],
        Some(&smart.id),
    )
    .await?;
    let mut children = parsers::resource_children(&root, course)?;
    for item in &mut children {
        item["docType"] = json!(doc_type);
        item["term"] = json!(smart.term);
        item["id"] = json!(format!("{}-{doc_type}", string(&item["id"])));
    }
    Ok(children)
}
#[tauri::command]
async fn courseware_children(
    username: String,
    course_id: String,
    parent_id: String,
    doc_type: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    if doc_type.is_none() {
        let course = smart
            .courses
            .iter()
            .find(|c| string(&c["id"]) == course_id)
            .ok_or("找不到该课程，请重新同步")?;
        return Ok(parsers::resource_categories(
            &course_id,
            &string(&course["name"]),
        ));
    }
    let doc_type = doc_type.unwrap();
    if !parsers::RESOURCE_TYPES
        .iter()
        .any(|(id, _)| *id == doc_type)
    {
        return Err("未知的资源分类".into());
    }
    let result = match fetch_children(&session, &smart, &course_id, &parent_id, &doc_type).await {
        Err(error) if error.contains("登录状态已失效") => {
            let smart = prepare_smart(&session).await?;
            fetch_children(&session, &smart, &course_id, &parent_id, &doc_type).await
        }
        result => result,
    };
    save_session(&state, &username, &session)?;
    result
}
fn progress(app: &tauri::AppHandle, username: &str, label: &str) {
    let _ = app.emit(
        "campus-sync-progress",
        json!({"accountId":username,"label":label}),
    );
}
#[tauri::command]
async fn sync_account(
    username: String,
    scope: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let scope = scope.unwrap_or_else(|| "all".into());
    if ![
        "all",
        "grades",
        "schedule",
        "homework",
        "resources",
        "mail",
        "services",
    ]
    .contains(&scope.as_str())
    {
        return Err("未知的同步范围".into());
    }
    let all = scope == "all";
    let session = get_session(&state, &username)?;
    let mut result = json!({"scope":scope});
    let mut failures = Vec::new();
    if all {
        progress(&app, &username, "正在恢复校园登录状态");
        let response = get(
            &session,
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

        progress(&app, &username, "正在读取个人资料与邮件状态");
        match parsers::student(&body, &username) {
            Ok(profile) => result["profile"] = profile,
            Err(e) => failures.push(format!("个人资料：{e}")),
        }
    }
    // 参考来源：MIS 状态接口的 ecard_yuer、net_fee 和 newmail_count 字段。
    // https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java
    // https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift
    if all || scope == "services" {
        match data_text(&session, &format!("{MIS}/osys_ajax_wrap/"))
            .await
            .and_then(|body| {
                serde_json::from_str::<Value>(&body).map_err(|_| "学校未返回有效邮件状态".into())
            })
            .and_then(|v| Ok(v))
        {
            Ok(status) => {
                if let Ok(count) = string(&status["newmail_count"]).parse::<u32>() {
                    result["mailCount"] = json!(count);
                }
                let mut balances = json!({});
                for (field, key, label) in [
                    ("ecard_yuer", "card", "校园卡"),
                    ("net_fee", "network", "校园网"),
                ] {
                    let value = string(&status[field]);
                    if value.parse::<f64>().is_ok_and(|n| n.is_finite()) {
                        balances[key] = json!(value);
                    } else {
                        failures.push(format!("{label}余额暂不可用"));
                    }
                }
                if balances.as_object().is_some_and(|o| !o.is_empty()) {
                    result["balances"] = balances;
                }
            }
            Err(e) => failures.push(format!("邮件：{e}")),
        }
    }
    if all || scope == "grades" || scope == "schedule" {
        match ensure_aa(&session).await {
            Ok(()) => {
                if all || scope == "grades" {
                    progress(&app, &username, "正在同步学业成绩");
                    match fetch_grades(&session).await {
                        Ok(items) => result["grades"] = json!(items),
                        Err(e) => failures.push(format!("成绩：{e}")),
                    }
                }
                if all || scope == "schedule" {
                    progress(&app, &username, "正在同步课程表");
                    match fetch_courses(&session).await {
                        Ok(items) => result["courses"] = json!(items),
                        Err(e) => failures.push(format!("课表：{e}")),
                    }
                }
            }
            Err(e) => failures.push(format!("教务：{e}")),
        }
    }
    if all || scope == "homework" || scope == "resources" {
        progress(&app, &username, "正在连接智慧课程平台");
        match prepare_smart(&session).await {
            Ok(smart) => {
                if all || scope == "resources" {
                    result["resources"] = json!(parsers::resource_roots(&smart.courses));
                }
                result["term"] = json!(smart.term);
                if all || scope == "homework" {
                    let (patches, errors) =
                        homework_patches(&session, &smart, &smart.courses, &app, &username).await;
                    for error in &errors {
                        failures.push(format!(
                            "{} · {}：{}",
                            string(&error["course"]),
                            string(&error["type"]),
                            string(&error["message"])
                        ));
                    }
                    result["homeworkPatches"] = json!(patches);
                    result["homeworkErrors"] = json!(errors);
                }
                if let Ok(week) = smart_json(
                    &session,
                    "coursePlatform/course.shtml",
                    &[("method", "getTimeList".into())],
                    Some(&smart.id),
                )
                .await
                {
                    let raw = if week.get("weekCode").is_some() {
                        &week["weekCode"]
                    } else {
                        &week["week_code"]
                    };
                    if let Ok(number) = string(raw).parse::<u32>() {
                        if (1..=30).contains(&number) {
                            result["currentWeek"] = json!(number);
                        }
                    }
                }
            }
            Err(e) => failures.push(format!("智慧课程：{e}")),
        }
    }
    if (all || scope == "schedule") && result.get("currentWeek").is_none() {
        if let Ok(response) = get(
            &session,
            &format!("{AA}/classroom/timeholdresult/room_view/"),
            None,
        )
        .await
        {
            if let Some(week) = response.url().query_pairs().find_map(|(key, value)| {
                if key == "zc" {
                    value.parse::<u32>().ok()
                } else {
                    None
                }
            }) {
                if (1..=30).contains(&week) {
                    result["currentWeek"] = json!(week);
                }
            }
        }
    }
    if all || scope == "mail" {
        progress(&app, &username, "正在读取邮箱收件箱");
        match campus::inbox(&session).await {
            Ok(mail) => {
                result["mailInbox"] = mail["rows"].clone();
                result["mailCount"] = mail["unread"].clone();
                result["mailTotal"] = mail["total"].clone();
            }
            Err(e) => failures.push(format!("邮箱：{e}")),
        }
    }
    save_session(&state, &username, &session)?;
    if result.as_object().is_some_and(|o| o.len() == 1) {
        return Err(failures.join("；"));
    }
    result["authExpired"] = json!(failures.iter().any(|e| e.contains("登录状态已失效")));
    result["failures"] = json!(failures);
    progress(&app, &username, "同步完成");
    Ok(result)
}
#[tauri::command]
fn saved_password(
    username: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Option<String>, String> {
    valid_username(&username)?;
    Ok(state.credentials.password(&username))
}
#[tauri::command]
async fn remove_account(
    username: String,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    valid_username(&username)?;
    if let Ok(session) = get_session(&state, &username) {
        sso::logout(&session).await;
    }
    let path = state.directory.join(format!("{username}.cookies.json"));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&username);
    state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&username);
    state.credentials.forget(&username)?;
    let entry = keyring::Entry::new("cn.zhixing.bjtu", &username).map_err(|e| e.to_string())?;
    if let Err(error) = entry.delete_credential() {
        if !matches!(error, keyring::Error::NoEntry) {
            return Err(error.to_string());
        }
    }
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .manage(campus::Features::default())
        .manage(devices::DeviceJobs::default())
        .manage(sso::SsoState::default())
        .manage(media::DownloadState::default())
        .setup(|app| {
            let directory = app.path().app_data_dir()?.join("sessions");
            fs::create_dir_all(&directory)?;
            media::init_history(
                &app.state::<media::DownloadState>(),
                directory.parent().unwrap().join("downloads.json"),
            );
            app.manage(CampusState {
                credentials: Arc::new(credentials::Store::load(
                    directory.parent().unwrap().join("credentials.json"),
                )),
                preferences: Arc::new(Mutex::new(settings::read(&directory))),
                directory,
                sessions: Mutex::new(HashMap::new()),
                pending: Mutex::new(HashMap::new()),
            });
            {
                let feature = app.state::<campus::Features>();
                let dir = app.path().app_data_dir()?;
                let baseline = fs::read(dir.join("mail-baselines.json"))
                    .ok()
                    .and_then(|b| serde_json::from_slice(&b).ok())
                    .unwrap_or_default();
                *feature.baselines.lock().unwrap() = baseline;
                *feature.directory.lock().unwrap() = dir;
            }
            campus::start_background(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            campus::open_school_page,
            mailbox::mail_detail,
            mailbox::mail_sent,
            mailbox::mail_mark_read,
            mailbox::mail_begin_compose,
            mailbox::mail_cancel_compose,
            mailbox::mail_send,
            mailbox::mail_upload,
            classrooms::classroom_occupancy,
            campus::network_credentials,
            campus::reconnect_network,
            campus::network_status,
            devices::network_devices,
            devices::logout_network_devices,
            devices::cancel_device_job,
            campus::prime_mail_baseline,
            campus::refresh_mailbox,
            campus::environment_diagnostics,
            files::download_resource_tree,
            files::teaching_calendar,
            files::file_bytes,
            sso::begin_sso,
            sso::finish_sso,
            sso::refresh_sso_captcha,
            credentials::credential_info,
            credentials::change_credential_storage,
            settings::get_preferences,
            settings::set_preferences,
            begin_login,
            finish_login,
            sync_account,
            courseware_children,
            sync_homework_course,
            media::course_replays,
            media::replay_links,
            media::download_items,
            media::retry_download,
            learning::homework_detail,
            learning::submit_homework,
            learning::upload_file,
            learning::resource_space,
            learning::resource_links,
            learning::learning_status,
            learning::inline_image,
            media::cancel_download,
            media::open_download,
            media::download_history,
            media::clear_download_history,
            saved_password,
            remove_account
        ])
        .run(tauri::generate_context!())
        .expect("无法启动知行校园");
}

#[cfg(test)]
mod tests {
    #[test]
    fn academic_login_requires_authenticated_home_not_just_aa_host() {
        assert!(authenticated_aa_page(
            &Url::parse("https://aa.bjtu.edu.cn/notice/item/?page=1").unwrap(),
            "<h1>教务通知</h1>"
        ));
        assert!(!authenticated_aa_page(
            &Url::parse("https://aa.bjtu.edu.cn/login/").unwrap(),
            "<h1>登录</h1>"
        ));
        assert!(!authenticated_aa_page(
            &Url::parse("https://aa.bjtu.edu.cn/notice/item/").unwrap(),
            "<input type='password'>"
        ));
        assert!(!authenticated_aa_page(
            &Url::parse("https://mis.bjtu.edu.cn/home/").unwrap(),
            "<h1>MIS</h1>"
        ));
    }

    use super::*;
    #[test]
    fn session_cookies_survive_restart_and_accounts_stay_separate() {
        let directory =
            std::env::temp_dir().join(format!("zhixing-session-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let state = CampusState {
            directory: directory.clone(),
            credentials: Arc::new(credentials::Store::default()),
            preferences: Arc::new(Mutex::new(settings::Preferences::default())),
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
        };
        let session = new_session(
            CookieStore::default(),
            "10001",
            Arc::new(Mutex::new(settings::Preferences::default())),
            Arc::new(credentials::Store::default()),
        )
        .unwrap();
        let url = Url::parse("https://mis.bjtu.edu.cn/").unwrap();
        session
            .cookies
            .lock()
            .unwrap()
            .parse("sessionid=student-one; Path=/; Secure", &url)
            .unwrap();
        save_session(&state, "10001", &session).unwrap();
        let restored = get_session(&state, "10001").unwrap();
        assert_eq!(
            restored
                .cookies
                .lock()
                .unwrap()
                .get_request_values(&url)
                .collect::<Vec<_>>(),
            vec![("sessionid", "student-one")]
        );
        assert!(get_session(&state, "10002").is_err());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn student_identity_is_distinct_from_student_number() {
        let html = r#"<div class="name_right"><h3><a>测试同学，欢迎您</a></h3><div class="nr_con"><span>身份：本科生</span><span>部门：计算机学院</span></div></div>"#;
        let profile = parsers::student(html, "10001").unwrap();
        assert_eq!(profile["studentId"], "10001");
        assert_eq!(profile["identity"], "本科生");
    }
    #[tokio::test]
    #[ignore = "访问学校公开认证页，不提交账号密码"]
    async fn live_school_login_challenge() {
        let (_, image) = challenge(
            new_session(
                CookieStore::default(),
                "10001",
                Arc::new(Mutex::new(settings::Preferences::default())),
                Arc::new(credentials::Store::default()),
            )
            .unwrap(),
        )
        .await
        .unwrap();
        assert!(image.starts_with(b"\x89PNG") || image.starts_with(b"\xff\xd8"));
        println!("CAS 登录表单与验证码获取成功：{} bytes", image.len());
    }
}
