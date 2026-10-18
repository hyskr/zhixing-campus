use super::*;
#[derive(Default)]
pub struct SsoState {
    pending: Mutex<HashMap<String, (Session, Value)>>,
}
fn extract(page: &str, name: &str) -> Value {
    let pattern = regex::Regex::new(&format!(
        r"(?m)(?:var|let|const)\s+{}\s*=\s*(.*?);\s*$",
        regex::escape(name)
    ))
    .unwrap();
    pattern
        .captures(page)
        .and_then(|m| serde_json::from_str(&m[1]).ok())
        .unwrap_or(Value::Null)
}
// 参考来源：参考 loginForm、ssoConfig、flowId 和 SM2 加密登录协议；加密使用 gm-crypto。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/cas/system.js
fn parse(page: &str) -> Value {
    let doc = Html::parse_document(page);
    let fields: HashMap<_, _> = doc
        .select(&selector("form#loginForm input[name]"))
        .map(|e| {
            (
                e.value().attr("name").unwrap().to_string(),
                e.value().attr("value").unwrap_or("").to_string(),
            )
        })
        .collect();
    json!({"fields":fields,"config":extract(page,"ssoConfig"),"error":extract(page,"error")})
}
#[tauri::command]
pub async fn begin_sso(
    username: String,
    state: tauri::State<'_, CampusState>,
    sso: tauri::State<'_, SsoState>,
) -> Result<Value, String> {
    valid_username(&username)?;
    let session = new_session(
        CookieStore::default(),
        &username,
        state.preferences.clone(),
        state.credentials.clone(),
    )?;
    let response = get(&session, campus::shortcut("sso").unwrap(), None).await?;
    let body = response.text().await.map_err(network_error)?;
    let page = parse(&body);
    if string(&page["fields"]["flowId"]).is_empty() {
        return Err("新版 SSO 未返回登录表单，请稍后重试".into());
    }
    let result = json!({"publicKey":page["config"]["sm2"]["publicKey"]});
    sso.pending
        .lock()
        .unwrap()
        .insert(username, (session, page));
    Ok(result)
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
    let (session, mut page) = sso
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
    if let Some(id) = page["captchaId"].as_str() {
        fields.insert(
            "captcha".into(),
            json!({"captchaId":id,"captchaValue":answer.unwrap_or_default()}).to_string(),
        );
    }
    let response = session
        .client
        .post("https://sso.bjtu.edu.cn/sso/login")
        .header("Origin", "https://sso.bjtu.edu.cn")
        .header("Referer", campus::shortcut("sso").unwrap())
        .form(&fields)
        .send()
        .await
        .map_err(network_error)?;
    let host = response.url().host_str().unwrap_or("").to_string();
    let text = response.text().await.map_err(network_error)?;
    let next = parse(&text);
    if !next["error"].is_null() {
        let message = string(&next["error"]["msg"]);
        if next["error"]["data"]["captchaType"] == "penggle.image" {
            let scene = string(&page["config"]["captchaProvider"]["scene"]);
            let root = session
                .client
                .post("https://sso.bjtu.edu.cn/api/captcha/getCaptcha")
                .body(scene)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .send()
                .await
                .map_err(network_error)?
                .json::<Value>()
                .await
                .map_err(network_error)?;
            let mut image = string(&root["data"]["captchaImg"]);
            if image.starts_with("https://")
                || image.starts_with("http://")
                || image.starts_with('/')
            {
                let url = Url::parse("https://sso.bjtu.edu.cn/")
                    .unwrap()
                    .join(&image)
                    .map_err(|e| e.to_string())?;
                let response = session
                    .client
                    .get(url)
                    .send()
                    .await
                    .map_err(network_error)?
                    .error_for_status()
                    .map_err(network_error)?;
                let bytes = response.bytes().await.map_err(network_error)?;
                image = format!("data:image/png;base64,{}", STANDARD.encode(bytes));
            }
            page["captchaId"] = root["data"]["captchaId"].clone();
            page["fields"] = next["fields"].clone();
            let result = json!({"captchaRequired":true,"image":if image.starts_with("data:"){image}else{format!("data:image/png;base64,{image}")},"publicKey":page["config"]["sm2"]["publicKey"],"message":message});
            sso.pending
                .lock()
                .unwrap()
                .insert(username, (session, page));
            return Ok(result);
        }
        return Err(if message.is_empty() {
            "新版 SSO 登录失败".into()
        } else {
            message
        });
    }
    if host != "uc.bjtu.edu.cn" {
        return Err("新版 SSO 尚需进一步验证，请在学校 SSO 页面完成".into());
    }
    state
        .credentials
        .put(&username, &password, &credential_mode, "sso")?;
    save_session(&state, &username, &session)?;
    state.sessions.lock().unwrap().insert(username, session);
    Ok(json!({"ok":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_sso_fields_and_public_key() {
        let page = parse(
            r#"<form id="loginForm"><input name="flowId" value="flow-1"></form>
var ssoConfig = {"sm2":{"enabled":true,"publicKey":"test"}};
var error = null;"#,
        );
        assert_eq!(page["fields"]["flowId"], "flow-1");
        assert_eq!(page["config"]["sm2"]["publicKey"], "test");
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
