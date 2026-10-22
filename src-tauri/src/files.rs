use super::*;
#[tauri::command]
// 参考来源：参考课程资源树和批量下载功能；目录遍历与路径保留由本项目实现。
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/screen/CoursewareScreen.kt
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/utils/DownloadUtil.kt
pub async fn download_resource_tree(
    username: String,
    course_id: String,
    parent_id: String,
    doc_type: Option<String>,
    folder_name: String,
    relative_path: Option<Vec<String>>,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let course = smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == course_id)
        .ok_or("找不到该课程")?;
    let course_name = string(&course["name"]);
    let mut stack = Vec::new();
    if let Some(doc) = doc_type {
        stack.push((
            parent_id,
            doc,
            relative_path
                .filter(|path| !path.is_empty())
                .unwrap_or_else(|| vec![course_name.clone(), folder_name]),
        ));
    } else {
        for (id, name) in parsers::RESOURCE_TYPES {
            stack.push((
                "0".into(),
                id.into(),
                vec![course_name.clone(), name.into()],
            ));
        }
    }
    let mut items = vec![];
    while let Some((parent, doc, path)) = stack.pop() {
        progress(
            &app,
            &username,
            &format!("正在读取资料目录 · {}", path.join(" / ")),
        );
        let children = fetch_children(&session, &smart, &course_id, &parent, &doc).await?;
        for node in children {
            if node["kind"] == "folder" {
                let mut path = path.clone();
                path.push(string(&node["name"]));
                stack.push((string(&node["sourceId"]), doc.clone(), path));
            } else {
                items.push(json!({"id":format!("tree-{}-{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),items.len()),"name":node["name"],"courseId":course_id,"rpId":node["rpId"],"url":node.get("url"),"downloadAllowed":node.get("downloadAllowed"),"relativePath":path,"kind":"resource"}));
            }
        }
    }
    if items.is_empty() {
        return Err("此目录暂无可下载文件".into());
    }
    media::download_items(
        username,
        serde_json::from_value(json!(items)).map_err(|e| e.to_string())?,
        app,
        state,
    )
    .await
}
#[tauri::command]
// 参考来源：参考课程上下文、iframe#pdfIframe 和静态 PDF 地址解析。
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt
pub async fn teaching_calendar(
    username: String,
    course_id: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let result = calendar_data(&session, &smart, &course_id).await?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
pub(super) async fn calendar_data(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
) -> Result<Value, String> {
    let course = smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == course_id)
        .ok_or("找不到该课程")?;
    let response = session
        .client
        .get(format!("{SMART}/coursePlatform/coursePlatform.shtml"))
        .query(&[
            ("method", "toCoursePlatform"),
            ("courseId", string(&course["course_num"]).as_str()),
            ("dataSource", "1"),
            ("cId", course_id),
            ("xkhId", string(&course["fz_id"]).as_str()),
            ("xqCode", smart.term.as_str()),
        ])
        .header("sessionid", &smart.id)
        .send()
        .await
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    let first = calendar_source(&response);
    let source = if let Some(source) = first {
        source
    } else {
        let page = session
            .client
            .get(format!("{SMART}/coursePlatform/coursePlatform.shtml"))
            .header("sessionid", &smart.id)
            .send()
            .await
            .map_err(network_error)?
            .text()
            .await
            .map_err(network_error)?;
        calendar_source(&page).ok_or("该课程尚未提供教学日历 PDF")?
    };
    let url = media::resource_url(&source, Some(false), &*session.preferences.lock().unwrap());
    Ok(
        json!({"id":format!("calendar-{course_id}"),"name":format!("{}_教学日历.pdf",string(&course["name"])),"url":url,"courseId":course_id}),
    )
}
fn calendar_source(page: &str) -> Option<String> {
    let doc = Html::parse_document(page);
    let src = doc
        .select(&selector("iframe#pdfIframe"))
        .next()?
        .value()
        .attr("src")?;
    let url = Url::parse(&learning::absolute_url(src)).ok()?;
    Some(
        url.query_pairs()
            .find(|(k, _)| k == "file")
            .map(|(_, v)| v.into_owned())
            .unwrap_or_else(|| url.to_string()),
    )
}
#[tauri::command]
pub async fn file_bytes(
    username: String,
    url: String,
    state: tauri::State<'_, CampusState>,
) -> Result<tauri::ipc::Response, String> {
    let session = get_session(&state, &username)?;
    let url = learning::absolute_url(&url);
    let mut request = session.client.get(&url);
    if Url::parse(&url).is_ok_and(|u| u.host_str() == Some("mail.bjtu.edu.cn")) {
        let sid = campus::mail_session(&session).await?;
        request = request.header(
            "Referer",
            format!("https://mail.bjtu.edu.cn/coremail/main.jsp?sid={sid}"),
        );
    }
    if Url::parse(&url).is_ok_and(|u| {
        u.host_str() == Some("123.121.147.7")
            && u.port() == Some(88)
            && u.path().starts_with("/ve/")
    }) {
        let smart = smart_session(&session).await?;
        request = request.header("sessionid", smart.id);
    }
    let response = request
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(network_error)?;
    if is_login_url(response.url()) {
        return Err(AUTH_EXPIRED.into());
    }
    let bytes = response
        .error_for_status()
        .map_err(network_error)?
        .bytes()
        .await
        .map_err(network_error)?;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}
