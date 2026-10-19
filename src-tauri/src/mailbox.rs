use super::*;
use serde::Deserialize;
const ORIGIN: &str = "https://mail.bjtu.edu.cn";
// 正文与写信协议参考 KMP MailboxRemoteDataSource.kt；上传和状态更新参考 Android CoremailProvider.kt。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/mailbox/MailboxRemoteDataSource.kt
// https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/provider/CoremailProvider.kt
fn checked(root: Value) -> Result<Value, String> {
    match root["code"].as_str() {
        Some("S_OK") => Ok(root),
        Some("S_SESSION_TIMEOUT" | "FA_INVALID_SESSION" | "S_INVALID_SESSION") => {
            Err(AUTH_EXPIRED.into())
        }
        Some(code) => Err(format!("邮箱操作失败：{code}")),
        None => Err("邮箱返回内容无法识别".into()),
    }
}
async fn json_call(session: &Session, sid: &str, func: &str, body: Value) -> Result<Value, String> {
    let response = session
        .client
        .post(format!("{ORIGIN}/coremail/s/json"))
        .query(&[("sid", sid), ("func", func)])
        .header("Origin", ORIGIN)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", format!("{ORIGIN}/coremail/main.jsp?sid={sid}"))
        .json(&body)
        .send()
        .await
        .map_err(network_error)?;
    checked(
        response
            .error_for_status()
            .map_err(network_error)?
            .json()
            .await
            .map_err(network_error)?,
    )
}
async fn form_call(
    session: &Session,
    sid: &str,
    path: &str,
    fields: &[(&str, &str)],
) -> Result<Value, String> {
    let response = session
        .client
        .post(format!("{ORIGIN}{path}"))
        .query(&[("sid", sid)])
        .header("Origin", ORIGIN)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", format!("{ORIGIN}/coremail/main.jsp?sid={sid}"))
        .form(fields)
        .send()
        .await
        .map_err(network_error)?;
    checked(
        response
            .error_for_status()
            .map_err(network_error)?
            .json()
            .await
            .map_err(network_error)?,
    )
}
fn strings(value: &Value) -> Vec<String> {
    if let Some(items) = value.as_array() {
        items.iter().map(string).collect()
    } else if value.is_string() {
        vec![string(value)]
    } else {
        vec![]
    }
}
fn attachment_url(mid: &str, part: &str) -> String {
    let mut url = Url::parse(&format!("{ORIGIN}/coremail/mbox-data")).unwrap();
    url.query_pairs_mut()
        .extend_pairs([("mid", mid), ("part", part), ("mode", "download")]);
    url.into()
}
fn detail(root: &Value, mid: &str) -> Result<Value, String> {
    let payload = &root["var"];
    let mail = &payload["mail"];
    let info = &payload["mailInfo"];
    if !mail.is_object() || !info.is_object() {
        return Err("邮箱未返回完整邮件".into());
    }
    let attachments=mail["attachments"].as_array().into_iter().flatten().chain(mail["inlineAttachments"].as_array().into_iter().flatten()).map(|a|{
        let id=string(&a["id"]);let part=a["part"].as_str().map(str::to_string).unwrap_or(id.clone());
        json!({"id":id,"name":a["filename"].as_str().unwrap_or("附件"),"size":a["estimateSize"].as_u64().or_else(||a["size"].as_u64()).unwrap_or(0),"contentType":a["contentType"],"contentId":a.get("contentId").or_else(||a.get("contentID")).or_else(||a.get("cid")).cloned().unwrap_or(Value::Null),"url":attachment_url(mid,&part)})
    }).collect::<Vec<_>>();
    Ok(
        json!({"id":mid,"subject":mail["subject"],"from":strings(&mail["from"]),"to":strings(&mail["to"]),"cc":strings(&mail["cc"]),"html":mail["mainPartData"]["content"].as_str().unwrap_or(""),"attachments":attachments}),
    )
}
// 已发送使用 FID 3；mbox:listMessages 可返回收件人和发送时间。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/feature/mailbox/MailboxScreenModel.kt
fn sent_page(root: &Value) -> Value {
    let rows=root["var"].as_array().into_iter().flatten().map(|v|json!({
        "id":string(&v["id"]),"subject":string(&v["subject"]),"from":strings(&v["from"]).join("；"),"to":strings(&v["to"]).join("；"),
        "summary":string(&v["summary"]),"date":v["sentDate"].as_str().map(str::to_string).unwrap_or_else(||string(&v["sentDate"])),"read":true,
        "attached":v["flags"]["attached"]==true||v["flags"]["inlineAttached"]==true
    })).collect::<Vec<_>>();
    json!({"total":root["total"].as_u64().unwrap_or(rows.len() as u64),"rows":rows})
}
#[tauri::command]
pub async fn mail_sent(
    username: String,
    start: u32,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    let root=json_call(&session,&sid,"mbox:listMessages",json!({"fid":3,"start":start,"limit":50,"summaryWindowSize":100,"mode":"count","order":"date","desc":true,"returnTotal":true,"returnTag":false,"mboxa":"","topFirst":true})).await?;
    save_session(&state, &username, &session)?;
    Ok(sent_page(&root))
}
#[tauri::command]
pub async fn mail_detail(
    username: String,
    message_id: String,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    let root = form_call(
        &session,
        &sid,
        "/coremail/XT/jsp/readMessage.jsp",
        &[
            ("mid", &message_id),
            ("mboxa", ""),
            ("part", ""),
            ("mailCipherPassword", ""),
        ],
    )
    .await?;
    let result = detail(&root, &message_id)?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
#[tauri::command]
pub async fn mail_mark_read(
    username: String,
    message_ids: Vec<String>,
    read: bool,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    json_call(&session,&sid,"mbox:updateMessageInfos",json!({"ids":message_ids,"attrs":{"flags":{"read":read}},"mboxa":"","returnOriginalMsgInfos":true,"expandThreadMid":false})).await?;
    save_session(&state, &username, &session)
}
#[tauri::command]
pub async fn mail_begin_compose(
    username: String,
    reply_to: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    let kind = if reply_to.is_some() {
        "reply"
    } else {
        "normal"
    };
    let mid = reply_to.unwrap_or_default();
    let root = form_call(
        &session,
        &sid,
        "/coremail/XT/jsp/compose.jsp",
        &[("ctype", kind), ("mid", &mid), ("mboxa", "")],
    )
    .await?;
    let v = &root["var"];
    if v["id"].as_str().is_none() {
        return Err("邮箱未返回写信编号".into());
    }
    save_session(&state, &username, &session)?;
    Ok(
        json!({"id":v["id"],"to":strings(&v["to"]),"cc":strings(&v["cc"]),"bcc":strings(&v["bcc"]),"subject":v["subject"].as_str().unwrap_or(""),"html":v["content"].as_str().unwrap_or("")}),
    )
}
#[tauri::command]
pub async fn mail_cancel_compose(
    username: String,
    compose_id: String,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    json_call(
        &session,
        &sid,
        "mbox:cancelComposes",
        json!({"ids":compose_id}),
    )
    .await?;
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeAttachment {
    pub id: i64,
    pub name: String,
    pub size: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
    pub subject: String,
    pub text: String,
    pub attachments: Vec<ComposeAttachment>,
    pub reply_to: Option<String>,
}
fn compose_payload(draft: &Draft) -> Result<Value, String> {
    if draft.to.is_empty() {
        return Err("请填写收件人".into());
    }
    let text = draft
        .text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\n', "<br>");
    let attachments = draft
        .attachments
        .iter()
        .map(
            |a| json!({"id":a.id,"type":"upload","name":a.name,"displayName":a.name,"size":a.size}),
        )
        .collect::<Vec<_>>();
    let mut body = json!({"id":draft.id,"attrs":{"to":draft.to,"cc":draft.cc,"bcc":draft.bcc,"subject":draft.subject,"isHtml":true,"content":format!("<div>{text}</div>"),"attachments":attachments,"priority":1,"requestReadReceipt":false,"saveSentCopy":true},"returnInfo":true,"action":"deliver"});
    if let Some(mid) = &draft.reply_to {
        body["ctype"] = json!("reply");
        body["mid"] = json!(mid);
        body["mboxa"] = json!("")
    }
    Ok(body)
}
#[tauri::command]
pub async fn mail_send(
    username: String,
    draft: Draft,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    let body = compose_payload(&draft)?;
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    json_call(&session, &sid, "mbox:compose", body).await?;
    save_session(&state, &username, &session)
}
#[tauri::command]
pub async fn mail_upload(
    username: String,
    compose_id: String,
    name: String,
    content_type: String,
    data: Vec<u8>,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    let session = get_session(&state, &username)?;
    let sid = campus::mail_session(&session).await?;
    let prepared=json_call(&session,&sid,"upload:prepare",json!({"composeId":compose_id,"attachmentId":-1,"fileName":name,"contentType":content_type,"securityLevel":null,"size":data.len()})).await?;
    let id = prepared["var"]["attachmentId"]
        .as_i64()
        .filter(|id| *id >= 0)
        .ok_or("邮箱未返回附件编号")?;
    let chunks = if data.is_empty() {
        vec![&data[..]]
    } else {
        data.chunks(2 * 1024 * 1024).collect::<Vec<_>>()
    };
    let mut offset = 0;
    for chunk in chunks {
        let end = (offset + chunk.len()).saturating_sub(1).max(offset);
        let part = reqwest::multipart::Part::bytes(chunk.to_vec())
            .file_name(name.clone())
            .mime_str(if content_type.is_empty() {
                "application/octet-stream"
            } else {
                &content_type
            })
            .map_err(|e| e.to_string())?;
        let response = session
            .client
            .post(format!("{ORIGIN}/coremail/XT/jsp/upload.jsp"))
            .query(&[
                ("func", "directData".to_string()),
                ("sid", sid.clone()),
                ("composeId", compose_id.clone()),
                ("attachmentId", id.to_string()),
                ("offset", offset.to_string()),
            ])
            .header("Origin", ORIGIN)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{ORIGIN}/coremail/main.jsp?sid={sid}"))
            .header(
                "Content-Range",
                format!("bytes {offset}-{end}/{}", data.len()),
            )
            .header("X-Requested-With", "XMLHttpRequest")
            .multipart(reqwest::multipart::Form::new().part("files[]", part))
            .send()
            .await
            .map_err(network_error)?;
        checked(
            response
                .error_for_status()
                .map_err(network_error)?
                .json()
                .await
                .map_err(network_error)?,
        )?;
        offset += chunk.len();
    }
    save_session(&state, &username, &session)?;
    Ok(json!({"id":id,"name":name,"size":data.len()}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sent_messages_keep_recipients_sent_time_and_total() {
        let page = sent_page(
            &json!({"total":75,"var":[{"id":"s1","subject":"已发送","to":["one@example.invalid","two@example.invalid"],"sentDate":1234567890,"flags":{"attached":true}}]}),
        );
        assert_eq!(page["total"], 75);
        assert_eq!(
            page["rows"][0]["to"],
            "one@example.invalid；two@example.invalid"
        );
        assert_eq!(page["rows"][0]["date"], "1234567890");
        assert_eq!(page["rows"][0]["attached"], true);
    }
    #[test]
    fn detail_preserves_body_recipients_and_authenticated_attachment_route() {
        let root = json!({"var":{"mail":{"subject":"通知","from":["a@bjtu.edu.cn"],"to":["b@bjtu.edu.cn"],"mainPartData":{"content":"<p>正文<img src='cid:image'></p>"},"attachments":[{"id":"2","filename":"报告.pdf","estimateSize":1024,"contentId":"image"}]},"mailInfo":{"id":"m1"}}});
        let v = detail(&root, "m1").unwrap();
        assert_eq!(v["attachments"][0]["size"], 1024);
        assert!(v["attachments"][0]["url"]
            .as_str()
            .unwrap()
            .contains("mid=m1&part=2"));
        assert!(v["html"].as_str().unwrap().contains("cid:image"));
        assert!(detail(&json!({"var":{}}), "m1").is_err());
    }
    #[test]
    fn send_payload_keeps_recipients_attachments_reply_and_escaped_text() {
        let draft = Draft {
            id: "c1".into(),
            to: vec!["a@bjtu.edu.cn".into()],
            cc: vec![],
            bcc: vec![],
            subject: "测试".into(),
            text: "<报告>\n第二行".into(),
            attachments: vec![ComposeAttachment {
                id: 3,
                name: "报告.txt".into(),
                size: 9,
            }],
            reply_to: Some("m1".into()),
        };
        let v = compose_payload(&draft).unwrap();
        assert_eq!(v["action"], "deliver");
        assert_eq!(v["mid"], "m1");
        assert_eq!(v["attrs"]["attachments"][0]["id"], 3);
        assert_eq!(v["attrs"]["content"], "<div>&lt;报告&gt;<br>第二行</div>");
        assert!(checked(json!({"code":"S_FAIL"})).is_err());
    }
}
