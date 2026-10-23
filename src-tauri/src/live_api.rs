//! 手动运行的真实接口巡检；入口为 scripts/test-live-api.ts。
use super::*;
use serde::Serialize;
use std::{
    io::{IsTerminal, Write},
    process::{Command, Stdio},
    time::Instant,
};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Check {
    account: String,
    interface: String,
    status: String,
    elapsed_ms: u128,
    detail: String,
}
#[derive(Default)]
struct Report {
    rows: Vec<Check>,
}
fn masked(id: &str) -> String {
    if id.len() > 4 {
        format!("{}***{}", &id[..2], &id[id.len() - 2..])
    } else {
        "***".into()
    }
}
fn safe_error(error: &str) -> String {
    if let Some(code) = regex::Regex::new(r"HTTP\s+\d{3}").unwrap().find(error) {
        return format!("学校返回 {}", code.as_str());
    }
    if let Some(code) = regex::Regex::new(r"(?:FA_|S_)[A-Z_]+").unwrap().find(error) {
        return format!("学校返回 {}", code.as_str());
    }
    if error.contains("超时") {
        return "学校系统响应超时".into();
    }
    if error.contains("密码") {
        return "账号或保存的密码不可用；请在应用中重新登录".into();
    }
    if error.contains("备用入口") {
        return "备用入口未建立当前账号的课程会话".into();
    }
    if error.contains("登录") || error.contains("会话") {
        return "登录或业务会话不可用".into();
    }
    if error.contains("验证码") {
        return "需要人工验证码".into();
    }
    if error.contains("尚未提供") {
        return "学校尚未发布该项数据".into();
    }
    if error.contains("网络") || error.contains("连接") {
        return "无法连接学校系统，请检查校园网或 VPN".into();
    }
    "请求或响应解析失败".into()
}
impl Report {
    fn push(&mut self, id: &str, name: &str, status: &str, elapsed: u128, detail: String) {
        println!("[{}] {} · {} · {}", status, masked(id), name, detail);
        self.rows.push(Check {
            account: masked(id),
            interface: name.into(),
            status: status.into(),
            elapsed_ms: elapsed,
            detail,
        });
    }
    fn result<T>(
        &mut self,
        id: &str,
        name: &str,
        start: Instant,
        result: Result<T, String>,
        summary: impl FnOnce(&T) -> String,
    ) -> Option<T> {
        match result {
            Ok(value) => {
                self.push(
                    id,
                    name,
                    "passed",
                    start.elapsed().as_millis(),
                    summary(&value),
                );
                Some(value)
            }
            Err(error) => {
                self.push(
                    id,
                    name,
                    "failed",
                    start.elapsed().as_millis(),
                    safe_error(&error),
                );
                None
            }
        }
    }
    fn skip(&mut self, id: &str, name: &str, why: &str) {
        self.push(id, name, "skipped", 0, why.into())
    }
    fn write(&self, path: &std::path::Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let counts = |status: &str| self.rows.iter().filter(|row| row.status == status).count();
        let value = json!({"version":env!("CARGO_PKG_VERSION"),"createdAtUnixMs":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),"mode":"read-only","passed":counts("passed"),"failed":counts("failed"),"skipped":counts("skipped"),"blocked":counts("blocked"),"checks":self.rows});
        fs::write(path, serde_json::to_vec_pretty(&value).unwrap()).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        println!(
            "汇总：{} 通过，{} 失败，{} 跳过，{} 等待人工处理",
            counts("passed"),
            counts("failed"),
            counts("skipped"),
            counts("blocked")
        );
        Ok(())
    }
}
fn encrypt(password: &str, key: &str) -> Result<String, String> {
    let runtime = std::env::var("CAMPUS_PROBE_BUN").unwrap_or_else(|_| "bun".into());
    let mut child = Command::new(runtime)
        .arg("scripts/encrypt-sso.ts")
        .current_dir(std::env::var("CAMPUS_PROBE_ROOT").unwrap())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "无法启动本地密码加密进程")?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(
            serde_json::to_string(&json!({"password":password,"publicKey":key}))
                .unwrap()
                .as_bytes(),
        )
        .map_err(|_| "无法传入本地加密进程")?;
    let result = child.wait_with_output().map_err(|_| "密码加密进程失败")?;
    if !result.status.success() {
        return Err("SSO 密码加密失败".into());
    }
    serde_json::from_slice::<Value>(&result.stdout)
        .ok()
        .and_then(|v| v["encrypted"].as_str().map(str::to_string))
        .ok_or("本地密码加密结果无效".into())
}
fn captcha_answer(
    challenge: &Value,
    report_dir: &std::path::Path,
) -> Result<Option<String>, String> {
    if challenge["captchaRequired"] != true {
        return Ok(None);
    }
    let image = string(&challenge["image"]);
    let data = image
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(&image);
    let file = report_dir.join("captcha.png");
    fs::write(&file, STANDARD.decode(data).map_err(|_| "验证码图片无效")?)
        .map_err(|_| "验证码图片保存失败")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    println!("验证码图片：{}", file.display());
    if !std::io::stdin().is_terminal() {
        return Err("需要人工验证码；请在终端重新运行脚本".into());
    }
    print!("输入图中字母验证码（直接回车跳过账号）：");
    std::io::stdout().flush().map_err(|e| e.to_string())?;
    let mut answer = String::new();
    std::io::stdin()
        .read_line(&mut answer)
        .map_err(|e| e.to_string())?;
    if answer.trim().is_empty() {
        return Err("需要人工验证码".into());
    }
    Ok(Some(answer.trim().into()))
}
async fn login(
    state: &CampusState,
    id: &str,
    password: &str,
    reuse: bool,
    report_dir: &std::path::Path,
) -> Result<Session, String> {
    let auth = sso::SsoState::default();
    let mut challenge = sso::begin_with_state(id.into(), Some(!reuse), state, &auth).await?;
    if challenge["profile"].is_object() {
        return get_session(state, id);
    }
    for _ in 0..2 {
        let answer = captcha_answer(&challenge, report_dir)?;
        let encrypted = encrypt(password, &string(&challenge["publicKey"]))?;
        match sso::finish_authentication(id.into(), encrypted, answer, &auth).await? {
            sso::Completion::Authenticated(session, _) => return Ok(session),
            sso::Completion::Challenge(next) => {
                challenge = next;
                if !std::io::stdin().is_terminal() {
                    return Err("需要人工验证码；请在终端重新运行脚本".into());
                }
            }
        }
    }
    Err("验证码未通过，请在应用中重新登录".into())
}
async fn sample_file(session: &Session, url: &str) -> Result<usize, String> {
    if url.is_empty() {
        return Err("学校未返回文件地址".into());
    }
    let url = learning::absolute_url(url);
    let mut request = session.client.get(&url);
    if Url::parse(&url).is_ok_and(|u| u.host_str() == Some("mail.bjtu.edu.cn")) {
        let sid = campus::mail_session(session).await?;
        request = request.header(
            "Referer",
            format!("https://mail.bjtu.edu.cn/coremail/main.jsp?sid={sid}"),
        );
    }
    let mut response = request
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?;
    if is_login_url(response.url()) {
        return Err(AUTH_EXPIRED.into());
    }
    if response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|value| value.contains("text/html"))
    {
        return Err("文件接口返回登录或预览网页".into());
    }
    let bytes = response
        .chunk()
        .await
        .map_err(network_error)?
        .ok_or("文件内容为空")?;
    if bytes.is_empty() {
        Err("文件内容为空".into())
    } else {
        Ok(bytes.len())
    }
}
async fn mailbox_checks(session: &Session, id: &str, report: &mut Report) {
    let started = Instant::now();
    let inbox = report.result(
        id,
        "mail.inbox",
        started,
        campus::inbox(session).await,
        |v| format!("{} 条记录", v["rows"].as_array().map(Vec::len).unwrap_or(0)),
    );
    let started = Instant::now();
    let sid = report.result(
        id,
        "mail.session",
        started,
        campus::mail_session(session).await,
        |_| "会话有效".into(),
    );
    let Some(sid) = sid else {
        report.skip(id, "mail.sent/detail/attachment", "邮箱会话不可用");
        return;
    };
    let started = Instant::now();
    report.result(
        id,
        "mail.folders",
        started,
        mailbox::form_call(
            session,
            &sid,
            "/coremail/XT/jsp/mail.jsp?func=getAllFolders",
            &[("stats", "true"), ("threads", "false")],
        )
        .await,
        |_| "文件夹接口返回成功".into(),
    );
    let started = Instant::now();
    let sent=report.result(id,"mail.sent",started,mailbox::json_call(session,&sid,"mbox:listMessages",json!({"fid":3,"start":0,"limit":50,"summaryWindowSize":100,"mode":"count","order":"date","desc":true,"returnTotal":true,"returnTag":false,"mboxa":"","topFirst":true})).await.map(|v|mailbox::sent_page(&v)),|v|format!("{} 条记录",v["rows"].as_array().map(Vec::len).unwrap_or(0)));
    let received = inbox
        .as_ref()
        .and_then(|v| v["rows"].as_array())
        .and_then(|rows| rows.iter().find(|row| row["read"] == true));
    let candidate = received.or_else(|| {
        sent.as_ref()
            .and_then(|v| v["rows"].as_array())
            .and_then(|rows| rows.first())
    });
    let Some(row) = candidate else {
        report.skip(
            id,
            "mail.detail/attachment",
            "没有已读邮件或已发送记录，避免测试改变未读状态",
        );
        return;
    };
    let mid = string(&row["id"]);
    let started = Instant::now();
    let detail = report.result(
        id,
        "mail.detail",
        started,
        mailbox::form_call(
            session,
            &sid,
            "/coremail/XT/jsp/readMessage.jsp",
            &[
                ("mid", &mid),
                ("mboxa", ""),
                ("part", ""),
                ("mailCipherPassword", ""),
            ],
        )
        .await
        .and_then(|v| mailbox::detail(&v, &mid)),
        |v| {
            format!(
                "正文 {} 字节，{} 个附件",
                string(&v["html"]).len(),
                v["attachments"].as_array().map(Vec::len).unwrap_or(0)
            )
        },
    );
    if let Some(file) = detail
        .as_ref()
        .and_then(|v| v["attachments"].as_array())
        .and_then(|rows| rows.first())
    {
        let started = Instant::now();
        report.result(
            id,
            "mail.attachment",
            started,
            sample_file(session, &string(&file["url"])).await,
            |n| format!("读取首块 {n} 字节"),
        );
    } else {
        report.skip(id, "mail.attachment", "当前邮件没有附件")
    }
}
async fn learning_checks(session: &Session, id: &str, report: &mut Report, all_items: bool) {
    let started = Instant::now();
    let smart = report.result(
        id,
        "learning.session/term/courses",
        started,
        prepare_smart(session).await,
        |v| format!("{} 门课程", v.courses.len()),
    );
    let Some(smart) = smart else {
        report.skip(
            id,
            "learning.homework/resources/replays/calendar/space",
            "智慧课程会话不可用",
        );
        return;
    };
    let started = Instant::now();
    report.result(
        id,
        "learning.webHome",
        started,
        data_text(session, campus::shortcut("courses").unwrap()).await,
        |_| "课程网页首页连接成功".into(),
    );
    let started = Instant::now();
    report.result(
        id,
        "learning.currentWeek",
        started,
        smart_json(
            session,
            "coursePlatform/course.shtml",
            &[("method", "getTimeList".into())],
            Some(&smart.id),
        )
        .await,
        |_| "教学周接口返回成功".into(),
    );
    let started = Instant::now();
    report.result(
        id,
        "learning.identity",
        started,
        quick_login::current_user(session).await.and_then(|same| {
            if same {
                Ok(())
            } else {
                Err(AUTH_EXPIRED.into())
            }
        }),
        |_| "当前账号匹配".into(),
    );
    let started = Instant::now();
    let space = report.result(
        id,
        "learning.personalSpace",
        started,
        learning::space_data(session, &smart, "").await,
        |v| format!("{} 个资源", v.len()),
    );
    if let Some(file) = space.as_ref().and_then(|rows| rows.first()) {
        let started = Instant::now();
        let ticket = report.result(
            id,
            "learning.personalSpace.link",
            started,
            media::ticket(session, &smart, "", &string(&file["rpId"]), "").await,
            |_| "资源链接接口返回成功".into(),
        );
        if let Some(value) = ticket {
            let started = Instant::now();
            report.result(
                id,
                "learning.personalSpace.preview",
                started,
                sample_file(session, &string(&value["rpUrl"])).await,
                |n| format!("读取首块 {n} 字节"),
            );
        }
    } else {
        report.skip(id, "learning.personalSpace.link", "个人空间暂无资源")
    }
    let mut checked_file = false;
    let mut checked_homework_file = false;
    let mut checked_replay = false;
    let mut checked_closed = false;
    for (index, course) in smart.courses.iter().enumerate() {
        let course_id = string(&course["id"]);
        let label = format!("course[{}]", index + 1);
        for kind in 0..3 {
            let started = Instant::now();
            let rows = report.result(
                id,
                &format!("{label}.homework.type{kind}"),
                started,
                fetch_homework_type(session, &smart, course, kind).await,
                |rows| format!("{} 项", rows.len()),
            );
            if let Some(rows) = rows {
                for item in rows.iter().take(if all_items { usize::MAX } else { 1 }) {
                    let started = Instant::now();
                    let detail = report.result(
                        id,
                        &format!("{label}.homework.type{kind}.detail/submission/review"),
                        started,
                        learning::detail_data(
                            session,
                            &smart,
                            &course_id,
                            &string(&item["sourceId"]),
                            kind,
                        )
                        .await
                        .and_then(|v| {
                            if string(&v["reviewError"]).is_empty() {
                                Ok(v)
                            } else {
                                Err(string(&v["reviewError"]))
                            }
                        }),
                        |v| format!("正文 {} 字节", string(&v["content"]).len()),
                    );
                    if !checked_homework_file {
                        if let Some(file) = detail
                            .as_ref()
                            .and_then(|v| v["attachments"].as_array())
                            .and_then(|rows| rows.first())
                        {
                            checked_homework_file = true;
                            let started = Instant::now();
                            report.result(
                                id,
                                "learning.homework.attachment",
                                started,
                                sample_file(session, &string(&file["url"])).await,
                                |n| format!("读取首块 {n} 字节"),
                            );
                        }
                    }
                }
            }
        }
        for (doc_type, _) in parsers::RESOURCE_TYPES {
            let mut stack = vec!["0".to_string()];
            let mut nested = false;
            while let Some(parent) = stack.pop() {
                let started = Instant::now();
                let nodes = report.result(
                    id,
                    &format!("{label}.resources.category{doc_type}"),
                    started,
                    fetch_children(session, &smart, &course_id, &parent, doc_type).await,
                    |v| format!("{} 个目录项", v.len()),
                );
                if let Some(nodes) = nodes {
                    for node in nodes {
                        if node["kind"] == "folder" {
                            if all_items || !nested {
                                stack.push(string(&node["sourceId"]));
                                nested = true;
                            }
                            continue;
                        }
                        let closed = node["downloadAllowed"] == false;
                        if closed && !checked_closed {
                            checked_closed = true;
                            let started = Instant::now();
                            report.result(
                                id,
                                "learning.closedResource.pdf",
                                started,
                                media::stream_open_path(
                                    session,
                                    &smart,
                                    &course_id,
                                    &string(&node["rpId"]),
                                    "",
                                )
                                .await,
                                |_| "转换预览地址可获取".into(),
                            );
                        }
                        if !checked_file || all_items {
                            let started = Instant::now();
                            let value = report.result(
                                id,
                                "learning.courseResource.link",
                                started,
                                media::ticket(
                                    session,
                                    &smart,
                                    &course_id,
                                    &string(&node["rpId"]),
                                    "",
                                )
                                .await,
                                |_| "资源链接可获取".into(),
                            );
                            if let Some(v) = value {
                                checked_file = true;
                                let started = Instant::now();
                                report.result(
                                    id,
                                    "learning.courseResource.download",
                                    started,
                                    if closed {
                                        match media::stream_open_path(
                                            session,
                                            &smart,
                                            &course_id,
                                            &string(&node["rpId"]),
                                            "",
                                        )
                                        .await
                                        {
                                            Ok(url) => sample_file(session, &url).await,
                                            Err(error) => Err(error),
                                        }
                                    } else {
                                        sample_file(session, &string(&v["rpUrl"])).await
                                    },
                                    |n| format!("读取首块 {n} 字节"),
                                );
                            }
                        }
                    }
                }
            }
        }
        let started = Instant::now();
        match files::calendar_data(session, &smart, &course_id).await {
            Err(error) if error.contains("尚未提供") => report.skip(
                id,
                &format!("{label}.teachingCalendar"),
                "学校尚未发布教学日历",
            ),
            result => {
                let calendar = report.result(
                    id,
                    &format!("{label}.teachingCalendar"),
                    started,
                    result,
                    |_| "教学日历链接可获取".into(),
                );
                if let Some(value) = calendar {
                    let started = Instant::now();
                    report.result(
                        id,
                        &format!("{label}.teachingCalendar.pdf"),
                        started,
                        sample_file(session, &string(&value["url"])).await,
                        |n| format!("读取首块 {n} 字节"),
                    );
                }
            }
        }
        let started = Instant::now();
        let replays = report.result(
            id,
            &format!("{label}.replays"),
            started,
            media::replay_data(session, &smart, &course_id).await,
            |v| format!("{} 次课", v.len()),
        );
        if !checked_replay {
            if let Some(item) = replays
                .as_ref()
                .and_then(|rows| rows.iter().find(|row| !string(&row["videoId"]).is_empty()))
            {
                checked_replay = true;
                let started = Instant::now();
                let links = report.result(
                    id,
                    "learning.replay.links",
                    started,
                    media::ticket(
                        session,
                        &smart,
                        &course_id,
                        &string(&item["videoId"]),
                        &string(&item["teacherId"]),
                    )
                    .await
                    .and_then(|v| parsers::replay_links(&v)),
                    |v| format!("{} 个视角", v.len()),
                );
                if let Some(links) = links {
                    for link in links {
                        let started = Instant::now();
                        report.result(
                            id,
                            "learning.replay.stream",
                            started,
                            sample_file(session, &string(&link["url"])).await,
                            |n| format!("读取首块 {n} 字节"),
                        );
                    }
                }
            }
        }
    }
    if !checked_replay {
        report.skip(id, "learning.replay.links/stream", "没有已发布的课程录制")
    }
    if !checked_closed {
        report.skip(id, "learning.closedResource.pdf", "没有找到未开放下载资源")
    }
    if !checked_file {
        report.skip(
            id,
            "learning.attachment/download",
            "没有可读取的附件或资源文件",
        )
    }
}
#[test]
fn failure_details_do_not_expose_upstream_content_or_request_secrets() {
    assert_eq!(
        safe_error("学校系统返回 HTTP 503，请稍后重试"),
        "学校返回 HTTP 503"
    );
    assert_eq!(
        safe_error("邮箱操作失败：FA_SECURITY"),
        "学校返回 FA_SECURITY"
    );
    assert_eq!(
        safe_error("https://example.invalid/?sid=private&password=private"),
        "请求或响应解析失败"
    );
    assert_eq!(safe_error("邮件正文或用户姓名"), "请求或响应解析失败");
}
#[tokio::test]
#[ignore = "读取本机保存账号并访问全部只读业务接口；通过 mise run test:live 显式执行"]
async fn saved_account_read_suite() {
    let data =
        PathBuf::from(std::env::var("CAMPUS_PROBE_DATA").expect("请通过 mise run test:live 执行"));
    let report_path = PathBuf::from(std::env::var("CAMPUS_PROBE_REPORT").unwrap());
    let report_dir = report_path.parent().unwrap();
    fs::create_dir_all(report_dir).unwrap();
    let original = credentials::Store::load(data.join("credentials.json"));
    let requested = std::env::var("CAMPUS_PROBE_ACCOUNT").unwrap_or_default();
    let mut accounts = if requested.is_empty() {
        original
            .records
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>()
    } else {
        vec![requested]
    };
    accounts.sort();
    let mut report = Report::default();
    if accounts.is_empty() {
        report.push(
            "",
            "credentials",
            "blocked",
            0,
            "没有保存的账号，请先在应用中登录并保存凭据".into(),
        );
    }
    let scratch = std::env::temp_dir().join(format!("zhixing-live-probe-{}", std::process::id()));
    fs::create_dir_all(&scratch).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&scratch, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let reuse = std::env::var("CAMPUS_PROBE_REUSE").as_deref() == Ok("1");
    let all_items = std::env::var("CAMPUS_PROBE_ALL").as_deref() == Ok("1");
    for id in accounts {
        if valid_username(&id).is_err() {
            report.skip(&id, "account", "账号标识无效");
            continue;
        }
        let started = Instant::now();
        let password = report.result(
            &id,
            "credentials.savedPassword",
            started,
            original
                .password(&id)
                .ok_or("未保存密码或系统凭据库不可读取".into()),
            |_| format!("从 {} 读取，密码不写入报告", original.mode(&id)),
        );
        let Some(password) = password else { continue };
        // 测试快照只写内存与临时目录，不覆盖应用凭据、Cookie、邮箱基线和下载历史。
        let store = Arc::new(credentials::Store::default());
        store.records.lock().unwrap().insert(
            id.clone(),
            credentials::Record {
                mode: "session".into(),
                login_method: "sso".into(),
                password: Some(password.clone()),
                quick: original.quick(&id),
            },
        );
        let state = CampusState {
            directory: scratch.clone(),
            credentials: store,
            preferences: Arc::new(Mutex::new(settings::read(&data.join("sessions")))),
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
        };
        if reuse {
            if let Ok(file) =
                fs::File::open(data.join("sessions").join(format!("{id}.cookies.json")))
            {
                if let Ok(cookies) = cookie_store::serde::json::load(BufReader::new(file)) {
                    if let Ok(session) = new_session(
                        cookies,
                        &id,
                        state.preferences.clone(),
                        state.credentials.clone(),
                    ) {
                        state.sessions.lock().unwrap().insert(id.clone(), session);
                    }
                }
            }
        }
        let started = Instant::now();
        let session = match login(&state, &id, &password, reuse, report_dir).await {
            Ok(session) => {
                report.push(
                    &id,
                    "auth.sso/mis",
                    "passed",
                    started.elapsed().as_millis(),
                    "SSO 与 MIS 登录成功".into(),
                );
                session
            }
            Err(error) => {
                report.push(
                    &id,
                    "auth.sso/mis",
                    if error.contains("验证码") {
                        "blocked"
                    } else {
                        "failed"
                    },
                    started.elapsed().as_millis(),
                    safe_error(&error),
                );
                report.skip(
                    &id,
                    "academic/learning/mail/services",
                    "认证未完成，未发送后续业务请求",
                );
                continue;
            }
        };
        if std::env::var("CAMPUS_PROBE_MODULE")
            .unwrap_or_default()
            .is_empty()
        {
            let started = Instant::now();
            report.result(
                &id,
                "mis.profile",
                started,
                data_text(&session, &format!("{MIS}/home/"))
                    .await
                    .and_then(|v| parsers::student(&v, &id)),
                |_| "个人资料解析成功".into(),
            );
            let started = Instant::now();
            report.result(
                &id,
                "services.balances",
                started,
                data_text(&session, &format!("{MIS}/osys_ajax_wrap/"))
                    .await
                    .and_then(|body| {
                        serde_json::from_str::<Value>(&body).map_err(|_| "余额响应格式无效".into())
                    }),
                |v| {
                    format!(
                        "校园卡字段 {}，校园网字段 {}",
                        v.get("ecard_yuer").is_some(),
                        v.get("net_fee").is_some()
                    )
                },
            );
            let started = Instant::now();
            let academic = report.result(
                &id,
                "academic.session",
                started,
                ensure_aa(&session).await,
                |_| "教务会话有效".into(),
            );
            if academic.is_some() {
                let started = Instant::now();
                report.result(
                    &id,
                    "academic.grades",
                    started,
                    fetch_grades(&session).await,
                    |v| format!("{} 条成绩", v.len()),
                );
                let started = Instant::now();
                report.result(
                    &id,
                    "academic.schedule",
                    started,
                    fetch_courses(&session).await,
                    |v| format!("{} 个课表时段", v.len()),
                );
                let started = Instant::now();
                report.result(
                    &id,
                    "academic.classrooms",
                    started,
                    data_text(
                        &session,
                        &format!(
                        "{AA}/classroom/timeholdresult/room_view/?zc=1&jxlh=1&page=1&perpage=500"
                    ),
                    )
                    .await
                    .and_then(|v| classrooms::parse_page(&v, 1, "1")),
                    |v| {
                        format!(
                            "{} 间教室",
                            v["rooms"].as_array().map(Vec::len).unwrap_or(0)
                        )
                    },
                );
            } else {
                report.skip(
                    &id,
                    "academic.grades/schedule/classrooms",
                    "教务连接失败；继续测试其他系统",
                )
            }
        }
        if std::env::var("CAMPUS_PROBE_MODULE").as_deref() != Ok("learning") {
            mailbox_checks(&session, &id, &mut report).await;
        }
        if std::env::var("CAMPUS_PROBE_MODULE").as_deref() != Ok("mail") {
            learning_checks(&session, &id, &mut report, all_items).await;
        }
        if std::env::var("CAMPUS_PROBE_MODULE")
            .unwrap_or_default()
            .is_empty()
        {
            let started = Instant::now();
            report.result(
                &id,
                "network.devices",
                started,
                devices::devices(&session).await,
                |v| format!("{} 台在线设备", v.len()),
            );
            let started = Instant::now();
            report.result(
                &id,
                "sso.userCenter",
                started,
                get(&session, campus::shortcut("sso").unwrap(), None)
                    .await
                    .and_then(|r| {
                        if r.url().host_str() == Some("uc.bjtu.edu.cn") {
                            Ok(())
                        } else {
                            Err(AUTH_EXPIRED.into())
                        }
                    }),
                |_| "用户中心票据回调可达".into(),
            );
        }
        for name in [
            "mail.send/upload/cancelCompose/markRead",
            "learning.upload/submitHomework",
            "network.reconnect/logoutDevices",
            "account.logout/changeCredentials",
        ] {
            report.skip(&id, name, "写操作未执行，不计入通过")
        }
    }
    let _ = fs::remove_dir_all(&scratch);
    report.write(&report_path).unwrap();
    assert!(
        !report
            .rows
            .iter()
            .any(|row| row.status == "failed" || row.status == "blocked"),
        "真实接口巡检有失败或需要人工处理的项目，请查看汇总报告"
    );
}
