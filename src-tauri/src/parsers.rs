use regex::Regex;
use scraper::{ElementRef, Html, Selector};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("静态 CSS 选择器")
}
pub fn text(element: ElementRef<'_>) -> String {
    element
        .text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        _ => value.to_string(),
    }
}
pub fn required(value: &Value, field: &str) -> Result<String, String> {
    let result = string(&value[field]);
    if result.trim().is_empty() {
        Err(format!("学校响应缺少 {field}，已保留上次数据"))
    } else {
        Ok(result)
    }
}
pub fn list<'a>(root: &'a Value, field: &str) -> Result<&'a [Value], String> {
    let status = string(&root["STATUS"]);
    if status == "2" {
        return Ok(&[]);
    }
    if !status.is_empty() && status != "0" {
        return Err("智慧课程平台返回失败，已保留上次数据".into());
    }
    match root.get(field) {
        Some(Value::Array(items)) => Ok(items),
        Some(Value::String(value)) if value.trim().is_empty() => Ok(&[]),
        _ => Err(format!("学校响应缺少有效的 {field}，已保留上次数据")),
    }
}
pub fn expired_page(html: &str) -> bool {
    let doc = Html::parse_document(html);
    doc.select(&selector(
        "input[type=password], input[name=loginname], input#id_captcha_0",
    ))
    .next()
    .is_some()
        || html.contains("会话失效")
        || html.contains("会话结束")
        || html.contains("session timeout")
}
pub fn multiline(html: &str) -> String {
    let html = Regex::new(r"(?i)<br\s*/?>|</(?:p|div|li|tr)\s*>")
        .unwrap()
        .replace_all(html, "\n");
    Html::parse_fragment(&html)
        .root_element()
        .text()
        .collect::<String>()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
// 参考来源：参考隐藏字段和个人信息的 HTML 选择器。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/LoginHtmlParser.kt
pub fn login_form(html: &str) -> Result<(String, String), String> {
    let doc = Html::parse_document(html);
    let field = |query: &str| {
        doc.select(&selector(query))
            .next()
            .and_then(|e| e.value().attr("value"))
            .unwrap_or("")
            .to_string()
    };
    let csrf = field("input[name=csrfmiddlewaretoken]");
    let captcha = field("input#id_captcha_0");
    if csrf.is_empty() || captcha.is_empty() {
        return Err("学校登录页面未提供完整验证码，请刷新后重试".into());
    }
    Ok((csrf, captcha))
}
pub fn student(html: &str, username: &str) -> Result<Value, String> {
    let doc = Html::parse_document(html);
    let raw_name = doc
        .select(&selector(".name_right > h3 > a"))
        .next()
        .map(text)
        .filter(|s| !s.is_empty())
        .ok_or("未能读取学生资料，请重新登录")?;
    let spans = doc
        .select(&selector(".name_right .nr_con span"))
        .map(text)
        .collect::<Vec<_>>();
    let field = |label: &str| {
        spans
            .iter()
            .find(|s| s.contains(label))
            .map(|s| {
                s.replace(&format!("{label}："), "")
                    .replace(&format!("{label}:"), "")
                    .trim()
                    .to_string()
            })
            .unwrap_or_default()
    };
    Ok(
        json!({"id":username,"name":raw_name.split('，').next().unwrap_or(&raw_name),"studentId":username,"department":field("部门"),"identity":field("身份"),"demo":false,"color":"blue"}),
    )
}
// 参考来源：参考成绩表字段与 data-content 详情解析。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/grade/GradeHtmlParser.kt
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java
pub fn grades(html: &str) -> Result<Vec<Value>, String> {
    let doc = Html::parse_document(html);
    let table = doc
        .select(&selector("table"))
        .next()
        .ok_or("未能读取成绩表，已保留上次成绩")?;
    let mut items = Vec::new();
    for row in table.select(&selector("tr")).skip(1) {
        let cols = row.select(&selector("td")).collect::<Vec<_>>();
        if cols.is_empty() {
            continue;
        }
        if cols.len() < 8 {
            return Err("成绩表结构不完整，已保留上次成绩".into());
        }
        let term = text(cols[1]);
        let name = text(cols[2]);
        if term.is_empty() || name.is_empty() {
            return Err("成绩记录缺少课程或学期，已保留上次成绩".into());
        }
        let detail = cols[7]
            .select(&selector("span[data-content]"))
            .next()
            .and_then(|e| e.value().attr("data-content"))
            .map(multiline)
            .unwrap_or_default();
        items.push(json!({"name":name,"teacher":text(cols[6]),"score":text(cols[4]),"credits":text(cols[3]),"term":term,"detail":detail}));
    }
    Ok(items)
}
pub fn merge_grades(groups: Vec<Vec<Value>>) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut occurrences = HashMap::<String, usize>::new();
    let mut result = Vec::new();
    for mut item in groups.into_iter().flatten() {
        let base = format!(
            "{}|{}|{}",
            string(&item["term"]),
            string(&item["name"]),
            string(&item["credits"])
        );
        if !seen.insert(format!("{base}|{}", string(&item["score"]))) {
            continue;
        }
        let occurrence = occurrences.entry(base.clone()).or_default();
        *occurrence += 1;
        item["id"] = json!(format!("{base}|{occurrence}"));
        result.push(item);
    }
    result
}
pub fn teachers(html: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let doc = Html::parse_document(html);
    for row in doc.select(&selector("table tr")).skip(2) {
        let cols = row.select(&selector("td")).collect::<Vec<_>>();
        if cols.len() >= 2 {
            let raw = text(cols[0]);
            let parts = raw.split_whitespace().collect::<Vec<_>>();
            let name = if parts.len() == 3 {
                parts[..2].join(" ")
            } else {
                raw
            };
            result.insert(name, text(cols[1]));
        }
    }
    result
}
// 参考来源：参考教务课表单元格、教学周及节次解析；输出本项目课程结构。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/course/CourseScheduleHtmlParser.kt
pub fn schedule(
    html: &str,
    selection: bool,
    teachers: &HashMap<String, String>,
) -> Result<Vec<Value>, String> {
    let doc = Html::parse_document(html);
    let table = doc
        .select(&selector("table"))
        .next()
        .ok_or("未能读取课表，已保留上次课表")?;
    let rows = table
        .select(&selector("tr"))
        .skip(1)
        .take(7)
        .collect::<Vec<_>>();
    if rows.len() != 7 {
        return Err("课表结构不完整，已保留上次课表".into());
    }
    let breaks = Regex::new(r"(?i)<br\s*/?>").unwrap();
    let mut items = Vec::new();
    for (row_index, row) in rows.into_iter().enumerate() {
        let cols = row.select(&selector("td")).collect::<Vec<_>>();
        if cols.len() < 8 {
            return Err("课表结构不完整，已保留上次课表".into());
        }
        for (day_index, col) in cols.into_iter().skip(1).take(7).enumerate() {
            for child in col.children().filter_map(ElementRef::wrap) {
                let fragment = if selection {
                    child
                        .select(&selector("span"))
                        .next()
                        .map(|e| e.inner_html())
                        .unwrap_or_default()
                } else {
                    child.inner_html()
                };
                let segments = breaks.splitn(&fragment, 2).collect::<Vec<_>>();
                if segments.len() != 2 {
                    continue;
                }
                let id = text(Html::parse_fragment(segments[0]).root_element());
                let name_doc = Html::parse_fragment(segments[1]);
                let name = if selection {
                    text(name_doc.root_element())
                } else {
                    name_doc
                        .select(&selector("span"))
                        .next()
                        .map(text)
                        .unwrap_or_default()
                };
                if id.is_empty() || name.is_empty() {
                    continue;
                }
                let info = child.select(&selector("div[style^=max-width]")).next();
                let raw_weeks = info.map(text).unwrap_or_default();
                let weeks = raw_weeks
                    .split_once('周')
                    .map(|(s, _)| format!("{s}周").split_whitespace().collect::<String>())
                    .unwrap_or_else(|| "未知".into());
                let embedded = info
                    .and_then(|e| e.select(&selector("i")).next())
                    .map(text)
                    .unwrap_or_default();
                let name_key = name.split_whitespace().next().unwrap_or(&name);
                let section = id
                    .split_whitespace()
                    .nth(1)
                    .map(|s| s.chars().skip(1).take(2).collect::<String>())
                    .unwrap_or_default();
                let lookup = if section.is_empty() {
                    name_key.into()
                } else {
                    format!("{name_key} {section}")
                };
                let teacher = if embedded.is_empty() {
                    teachers
                        .get(&lookup)
                        .cloned()
                        .unwrap_or_else(|| "未提供".into())
                } else {
                    embedded
                };
                let place = child
                    .select(&selector("span.text-muted"))
                    .next()
                    .map(text)
                    .unwrap_or_else(|| "未提供".into());
                items.push(json!({"id":format!("{id}|{day_index}|{row_index}|{selection}"),"name":name,"teacher":teacher,"place":place,"day":day_index+1,"period":row_index+1,"weeks":weeks,"selection":selection,"color":"blue"}));
            }
        }
    }
    Ok(items)
}
pub fn smart_courses(root: &Value) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    for item in list(root, "courseList")? {
        required(item, "id")?;
        required(item, "name")?;
        result.push(item.clone());
    }
    Ok(result)
}
pub fn homework(root: &Value, kind: usize, fallback_course: &Value) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    for item in list(root, "courseNoteList")? {
        let raw_id = required(item, "id")?;
        let course = string(&item["course_name"]);
        let title = required(item, "title")?;
        result.push(json!({"id":format!("{}|{kind}|{raw_id}",string(&fallback_course["id"])),"course":if course.is_empty(){string(&fallback_course["name"])}else{course},"title":title,"courseId":string(&fallback_course["id"]),"submittedAt":string(&item["subTime"]),"sourceId":raw_id,"snId":string(&item["snId"]),"userId":string(&item["user_id"]),"teacherId":string(&fallback_course["teacher_id"]),"openedAt":string(&item["open_date"]),"rawContent":string(&item["content"]),"submitCount":item["submitCount"],"allCount":item["allCount"],"reviewStatus":if string(&item["pyNum"]).parse::<u64>().unwrap_or(0)>0{"已批改"}else{"未批改"},"repeatAllowed":string(&item["is_repeat"])!="0","score":string(&item["stu_score"]),"totalScore":string(&item["score"]),"grouped":string(&item["is_fz"]),"type":(["作业","课程设计","实验"][kind]),"deadline":string(&item["end_time"]).replace(' ',"T"),"status":string(&item["subStatus"]),"content":multiline(&string(&item["content"]))}));
    }
    Ok(result)
}
pub fn resource_roots(courses: &[Value]) -> Vec<Value> {
    courses.iter().map(|c| json!({"id":format!("course-{}",string(&c["id"])),"courseId":string(&c["id"]),"sourceId":"0","name":string(&c["name"]),"course":string(&c["name"]),"kind":"course","term":string(&c["xq_code"]),"loaded":false,"children":[]})).collect()
}
pub fn resource_children(root: &Value, course: &Value) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    let course_id = required(course, "id")?;
    let name = required(course, "name")?;
    for folder in list(root, "bagList")? {
        let id = required(folder, "id")?;
        result.push(json!({"id":format!("bag-{course_id}-{id}"),"courseId":course_id,"sourceId":id,"name":required(folder,"bag_name")?,"course":name,"kind":"folder","loaded":false,"children":[]}));
    }
    for file in list(root, "resList")? {
        let id = required(file, "resId")?;
        let mut filename = required(file, "rpName")?;
        let ext = string(&file["extName"]);
        if !ext.is_empty()
            && !filename
                .to_lowercase()
                .ends_with(&format!(".{}", ext.to_lowercase()))
        {
            filename.push('.');
            filename.push_str(ext.trim_start_matches('.'));
        }
        result.push(json!({"id":format!("res-{course_id}-{id}"),"courseId":course_id,"sourceId":id,"name":filename,"course":name,"kind":"file","size":resource_size(&file["rpSize"]),"rpId":required(file,"rpId")?,"convertUrl":string(&file["convert_url"]),"url":if !string(&file["res_url"]).is_empty(){string(&file["res_url"])}else{string(&file["resUrl"])},"downloadAllowed":file.get("stu_download").map(|v|string(v)=="2").unwrap_or(true),"loaded":true,"children":[]}));
    }
    Ok(result)
}

