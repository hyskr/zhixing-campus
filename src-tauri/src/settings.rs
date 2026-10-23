use super::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub appearance: String,
    pub quick_login: bool,
    pub resource_port: u16,
    pub download_concurrency: usize,
    pub reuse_uploads: bool,
    pub save_uploads: bool,
    pub network_reconnect: bool,
    pub network_account: String,
    pub network_interval: u64,
    pub mail_notifications: bool,
    pub mail_account: String,
    pub mail_interval: u64,
    pub grade_notifications: bool,
    pub grade_interval: u64,
    pub course_notifications: bool,
    pub reminder_account: String,
    pub course_reminder_minutes: i64,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            appearance: "classic".into(),
            quick_login: true,
            resource_port: 1936,
            download_concurrency: 3,
            reuse_uploads: true,
            save_uploads: true,
            network_reconnect: false,
            network_account: String::new(),
            network_interval: 60,
            mail_notifications: false,
            mail_account: String::new(),
            mail_interval: 10,
            grade_notifications: false,
            grade_interval: 10,
            course_notifications: false,
            reminder_account: String::new(),
            course_reminder_minutes: 0,
        }
    }
}
pub fn read(directory: &std::path::Path) -> Preferences {
    directory
        .parent()
        .and_then(|p| fs::read(p.join("settings.json")).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
#[tauri::command]
pub fn get_preferences(state: tauri::State<'_, CampusState>) -> Result<Preferences, String> {
    Ok(state.preferences.lock().map_err(|e| e.to_string())?.clone())
}
#[tauri::command]
pub fn set_preferences(
    preferences: Preferences,
    state: tauri::State<'_, CampusState>,
    downloads: tauri::State<'_, media::DownloadState>,
) -> Result<(), String> {
    let mut preferences = preferences;
    if !matches!(preferences.appearance.as_str(), "classic" | "claude") {
        return Err("请选择有效的界面风格".into());
    }
    if preferences.resource_port == 0 {
        return Err("请输入 1–65535 之间的端口".into());
    }
    preferences.network_interval = preferences.network_interval.clamp(1, 3600);
    preferences.mail_interval = preferences.mail_interval.clamp(1, 1440);
    preferences.grade_interval = preferences.grade_interval.clamp(1, 1440);
    preferences.course_reminder_minutes = preferences.course_reminder_minutes.clamp(0, 30);
    preferences.download_concurrency = preferences.download_concurrency.clamp(1, 8);
    let path = state.directory.parent().unwrap().join("settings.json");
    fs::write(
        path,
        serde_json::to_vec_pretty(&preferences).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let concurrency_changed = state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .download_concurrency
        != preferences.download_concurrency;
    if concurrency_changed {
        *downloads.slots.lock().map_err(|e| e.to_string())? = Some(Arc::new(
            tokio::sync::Semaphore::new(preferences.download_concurrency),
        ));
    }
    *state.preferences.lock().map_err(|e| e.to_string())? = preferences;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mail_and_grade_intervals_are_independent_and_keep_existing_defaults() {
        let old: Preferences = serde_json::from_value(json!({"mailInterval":30})).unwrap();
        assert_eq!(old.mail_interval, 30);
        assert_eq!(old.grade_interval, 10);
        let mut selected = old;
        selected.grade_interval = 5;
        let restored: Preferences =
            serde_json::from_value(serde_json::to_value(selected).unwrap()).unwrap();
        assert_eq!(restored.mail_interval, 30);
        assert_eq!(restored.grade_interval, 5);
    }
    #[test]
    fn appearance_defaults_for_existing_settings_and_persists_selection() {
        let old: Preferences = serde_json::from_value(json!({"quickLogin":false})).unwrap();
        assert_eq!(old.appearance, "classic");
        assert!(!old.quick_login);
        let mut selected = old;
        selected.appearance = "claude".into();
        let saved = serde_json::to_value(&selected).unwrap();
        assert_eq!(saved["appearance"], "claude");
        assert_eq!(
            serde_json::from_value::<Preferences>(saved)
                .unwrap()
                .appearance,
            "claude"
        );
    }
}
