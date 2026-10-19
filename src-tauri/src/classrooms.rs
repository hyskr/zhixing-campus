use super::*;
use regex::Regex;

// 参考课程占用表的 7×7 单元格与颜色含义：
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/classroomoccupancy/ClassroomOccupancyHtmlParser.kt
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift
fn options(doc: &Html, name: &str) -> Vec<Value> {
    doc.select(&selector(&format!("select[name='{name}'] option")))
        .filter_map(|option| {
            let value = option.value().attr("value")?;
            if value.is_empty() {
                return None;
            }
            Some(json!({"id":value,"name":text(option)}))
        })
        .collect()
}
fn occupancy(style: &str) -> &'static str {
    let style = style.to_lowercase();
    let Some(color) = Regex::new(r"background-color\s*:\s*(#[0-9a-f]+)")
        .unwrap()
        .captures(&style)
        .map(|c| c[1].to_string())
    else {
        return "free";
    };
    match color.as_str() {
        "#fff" | "#ffffff" => "free",
        "#e46868" => "scheduled",
        "#9e6868" => "rescheduled",
        "#394ed6" => "exam",
        "#77bf6d" => "experiment",
        "#d8cc56" => "other",
        _ => "unknown",
    }
}
pub fn parse_page(body: &str, week: u32, building: &str) -> Result<Value, String> {
    let doc = Html::parse_document(body);
    let table = doc
        .select(&selector("table"))
        .next()
        .ok_or("教室占用页面未返回表格")?;
    let mut rooms = Vec::new();
    let capacity = Regex::new(r"[（(]\s*(\d+)\s*[）)]").unwrap();
    let position = Regex::new(r"星期([一二三四五六日天1-7])\s*第(\d+)节").unwrap();
    for row in table.select(&selector("tr")) {
        if row.select(&selector("th")).next().is_some() {
            continue;
        }
        let cells = row.select(&selector("td")).collect::<Vec<_>>();
        if cells.is_empty() {
            continue;
        }
        if cells.len() < 50 {
            return Err("教室占用表格不完整，已保留原有结果".into());
        }
        let label = text(cells[0]);
        let name = label
            .split([' ', '(', '（'])
            .next()
            .unwrap_or("")
            .to_string();
        let seats = capacity
            .captures(&label)
            .and_then(|c| c[1].parse::<u32>().ok())
            .unwrap_or(0);
        let mut statuses = vec!["unknown"; 49];
        for (index, cell) in cells.iter().skip(1).take(49).enumerate() {
            let at = position
                .captures(cell.value().attr("title").unwrap_or(""))
                .and_then(|capture| {
                    let day = match &capture[1] {
                        "一" | "1" => 1,
                        "二" | "2" => 2,
                        "三" | "3" => 3,
                        "四" | "4" => 4,
                        "五" | "5" => 5,
                        "六" | "6" => 6,
                        "日" | "天" | "7" => 7,
                        _ => 0,
                    };
                    let period = capture[2].parse::<usize>().ok()?;
                    if day > 0 && (1..=7).contains(&period) {
                        Some((day - 1) * 7 + period - 1)
                    } else {
                        None
                    }
                })
                .unwrap_or(index);
            statuses[at] = occupancy(cell.value().attr("style").unwrap_or(""));
        }
        rooms.push(json!({"id":name,"name":name,"capacity":seats,"cells":statuses}));
    }
    let current = Regex::new(r#"\[name=zxjxjhh\].*?\.val\(["']([^"']+)"#)
        .unwrap()
        .captures(body)
        .map(|c| c[1].to_string())
        .or_else(|| {
            doc.select(&selector("select[name=zxjxjhh] option[selected]"))
                .next()
                .and_then(|o| o.value().attr("value").map(str::to_string))
        });
    Ok(
        json!({"week":week,"building":building,"rooms":rooms,"buildings":options(&doc,"jxlh"),"semesters":options(&doc,"zxjxjhh"),"currentSemester":current}),
    )
}
#[tauri::command]
pub async fn classroom_occupancy(
    username: String,
    week: u32,
    building: String,
    semester: Option<String>,
    state: tauri::State<'_, CampusState>,
) -> Result<Value, String> {
    if !(1..=53).contains(&week) {
        return Err("教学周应在 1–53 之间".into());
    }
    let session = get_session(&state, &username)?;
    ensure_aa(&session).await?;
    let mut url = Url::parse(&format!("{AA}/classroom/timeholdresult/room_view/")).unwrap();
    url.query_pairs_mut().extend_pairs([
        ("zc", week.to_string()),
        ("jxlh", building.clone()),
        ("page", "1".into()),
        ("perpage", "500".into()),
    ]);
    if let Some(semester) = semester.filter(|value| !value.is_empty()) {
        url.query_pairs_mut().append_pair("zxjxjhh", &semester);
    }
    let body = data_text(&session, url.as_str()).await?;
    let result = parse_page(&body, week, &building)?;
    save_session(&state, &username, &session)?;
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_week_grid_and_does_not_treat_unknown_color_as_free() {
        let mut cells = String::new();
        for i in 0..49 {
            cells.push_str(&format!(
                "<td title='星期{} 第{}节' style='background-color: {}'></td>",
                i / 7 + 1,
                i % 7 + 1,
                if i == 8 {
                    "#394ed6"
                } else if i == 9 {
                    "#abcdef"
                } else {
                    "#fff"
                }
            ));
        }
        let html=format!("<select name='jxlh'><option value='1'>思源楼</option></select><select name='zxjxjhh'><option value='term' selected>当前学期</option></select><table><tr><th>教室</th></tr><tr><td>SY101 (90)</td>{cells}</tr></table>");
        let page = parse_page(&html, 6, "1").unwrap();
        assert_eq!(page["rooms"][0]["capacity"], 90);
        assert_eq!(page["rooms"][0]["cells"][8], "exam");
        assert_eq!(page["rooms"][0]["cells"][9], "unknown");
        assert_eq!(page["currentSemester"], "term");
    }
    #[test]
    fn distinguishes_empty_table_from_failed_page() {
        assert!(parse_page("<h1>错误</h1>", 1, "1").is_err());
        assert!(parse_page("<table><tr><td>SY101</td></tr></table>", 1, "1").is_err());
        assert_eq!(
            parse_page("<table><tr><th>教室</th></tr></table>", 1, "1").unwrap()["rooms"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }
    #[test]
    #[ignore = "读取指定的本地学校页面，仅输出解析数量"]
    fn live_classroom_parser() {
        let path = std::env::var("CAMPUS_ROOM_HTML").unwrap();
        let body = fs::read_to_string(path).unwrap();
        let page = parse_page(&body, 6, "1").unwrap();
        assert!(!page["rooms"].as_array().unwrap().is_empty());
        println!(
            "rooms={}, buildings={}",
            page["rooms"].as_array().unwrap().len(),
            page["buildings"].as_array().unwrap().len()
        );
    }
}
