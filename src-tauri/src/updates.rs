use super::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct ReleaseManifest {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
}

// 静态清单同时提供版本与发布说明，无需请求 GitHub REST API。
// https://v2.tauri.app/plugin/updater/#static-json-file
#[tauri::command]
pub async fn update_release(app: tauri::AppHandle) -> Result<Value, String> {
    if cfg!(target_os="android") { return crate::android_updates::release_info(&app).await; }
    let endpoint = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value["endpoints"][0].as_str())
        .ok_or("应用未配置更新地址")?
        .to_owned();
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("zhixing-campus/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|error| format!("获取更新信息失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "获取更新信息失败（HTTP {}）",
            response.status().as_u16()
        ));
    }
    let release: ReleaseManifest = response
        .json()
        .await
        .map_err(|_| "更新清单格式无效，请稍后重试")?;
    Ok(json!({
        "version": release.version,
        "notes": release.notes.unwrap_or_default(),
        "date": release.pub_date.unwrap_or_default(),
        "url": "https://github.com/hyskr/zhixing-campus/releases/latest",
    }))
}
