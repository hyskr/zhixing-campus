//! Console interface over the same account sessions and campus adapters as the app.
//! Command/output design references are recorded in docs/references/cli-sources.md.
use super::*;
use std::io::IsTerminal;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
struct Failure {
    code: &'static str,
    message: String,
    exit: i32,
    details: Value,
}
type Result<T> = std::result::Result<T, Failure>;
impl From<String> for Failure {
    fn from(message: String) -> Self {
        let auth = message.contains("登录")
            || message.contains("验证码")
            || message.contains("密码")
            || message.contains("FA_SECURITY");
        Self {
            code: if auth {
                "AUTH_REQUIRED"
            } else {
                "UPSTREAM_ERROR"
            },
            message,
            exit: if auth { 3 } else { 6 },
            details: Value::Null,
        }
    }
}
fn fail(code: &'static str, message: impl Into<String>, exit: i32) -> Failure {
    Failure {
        code,
        message: message.into(),
        exit,
        details: Value::Null,
    }
}
fn local(error: impl std::fmt::Display) -> Failure {
    fail("LOCAL_ERROR", error.to_string(), 1)
}
struct Args {
    path: String,
    flags: HashMap<String, String>,
}
impl Args {
    fn value(&self, key: &str) -> &str {
        self.flags.get(key).map(String::as_str).unwrap_or("")
    }
    fn has(&self, key: &str) -> bool {
        self.flags.contains_key(key)
    }
    fn need(&self, key: &str) -> Result<&str> {
        if self.value(key).is_empty() {
            Err(fail("INVALID_ARGUMENT", format!("缺少 --{key}"), 2))
        } else {
            Ok(self.value(key))
        }
    }
    fn number(&self, key: &str, default: u32) -> Result<u32> {
        if self.value(key).is_empty() {
            Ok(default)
        } else {
            self.value(key)
                .parse()
                .map_err(|_| fail("INVALID_ARGUMENT", format!("--{key} 需要非负整数"), 2))
        }
    }
    fn confirm(&self) -> Result<()> {
        if self.has("confirm") {
            Ok(())
        } else {
            Err(fail(
                "CONFIRM_REQUIRED",
                "此命令会修改数据，请显式传入 --confirm",
                5,
            ))
        }
    }
}
fn parse() -> Result<Args> {
    let mut words = Vec::new();
    let mut flags = HashMap::new();
    let mut raw = std::env::args().skip(1).peekable();
    let switches = [
        "help",
        "version",
        "password-stdin",
        "saved-password",
        "confirm",
        "refresh",
        "pretty",
    ];
    let values = [
        "account", "data-dir", "output", "storage", "captcha", "course", "id", "type", "category",
        "parent", "start", "limit", "building", "week", "semester", "query", "out", "view",
    ];
    while let Some(arg) = raw.next() {
        if arg == "-h" {
            flags.insert("help".into(), "true".into());
            continue;
        }
        if arg == "-V" {
            flags.insert("version".into(), "true".into());
            continue;
        }
        if let Some(option) = arg.strip_prefix("--") {
            let (key, inline) = option
                .split_once('=')
                .map(|(a, b)| (a, Some(b)))
                .unwrap_or((option, None));
            let value = if switches.contains(&key) {
                if inline.is_some() {
                    return Err(fail(
                        "INVALID_ARGUMENT",
                        format!("--{key} 不接受赋值；启用时直接传入该开关"),
                        2,
                    ));
                }
                "true".into()
            } else if values.contains(&key) {
                inline
                    .map(str::to_owned)
                    .or_else(|| raw.next())
                    .filter(|v| !v.starts_with("--"))
                    .ok_or_else(|| fail("INVALID_ARGUMENT", format!("--{key} 缺少参数"), 2))?
            } else {
                return Err(fail("INVALID_ARGUMENT", format!("未知参数 --{key}"), 2));
            };
            flags.insert(key.into(), value);
        } else {
            words.push(arg);
        }
    }
    Ok(Args {
        path: words.join(" "),
        flags,
    })
}
fn commands() -> Value {
    json!([
        {"path":"cli install","summary":"把随应用安装的 CLI 加入当前用户命令路径","writes":true,"flags":[]},
        {"path":"account list","summary":"列出本机保存账号与会话可用性","writes":false,"flags":[]},
        {"path":"auth status","summary":"连接 MIS 验证当前账号登录态","writes":false,"flags":[]},
        {"path":"auth login","summary":"SSO 登录，密码从终端或 stdin 读取；需要验证码时返回图片路径","writes":true,"flags":["password-stdin","saved-password","storage"]},
        {"path":"auth begin","summary":"建立可跨进程完成的 SSO 登录挑战","writes":true,"flags":[]},
        {"path":"auth finish","summary":"完成上次挑战，验证码与密码从显式参数/stdin 获取","writes":true,"flags":["captcha","password-stdin","saved-password","storage"]},
        {"path":"auth logout","summary":"删除所选账号本机 Cookie 会话，保留凭据","writes":true,"flags":["confirm"]},
        {"path":"profile show","summary":"个人资料","writes":false,"flags":[]},
        {"path":"grades list","summary":"成绩与学分","writes":false,"flags":[]},
        {"path":"schedule list","summary":"学期课表、选课课表","writes":false,"flags":["week"]},
        {"path":"course list","summary":"智慧课程列表，返回后续命令使用的课程 id","writes":false,"flags":[]},
        {"path":"homework list","summary":"按课程读取作业、实验、课程设计，保留部分失败","writes":false,"flags":["course","type"]},
        {"path":"homework show","summary":"正文、附件、提交记录与批阅","writes":false,"flags":["course","id","type"]},
        {"path":"resource list","summary":"课程资源分类或指定目录子项","writes":false,"flags":["course","category","parent"]},
        {"path":"resource space","summary":"个人文件空间","writes":false,"flags":["query"]},
        {"path":"replay list","summary":"课程回放","writes":false,"flags":["course"]},
        {"path":"replay links","summary":"获取各视角回放链接","writes":false,"flags":["course","id"]},
        {"path":"mail inbox","summary":"收件箱分页，不改变已读状态","writes":false,"flags":["start","limit"]},
        {"path":"mail sent","summary":"已发送邮件分页","writes":false,"flags":["start","limit"]},
        {"path":"mail show","summary":"完整正文与附件，不自动标记已读","writes":false,"flags":["id"]},
        {"path":"mail mark-read","summary":"明确标记单封邮件已读","writes":true,"flags":["id","confirm"]},
        {"path":"mail mark-unread","summary":"明确标记单封邮件未读","writes":true,"flags":["id","confirm"]},
        {"path":"classroom list","summary":"教学周和楼宇的教室占用","writes":false,"flags":["week","building","semester"]},
        {"path":"balance show","summary":"校园卡和校园网余额","writes":false,"flags":[]},
        {"path":"device list","summary":"校园网在线设备","writes":false,"flags":[]},
        {"path":"download resource","summary":"按资源 ID 下载到显式本机路径","writes":true,"flags":["course","id","out"]},
        {"path":"download replay","summary":"下载指定回放视角","writes":true,"flags":["course","id","view","out"]},
        {"path":"schema","summary":"机器可读的命令与输出契约","writes":false,"flags":[]}
    ])
}
fn schema() -> Value {
    json!({"name":"zhixing","version":env!("CARGO_PKG_VERSION"),"schema_version":1,"global_flags":{"account":"账号；只有一个保存账号时可省略","data-dir":"默认使用桌面应用数据目录","output":"auto|json|text；管道默认 JSON","refresh":"读接口会话失效后使用已保存密码重新 SSO 登录一次","pretty":"缩进 JSON"},"commands":commands(),"response":{"schema_version":1,"ok":true,"data":{},"error":null,"meta":{"timezone":"Asia/Shanghai","complete":true},"next_actions":[]},"exit_codes":{"0":"成功","1":"本地读写错误","2":"参数错误","3":"登录或人工验证码","4":"找不到目标","5":"需要显式确认","6":"网络或平台错误","7":"部分结果"}})
}
fn data_dir(args: &Args) -> Result<PathBuf> {
    if !args.value("data-dir").is_empty() {
        return Ok(PathBuf::from(args.value("data-dir")));
    }
    cli_install::default_data_directory().map_err(Failure::from)
}
fn state(directory: &Path) -> CampusState {
    CampusState {
        directory: directory.join("sessions"),
        preferences: Arc::new(Mutex::new(settings::read(&directory.join("sessions")))),
        credentials: Arc::new(credentials::Store::load(directory.join("credentials.json"))),
        sessions: Mutex::new(HashMap::new()),
        pending: Mutex::new(HashMap::new()),
    }
}
fn accounts(state: &CampusState) -> Vec<String> {
    let mut ids: Vec<String> = state
        .credentials
        .records
        .lock()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    if let Ok(files) = fs::read_dir(&state.directory) {
        for file in files.flatten() {
            if let Some(id) = file
                .file_name()
                .to_str()
                .and_then(|name| name.strip_suffix(".cookies.json"))
            {
                ids.push(id.into());
            }
        }
    }
    ids.sort();
    ids.dedup();
    ids
}
fn account(args: &Args, state: &CampusState) -> Result<String> {
    let ids = accounts(state);
    let id = if args.value("account").is_empty() {
        if ids.len() == 1 {
            ids[0].clone()
        } else {
            return Err(fail(
                "INVALID_ARGUMENT",
                "请使用 --account 指定学号；可先执行 account list",
                2,
            ));
        }
    } else {
        args.value("account").into()
    };
    valid_username(&id).map_err(Failure::from)?;
    Ok(id)
}
fn secure_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(local)?;
    }
    fs::write(path, bytes).map_err(local)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(local)?;
    }
    Ok(())
}
fn challenge_path(state: &CampusState, id: &str) -> PathBuf {
    state.directory.join(format!("{id}.cli-auth.json"))
}
fn save_challenge(
    state: &CampusState,
    id: &str,
    auth: &sso::SsoState,
    challenge: &Value,
) -> Result<Value> {
    let pending = auth.pending.lock().unwrap();
    let (session, page) = pending
        .get(id)
        .ok_or_else(|| fail("AUTH_REQUIRED", "登录挑战已过期", 3))?;
    let mut cookies = Vec::new();
    cookie_store::serde::json::save_incl_expired_and_nonpersistent(
        &session.cookies.lock().unwrap(),
        &mut cookies,
    )
    .map_err(local)?;
    secure_write(&challenge_path(state,id),&serde_json::to_vec(&json!({"page":page,"cookies":String::from_utf8_lossy(&cookies),"createdAt":chrono::Utc::now().timestamp()})).map_err(local)?)?;
    let mut result = json!({"account":id,"authenticated":false,"requiresCaptcha":challenge["captchaRequired"]==true,"nextCommand":format!("zhixing auth finish --account {id} --password-stdin")});
    if let Some(image) = challenge["image"]
        .as_str()
        .or_else(|| challenge["captchaImage"].as_str())
        .filter(|image| !image.is_empty())
    {
        let raw = image
            .rsplit_once(',')
            .map(|(_, data)| data)
            .unwrap_or(image);
        let bytes = STANDARD
            .decode(raw)
            .map_err(|_| fail("UPSTREAM_ERROR", "验证码图片格式无效", 6))?;
        let path = state.directory.join(format!("{id}.cli-captcha.png"));
        secure_write(&path, &bytes)?;
        result["captchaFile"] = json!(path);
    }
    Ok(result)
}
fn password(args: &Args, state: &CampusState, id: &str) -> Result<String> {
    if args.has("saved-password") {
        return state
            .credentials
            .password(id)
            .ok_or_else(|| fail("AUTH_REQUIRED", "本机没有可读取的已保存密码", 3));
    }
    if args.has("password-stdin") {
        let mut value = String::new();
        std::io::stdin().read_line(&mut value).map_err(local)?;
        let value = value.trim_end_matches(['\r', '\n']).to_string();
        if value.is_empty() {
            return Err(fail("INVALID_ARGUMENT", "标准输入密码为空", 2));
        }
        return Ok(value);
    }
    if !std::io::stdin().is_terminal() {
        return Err(fail(
            "INVALID_ARGUMENT",
            "非交互登录请使用 --password-stdin 或 --saved-password",
            2,
        ));
    }
    rpassword::prompt_password("校园密码：").map_err(local)
}
// RustCrypto encrypts C1C3C2 with SEC1's 04 prefix; the school expects that prefix removed, then base64.
fn encrypt(password: &str, key: &str) -> Result<String> {
    if key.is_empty() {
        return Ok(password.into());
    }
    let mut bytes = STANDARD
        .decode(key)
        .map_err(|_| fail("UPSTREAM_ERROR", "SSO 公钥格式无效", 6))?;
    if bytes.len() == 64 {
        bytes.insert(0, 4);
    }
    let key = sm2::pke::EncryptingKey::from_sec1_bytes(&bytes)
        .map_err(|_| fail("UPSTREAM_ERROR", "SSO 公钥不可用", 6))?;
    let data = key
        .encrypt(&mut rand::rng(), password.as_bytes())
        .map_err(|_| fail("LOCAL_ERROR", "密码加密失败", 1))?;
    Ok(STANDARD.encode(
        data.strip_prefix(&[4])
            .ok_or_else(|| fail("LOCAL_ERROR", "SM2 密文格式无效", 1))?,
    ))
}
async fn finish(args: &Args, state: &CampusState, id: &str, auth: &sso::SsoState) -> Result<Value> {
    let key = {
        let pending = auth.pending.lock().unwrap();
        let (_, page) = pending
            .get(id)
            .ok_or_else(|| fail("AUTH_REQUIRED", "请先运行 auth begin", 3))?;
        string(&page["config"]["sm2"]["publicKey"])
    };
    if args.value("captcha").is_empty()
        && auth
            .pending
            .lock()
            .unwrap()
            .get(id)
            .is_some_and(|(_, page)| page["captchaId"].is_string())
    {
        return Err(Failure {
            code: "CAPTCHA_REQUIRED",
            message: "请输入验证码后运行 auth finish --captcha".into(),
            exit: 3,
            details: json!({"captchaFile":state.directory.join(format!("{id}.cli-captcha.png"))}),
        });
    }
    let secret = password(args, state, id)?;
    let result = sso::finish_authentication(
        id.into(),
        encrypt(&secret, &key)?,
        if args.value("captcha").is_empty() {
            None
        } else {
            Some(args.value("captcha").into())
        },
        auth,
    )
    .await
    .map_err(Failure::from)?;
    match result {
        sso::Completion::Challenge(next) => {
            let details = save_challenge(state, id, auth, &next)?;
            Err(Failure {
                code: "CAPTCHA_REQUIRED",
                message: "学校要求输入人工验证码，请查看 captchaFile 后运行 auth finish --captcha"
                    .into(),
                exit: 3,
                details,
            })
        }
        sso::Completion::Authenticated(session, profile) => {
            let mode = if args.value("storage").is_empty() {
                state.credentials.mode(id)
            } else {
                args.value("storage").into()
            };
            if mode == "session" {
                return Err(fail(
                    "INVALID_ARGUMENT",
                    "独立 CLI 请使用 keychain 或 file 保存登录态",
                    2,
                ));
            }
            state
                .credentials
                .put(id, &secret, &mode, "sso")
                .map_err(Failure::from)?;
            save_session(state, id, &session).map_err(Failure::from)?;
            state.sessions.lock().unwrap().insert(id.into(), session);
            let _ = fs::remove_file(challenge_path(state, id));
            let _ = fs::remove_file(state.directory.join(format!("{id}.cli-captcha.png")));
            Ok(json!({"account":id,"authenticated":true,"profile":profile,"storage":mode}))
        }
    }
}
async fn login(args: &Args, state: &CampusState, id: &str) -> Result<Value> {
    let auth = sso::SsoState::default();
    let challenge = sso::begin_with_state(id.into(), Some(true), state, &auth)
        .await
        .map_err(Failure::from)?;
    if challenge["profile"].is_object() {
        return Ok(json!({"account":id,"authenticated":true,"profile":challenge["profile"]}));
    }
    if args.path == "auth begin" || challenge["captchaRequired"] == true {
        let details = save_challenge(state, id, &auth, &challenge)?;
        if args.path == "auth begin" {
            return Ok(details);
        }
        return Err(Failure {
            code: "CAPTCHA_REQUIRED",
            message: "需要人工验证码，请使用 auth finish 完成登录".into(),
            exit: 3,
            details,
        });
    }
    finish(args, state, id, &auth).await
}
fn progress(command: &str, event: &str, data: Value) {
    eprintln!("{}", json!({"event":event,"command":command,"data":data}));
}
async fn profile(session: &Session, id: &str) -> std::result::Result<Value, String> {
    let response = session
        .client
        .get(format!("{MIS}/home/"))
        .send()
        .await
        .map_err(network_error)?;
    if is_login_url(response.url()) {
        return Err(AUTH_EXPIRED.into());
    }
    let body = response.text().await.map_err(network_error)?;
    if parsers::expired_page(&body) {
        return Err(AUTH_EXPIRED.into());
    }
    parsers::student(&body, id)
}
fn kind(args: &Args) -> Result<usize> {
    let value = match args.value("type") {
        "" | "homework" | "作业" => 0,
        "design" | "课程设计" => 1,
        "experiment" | "实验" => 2,
        _ => {
            return Err(fail(
                "INVALID_ARGUMENT",
                "--type 使用 homework、design 或 experiment",
                2,
            ))
        }
    };
    Ok(value)
}
async fn query(args: &Args, session: &Session, id: &str) -> Result<Value> {
    match args.path.as_str() {
        "auth status" | "profile show" => {
            Ok(json!({"account":id,"authenticated":true,"profile":profile(session,id).await?}))
        }
        "grades list" => {
            ensure_aa(session).await?;
            Ok(json!(fetch_grades(session).await?))
        }
        "schedule list" => {
            ensure_aa(session).await?;
            let mut rows = fetch_courses(session).await?;
            if args.has("week") {
                let week = args.number("week", 1)?;
                if !(1..=30).contains(&week) {
                    return Err(fail("INVALID_ARGUMENT", "--week 应为 1–30", 2));
                }
                rows.retain(|c| reminders::in_week(&string(&c["weeks"]), week as i64));
            }
            Ok(json!(rows))
        }
        "balance show" => {
            let body = data_text(session, &format!("{MIS}/osys_ajax_wrap/")).await?;
            let v: Value = serde_json::from_str(&body)
                .map_err(|_| fail("UPSTREAM_ERROR", "余额接口未返回 JSON", 6))?;
            Ok(json!({"card":v["ecard_yuer"],"network":v["net_fee"]}))
        }
        "device list" => Ok(json!(devices::devices(session).await?)),
        "mail inbox" | "mail sent" => {
            let sid = campus::mail_session(session).await?;
            let limit = args.number("limit", 50)?;
            if !(1..=100).contains(&limit) {
                return Err(fail("INVALID_ARGUMENT", "--limit 应为 1–100", 2));
            }
            let sent = args.path == "mail sent";
            let v=mailbox::json_call(session,&sid,if sent{"mbox:listMessages"}else{"mbox:listThreads"},json!({"fid":if sent{3}else{1},"start":args.number("start",0)?,"limit":limit,"summaryWindowSize":100,"mode":"count","order":"date","desc":true,"returnTotal":true,"returnTag":false,"mboxa":"","topFirst":true})).await?;
            Ok(if sent {
                mailbox::sent_page(&v)
            } else {
                campus::normalize_mail(&v)?
            })
        }
        "mail show" => {
            let mid = args.need("id")?;
            let sid = campus::mail_session(session).await?;
            let root = mailbox::form_call(
                session,
                &sid,
                "/coremail/XT/jsp/readMessage.jsp",
                &[
                    ("mid", mid),
                    ("mboxa", ""),
                    ("part", ""),
                    ("mailCipherPassword", ""),
                ],
            )
            .await?;
            Ok(mailbox::detail(&root, mid)?)
        }
        "mail mark-read" | "mail mark-unread" => {
            args.confirm()?;
            let sid = campus::mail_session(session).await?;
            mailbox::json_call(session,&sid,"mbox:updateMessageInfos",json!({"ids":[args.need("id")?],"attrs":{"flags":{"read":args.path=="mail mark-read"}},"mboxa":"","returnOriginalMsgInfos":true,"expandThreadMid":false})).await?;
            Ok(json!({"updated":true,"id":args.value("id"),"read":args.path=="mail mark-read"}))
        }
        "classroom list" => {
            ensure_aa(session).await?;
            let week = args.number("week", 1)?;
            if !(1..=53).contains(&week) {
                return Err(fail("INVALID_ARGUMENT", "--week 应为 1–53", 2));
            }
            let building = if args.value("building").is_empty() {
                "1"
            } else {
                args.value("building")
            };
            let mut url = Url::parse(&format!("{AA}/classroom/timeholdresult/room_view/")).unwrap();
            url.query_pairs_mut().extend_pairs([
                ("zc", week.to_string()),
                ("jxlh", building.into()),
                ("page", "1".into()),
                ("perpage", "500".into()),
            ]);
            if args.has("semester") {
                url.query_pairs_mut()
                    .append_pair("zxjxjhh", args.value("semester"));
            }
            Ok(classrooms::parse_page(
                &data_text(session, url.as_str()).await?,
                week,
                building,
            )?)
        }
        _ => smart_query(args, session).await,
    }
}
async fn smart_query(args: &Args, session: &Session) -> Result<Value> {
    let smart = smart_session(session).await?;
    let course_id = args.value("course");
    let course = smart
        .courses
        .iter()
        .find(|course| string(&course["id"]) == course_id);
    if !course_id.is_empty() && course.is_none() {
        return Err(fail(
            "NOT_FOUND",
            "该课程不属于当前账号，请使用 course list 获取 id",
            4,
        ));
    }
    let teacher = course.map(|c| string(&c["teacher_id"])).unwrap_or_default();
    match args.path.as_str() {
        "course list" => Ok(json!({"term":smart.term,"courses":smart.courses})),
        "homework list" => {
            let mut rows = Vec::new();
            let mut failures = Vec::new();
            for c in smart
                .courses
                .iter()
                .filter(|c| course_id.is_empty() || string(&c["id"]) == course_id)
            {
                for k in 0..3 {
                    if args.has("type") && k != kind(args)? {
                        continue;
                    }
                    progress(&args.path, "course.read", json!({"id":c["id"],"type":k}));
                    match fetch_homework_type(session, &smart, c, k).await {
                        Ok(items) => rows.extend(items),
                        Err(error) => failures
                            .push(json!({"course":c["id"],"type":k,"message":safe_error(&error)})),
                    }
                }
            }
            Ok(json!({"items":rows,"failures":failures}))
        }
        "homework show" => Ok(learning::detail_data(
            session,
            &smart,
            args.need("course")?,
            args.need("id")?,
            kind(args)?,
        )
        .await?),
        "resource list" => {
            let id = args.need("course")?;
            if !args.has("category") {
                Ok(json!(parsers::resource_categories(
                    id,
                    &string(&course.unwrap()["name"])
                )))
            } else {
                if !parsers::RESOURCE_TYPES
                    .iter()
                    .any(|(k, _)| *k == args.value("category"))
                {
                    return Err(fail(
                        "INVALID_ARGUMENT",
                        "未知分类；先执行 resource list --course 获取分类",
                        2,
                    ));
                }
                Ok(json!(
                    fetch_children(
                        session,
                        &smart,
                        id,
                        if args.value("parent").is_empty() {
                            "0"
                        } else {
                            args.value("parent")
                        },
                        args.value("category")
                    )
                    .await?
                ))
            }
        }
        "resource space" => Ok(json!(
            learning::space_data(session, &smart, args.value("query")).await?
        )),
        "replay list" => Ok(json!(
            media::replay_data(session, &smart, args.need("course")?).await?
        )),
        "replay links" => {
            let v = media::ticket(
                session,
                &smart,
                args.need("course")?,
                args.need("id")?,
                &teacher,
            )
            .await?;
            Ok(json!(parsers::replay_links(&v)?))
        }
        "download resource" | "download replay" => {
            let mut output = PathBuf::from(args.need("out")?);
            if !output.is_absolute() {
                output = std::env::current_dir().map_err(local)?.join(output);
            }
            if output.exists() {
                return Err(fail(
                    "LOCAL_ERROR",
                    "目标文件已存在，请指定新的 --out 路径",
                    1,
                ));
            }
            let ticket = media::ticket(
                session,
                &smart,
                args.need("course")?,
                args.need("id")?,
                &teacher,
            )
            .await?;
            let url = if args.path == "download replay" {
                let links = parsers::replay_links(&ticket)?;
                let view = if args.value("view").is_empty() {
                    "teacher"
                } else {
                    args.value("view")
                };
                links
                    .iter()
                    .find(|v| string(&v["view"]) == view)
                    .map(|v| string(&v["url"]))
                    .ok_or_else(|| fail("NOT_FOUND", "此回放未提供所选视角", 4))?
            } else {
                media::resource_url(
                    &parsers::required(&ticket, "rpUrl")?,
                    None,
                    &session.preferences.lock().unwrap(),
                )
            };
            let mut response = session
                .client
                .get(&url)
                .send()
                .await
                .map_err(network_error)?
                .error_for_status()
                .map_err(network_error)?;
            if is_login_url(response.url()) {
                return Err(AUTH_EXPIRED.to_string().into());
            }
            if let Some(parent) = output.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(local)?;
            }
            let temporary = output.with_extension(format!(
                "{}part",
                output
                    .extension()
                    .and_then(|v| v.to_str())
                    .map(|v| format!("{v}."))
                    .unwrap_or_default()
            ));
            let result: Result<u64> = async {
                use tokio::io::AsyncWriteExt;
                let mut file = tokio::fs::File::create(&temporary).await.map_err(local)?;
                let mut bytes = 0u64;
                let mut last = std::time::Instant::now();
                while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                    file.write_all(&chunk).await.map_err(local)?;
                    bytes += chunk.len() as u64;
                    if last.elapsed().as_secs() >= 1 {
                        progress(&args.path, "download.progress", json!({"bytes":bytes}));
                        last = std::time::Instant::now();
                    }
                }
                file.flush().await.map_err(local)?;
                tokio::fs::rename(&temporary, &output)
                    .await
                    .map_err(local)?;
                Ok(bytes)
            }
            .await;
            match result {
                Ok(bytes) => Ok(json!({"path":output,"bytes":bytes})),
                Err(error) => {
                    let _ = tokio::fs::remove_file(&temporary).await;
                    Err(error)
                }
            }
        }
        _ => Err(fail(
            "INVALID_ARGUMENT",
            "未知命令，请使用 schema 查看命令列表",
            2,
        )),
    }
}
fn safe_error(message: &str) -> String {
    if message.contains("http://") || message.contains("https://") {
        "学校接口请求失败，请稍后重试".into()
    } else {
        message.into()
    }
}
async fn execute(args: &Args) -> Result<Value> {
    if args.has("version") {
        return Ok(json!({"version":env!("CARGO_PKG_VERSION")}));
    }
    if args.path == "schema" || args.has("help") || args.path.is_empty() {
        return Ok(schema());
    }
    if let Some(path) = args.path.strip_prefix("schema ") {
        let spec = commands()
            .as_array()
            .unwrap()
            .iter()
            .find(|command| command["path"] == path)
            .cloned()
            .ok_or_else(|| fail("INVALID_ARGUMENT", "找不到对应命令", 2))?;
        return Ok(
            json!({"command":spec,"global_flags":schema()["global_flags"],"response":schema()["response"]}),
        );
    }
    if !commands()
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["path"] == args.path)
    {
        return Err(fail(
            "INVALID_ARGUMENT",
            "未知命令，执行 schema 查看命令契约",
            2,
        ));
    }
    let catalogue = commands();
    let spec = catalogue
        .as_array()
        .unwrap()
        .iter()
        .find(|command| command["path"] == args.path)
        .unwrap();
    for key in args.flags.keys() {
        if !["account", "data-dir", "output", "refresh", "pretty"].contains(&key.as_str())
            && !spec["flags"]
                .as_array()
                .unwrap()
                .iter()
                .any(|flag| flag.as_str() == Some(key.as_str()))
        {
            return Err(fail(
                "INVALID_ARGUMENT",
                format!("{} 不支持 --{}", args.path, key),
                2,
            ));
        }
    }
    if args.has("password-stdin") && args.has("saved-password") {
        return Err(fail(
            "INVALID_ARGUMENT",
            "--password-stdin 与 --saved-password 只能选择一个",
            2,
        ));
    }
    if args.flags.contains_key("storage") && !["keychain", "file"].contains(&args.value("storage"))
    {
        return Err(fail(
            "INVALID_ARGUMENT",
            "--storage 仅支持 keychain 或 file",
            2,
        ));
    }
    if args.path == "cli install" {
        return cli_install::install().map_err(Failure::from);
    }
    let dir = data_dir(args)?;
    let state = state(&dir);
    if args.path == "account list" {
        return Ok(json!(accounts(&state).iter().map(|id|json!({"id":id,"credentialMode":state.credentials.mode(id),"sessionSaved":state.directory.join(format!("{id}.cookies.json")).exists(),"hasSavedPassword":state.credentials.records.lock().unwrap().contains_key(id)})).collect::<Vec<_>>()));
    }
    let id = account(args, &state)?;
    if args.path == "auth login" || args.path == "auth begin" {
        return login(args, &state, &id).await;
    }
    if args.path == "auth finish" {
        let file: Value = serde_json::from_slice(
            &fs::read(challenge_path(&state, &id))
                .map_err(|_| fail("AUTH_REQUIRED", "找不到登录挑战，请运行 auth begin", 3))?,
        )
        .map_err(local)?;
        if chrono::Utc::now().timestamp() - file["createdAt"].as_i64().unwrap_or(0) > 600 {
            return Err(fail(
                "AUTH_REQUIRED",
                "登录挑战已过期，请重新运行 auth begin",
                3,
            ));
        }
        let cookies =
            cookie_store::serde::json::load(std::io::Cursor::new(string(&file["cookies"])))
                .map_err(local)?;
        let session = new_session(
            cookies,
            &id,
            state.preferences.clone(),
            state.credentials.clone(),
        )?;
        let auth = sso::SsoState::default();
        auth.pending
            .lock()
            .unwrap()
            .insert(id.clone(), (session, file["page"].clone()));
        return finish(args, &state, &id, &auth).await;
    }
    if args.path == "auth logout" {
        args.confirm()?;
        match fs::remove_file(state.directory.join(format!("{id}.cookies.json"))) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(local(e)),
        }
        return Ok(json!({"account":id,"sessionRemoved":true}));
    }
    let session = match get_session(&state, &id) {
        Ok(session) => session,
        Err(_) if args.has("refresh") => {
            let mut flags = args.flags.clone();
            flags.insert("saved-password".into(), "true".into());
            login(
                &Args {
                    path: "auth login".into(),
                    flags,
                },
                &state,
                &id,
            )
            .await?;
            get_session(&state, &id).map_err(Failure::from)?
        }
        Err(error) => return Err(error.into()),
    };
    let mut result = query(args, &session, &id).await;
    if args.has("refresh") && result.as_ref().is_err_and(|e| e.exit == 3) {
        let mut flags = args.flags.clone();
        flags.insert("saved-password".into(), "true".into());
        let auth_args = Args {
            path: "auth login".into(),
            flags,
        };
        login(&auth_args, &state, &id).await?;
        result = query(args, &get_session(&state, &id)?, &id).await;
    }
    save_session(&state, &id, &get_session(&state, &id)?).map_err(Failure::from)?;
    result
}
pub fn run() -> i32 {
    let parsed = parse();
    let output = parsed
        .as_ref()
        .map(|args| args.value("output"))
        .unwrap_or("json");
    let text = output == "text" || (output != "json" && std::io::stdout().is_terminal());
    let result = match &parsed {
        Ok(args) if ["", "auto", "json", "text"].contains(&args.value("output")) => {
            tokio::runtime::Runtime::new()
                .map_err(local)
                .and_then(|runtime| runtime.block_on(execute(args)))
        }
        Ok(_) => Err(fail(
            "INVALID_ARGUMENT",
            "--output 使用 auto、json 或 text",
            2,
        )),
        Err(error) => Err(error.clone()),
    };
    let (data, error, exit, complete) = match result {
        Ok(data) => {
            let partial = data["failures"].as_array().is_some_and(|v| !v.is_empty());
            (
                data,
                if partial {
                    json!({"code":"PARTIAL_RESULT","message":"部分课程读取失败，已保留成功结果，请查看 data.failures"})
                } else {
                    Value::Null
                },
                if partial { 7 } else { 0 },
                !partial,
            )
        }
        Err(error) => {
            let code = error.exit;
            (
                Value::Null,
                json!({"code":error.code,"message":safe_error(&error.message),"details":error.details}),
                code,
                false,
            )
        }
    };
    let next = if exit == 3 {
        json!(["auth begin", "auth finish --password-stdin"])
    } else if exit == 2 {
        json!(["schema"])
    } else {
        json!([])
    };
    let envelope = json!({"schema_version":1,"ok":exit==0,"data":data,"error":error,"meta":{"version":env!("CARGO_PKG_VERSION"),"timezone":"Asia/Shanghai","complete":complete},"next_actions":next});
    if text {
        if error.is_null() {
            println!("{}", serde_json::to_string_pretty(&data).unwrap());
        } else {
            eprintln!("{}", error["message"].as_str().unwrap_or("命令失败"));
        }
    } else if parsed.as_ref().is_ok_and(|a| a.has("pretty")) {
        println!("{}", serde_json::to_string_pretty(&envelope).unwrap());
    } else {
        println!("{envelope}");
    }
    exit
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn school_sm2_cipher_and_cli_encryption_use_same_layout() {
        let public="BCNfHMe8JNA+F0xYeDk+8jpQX/u7gIRDbmOvxyzq5cUyaEGp88qjQT78wi2lAzmdPM6OVMEwDiqrRWqeeO+789s=";
        let private = STANDARD
            .decode("xvTitqraFE8IaR0A1mRBX7OD024adxJl3Z6tn7UGSlI=")
            .unwrap();
        let key = sm2::pke::DecryptingKey::from_slice(&private).unwrap();
        let fixture="UIEP+/t+eev0UNqTlUNIFZzUsaqjQaWmNg7WNOVByPF2hzrndStvuEfJcFqvcv4T8E8AKLVcvt9n6tYkjPrw0kvbNI8rtpRtVfKVv8OUhOPSb0Viq61tu82u2xeJXT1QqnwnhCgIiaF/ThHqUsS2Tsnsg9rn";
        for cipher in [
            fixture.to_string(),
            encrypt("fixture-Password_123!", public).unwrap(),
        ] {
            let mut bytes = vec![4];
            bytes.extend(STANDARD.decode(cipher).unwrap());
            assert_eq!(key.decrypt(&bytes).unwrap(), b"fixture-Password_123!");
        }
    }
}
