//! Human-readable CLI output; JSON responses retain their original schema.
use comfy_table::{presets::UTF8_FULL_CONDENSED, ContentArrangement, Table};
use serde_json::{json, Value};

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn label(key: &str) -> &str {
    match key {
        "id" => "ID",
        "name" => "名称",
        "account" | "studentId" => "账号",
        "authenticated" => "已登录",
        "department" => "院系",
        "identity" => "身份",
        "teacher" => "教师",
        "courseId" => "课程 ID",
        "sourceId" => "原始作业 ID",
        "version" => "版本",
        "command" => "命令",
        "executable" => "可执行文件",
        "path" | "out" => "保存位置",
        "message" => "说明",
        "installed" => "命令已安装",
        "restartTerminal" => "需重新打开终端",
        "link" => "命令入口",
        "profile" => "个人信息",
        "dataDirectory" => "数据目录",
        "submitted" => "已提交",
        "attachmentCount" => "附件数量",
        "score" => "得分",
        "totalScore" => "总分",
        "status" => "状态",
        "deadline" => "截止时间",
        "submittedAt" => "提交时间",
        "openedAt" => "开放时间",
        "reviewStatus" => "批改状态",
        "comment" => "评语",
        "reviewError" => "批改信息",
        "repeatAllowed" => "允许重复提交",
        "submitCount" => "已提交人数",
        "allCount" => "总人数",
        "bytes" => "下载大小",
        "week" => "教学周",
        "building" => "教学楼",
        "currentSemester" => "当前学期",
        "requiresCaptcha" => "需要验证码",
        "captchaFile" => "验证码图片",
        "nextCommand" => "下一步命令",
        "sessionRemoved" => "本机会话已移除",
        "updated" => "操作成功",
        "read" => "已读",
        "content" => "作业要求",
        "submittedContent" => "已提交正文",
        "attachments" => "附件",
        "submittedAttachments" => "已提交附件",
        "failures" => "读取失败项",
        "detail" => "成绩构成",
        "term" => "学期",
        "available" => "可用",
        "url" => "链接",
        _ => key,
    }
}
fn date(raw: &str) -> String {
    let offset = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
    if let Ok(number) = raw.parse::<i64>() {
        let seconds = if number > 100_000_000_000 {
            number / 1000
        } else {
            number
        };
        if seconds > 0 {
            if let Some(value) = chrono::DateTime::from_timestamp(seconds, 0) {
                return value
                    .with_timezone(&offset)
                    .format("%Y-%m-%d %H:%M")
                    .to_string();
            }
        }
    }
    if let Ok(value) = chrono::DateTime::parse_from_rfc3339(raw) {
        return value
            .with_timezone(&offset)
            .format("%Y-%m-%d %H:%M")
            .to_string();
    }
    raw.replace('T', " ")
}
fn value(key: &str, data: &Value) -> String {
    if data.is_null() || data.as_str() == Some("") {
        return "—".into();
    }
    if let Some(boolean) = data.as_bool() {
        return match key {
            "read" => {
                if boolean {
                    "已读"
                } else {
                    "未读"
                }
            }
            "hasSavedPassword" | "sessionSaved" => {
                if boolean {
                    "已保存"
                } else {
                    "未保存"
                }
            }
            _ => {
                if boolean {
                    "是"
                } else {
                    "否"
                }
            }
        }
        .into();
    }
    if let Some(items) = data.as_array() {
        return items
            .iter()
            .map(|item| value(key, item))
            .collect::<Vec<_>>()
            .join("；");
    }
    if let Some(fields) = data.as_object() {
        return fields
            .iter()
            .map(|(key, item)| format!("{}：{}", label(key), value(key, item)))
            .collect::<Vec<_>>()
            .join("\n");
    }
    let raw = data
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| data.to_string());
    match key {
        "day" => match raw.parse::<usize>() {
            Ok(day) if (1..=7).contains(&day) => {
                format!("周{}", ["一", "二", "三", "四", "五", "六", "日"][day - 1])
            }
            _ => raw,
        },
        "date" | "startTime" | "endTime" | "deadline" | "submittedAt" | "openedAt" | "since" => {
            date(&raw)
        }
        "credentialMode" => match raw.as_str() {
            "keychain" => "系统凭据库".into(),
            "file" => "本机文件".into(),
            "session" => "仅本次".into(),
            _ => raw,
        },
        "kind" => match raw.as_str() {
            "file" => "文件".into(),
            "folder" => "目录".into(),
            "course" => "课程".into(),
            _ => raw,
        },
        "state" if raw == "online" => "在线".into(),
        "period" => format!("第 {raw} 节"),
        "size" | "bytes" if data.is_number() => {
            let size = data.as_u64().unwrap_or(0);
            if size >= 1048576 {
                format!("{:.1} MB", size as f64 / 1048576.0)
            } else if size >= 1024 {
                format!("{:.1} KB", size as f64 / 1024.0)
            } else {
                format!("{size} B")
            }
        }
        _ => raw,
    }
}
fn cell(row: &Value, keys: &str) -> String {
    let key = keys
        .split('|')
        .find(|key| !row[*key].is_null() && row[*key].as_str() != Some(""))
        .unwrap_or(keys.split('|').next().unwrap_or(keys));
    value(key, &row[key])
}
fn grid(title: &str, headers: Vec<String>, rows: Vec<Vec<String>>) -> String {
    let empty = rows.is_empty();
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL_CONDENSED)
        .set_content_arrangement(ContentArrangement::Dynamic);
    let width = std::env::var("COLUMNS")
        .ok()
        .and_then(|width| width.parse::<u16>().ok())
        .or_else(|| table.width())
        .unwrap_or(120);
    table.set_width(width.max(40)).set_header(headers);
    for row in rows {
        table.add_row(row);
    }
    format!(
        "{title}\n{table}\n{}",
        if empty { "暂无记录\n" } else { "" }
    )
}
fn rows(title: &str, items: &[Value], columns: &[(&str, &str)]) -> String {
    let headers = columns
        .iter()
        .map(|(heading, _)| heading.to_string())
        .collect();
    let body = items
        .iter()
        .map(|row| columns.iter().map(|(_, key)| cell(row, key)).collect())
        .collect();
    grid(&format!("{title}（{} 条）", items.len()), headers, body)
}
fn details(title: &str, data: &Value) -> String {
    if let Some(fields) = data.as_object() {
        let flat = fields
            .iter()
            .filter(|(_, item)| {
                !item.is_object()
                    && (!item.is_array() || array(item).iter().all(|v| !v.is_object()))
            })
            .map(|(key, item)| vec![label(key).to_string(), value(key, item)])
            .collect();
        let mut result = grid(title, vec!["项目".into(), "内容".into()], flat);
        for (key, item) in fields {
            if item.is_object() || (item.is_array() && array(item).iter().any(Value::is_object)) {
                result.push('\n');
                result.push_str(&generic(label(key), item));
            }
        }
        result
    } else {
        generic(title, data)
    }
}
fn generic(title: &str, data: &Value) -> String {
    match data {
        Value::Null => String::new(),
        Value::Array(items) => {
            if items.iter().any(Value::is_object) {
                let mut keys = Vec::new();
                for row in items {
                    if let Some(fields) = row.as_object() {
                        for key in fields.keys() {
                            if !keys.contains(key) {
                                keys.push(key.clone());
                            }
                        }
                    }
                }
                let headers = keys.iter().map(|key| label(key).to_string()).collect();
                let values = items
                    .iter()
                    .map(|row| keys.iter().map(|key| cell(row, key)).collect())
                    .collect();
                grid(title, headers, values)
            } else {
                format!("{title}\n{}\n", value("", data))
            }
        }
        Value::Object(_) => details(title, data),
        _ => format!("{title}：{}\n", value("", data)),
    }
}
pub(super) fn render(command: &str, data: &Value) -> String {
    match command{
        "account list"=>rows("保存的账号",array(data),&[("账号","id"),("保存方式","credentialMode"),("密码","hasSavedPassword"),("会话","sessionSaved")]),
        "course list"=>format!("学期：{}\n{}",value("term",&data["term"]),rows("课程",array(&data["courses"]),&[("课程 ID","id"),("课程名称","name"),("教师","teacher|teacher_name|teacherName")])),
        "grades list"=>rows("学业成绩",array(data),&[("课程","name"),("教师","teacher"),("学分","credits"),("成绩","score"),("学期","term"),("成绩构成","detail")]),
        "schedule list"=>rows("课程安排",array(data),&[("星期","day"),("节次","period"),("课程","name"),("地点","place"),("教师","teacher"),("周次","weeks")]),
        "homework list"=>{
            let mut result=rows("作业与任务",array(&data["items"]),&[("作业 ID","sourceId"),("课程 ID","courseId"),("课程","course"),("类型","type"),("标题","title"),("状态","status"),("截止时间","deadline")]);
            if !array(&data["failures"]).is_empty(){result.push_str(&rows("读取失败",array(&data["failures"]),&[("课程 ID","course"),("类型","type"),("原因","message")]));}result
        },
        "mail inbox"|"mail sent"=>{
            let mut result=format!("总邮件：{} 封",value("",&data["total"]));
            if !data["unread"].is_null(){result.push_str(&format!(" · 本页未读：{} 封",value("",&data["unread"])));}
            result.push('\n');
            result.push_str(&rows(if command=="mail sent"{"已发送"}else{"收件箱"},array(&data["rows"]),&[("邮件 ID","id"),("主题","subject"),(if command=="mail sent"{"收件人"}else{"发件人"},if command=="mail sent"{"to"}else{"from"}),("时间","date"),("状态","read"),("附件","attached")]));result
        },
        "mail show"=>{
            let mut summary=data.clone();if let Some(fields)=summary.as_object_mut(){fields.remove("html");fields.remove("attachments");}
            format!("{}\n正文\n{}\n\n{}",details("邮件详情",&summary),super::parsers::multiline(data["html"].as_str().unwrap_or("")),rows("附件",array(&data["attachments"]),&[("附件 ID","id"),("文件名","name"),("大小","size"),("链接","url")]))
        },
        "resource list"|"resource space"=>rows("课程资料",array(data),&[("名称","name"),("类型","kind"),("课程 ID","courseId"),("分类","docType"),("资源 ID","rpId|sourceId|id"),("大小","size")]),
        "replay list"=>rows("课程回放",array(data),&[("回放 ID","videoId"),("名称","name"),("开始时间","startTime"),("结束时间","endTime"),("教室","room"),("教师","teacher")]),
        "replay links"=>rows("回放视角",array(data),&[("视角","label"),("参数","view"),("链接","url")]),
        "device list"=>rows("在线设备",array(data),&[("设备","name"),("IP","ip"),("MAC","mac"),("上线时间","since"),("状态","state")]),
        "balance show"=>details("余额",&json!({"校园卡":data["card"],"校园网":data["network"]})),
        "classroom list"=>{
            let items:Vec<Value>=array(&data["rooms"]).iter().map(|room|{
                let mut item=room.clone();let cells=array(&room["cells"]);
                for day in 0..7{let marks=(0..7).map(|period|match cells.get(day*7+period).and_then(Value::as_str){Some("free")=>"·",Some("occupied")=>"■",_=>"?"}).collect::<String>();item[format!("day{day}")]=json!(marks);}item
            }).collect();
            format!("第 {} 周 · 教学楼 {}\n{}· 空闲，■ 占用，? 未知；每天从左到右为第 1–7 节。\n",value("",&data["week"]),value("",&data["building"]),rows("教室占用",&items,&[("教室","name"),("容量","capacity"),("周一","day0"),("周二","day1"),("周三","day2"),("周四","day3"),("周五","day4"),("周六","day5"),("周日","day6")]))
        },
        "schema"|"" if data["commands"].is_array()=>format!("{}\n终端默认表格，管道默认 JSON。--output text 或 --output table 强制表格。\n使用 zhixing schema <命令> 查看参数。\n",rows("zhixing 命令",array(&data["commands"]),&[("命令","path"),("说明","summary"),("修改数据","writes")])),
        _ if data["command"].is_object()=>{
            let spec=&data["command"];let flags=array(&spec["flags"]).iter().map(|flag|vec![format!("--{}",flag.as_str().unwrap_or(""))]).collect();
            let mut result=format!("用法：zhixing {} [参数]\n{}\n{}",value("",&spec["path"]),value("",&spec["summary"]),grid("命令参数",vec!["参数".into()],flags));
            if let Some(global)=data["global_flags"].as_object(){result.push_str(&grid("通用参数",vec!["参数".into(),"说明".into()],global.iter().map(|(key,v)|vec![format!("--{key}"),value("",v)]).collect()));}result
        },
        _=>details(if command.is_empty(){"详情"}else{command},data)
    }
}
