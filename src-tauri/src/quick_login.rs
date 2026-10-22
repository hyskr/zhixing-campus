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
// 主入口失败后经本科教学平台连接智慧课程；登录过期直接交由 SSO 续期。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/4046df747c51436aeb3432ef21f7e449736d660d/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/SmartPlatformHandshake.kt
const PORTAL_HOME: &str = "https://bksy.bjtu.edu.cn/login_introduce_t.html";
const PORTAL_BRIDGE: &str =
    "https://bksycenter.bjtu.edu.cn/NoMasterJumpPage.aspx?URL=jwcZhjx&FPC=page:jwcZhjx";
fn next_url(
    url: &Url,
    location: Option<&str>,
    body: &str,
    portal: bool,
) -> Result<Option<Url>, String> {
    if let Some(location) = location {
        let mut target = url.join(location).map_err(|_| "学校登录跳转地址无效")?;
        if target.host_str() == Some("bksycenter.bjtu.edu.cn")
            && target.path() == "/oauth2.ashx"
            && target.scheme() == "http"
        {
            let _ = target.set_scheme("https");
        }
        if is_login_url(&target) {
            return Err(AUTH_EXPIRED.into());
        }
        return Ok(Some(target));
    }
    if parsers::expired_page(body) {
        return Err(AUTH_EXPIRED.into());
    }
    if portal && url.as_str() == PORTAL_HOME {
        return Ok(Some(Url::parse(PORTAL_BRIDGE).unwrap()));
    }
    if url.host_str() == Some("123.121.147.7") && url.path() == "/ve/back/core/main/qx_kl.jsp" {
        return Ok(Some(
            url.join("index.shtml?method=index&type=qxkt").unwrap(),
        ));
    }
    let doc = Html::parse_document(body);
    if let Some(action) = doc
        .select(&selector("form#redirect"))
        .next()
        .and_then(|e| e.value().attr("action"))
    {
        let target = url.join(action).map_err(|_| "智慧课程跳转地址无效")?;
        if is_login_url(&target) {
            return Err(AUTH_EXPIRED.into());
        }
        return Ok(Some(target));
    }
    Ok(None)
}
async fn follow_entry(
    client: &Client,
    start: &str,
    portal: bool,
) -> Result<Option<String>, String> {
    let mut url = Url::parse(start).map_err(|_| "智慧课程入口地址无效")?;
    let mut referer = format!("{MIS}/home/");
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
            .header("Referer", &referer)
            .send()
            .await
            .map_err(network_error)?;
        if is_login_url(response.url()) {
            return Err(AUTH_EXPIRED.into());
        }
        let location = if response.status().is_redirection() {
            Some(
                response
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or("学校登录跳转缺少地址")?
                    .to_string(),
            )
        } else {
            None
        };
        let body = if location.is_none() {
            response
                .error_for_status()
                .map_err(network_error)?
                .text()
                .await
                .map_err(network_error)?
        } else {
            String::new()
        };
        if let Some(next) = next_url(&url, location.as_deref(), &body, portal)? {
            referer = url.to_string();
            url = next;
            continue;
        }
        return Ok(candidate);
    }
    Err("学校登录跳转次数过多，请稍后重试".into())
}
pub async fn enter_from_mis(session: &Session) -> Result<(), String> {
    let client = Client::builder()
        .cookie_provider(session.cookies.clone())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(35))
        .user_agent(USER_AGENT)
        .build()
        .map_err(network_error)?;
    let primary = follow_entry(&client, &format!("{MIS}/module/module/28/"), false).await;
    let token = match primary {
        Err(error) if error.contains(AUTH_EXPIRED) => return Err(error),
        Ok(token) if current_user(session).await.unwrap_or(false) => token,
        _ => {
            let token = follow_entry(&client, &format!("{MIS}/module/module/104/"), true).await?;
            if !current_user(session).await? {
                return Err("备用入口未能建立当前账号的智慧课程会话，请重试".into());
            }
            token
        }
    };
    if let Some(token) = token {
        let prior = session
            .quick
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .or_else(|| session.credentials.quick(&session.username));
        if prior.as_deref() != Some(&token) {
            session.credentials.put_quick(&session.username, &token)?;
        }
        *session.quick.lock().map_err(|e| e.to_string())? = Some(token);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn handshake_follows_form_and_http_redirect_without_old_query() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let mut paths = Vec::new();
            for stage in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut bytes = [0; 4096];
                let size = stream.read(&mut bytes).unwrap();
                let request = String::from_utf8_lossy(&bytes[..size]);
                paths.push(request.lines().next().unwrap().to_string());
                let response=match stage{
                    0=>{let body="<form id='redirect' action='/bridge?new=2'></form>";format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len())},
                    1=>"HTTP/1.1 302 Found\r\nLocation: /landed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
                    _=>"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK".into()
                };
                stream.write_all(response.as_bytes()).unwrap();
            }
            paths
        });
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        assert!(
            follow_entry(&client, &format!("http://{address}/module?old=1"), false)
                .await
                .unwrap()
                .is_none()
        );
        let paths = worker.join().unwrap();
        assert_eq!(
            paths,
            vec![
                "GET /module?old=1 HTTP/1.1",
                "GET /bridge?new=2 HTTP/1.1",
                "GET /landed HTTP/1.1"
            ]
        );
    }
    #[test]
    fn portal_bridge_and_script_landing_follow_known_routes() {
        let home = Url::parse(PORTAL_HOME).unwrap();
        assert_eq!(
            next_url(&home, None, "", true).unwrap().unwrap().as_str(),
            PORTAL_BRIDGE
        );
        let oauth = next_url(
            &home,
            Some("http://bksycenter.bjtu.edu.cn/oauth2.ashx?code=test"),
            "",
            true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(oauth.scheme(), "https");
        let landing = Url::parse("http://123.121.147.7:88/ve/back/core/main/qx_kl.jsp").unwrap();
        assert_eq!(
            next_url(&landing, None, "", true)
                .unwrap()
                .unwrap()
                .as_str(),
            "http://123.121.147.7:88/ve/back/core/main/index.shtml?method=index&type=qxkt"
        );
    }
    #[test]
    fn relative_redirect_replaces_old_query_and_login_expiry_stops() {
        let url = Url::parse("https://mis.bjtu.edu.cn/module/module/28/?old=1").unwrap();
        assert_eq!(
            next_url(
                &url,
                None,
                r#"<form id="redirect" action="/bridge?new=2"></form>"#,
                false
            )
            .unwrap()
            .unwrap()
            .as_str(),
            "https://mis.bjtu.edu.cn/bridge?new=2"
        );
        assert_eq!(
            next_url(
                &url,
                Some("https://sso.bjtu.edu.cn/o/authorize/?state=1"),
                "",
                true
            )
            .unwrap_err(),
            AUTH_EXPIRED
        );
    }
}
