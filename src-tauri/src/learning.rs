use super::*;
use serde::Deserialize;

pub fn absolute_url(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    if raw.starts_with("http://") || raw.starts_with("https://") {
        return raw.into();
    }
    let path = raw.trim_start_matches("W:\\Root").replace('\\', "/");
    if path.starts_with("/rp/") || path.starts_with("rp/") {
        format!("http://123.121.147.7:8081/{}", path.trim_start_matches('/'))
    } else {
        Url::parse("http://123.121.147.7:88/ve/")
            .unwrap()
            .join(&path)
            .map(|v| v.to_string())
            .unwrap_or_default()
    }
}
fn encode(raw: &str) -> String {
    Url::parse_with_params("http://localhost/", &[("v", raw)])
        .unwrap()
        .query()
        .unwrap()[2..]
        .replace('+', "%20")
}
fn attachment(item: &Value, index: usize) -> Value {
    json!({"id":string(&item["id"]),"name":if string(&item["file_name"]).is_empty(){format!("附件 {}",index+1)}else{string(&item["file_name"]).replace('+'," ")},"convertUrl":absolute_url(&string(&item["convert_url"])),"size":item["pic_size"].as_u64().unwrap_or_else(||string(&item["pic_size"]).parse().unwrap_or(0)),"url":absolute_url(&string(&item["url"]))})
}
pub fn review_html(body: &str) -> Value {
    let doc = Html::parse_document(body);
    let score = doc
        .select(&selector("#oldScore,input[name=oldScore]"))
        .next()
        .and_then(|e| e.value().attr("value"))
        .unwrap_or("");
    let comment = doc
        .select(&selector("#pigaiContent,textarea[name=pigaiContent]"))
        .next()
        .map(|e| e.text().collect::<String>())
        .unwrap_or_default();
    let content=doc.select(&selector("#stuContent,#workContent,#homeworkContent,.stuWorkContent,.studentContent,.markContentLeftNew,.markContentLeft")).next().map(|e|e.inner_html()).unwrap_or_default();
    let pattern = regex::Regex::new(r"\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)").unwrap();
    let attachments: Vec<_> = doc
        .select(&selector("div.homeworkContent"))
        .filter_map(|e| {
            let m = pattern.captures(e.value().attr("onclick")?)?;
            let mut url = Url::parse("http://123.121.147.7:88/ve/downloadZyFj.shtml").unwrap();
            url.query_pairs_mut().extend_pairs([
                ("path", &m[1]),
                ("filename", &m[2]),
                ("id", &m[3]),
            ]);
            Some(json!({"id":&m[3],"name":m[2].replace('+'," "),"url":url.as_str(),"size":0}))
        })
        .collect();
    let available =
        !score.is_empty() || !comment.is_empty() || !content.is_empty() || !attachments.is_empty();
    json!({"content":content,"attachments":attachments,"score":score,"comment":comment,"available":available})
}
async fn raw_homework(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    source_id: &str,
    kind: usize,
) -> Result<Value, String> {
    let c = smart
        .courses
        .iter()
        .find(|v| string(&v["id"]) == course_id)
        .ok_or("找不到该课程，请同步后重试")?;
    let root = smart_json(
        session,
        "coursePlatform/homeWork.shtml",
        &[
            ("method", "getHomeWorkList".into()),
            ("cId", course_id.into()),
            ("subType", kind.to_string()),
            ("page", "1".into()),
            ("pagesize", "100".into()),
        ],
        Some(&smart.id),
    )
    .await?;
    let total = string(&root["total"])
        .parse::<usize>()
        .unwrap_or(0)
        .max(100);
    let mut found = parsers::list(&root, "courseNoteList")?
        .iter()
        .find(|h| string(&h["id"]) == source_id)
        .cloned();
    if found.is_none() && total > 100 {
        let root = smart_json(
            session,
            "coursePlatform/homeWork.shtml",
            &[
                ("method", "getHomeWorkList".into()),
                ("cId", string(&c["id"])),
                ("subType", kind.to_string()),
                ("page", "1".into()),
                ("pagesize", total.to_string()),
            ],
            Some(&smart.id),
        )
        .await?;
        found = parsers::list(&root, "courseNoteList")?
            .iter()
            .find(|h| string(&h["id"]) == source_id)
            .cloned();
    }
    found.ok_or("该作业已变更，请刷新课程作业".into())
}
#[tauri::command]
pub async fn homework_detail(
    username: String,
    course_id: String,
    source_id: String,
    kind: usize,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let result = detail_data(&session, &smart, &course_id, &source_id, kind).await?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
// 参考来源：参考作业详情与提交记录接口；正文、附件、分数和批语映射为本项目结构。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/HomeworkSubmissionHtmlParser.kt
pub(super) async fn detail_data(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    source_id: &str,
    kind: usize,
) -> Result<Value, String> {
    let raw = raw_homework(&session, &smart, &course_id, &source_id, kind).await?;
    let course = smart
        .courses
        .iter()
        .find(|c| string(&c["id"]) == course_id)
        .unwrap();
    let root = smart_json(
        &session,
        "coursePlatform/homeWork.shtml",
        &[
            ("method", "queryStudentCourseNote".into()),
            ("id", source_id.into()),
            ("courseId", course_id.into()),
            ("teacherId", string(&course["teacher_id"])),
        ],
        Some(&smart.id),
    )
    .await?;
    if !string(&root["STATUS"]).is_empty() && string(&root["STATUS"]) != "0" {
        return Err("学校未返回作业详情，请重试".into());
    }
    let detail = &root["homeWork"];
    let mut result = json!({"content":if detail["content"].is_null(){string(&raw["content"])}else{string(&detail["content"])},"attachments":root["picList"].as_array().unwrap_or(&Vec::new()).iter().enumerate().map(|(i,v)|attachment(v,i)).collect::<Vec<_>>(),"submittedContent":"","submittedAttachments":[],"submittedAt":string(&raw["subTime"]),"status":string(&raw["subStatus"]),"score":string(&raw["stu_score"]),"comment":string(&raw["returnContent"]),"openedAt":string(&raw["open_date"]),"deadline":string(&raw["end_time"]),"repeatAllowed":string(&raw["is_repeat"])!="0","submitCount":raw["submitCount"],"allCount":raw["allCount"],"reviewStatus":if string(&raw["pyNum"]).parse::<u64>().unwrap_or(0)>0{"已批改"}else{"未批改"},"reviewError":""});
    let sn = string(&raw["snId"]);
    if !sn.is_empty() {
        let response=session.client.get(format!("{SMART}/course/courseWorkInfo.shtml"))
            .query(&[("method","piGaiDiv"),("upId",source_id),("id",sn.as_str()),("uLevel","1"),("type",kind.to_string().as_str()),("score",string(&raw["score"]).as_str()),("sessionId",smart.id.as_str())])
            .header("sessionid",&smart.id).header("Referer",format!("{SMART}/coursePlatform/coursePlatform.shtml?method=toCoursePlatform&cId={course_id}"))
            .send().await.map_err(network_error)?;
        let body = response
            .error_for_status()
            .map_err(network_error)?
            .text_with_charset("gb18030")
            .await
            .map_err(network_error)?;
        let parsed = review_html(&body);
        if parsed["available"] == true {
            result["submittedContent"] = parsed["content"].clone();
            result["submittedAttachments"] = parsed["attachments"].clone();
            if !string(&parsed["score"]).is_empty() {
                result["score"] = parsed["score"].clone()
            }
            if !string(&parsed["comment"]).is_empty() {
                result["comment"] = parsed["comment"].clone()
            }
        } else {
            result["reviewError"] = json!("学校暂未返回提交详情与批改信息，可稍后重试");
        }
    }
    Ok(result)
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedFile {
    pub name: String,
    pub size: u64,
    pub visit_name: String,
}
pub fn upload_item(file: &UploadedFile) -> Value {
    let (stem, ext) = file.name.rsplit_once('.').unwrap_or((&file.name, ""));
    json!({"fileNameNoExt":encode(stem),"fileExtName":ext,"fileSize":file.size.to_string(),"visitName":file.visit_name,"pid":"","ftype":"insert"})
}
#[tauri::command]
pub async fn upload_file(
    username: String,
    name: String,
    data: String,
    note_id: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let result = upload_data(&session, &smart, &name, &data, note_id.as_deref()).await?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
// 参考来源：参考学生上传入口、multipart 字段和上传结果中的 visitName。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-common.js
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-manager.js
async fn upload_data(
    session: &Session,
    smart: &SmartSession,
    name: &str,
    data: &str,
    note_id: Option<&str>,
) -> Result<Value, String> {
    let bytes = STANDARD.decode(data).map_err(|_| "无法读取所选文件")?;
    upload_bytes(session, smart, name, bytes, note_id).await
}
pub(super) async fn upload_bytes(
    session: &Session,
    smart: &SmartSession,
    name: &str,
    bytes: Vec<u8>,
    note_id: Option<&str>,
) -> Result<Value, String> {
    let size = bytes.len();
    let body = reqwest::multipart::Form::new().part(
        "file",
        reqwest::multipart::Part::bytes(bytes).file_name(name.to_string()),
    );
    let response = session
        .client
        .post(format!("{SMART}/rp/common/homeworkUpload.shtml"))
        .query(&[("noteId", note_id.as_deref().unwrap_or("1"))])
        .header("sessionid", &smart.id)
        .multipart(body)
        .timeout(Duration::from_secs(3600))
        .send()
        .await
        .map_err(network_error)?;
    let text = response
        .error_for_status()
        .map_err(network_error)?
        .text()
        .await
        .map_err(network_error)?;
    if parsers::expired_page(&text) {
        return Err(AUTH_EXPIRED.into());
    }
    let root = parsers::smart_response(&text)?;
    let visit = string(&root["visitName"]);
    if visit.is_empty() {
        return Err(if !string(&root["ERRMSG"]).is_empty() {
            string(&root["ERRMSG"])
        } else {
            "学校未返回上传地址".into()
        });
    }
    let path = visit
        .strip_prefix("W:\\Root")
        .unwrap_or(&visit)
        .replace('\\', "/");
    Ok(
        json!({"id":format!("upload-{}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()),"name":name,"size":size,"visitName":visit,"url":format!("http://123.121.147.7:8081/{}",path.trim_start_matches('/'))}),
    )
}
#[tauri::command]
// 参考来源：参考提交接口、正文及 fileList 附件字段。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-common.js
pub async fn submit_homework(
    username: String,
    course_id: String,
    source_id: String,
    kind: usize,
    content: String,
    files: Vec<UploadedFile>,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    submit_data(
        &session, &smart, &course_id, &source_id, kind, &content, &files,
    )
    .await?;
    save_session(&state, &username, &session)?;
    Ok(true)
}
pub(super) async fn submit_data(
    session: &Session,
    smart: &SmartSession,
    course_id: &str,
    source_id: &str,
    kind: usize,
    content: &str,
    files: &[UploadedFile],
) -> Result<(), String> {
    let raw = raw_homework(session, smart, course_id, source_id, kind).await?;
    if string(&raw["subStatus"]) == "已提交" && string(&raw["is_repeat"]) == "0" {
        return Err("该作业不允许重复提交".into());
    }
    let file_list = serde_json::to_string(&files.iter().map(upload_item).collect::<Vec<_>>())
        .map_err(|e| e.to_string())?;
    let response = session
        .client
        .post(format!("{SMART}/course/courseWorkInfo.shtml"))
        .header("sessionid", &smart.id)
        .form(&[
            ("method", "sendStuHomeWorks"),
            ("content", encode(&content).as_str()),
            ("groupName", ""),
            ("groupId", ""),
            ("courseId", course_id),
            ("contentType", kind.to_string().as_str()),
            ("fz", &string(&raw["is_fz"])),
            ("jxrl_id", ""),
            ("fileList", &file_list),
            ("upId", source_id),
            ("return_num", &string(&raw["return_num"])),
            ("isTeacher", "0"),
        ])
        .send()
        .await
        .map_err(network_error)?;
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
    if root["flag"] != true && string(&root["flag"]) != "success" {
        return Err(if !string(&root["ERRMSG"]).is_empty() {
            string(&root["ERRMSG"])
        } else {
            "学校未确认提交成功，请刷新作业状态后再操作".into()
        });
    }
    Ok(())
}
#[tauri::command]
// 参考来源：参考账号资源查询与资源链接获取流程。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/resource-download.js
pub async fn resource_space(
    username: String,
    query: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let result = space_data(&session, &smart, &query).await?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
pub(super) async fn space_data(
    session: &Session,
    smart: &SmartSession,
    query: &str,
) -> Result<Vec<Value>, String> {
    let mut root = json!({});
    for rows in [10usize, 0] {
        let rows = if rows == 0 {
            string(&root["total"]).parse::<usize>().unwrap_or(0)
        } else {
            rows
        };
        if rows == 0 {
            break;
        }
        let response = session
            .client
            .post(format!(
                "{SMART}/resourceSpace.shtml?method=resourceSpaceList"
            ))
            .header("sessionid", &smart.id)
            .form(&[
                ("type", "1"),
                ("rows", rows.to_string().as_str()),
                ("searchName", encode(&query).as_str()),
            ])
            .send()
            .await
            .map_err(network_error)?;
        let body = response
            .error_for_status()
            .map_err(network_error)?
            .text()
            .await
            .map_err(network_error)?;
        if parsers::expired_page(&body) {
            return Err(AUTH_EXPIRED.into());
        }
        root = parsers::smart_response(&body)?;
        if string(&root["total"]).parse::<usize>().unwrap_or(0) <= rows {
            break;
        }
    }
    let result=root["result"].as_array().unwrap_or(&Vec::new()).iter().map(|v|json!({"id":string(&v["rpId"]),"name":string(&v["rpName"]),"url":absolute_url(&string(&v["resUrl"])),"rpId":string(&v["rpId"]),"size":parsers::resource_size(&v["rpSize"]),"inputTime":string(&v["inputTime"])})).collect();
    Ok(result)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkItem {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub rp_id: Option<String>,
    pub course_id: Option<String>,
    pub download_allowed: Option<bool>,
}
#[tauri::command]
pub async fn resource_links(
    username: String,
    items: Vec<LinkItem>,
    state: tauri::State<'_, CampusState>,
) -> Result<Vec<Value>, String> {
    let session = get_session(&state, &username)?;
    let mut result = Vec::new();
    for item in items {
        let url = if let Some(url) = item.url.filter(|u| !u.is_empty()) {
            absolute_url(&url)
        } else {
            let smart = smart_session(&session).await?;
            let rp = item.rp_id.as_deref().ok_or("此资源缺少下载标识")?;
            let course_id = item.course_id.as_deref().unwrap_or("");
            // 未开放下载的资源：预览与复制同样改用学校提供的 PDF 转换版地址。
            if item.download_allowed == Some(false) {
                match media::stream_open_path(&session, &smart, course_id, rp, "").await {
                    Ok(path) if !path.is_empty() => absolute_url(&path),
                    Err(error) if error.contains("登录状态已失效") => return Err(error),
                    _ => {
                        let ticket = media::ticket(&session, &smart, course_id, rp, "").await?;
                        absolute_url(&parsers::required(&ticket, "rpUrl")?)
                    }
                }
            } else {
                let ticket = media::ticket(&session, &smart, course_id, rp, "").await?;
                absolute_url(&parsers::required(&ticket, "rpUrl")?)
            }
        };
        let url = media::resource_url(
            &url,
            item.download_allowed,
            &*session.preferences.lock().map_err(|e| e.to_string())?,
        );
        result.push(json!({"id":item.id,"name":item.name,"url":url}));
    }
    save_session(&state, &username, &session)?;
    Ok(result)
}
#[tauri::command]
pub async fn learning_status(
    username: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let started = std::time::Instant::now();
    let ok = quick_login::current_user(&session).await.unwrap_or(false);
    Ok(
        json!({"connected":ok,"quickAvailable":session.quick.lock().map_err(|e|e.to_string())?.is_some(),"elapsedMs":started.elapsed().as_millis()}),
    )
}
#[tauri::command]
pub async fn inline_image(
    username: String,
    url: String,
    state: tauri::State<'_, CampusState>,
) -> Result<String, String> {
    let session = get_session(&state, &username)?;
    let response = session
        .client
        .get(absolute_url(&url))
        .send()
        .await
        .map_err(network_error)?
        .error_for_status()
        .map_err(network_error)?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    if !mime.starts_with("image/") {
        return Err("学校未返回图片".into());
    }
    let bytes = response.bytes().await.map_err(network_error)?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn submitted_review_keeps_text_score_comment_and_download_filename() {
        let page = r#"<div class="markContentLeft"><p>我的实验结论</p></div><input id="oldScore" value="92"><textarea id="pigaiContent">分析完整</textarea><div class="homeworkContent" onclick="downloadFile('/rp/test.pdf','实验报告.pdf','17')"></div>"#;
        let result = review_html(page);
        assert!(string(&result["content"]).contains("我的实验结论"));
        assert_eq!(result["score"], "92");
        assert_eq!(result["comment"], "分析完整");
        assert_eq!(result["attachments"][0]["name"], "实验报告.pdf");
        assert!(string(&result["attachments"][0]["url"]).contains("downloadZyFj.shtml"));
        assert_eq!(
            review_html("<html><div class=courseTitleBox>提交时间</div></html>")["available"],
            false
        );
    }
    #[test]
    fn uploaded_filenames_match_the_school_double_encoded_form() {
        let file = UploadedFile {
            name: "实验 + 报告.pdf".into(),
            size: 28,
            visit_name: "/rp/test.pdf".into(),
        };
        let item = upload_item(&file);
        assert_eq!(
            item["fileNameNoExt"],
            "%E5%AE%9E%E9%AA%8C%20%2B%20%E6%8A%A5%E5%91%8A"
        );
        assert_eq!(item["fileExtName"], "pdf");
        assert_eq!(item["ftype"], "insert");
        assert_eq!(
            absolute_url("/rp/test.pdf"),
            "http://123.121.147.7:8081/rp/test.pdf"
        );
    }
    #[tokio::test]
    #[ignore = "使用本人登录跳转凭据验证学校只读数据和一个上传文件，不提交作业"]
    async fn live_learning_integration() {
        let directory = PathBuf::from(std::env::var("CAMPUS_PROBE_DIR").expect("CAMPUS_PROBE_DIR"));
        let auth: Value =
            serde_json::from_slice(&fs::read(directory.join("own-jump.json")).unwrap()).unwrap();
        let mut prefs = settings::Preferences::default();
        prefs.quick_login = true;
        let session = new_session(
            CookieStore::default(),
            &string(&auth["username"]),
            Arc::new(Mutex::new(prefs)),
            Arc::new(credentials::Store::default()),
        )
        .unwrap();
        *session.quick.lock().unwrap() = Some(string(&auth["quick"]));
        assert!(quick_login::restore(&session).await.unwrap());
        let smart = prepare_smart(&session).await.unwrap();
        assert!(!smart.courses.is_empty());
        let mut found = None;
        for c in &smart.courses {
            let items = fetch_homework_type(&session, &smart, c, 2).await.unwrap();
            if let Some(item) = items.first() {
                found = Some(item.clone());
                break;
            }
        }
        let item = found.unwrap();
        let detail = detail_data(
            &session,
            &smart,
            &string(&item["courseId"]),
            &string(&item["sourceId"]),
            2,
        )
        .await
        .unwrap();
        assert!(!string(&detail["content"]).is_empty());
        let closed: Value =
            serde_json::from_slice(&fs::read(directory.join("closed-resource.json")).unwrap())
                .unwrap();
        let ticket = media::ticket(&session, &smart, "", &string(&closed["rpId"]), "")
            .await
            .unwrap();
        assert!(!string(&ticket["rpUrl"]).is_empty());
        let h = smart_json(
            &session,
            "coursePlatform/homeWork.shtml",
            &[
                ("method", "getHomeWorkList".into()),
                ("cId", string(&item["courseId"])),
                ("subType", "2".into()),
                ("page", "1".into()),
                ("pagesize", "100".into()),
            ],
            Some(&smart.id),
        )
        .await
        .unwrap();
        assert!(h["courseNoteList"].is_array());
        let uploaded = upload_data(
            &session,
            &smart,
            "知行上传验证.txt",
            &STANDARD.encode("知行文件上传与下载验证。\n"),
            Some(&string(&item["sourceId"])),
        )
        .await
        .unwrap();
        let bytes = session
            .client
            .get(string(&uploaded["url"]))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(bytes.as_ref(), "知行文件上传与下载验证。\n".as_bytes());
        fs::write(
            directory.join("verified-upload.json"),
            serde_json::to_vec(&uploaded).unwrap(),
        )
        .unwrap();
        eprintln!("live verified: {} courses, homework detail, closed resource URL, upload and file round trip; review available: {}",smart.courses.len(),string(&detail["reviewError"]).is_empty());
    }
}
