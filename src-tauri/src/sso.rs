use super::*;
#[derive(Default)]
pub struct SsoState {
    pub(super) pending: Mutex<HashMap<String, (Session, Value)>>,
    captcha_users: Mutex<std::collections::HashSet<String>>,
}
const HOME: &str = "https://mis.bjtu.edu.cn/home/";
// MIS OAuth 登录、411xx 验证码和 SM2 布局参考：
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/cc23379ce76396944199220557790fd1f6ce7993/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SchoolLoginProtocol.kt
// 多行 JSON 配置解析参考：
// https://github.com/s1y4x1/BJTU-course-assistant/blob/99a6a370e62b0a09a0f16848866c1e25569bc5a8/modules/cas/system.js
fn extract(page: &str, name: &str) -> Value {
    let pattern = regex::Regex::new(&format!(
        r"\b(?:var|let|const)\s+{}\s*=\s*",
        regex::escape(name)
    ))
    .unwrap();
    pattern
        .find(page)
        .and_then(|m| {
            serde_json::Deserializer::from_str(&page[m.end()..])
                .into_iter::<Value>()
                .next()
        })
        .and_then(Result::ok)
        .unwrap_or(Value::Null)
}
fn parse(page: &str) -> Value {
    let doc = Html::parse_document(page);
    let fields: HashMap<_, _> = doc
        .select(&selector("form#loginForm input[name]"))
        .filter(|e| e.value().attr("type") != Some("checkbox"))
        .map(|e| {
            (
                e.value().attr("name").unwrap().to_string(),
                e.value().attr("value").unwrap_or("").to_string(),
            )
        })
        .collect();
    json!({"fields":fields,"config":extract(page,"ssoConfig"),"error":extract(page,"error")})
}
fn needs_captcha(error: &Value) -> bool {
    let code = string(&error["code"]).parse::<u32>().unwrap_or(0);
    (41100..41200).contains(&code) || !string(&error["data"]["captchaType"]).is_empty()
}
fn home_page(url: &Url, body: &str) -> bool {
    url.host_str() == Some("mis.bjtu.edu.cn")
        && url.path().trim_end_matches('/') == "/home"
        && !parsers::expired_page(body)
}
fn challenge(page: &Value) -> Value {
    json!({"publicKey":page["config"]["sm2"]["publicKey"].as_str().unwrap_or(""),"captchaRequired":page["captchaId"].is_string(),"image":page["image"].as_str().unwrap_or("")})
}
fn validate_page(page: &Value) -> Result<(), String> {
    if string(&page["fields"]["flowId"]).is_empty() {
        return Err("统一身份认证未返回登录表单，请重新连接".into());
    }
    match page["config"]["sm2"]["enabled"].as_bool() {
        Some(true) if !string(&page["config"]["sm2"]["publicKey"]).is_empty() => Ok(()),
        Some(false) => Ok(()),
        _ => Err("统一身份认证未返回有效的密码加密配置".into()),
    }
}
async fn captcha(session: &Session, page: &mut Value) -> Result<(), String> {
    let scene = page["config"]["captchaProvider"]["scene"]
        .as_str()
        .or_else(|| page["error"]["data"]["scene"].as_str())
        .or_else(|| page["error"]["data"]["captchaScene"].as_str())
        .unwrap_or("");
    let root = session
        .client
        .post("https://sso.bjtu.edu.cn/api/captcha/getCaptcha")
        .header("Origin", "https://sso.bjtu.edu.cn")
        .header("Referer", string(&page["url"]))
        .header("X-Requested-With", "XMLHttpRequest")
        .header(
            "Content-Type",
            "application/x-www-form-urlencoded; charset=UTF-8",
        )
        .body(scene.to_string())
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?
        .json::<Value>()
        .await
        .map_err(network_error)?;
    let image = string(&root["data"]["captchaImg"]);
    let id = string(&root["data"]["captchaId"]);
    if image.is_empty() || id.is_empty() {
        return Err("统一身份认证未返回验证码图片，请刷新".into());
    }
    let data = if image.starts_with("https://")
        || image.starts_with("http://")
        || image.starts_with('/')
    {
        let url = Url::parse("https://sso.bjtu.edu.cn/")
            .unwrap()
            .join(&image)
            .map_err(|e| e.to_string())?;
        let bytes = session
            .client
            .get(url)
            .send()
            .await
            .map_err(network_error)?
            .error_for_status()
            .map_err(network_error)?
            .bytes()
            .await
            .map_err(network_error)?;
        format!("data:image/png;base64,{}", STANDARD.encode(bytes))
    } else if image.starts_with("data:") {
        image
    } else {
        format!("data:image/png;base64,{image}")
    };
    page["captchaId"] = json!(id);
    page["image"] = json!(data);
    Ok(())
}
#[tauri::command]
pub async fn begin_sso(
    username: String,
    fresh: Option<bool>,
    state: tauri::State<'_, CampusState>,
    sso: tauri::State<'_, SsoState>,
) -> Result<Value, String> {
    begin_with_state(username, fresh, &state, &sso).await
}
pub(super) async fn begin_with_state(
    username: String,
    fresh: Option<bool>,
    state: &CampusState,
    sso: &SsoState,
) -> Result<Value, String> {
    valid_username(&username)?;
    let session = if fresh == Some(false) {
        get_session(&state, &username).ok()
    } else {
        None
    };
    // 每个账号使用独立 CookieStore，新登录不继承其他账号的 MIS/TGC。
    let session = match session {
        Some(session) => session,
        None => new_session(
            CookieStore::default(),
            &username,
            state.preferences.clone(),
            state.credentials.clone(),
        )?,
    };
    let response = get(&session, HOME, None).await?;
    let url = response.url().clone();
    let body = response.text().await.map_err(network_error)?;
    if home_page(&url, &body) {
        let profile = parsers::student(&body, &username)?;
        save_session(&state, &username, &session)?;
        state.sessions.lock().unwrap().insert(username, session);
        return Ok(json!({"profile":profile}));
    }
    if url.host_str() != Some("sso.bjtu.edu.cn") {
        return Err("MIS 未跳转到统一身份认证，请稍后重试".into());
    }
    let mut page = parse(&body);
    validate_page(&page)?;
    page["url"] = json!(url.as_str());
    let requested =
        needs_captcha(&page["error"]) || sso.captcha_users.lock().unwrap().contains(&username);
    if requested {
        captcha(&session, &mut page).await?;
    }
    let mut result = challenge(&page);
    result["credentialMode"] = json!(state.credentials.mode(&username));
    sso.pending
        .lock()
        .unwrap()
        .insert(username, (session, page));
    Ok(result)
}
#[tauri::command]
pub async fn refresh_sso_captcha(
    username: String,
    sso: tauri::State<'_, SsoState>,
) -> Result<Value, String> {
    let (session, mut page) = sso
        .pending
        .lock()
        .unwrap()
        .remove(&username)
        .ok_or("SSO 登录已过期，请重新开始")?;
    let result = captcha(&session, &mut page).await.map(|_| challenge(&page));
    sso.pending
        .lock()
        .unwrap()
        .insert(username, (session, page));
    result
}
#[tauri::command]
pub async fn finish_sso(
    username: String,
    password: String,
    encrypted_password: String,
    answer: Option<String>,
    credential_mode: String,
    state: tauri::State<'_, CampusState>,
    sso: tauri::State<'_, SsoState>,
) -> Result<Value, String> {
    match finish_authentication(username.clone(), encrypted_password, answer, &sso).await? {
        Completion::Challenge(value) => Ok(value),
        Completion::Authenticated(session, profile) => {
            state
                .credentials
                .put(&username, &password, &credential_mode, "sso")?;
            if credential_mode == "session" {
                let _ = fs::remove_file(state.directory.join(format!("{username}.cookies.json")));
            }
            save_session(&state, &username, &session)?;
            state.sessions.lock().unwrap().insert(username, session);
            Ok(json!({"profile":profile}))
        }
    }
}
pub(super) enum Completion {
    Challenge(Value),
    Authenticated(Session, Value),
}
pub(super) async fn finish_authentication(
    username: String,
    encrypted_password: String,
    answer: Option<String>,
    sso: &SsoState,
) -> Result<Completion, String> {
    let (session, page) = sso
        .pending
        .lock()
        .unwrap()
        .remove(&username)
        .ok_or("SSO 登录已过期，请重新开始")?;
    let mut fields: HashMap<String, String> =
        serde_json::from_value(page["fields"].clone()).map_err(|e| e.to_string())?;
    fields.insert("username".into(), username.clone());
    fields.insert("password".into(), encrypted_password);
    fields.insert("loginType".into(), "username_password".into());
    fields.insert(
        "captcha".into(),
        page["captchaId"]
            .as_str()
            .map(|id| {
                json!({"captchaId":id,"captchaValue":answer.unwrap_or_default().trim()}).to_string()
            })
            .unwrap_or_default(),
    );
    let response = session
        .client
        .post("https://sso.bjtu.edu.cn/sso/login")
        .header("Origin", "https://sso.bjtu.edu.cn")
        .header("Referer", string(&page["url"]))
        .form(&fields)
        .send()
        .await
        .map_err(network_error)?;
    let url = response.url().clone();
    let body = response.text().await.map_err(network_error)?;
    let mut next = parse(&body);
    if !next["error"].is_null() {
        let message = string(&next["error"]["msg"]);
        if needs_captcha(&next["error"]) {
            sso.captcha_users.lock().unwrap().insert(username.clone());
            validate_page(&next)?;
            next["url"] = json!(url.as_str());
            captcha(&session, &mut next).await?;
            let mut result = challenge(&next);
            result["message"] = json!(if message.is_empty() {
                "请输入统一身份认证的字母验证码".to_string()
            } else {
                message
            });
            sso.pending
                .lock()
                .unwrap()
                .insert(username, (session, next));
            return Ok(Completion::Challenge(result));
        }
        return Err(if string(&next["error"]["code"]) == "40400" {
            "账号或密码错误，请检查后重试".into()
        } else if message.is_empty() {
            "统一身份认证登录失败，请重新连接".into()
        } else {
            message
        });
    }
    let html = if home_page(&url, &body) {
        body
    } else {
        let home = get(&session, HOME, None).await?;
        let target = home.url().clone();
        let html = home.text().await.map_err(network_error)?;
        if !home_page(&target, &html) {
            return Err("统一身份认证尚未完成 MIS 授权，请重新登录".into());
        }
        html
    };
    let profile = parsers::student(&html, &username)?;
    sso.captcha_users.lock().unwrap().remove(&username);
    Ok(Completion::Authenticated(session, profile))
}

