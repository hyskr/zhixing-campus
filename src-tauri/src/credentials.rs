// 参考来源：文件／钥匙串／不持久化三种凭据保存方式的功能设计。
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Core/CredentialStore.swift
// 本项目以 Rust keyring 和按账号记录实现，未移植 Swift 钥匙串封装。
use super::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub mode: String,
    pub login_method: String,
    pub password: Option<String>,
    pub quick: Option<String>,
}
#[derive(Default)]
pub struct Store {
    pub records: Mutex<HashMap<String, Record>>,
    pub path: PathBuf,
}
impl Store {
    pub fn load(path: PathBuf) -> Self {
        let records = fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            records: Mutex::new(records),
            path,
        }
    }
    fn persist(&self) -> Result<(), String> {
        if self.path.as_os_str().is_empty() {
            return Ok(());
        }
        let rows: HashMap<_, _> = self
            .records
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, r)| r.mode != "session")
            .map(|(id, r)| {
                let mut r = r.clone();
                if r.mode == "keychain" {
                    r.password = None;
                    r.quick = None
                }
                (id.clone(), r)
            })
            .collect();
        fs::write(
            &self.path,
            serde_json::to_vec_pretty(&rows).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.path, fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn mode(&self, id: &str) -> String {
        self.records
            .lock()
            .unwrap()
            .get(id)
            .map(|r| r.mode.clone())
            .unwrap_or_else(|| "keychain".into())
    }
    pub fn password(&self, id: &str) -> Option<String> {
        if let Some(r) = self.records.lock().unwrap().get(id) {
            if r.mode != "keychain" {
                return r.password.clone();
            }
        }
        keyring::Entry::new("cn.zhixing.bjtu", id)
            .ok()?
            .get_password()
            .ok()
    }
    pub fn quick(&self, id: &str) -> Option<String> {
        if let Some(r) = self.records.lock().unwrap().get(id) {
            if r.mode != "keychain" {
                return r.quick.clone();
            }
        }
        keyring::Entry::new("cn.zhixing.bjtu.quick", id)
            .ok()?
            .get_password()
            .ok()
    }
    pub fn put(&self, id: &str, password: &str, mode: &str, method: &str) -> Result<(), String> {
        if !["keychain", "file", "session"].contains(&mode) {
            return Err("未知凭据保存方式".into());
        }
        let entry = keyring::Entry::new("cn.zhixing.bjtu", id).map_err(|e| e.to_string())?;
        if mode == "keychain" {
            entry.set_password(password).map_err(|e| e.to_string())?;
        } else {
            let _ = entry.delete_credential();
            let _ = keyring::Entry::new("cn.zhixing.bjtu.quick", id)
                .and_then(|e| e.delete_credential());
        }
        self.records.lock().unwrap().insert(
            id.into(),
            Record {
                mode: mode.into(),
                login_method: method.into(),
                password: Some(password.into()),
                quick: None,
            },
        );
        self.persist()
    }
    pub fn put_quick(&self, id: &str, quick: &str) -> Result<(), String> {
        let mode = self.mode(id);
        if mode == "keychain" {
            keyring::Entry::new("cn.zhixing.bjtu.quick", id)
                .map_err(|e| e.to_string())?
                .set_password(quick)
                .map_err(|e| e.to_string())?;
        } else if let Some(r) = self.records.lock().unwrap().get_mut(id) {
            r.quick = Some(quick.into());
        }
        self.persist()
    }
    pub fn forget_quick(&self, id: &str) -> Result<(), String> {
        if let Some(record) = self.records.lock().unwrap().get_mut(id) {
            record.quick = None;
        }
        if self.mode(id) == "keychain" {
            let _ = keyring::Entry::new("cn.zhixing.bjtu.quick", id)
                .and_then(|e| e.delete_credential());
        }
        self.persist()
    }
    pub fn forget(&self, id: &str) -> Result<(), String> {
        self.records.lock().unwrap().remove(id);
        let _ = keyring::Entry::new("cn.zhixing.bjtu", id).and_then(|e| e.delete_credential());
        let _ =
            keyring::Entry::new("cn.zhixing.bjtu.quick", id).and_then(|e| e.delete_credential());
        self.persist()
    }
}
#[tauri::command]
pub fn credential_info(username: String, state: tauri::State<'_, CampusState>) -> Value {
    let r = state
        .credentials
        .records
        .lock()
        .unwrap()
        .get(&username)
        .cloned();
    json!({"mode":r.as_ref().map(|r|r.mode.as_str()).unwrap_or("keychain"),"loginMethod":r.as_ref().map(|r|r.login_method.as_str()).unwrap_or("cas"),"hasPassword":r.as_ref().map(|_|true),"file":state.credentials.path.to_string_lossy()})
}
#[tauri::command]
pub async fn change_credential_storage(
    username: String,
    mode: String,
    state: tauri::State<'_, CampusState>,
) -> Result<(), String> {
    let password = state
        .credentials
        .password(&username)
        .ok_or("请先重新登录，再选择保存方式")?;
    let method = state
        .credentials
        .records
        .lock()
        .unwrap()
        .get(&username)
        .map(|r| r.login_method.clone())
        .unwrap_or_else(|| "cas".into());
    state
        .credentials
        .put(&username, &password, &mode, &method)?;
    if mode == "session" {
        let _ = fs::remove_file(state.directory.join(format!("{username}.cookies.json")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_credentials_survive_restart_and_session_credentials_do_not() {
        let path =
            std::env::temp_dir().join(format!("campus-credentials-{}.json", std::process::id()));
        let store = Store::load(path.clone());
        store.records.lock().unwrap().insert(
            "file".into(),
            Record {
                mode: "file".into(),
                login_method: "cas".into(),
                password: Some("test-file-password".into()),
                quick: Some("test-token".into()),
            },
        );
        store.records.lock().unwrap().insert(
            "session".into(),
            Record {
                mode: "session".into(),
                login_method: "sso".into(),
                password: Some("test-session-password".into()),
                quick: None,
            },
        );
        store.persist().unwrap();
        let next = Store::load(path.clone());
        assert_eq!(next.password("file").as_deref(), Some("test-file-password"));
        assert!(!next.records.lock().unwrap().contains_key("session"));
        assert_eq!(next.quick("file").as_deref(), Some("test-token"));
        fs::remove_file(path).unwrap();
    }
}