pub const RESOURCE_TYPES: [(&str, &str); 5] = [
    ("1", "电子课件"),
    ("5", "教案设计"),
    ("10", "实验"),
    ("12", "教材教辅"),
    ("13", "MOOC 资源"),
];
// 参考来源：参考 docType 1、5、10、12、13 的分类映射。
// https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js
pub fn resource_categories(course_id: &str, course: &str) -> Vec<Value> {
    RESOURCE_TYPES.iter().map(|(id,name)|json!({"id":format!("category-{course_id}-{id}"),"courseId":course_id,"sourceId":"0","docType":id,"name":name,"course":course,"kind":"folder","loaded":false,"children":[]})).collect()
}
pub fn resource_size(value: &Value) -> String {
    let raw = string(value);
    match raw.parse::<f64>() {
        Ok(number) if number > 0.0 => format!("{number:.2} MB"),
        _ => raw,
    }
}
pub fn smart_response(body: &str) -> Result<Value, String> {
    let source = body.trim().trim_start_matches('\u{feff}');
    let source = if source.starts_with("{}") && source.len() > 2 {
        &source[2..]
    } else {
        source
    };
    let value: Value =
        serde_json::from_str(source).map_err(|_| "智慧课程平台未返回有效数据，已保留上次缓存")?;
    Ok(if value["response"].is_object() {
        value["response"].clone()
    } else {
        value
    })
}
pub fn current_term(rows: &[Value]) -> String {
    rows.iter()
        .find(|row| string(&row["currentFlag"]) == "2" || string(&row["current_flag"]) == "2")
        .or_else(|| rows.first())
        .map(|row| {
            let code = string(&row["xqCode"]);
            if code.is_empty() {
                string(&row["xq_code"])
            } else {
                code
            }
        })
        .unwrap_or_default()
}
pub fn replay_list(root: &Value, course_id: &str) -> Result<Vec<Value>, String> {
    let items = list(root, "courseSchedList")?;
    Ok(items.iter().enumerate().map(|(i,item)|{
        let video=string(&item["videoId"]);let title=string(&item["courseBetween"]);
        json!({"id":format!("replay-{course_id}-{}",if video.is_empty(){i.to_string()}else{video.clone()}),"videoId":video,"courseId":course_id,"name":if title.is_empty(){format!("第 {} 次课程",i+1)}else{title},"startTime":string(&item["classBeginTime"]),"endTime":string(&item["classEndTime"]),"room":string(&item["classRoom"]),"teacher":string(&item["teacherName"]),"teacherId":string(&item["teacherId"]),"content":multiline(&string(&item["content"]))})
    }).collect())
}
pub fn replay_links(root: &Value) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    let views = [
        ("student", "学生视角"),
        ("teacher", "教师视角"),
        ("courseware", "课件视角"),
    ];
    let source = string(&root["html"]);
    let doc = Html::parse_fragment(&source);
    for (i, anchor) in doc.select(&selector("a[href]")).enumerate() {
        let href = anchor.value().attr("href").unwrap_or("");
        let Ok(url) = reqwest::Url::parse("http://123.121.147.7:88/ve/")
            .unwrap()
            .join(href)
        else {
            continue;
        };
        if !matches!(url.scheme(), "http" | "https") {
            continue;
        }
        let label = format!(
            "{} {} {}",
            text(anchor),
            anchor.value().attr("title").unwrap_or(""),
            anchor.value().attr("data-view").unwrap_or("")
        );
        let index = if label.contains("学生") || label.contains("student") {
            0
        } else if label.contains("教师") || label.contains("老师") || label.contains("teacher")
        {
            1
        } else if label.contains("课件") || label.contains("courseware") {
            2
        } else {
            i.min(2)
        };
        if !result.iter().any(|v: &Value| v["view"] == views[index].0) {
            result
                .push(json!({"view":views[index].0,"label":views[index].1,"url":url.to_string()}));
        }
    }
    for ((view, label), keys) in views.into_iter().zip([
        ["studentUrl", "stuUrl", "student_url"],
        ["teacherUrl", "teaUrl", "teacher_url"],
        ["coursewareUrl", "courseUrl", "pptUrl"],
    ]) {
        if result.iter().any(|v| v["view"] == view) {
            continue;
        }
        if let Some(url) = keys
            .iter()
            .filter_map(|key| root[key].as_str())
            .find(|url| url.starts_with("https://") || url.starts_with("http://"))
        {
            result.push(json!({"view":view,"label":label,"url":url}));
        }
    }
    if result.is_empty() {
        return Err("此回放尚未提供可用的视频链接".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn grid(body: &str) -> String {
        format!(
            "<table><tr><th>时间</th></tr>{}</table>",
            (0..7)
                .map(|i| format!(
                    "<tr><td>第{i}节</td><td>{}</td>{}</tr>",
                    if i == 0 { body } else { "" },
                    "<td></td>".repeat(6)
                ))
                .collect::<String>()
        )
    }
    #[test]
    fn current_course_name_excludes_week_and_place() {
        let items=schedule(&grid(r#"<div>C100 (01)<br/><span>离散数学</span><div style="max-width:180px">第1-3,5周 <i>张老师</i></div><span class="text-muted">思源101</span></div>"#),false,&HashMap::new()).unwrap();
        assert_eq!(items[0]["name"], "离散数学");
        assert_eq!(items[0]["teacher"], "张老师");
        assert_eq!(items[0]["weeks"], "第1-3,5周");
    }
    #[test]
    fn selection_teacher_uses_academic_teacher_table() {
        let map = HashMap::from([("程序设计 02".into(), "李老师".into())]);
        let items=schedule(&grid(r#"<div><span>C200 (02)<br>程序设计</span><div style="max-width:180px">第2-4周</div><span class="text-muted">逸夫201</span></div>"#),true,&map).unwrap();
        assert_eq!(items[0]["name"], "程序设计");
        assert_eq!(items[0]["teacher"], "李老师");
        assert!(schedule("<table><tr><th>header</th></tr></table>", false, &map).is_err());
    }
    #[test]
    fn smart_empty_and_failed_responses_are_distinct() {
        assert!(list(&json!({"STATUS":"0"}), "courseNoteList").is_err());
        assert!(list(&json!({"STATUS":"1","courseNoteList":[]}), "courseNoteList").is_err());
        assert!(list(&json!({"STATUS":"2"}), "courseNoteList")
            .unwrap()
            .is_empty());
        assert!(
            list(&json!({"STATUS":"0","courseNoteList":""}), "courseNoteList")
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn grade_updates_keep_identity_and_retakes_are_not_dropped() {
        let grade = json!({"name":"高等数学","term":"2025-2026-1","credits":"5","score":"80"});
        let mut retake = grade.clone();
        retake["score"] = json!("90");
        let items = merge_grades(vec![
            vec![grade.clone()],
            vec![grade.clone(), retake.clone()],
        ]);
        assert_eq!(items.len(), 2);
        assert_ne!(items[0]["id"], items[1]["id"]);
        let updated = merge_grades(vec![vec![retake]]);
        assert_eq!(updated[0]["id"], items[0]["id"]);
    }
    #[test]
    fn resources_have_account_course_scoped_ids() {
        let root = json!({"STATUS":"0","bagList":[{"id":"1","bag_name":"讲义"}],"resList":[{"resId":2,"rpId":"rp-2","rpName":"概述","extName":"pdf","rpSize":"2 MB"}]});
        let a = resource_children(&root, &json!({"id":17,"name":"程序设计"})).unwrap();
        let b = resource_children(&root, &json!({"id":18,"name":"数据库"})).unwrap();
        assert_ne!(a[1]["id"], b[1]["id"]);
        assert_eq!(a[1]["name"], "概述.pdf");
        assert_eq!(a[0]["loaded"], false);
    }
    #[test]
    fn chooses_current_flag_instead_of_first_semester() {
        assert_eq!(
            current_term(&[
                json!({"xqCode":"old","currentFlag":1}),
                json!({"xqCode":"current","currentFlag":"2"})
            ]),
            "current"
        );
    }
    #[test]
    fn accepts_known_smart_response_wrappers() {
        let value = smart_response(r#"{}{"response":{"STATUS":"0","courseList":[]}}"#).unwrap();
        assert_eq!(value["STATUS"], "0");
        assert!(smart_response("<html>login</html>").is_err());
    }
    #[test]
    fn categories_cover_the_supported_resource_types() {
        let nodes = resource_categories("17", "课程");
        assert_eq!(nodes.len(), 5);
        assert_eq!(
            nodes
                .iter()
                .map(|v| string(&v["docType"]))
                .collect::<Vec<_>>(),
            vec!["1", "5", "10", "12", "13"]
        );
    }
    #[test]
    fn replay_links_keep_view_labels_and_decode_html_entities() {
        let links=replay_links(&json!({"html":"<a href='https://example.edu/video.mp4?a=1&amp;b=2'>教师视角</a><a href='https://example.edu/slides.mp4'>课件视角</a>"})).unwrap();
        assert_eq!(links[0]["view"], "teacher");
        assert_eq!(links[0]["url"], "https://example.edu/video.mp4?a=1&b=2");
        assert_eq!(links[1]["view"], "courseware");
    }
    #[test]
    fn replay_schedule_preserves_unpublished_sessions() {
        let list=replay_list(&json!({"STATUS":"0","courseSchedList":[{"classBeginTime":"2026-10-13 08:00","courseBetween":"课堂一","videoId":"v1"},{"classBeginTime":"2026-10-20 08:00","courseBetween":"课堂二"}]}),"17").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[1]["videoId"], "");
    }
}
