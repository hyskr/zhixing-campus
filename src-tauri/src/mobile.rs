use super::*;
use keyring::credential::{Credential, CredentialApi, CredentialBuilderApi};
use std::any::Any;
use tauri::plugin::{PluginHandle, TauriPlugin};

struct AndroidCredentials(PluginHandle<tauri::Wry>);
struct AndroidCredential {
    plugin: PluginHandle<tauri::Wry>,
    key: String,
}
fn platform_error(error: impl std::fmt::Display) -> keyring::Error {
    keyring::Error::PlatformFailure(Box::new(std::io::Error::other(error.to_string())))
}
impl CredentialBuilderApi for AndroidCredentials {
    fn build(
        &self,
        _target: Option<&str>,
        service: &str,
        user: &str,
    ) -> keyring::Result<Box<Credential>> {
        Ok(Box::new(AndroidCredential {
            plugin: self.0.clone(),
            key: format!("{service}:{user}"),
        }))
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}
impl CredentialApi for AndroidCredential {
    fn set_secret(&self, secret: &[u8]) -> keyring::Result<()> {
        self.plugin
            .run_mobile_plugin::<Value>(
                "secret",
                json!({"operation":"set","key":self.key,"value":STANDARD.encode(secret)}),
            )
            .map_err(platform_error)?;
        Ok(())
    }
    fn get_secret(&self) -> keyring::Result<Vec<u8>> {
        let result = self
            .plugin
            .run_mobile_plugin::<Value>("secret", json!({"operation":"get","key":self.key}))
            .map_err(platform_error)?;
        if result["exists"] == false {
            return Err(keyring::Error::NoEntry);
        }
        STANDARD
            .decode(result["value"].as_str().unwrap_or_default())
            .map_err(platform_error)
    }
    fn delete_credential(&self) -> keyring::Result<()> {
        self.plugin
            .run_mobile_plugin::<Value>("secret", json!({"operation":"delete","key":self.key}))
            .map_err(platform_error)?;
        Ok(())
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}
struct Mobile(PluginHandle<tauri::Wry>);
pub fn init() -> TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("campus-mobile")
        .setup(|app, api| {
            let handle = api.register_android_plugin("cn.zhixing.bjtu", "CampusMobilePlugin")?;
            keyring::set_default_credential_builder(Box::new(AndroidCredentials(handle.clone())));
            app.manage(Mobile(handle));
            Ok(())
        })
        .build()
}
pub fn open_school(
    app: &tauri::AppHandle,
    address: &str,
    cookies: Vec<tauri::webview::Cookie<'static>>,
) -> Result<(), String> {
    let cookies:Vec<_>=cookies.into_iter().filter_map(|cookie| {
        let domain=cookie.domain()?.trim_start_matches('.');
        Some(json!({"url":format!("{}://{domain}/",if cookie.secure()==Some(true){"https"}else{"http"}),"value":cookie.to_string()}))
    }).collect();
    app.state::<Mobile>()
        .0
        .run_mobile_plugin::<Value>("openSchool", json!({"url":address,"cookies":cookies}))
        .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn open_file(app: &tauri::AppHandle, path: &std::path::Path) -> Result<(), String> {
    app.state::<Mobile>()
        .0
        .run_mobile_plugin::<Value>("openFile", json!({"path":path.to_string_lossy()}))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn export_file(
    app: &tauri::AppHandle,
    path: &std::path::Path,
    relative: &str,
) -> Result<String, String> {
    let result = app
        .state::<Mobile>()
        .0
        .run_mobile_plugin::<Value>(
            "exportFile",
            json!({"path":path.to_string_lossy(),"relativePath":relative}),
        )
        .map_err(|e| e.to_string())?;
    Ok(result["uri"].as_str().unwrap_or_default().to_string())
}
