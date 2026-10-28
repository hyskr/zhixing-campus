//! 应用运行期间的成绩与课表提醒；邮件通知由 campus 模块按收件箱基线处理。
use super::*;
use chrono::{Datelike, FixedOffset, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct Reminders {
    path: Mutex<PathBuf>,
    accounts: Mutex<HashMap<String, AccountReminders>>,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct AccountReminders {
    grades: Option<Vec<Value>>,
    courses: Vec<Value>,
    week: u32,
    week_anchor: Option<NaiveDate>,
    sent_date: Option<NaiveDate>,
    sent_courses: Vec<String>,
}
fn today() -> NaiveDate {
    china_now().date()
}
fn china_now() -> NaiveDateTime {
    Utc::now()
        .with_timezone(&FixedOffset::east_opt(8 * 3600).unwrap())
        .naive_local()
}
pub fn init(state: &Reminders, path: PathBuf) {
    let accounts = fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    *state.accounts.lock().unwrap() = accounts;
    *state.path.lock().unwrap() = path;
}
fn persist(state: &Reminders, accounts: &HashMap<String, AccountReminders>) -> Result<(), String> {
    let bytes = serde_json::to_vec(accounts).map_err(|e| e.to_string())?;
    fs::write(&*state.path.lock().map_err(|e| e.to_string())?, bytes).map_err(|e| e.to_string())
}
fn new_grades(previous: Option<&Vec<Value>>, rows: &[Value]) -> Vec<String> {
    let Some(previous) = previous else {
        return vec![];
    };
    rows.iter()
        .filter(|item| {
            previous
                .iter()
                .find(|old| old["id"] == item["id"])
                .is_none_or(|old| old["score"] != item["score"])
        })
        .map(|item| format!("{} · {}", string(&item["name"]), string(&item["score"])))
        .collect()
}
fn deliver(app: &tauri::AppHandle, title: &str, body: &str) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("系统通知投递失败：{e}"))
}
pub fn record_sync(app: &tauri::AppHandle, username: &str, result: &Value) -> Result<(), String> {
    if result["grades"].is_array() {
        campus::record_scope_sync(app, username, "grades");
    }
    let state = app.state::<Reminders>();
    let prefs = app
        .state::<CampusState>()
        .preferences
        .lock()
        .unwrap()
        .clone();
    let fresh = {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        let account = accounts.entry(username.into()).or_default();
        let fresh = if let Some(rows) = result["grades"].as_array() {
            let fresh = new_grades(account.grades.as_ref(), rows);
            account.grades = Some(rows.clone());
            fresh
        } else {
            vec![]
        };
        if let Some(rows) = result["courses"].as_array() {
            account.courses = rows.clone();
        }
        if let Some(week) = result["currentWeek"]
            .as_u64()
            .filter(|v| (1..=30).contains(v))
        {
            account.week = week as u32;
            let now = today();
            account.week_anchor =
                Some(now - chrono::Duration::days(now.weekday().num_days_from_monday() as i64));
        }
        persist(&state, &accounts)?;
        fresh
    };
    if prefs.grade_notifications && prefs.reminder_account == username && !fresh.is_empty() {
        let _ = app.emit("campus-inapp-notice", json!({"title":format!("学业成绩 · {} 门更新",fresh.len()),"body":fresh.iter().take(4).cloned().collect::<Vec<_>>().join("\n"),"page":"grades","accountId":username}));
        if let Err(error) = deliver(
            app,
            &format!("学业成绩 · {} 门更新", fresh.len()),
            &fresh.into_iter().take(4).collect::<Vec<_>>().join("\n"),
        ) { eprintln!("成绩系统通知未投递：{error}"); }
    }
    Ok(())
}
#[tauri::command]
pub fn cache_reminder_data(
    username: String,
    data: Value,
    state: tauri::State<'_, Reminders>,
) -> Result<(), String> {
    // 启动时仅从已同步缓存建立基线，避免把旧成绩当作新成绩。
    let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
    let account = accounts.entry(username).or_default();
    if account.grades.is_none() {
        account.grades = data["grades"].as_array().cloned();
    }
    account.courses = data["courses"].as_array().cloned().unwrap_or_default();
    if let Some(week) = data["currentWeek"]
        .as_u64()
        .filter(|v| (1..=30).contains(v))
    {
        // 使用缓存同步日定位教学周，重启不把旧周次当成本周。
        if let Some(date) = data["syncedDate"]
            .as_str()
            .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
        {
            if account.week_anchor.is_none() || data["weekSyncedAt"].is_string() {
                account.week = week as u32;
                account.week_anchor = Some(
                    date - chrono::Duration::days(date.weekday().num_days_from_monday() as i64),
                );
            }
        }
    }
    persist(&state, &accounts)
}
pub(super) fn in_week(text: &str, week: i64) -> bool {
    let re = regex::Regex::new(r"(\d+)(?:\s*[-~—]\s*(\d+))?").unwrap();
    let mut any = false;
    let mut within = false;
    for cap in re.captures_iter(text) {
        any = true;
        let start = cap[1].parse::<i64>().unwrap();
        let end = cap
            .get(2)
            .and_then(|v| v.as_str().parse::<i64>().ok())
            .unwrap_or(start);
        within |= (start..=end).contains(&week);
    }
    (!any || within)
        && (!text.contains('单') || week % 2 == 1)
        && (!text.contains('双') || week % 2 == 0)
}
fn due_courses(
    account: &AccountReminders,
    now: NaiveDateTime,
    ahead: i64,
) -> Vec<(String, String)> {
    let Some(anchor) = account.week_anchor else {
        return vec![];
    };
    let week = account.week as i64 + (now.date() - anchor).num_days().div_euclid(7);
    let starts = [
        (8, 0),
        (10, 10),
        (12, 10),
        (14, 10),
        (16, 20),
        (19, 0),
        (21, 0),
    ];
    account
        .courses
        .iter()
        .filter_map(|course| {
            if course["selection"] == true
                || course["day"].as_u64() != Some(now.weekday().number_from_monday() as u64)
                || !in_week(&string(&course["weeks"]), week)
            {
                return None;
            }
            let period = course["period"].as_u64()? as usize;
            let &(hour, minute) = starts.get(period.checked_sub(1)?)?;
            let start = now.date().and_hms_opt(hour, minute, 0)?;
            let elapsed = (now - (start - chrono::Duration::minutes(ahead))).num_seconds();
            let key = format!(
                "{}:{}:{}",
                string(&course["id"]),
                period,
                string(&course["name"])
            );
            if !(0..90).contains(&elapsed)
                || (account.sent_date == Some(now.date()) && account.sent_courses.contains(&key))
            {
                return None;
            }
            Some((
                key,
                format!(
                    "{} · {:02}:{:02} · {}\n{}",
                    string(&course["name"]),
                    hour,
                    minute,
                    string(&course["place"]),
                    string(&course["teacher"])
                ),
            ))
        })
        .collect()
}
fn check_courses(app: &tauri::AppHandle, prefs: &settings::Preferences) -> Result<(), String> {
    let state = app.state::<Reminders>();
    let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
    let Some(account) = accounts.get_mut(&prefs.reminder_account) else {
        return Ok(());
    };
    let now = china_now();
    let due = due_courses(account, now, prefs.course_reminder_minutes);
    if account.sent_date != Some(now.date()) {
        account.sent_date = Some(now.date());
        account.sent_courses.clear()
    }
    for (key, body) in due {
        let title = if prefs.course_reminder_minutes == 0 {
            "到点上课".into()
        } else {
            format!("{} 分钟后上课", prefs.course_reminder_minutes)
        };
        let _ = app.emit("campus-inapp-notice", json!({"title":title,"body":body,"page":"schedule","accountId":prefs.reminder_account}));
        if let Err(error) = deliver(app, &title, &body) { eprintln!("上课系统通知未投递：{error}"); }
        account.sent_courses.push(key);
    }
    persist(&state, &accounts)
}
pub fn start_background(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_grade = std::time::Instant::now();
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let prefs = app
                .state::<CampusState>()
                .preferences
                .lock()
                .unwrap()
                .clone();
            if prefs.course_notifications && !prefs.reminder_account.is_empty() {
                if let Err(error) = check_courses(&app, &prefs) {
                    let _ = app.emit("campus-reminder-error", error);
                }
            }
            if prefs.grade_notifications
                && !prefs.reminder_account.is_empty()
                && last_grade.elapsed().as_secs() >= prefs.grade_interval * 60
                && !campus::recently_synced(&app, &prefs.reminder_account, "grades", prefs.grade_interval)
            {
                last_grade = std::time::Instant::now();
                let result = async {
                    let session =
                        get_session(&app.state::<CampusState>(), &prefs.reminder_account)?;
                    ensure_aa(&session).await?;
                    let grades = fetch_grades(&session).await?;
                    record_sync(&app, &prefs.reminder_account, &json!({"grades":grades}))?;
                    let _ = app.emit("campus-grades-updated", json!({"accountId":prefs.reminder_account,"grades":grades}));
                    Ok::<(), String>(())
                }
                .await;
                if let Err(error) = result {
                    let _ = app.emit("campus-reminder-error", error);
                }
            }
        }
    });
}
#[tauri::command]
pub async fn test_notification(app: tauri::AppHandle, kind: Option<String>) -> Result<(), String> {
    let (title, body) = match kind.as_deref() {
        Some("grade") => (
            "成绩提醒测试",
            "示例课程 · 92 分。此为测试通知，未读取或更改真实成绩。",
        ),
        Some("course") => (
            "上课提醒测试",
            "示例课程 · 08:00 · 思源楼 101。此为测试通知。",
        ),
        _ => (
            "新邮件提醒测试",
            "知行通知已交给系统。此为测试通知，未发送邮件。",
        ),
    };
    deliver(&app, title, body)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grades_ignore_initial_history_and_notify_new_or_changed_score() {
        let old = vec![json!({"id":"1","name":"数学","score":"80"})];
        assert!(new_grades(None, &old).is_empty());
        assert!(new_grades(Some(&old), &old).is_empty());
        let new = vec![
            json!({"id":"1","name":"数学","score":"90"}),
            json!({"id":"2","name":"物理","score":"85"}),
        ];
        assert_eq!(new_grades(Some(&old), &new), vec!["数学 · 90", "物理 · 85"]);
    }
    #[test]
    fn course_reminders_respect_weeks_time_and_persisted_deduplication() {
        let date = NaiveDate::from_ymd_opt(2026, 10, 22).unwrap();
        let mut account = AccountReminders {
            week: 6,
            week_anchor: Some(NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()),
            courses: vec![
                json!({"id":"c1","name":"网络","teacher":"教师","day":4,"period":1,"place":"思源楼101","weeks":"1-16周(双)","selection":false}),
            ],
            ..Default::default()
        };
        assert_eq!(
            due_courses(&account, date.and_hms_opt(7, 50, 20).unwrap(), 10).len(),
            1
        );
        assert!(due_courses(&account, date.and_hms_opt(7, 49, 59).unwrap(), 10).is_empty());
        assert!(due_courses(&account, date.and_hms_opt(8, 2, 0).unwrap(), 0).is_empty());
        account.sent_date = Some(date);
        account.sent_courses = vec!["c1:1:网络".into()];
        let restored: AccountReminders =
            serde_json::from_slice(&serde_json::to_vec(&account).unwrap()).unwrap();
        assert!(due_courses(&restored, date.and_hms_opt(7, 50, 20).unwrap(), 10).is_empty());
        assert!(due_courses(
            &account,
            NaiveDate::from_ymd_opt(2026, 10, 29)
                .unwrap()
                .and_hms_opt(7, 50, 20)
                .unwrap(),
            10
        )
        .is_empty());
    }
}
