use super::*;
pub async fn current_user(session: &Session) -> Result<bool, String> {
    let response = get(
        session,
        &format!("{SMART}/coursePlatform/coursePlatform.shtml?method=getUserInfo"),
        None,
    )
    .await?;
    let body = response.text().await.map_err(network_error)?;
    let Ok(root) = parsers::smart_response(&body) else {
        return Ok(false);
    };
    Ok(string(&root["result"]["loginName"]) == session.username)
}
// 参考来源：参考 quickUsername 恢复及失效处理；仅保存当前账号经 MIS 跳转取得的值。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/login-service.js
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/login-utils.js
pub async fn restore(session: &Session) -> Result<bool, String> {
    if !session
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .quick_login
    {
        return Ok(false);
    }
    let token = session
        .quick
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .or_else(|| session.credentials.quick(&session.username));
    let Some(token) = token else { return Ok(false) };
    session
        .client
        .get("http://123.121.147.7:88/ve/s.shtml")
        .query(&[
            ("loginType", "2"),
            ("login", "main_2"),
            ("username", token.as_str()),
        ])
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?;
    if current_user(session).await? {
        return Ok(true);
    }
    *session.quick.lock().map_err(|e| e.to_string())? = None;
    session.credentials.forget_quick(&session.username)?;
    Ok(false)
}
pub async fn enter_from_mis(session: &Session) -> Result<(), String> {
    let client = Client::builder()
        .cookie_provider(session.cookies.clone())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(35))
        .user_agent(USER_AGENT)
        .build()
        .map_err(network_error)?;
    let mut url = Url::parse(&format!("{MIS}/module/module/28/")).unwrap();
    let mut candidate = None;
    for _ in 0..15 {
        if url.host_str() == Some("123.121.147.7") && url.path() == "/ve/s.shtml" {
            let fields: HashMap<_, _> = url.query_pairs().into_owned().collect();
            if fields.get("loginType").map(String::as_str) == Some("2") {
                candidate = fields.get("username").cloned();
            }
        }
        let response = client
            .get(url.clone())
            .header("Referer", format!("{MIS}/home/"))
            .send()
            .await
            .map_err(network_error)?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("学校登录跳转缺少地址")?;
            url = url.join(location).map_err(|_| "学校登录跳转地址无效")?;
            if is_login_url(&url) {
                return Err(AUTH_EXPIRED.into());
            }
            continue;
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
        if url.host_str() != Some("123.121.147.7") {
            let doc = Html::parse_document(&body);
            let action = doc
                .select(&selector("form#redirect"))
                .next()
                .and_then(|e| e.value().attr("action"));
            if let Some(action) = action {
                url = url.join(action).map_err(|_| "智慧课程跳转地址无效")?;
                continue;
            }
        }
        if !current_user(session).await? {
            return Err(AUTH_EXPIRED.into());
        }
        if let Some(token) = candidate {
            *session.quick.lock().map_err(|e| e.to_string())? = Some(token.clone());
            session.credentials.put_quick(&session.username, &token)?;
        }
        return Ok(());
    }
    Err("学校登录跳转次数过多，请稍后重试".into())
}