pub async fn logout(session: &Session) {
    if let Ok(client) = Client::builder()
        .cookie_provider(session.cookies.clone())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .user_agent(USER_AGENT)
        .build()
    {
        for url in [
            "https://mis.bjtu.edu.cn/auth/slogout/",
            "https://sso.bjtu.edu.cn/sso/logout?next=https%3A%2F%2Fmis.bjtu.edu.cn%2Fhome%2F",
        ] {
            let _ = client.get(url).send().await;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_multiline_json_and_skips_checkbox() {
        let page = parse(
            r#"<form id="loginForm"><input name="flowId" value="f1"><input name="username"><input name="password"><input name="remember" type="checkbox" value="true"></form>
var ssoConfig = {
 "sm2": {"enabled":true,"publicKey":"test"},"nested":{"values":[1,2]}
}; var error = {"code":41102,"msg":"校验码","data":{}};
"#,
        );
        assert_eq!(page["fields"]["flowId"], "f1");
        assert!(page["fields"].get("remember").is_none());
        assert_eq!(page["config"]["sm2"]["publicKey"], "test");
        assert!(needs_captcha(&page["error"]));
        assert!(!needs_captcha(&json!({"code":40400})));
        assert!(needs_captcha(&json!({"code":"41100"})));
    }
    #[test]
    fn accepts_only_authenticated_mis_home() {
        assert!(home_page(&Url::parse(HOME).unwrap(), "<h1>首页</h1>"));
        assert!(!home_page(
            &Url::parse("https://sso.bjtu.edu.cn/o/authorize/").unwrap(),
            "<form id='loginForm'></form>"
        ));
        assert!(!home_page(
            &Url::parse(HOME).unwrap(),
            "<input type='password'>"
        ));
    }
    #[test]
    #[ignore = "读取指定公开 SSO 页面，只核对表单及公钥"]
    fn live_sso_page() {
        let page = parse(&fs::read_to_string(std::env::var("CAMPUS_SSO_HTML").unwrap()).unwrap());
        validate_page(&page).unwrap();
        assert!(!string(&page["config"]["sm2"]["publicKey"]).is_empty());
        println!("MIS SSO form and SM2 public key parsed");
    }
}
pub fn merge_sessions(target: &Session, source: &Session) -> Result<(), String> {
    let sso = Url::parse("https://sso.bjtu.edu.cn/").unwrap();
    let uc = Url::parse("https://uc.bjtu.edu.cn/").unwrap();
    let cookies: Vec<_> = source
        .cookies
        .lock()
        .map_err(|e| e.to_string())?
        .iter_any()
        .filter(|cookie| cookie.domain.matches(&sso) || cookie.domain.matches(&uc))
        .cloned()
        .collect();
    let mut jar = target.cookies.lock().map_err(|e| e.to_string())?;
    for cookie in cookies {
        let domain = cookie.domain.as_cow().unwrap().into_owned();
        let url = Url::parse(&format!("https://{domain}/")).map_err(|e| e.to_string())?;
        let _ = jar.insert(cookie, &url);
    }
    Ok(())
}
#[cfg(test)]
mod merge_tests {
    use super::*;
    #[test]
    fn cas_bridge_preserves_sso_and_mis_cookies() {
        let prefs = Arc::new(Mutex::new(settings::Preferences::default()));
        let store = Arc::new(credentials::Store::default());
        let source = new_session(
            CookieStore::default(),
            "10001",
            prefs.clone(),
            store.clone(),
        )
        .unwrap();
        let target = new_session(CookieStore::default(), "10001", prefs, store).unwrap();
        let sso = Url::parse("https://sso.bjtu.edu.cn/").unwrap();
        let mis = Url::parse("https://mis.bjtu.edu.cn/").unwrap();
        source
            .cookies
            .lock()
            .unwrap()
            .parse("sso-session=test; Path=/; Secure", &sso)
            .unwrap();
        target
            .cookies
            .lock()
            .unwrap()
            .parse("mis-session=test; Path=/; Secure", &mis)
            .unwrap();
        merge_sessions(&target, &source).unwrap();
        let jar = target.cookies.lock().unwrap();
        assert_eq!(jar.get_request_values(&sso).count(), 1);
        assert_eq!(jar.get_request_values(&mis).count(), 1);
    }
}
