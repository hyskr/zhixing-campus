//! Install a user-level terminal entry for the CLI already bundled with the desktop app.
use super::*;

fn executable() -> Result<PathBuf, String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) {
        "zhixing.exe"
    } else {
        "zhixing"
    };
    let path = current.parent().ok_or("无法定位应用目录")?.join(name);
    if !path.is_file() {
        return Err("当前应用未包含 CLI，请安装包含命令行工具的新版桌面包".into());
    }
    Ok(path)
}
fn home() -> Result<PathBuf, String> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or("无法定位用户目录".into())
}
fn info() -> Result<Value, String> {
    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = current
        .parent()
        .ok_or("无法定位应用目录")?
        .join(if cfg!(windows) {
            "zhixing.exe"
        } else {
            "zhixing"
        });
    Ok(
        json!({"bundled":path.is_file(),"executable":path,"command":"zhixing","dataDirectory":default_data_directory()?}),
    )
}
pub(super) fn default_data_directory() -> Result<PathBuf, String> {
    let home = home()?;
    Ok(if cfg!(target_os = "macos") {
        home.join("Library/Application Support/cn.zhixing.bjtu")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Roaming"))
            .join("cn.zhixing.bjtu")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
            .join("cn.zhixing.bjtu")
    })
}
fn install_entry() -> Result<Value, String> {
    let source = executable()?;
    #[cfg(windows)]
    {
        use std::process::Command;
        let directory = source.parent().unwrap();
        let script = r#"$ErrorActionPreference='Stop'; $dir=$env:ZHIXING_CLI_DIRECTORY; $current=[Environment]::GetEnvironmentVariable('Path','User'); $parts=@($current -split ';' | Where-Object { $_ }); if($parts -notcontains $dir) { [Environment]::SetEnvironmentVariable('Path',(($parts + $dir) -join ';'),'User') }"#;
        let result = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("ZHIXING_CLI_DIRECTORY", directory)
            .output()
            .map_err(|_| "无法更新用户 PATH，请手动将应用目录加入 PATH")?;
        if !result.status.success() {
            return Err("更新用户 PATH 失败，请手动将应用目录加入 PATH".into());
        }
        Ok(
            json!({"installed":true,"executable":source,"command":"zhixing","restartTerminal":true,"message":"CLI 已加入用户 PATH，重新打开终端后可用"}),
        )
    }
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::symlink;
        let home = home()?;
        let directory = home.join(".local/bin");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let target = directory.join("zhixing");
        let appimage = std::env::var_os("APPIMAGE").map(PathBuf::from);
        if fs::symlink_metadata(&target).is_ok() {
            if !fs::symlink_metadata(&target)
                .map_err(|e| e.to_string())?
                .file_type()
                .is_symlink()
                && !fs::read_to_string(&target)
                    .unwrap_or_default()
                    .starts_with("#!/bin/sh\n# zhixing CLI\n")
            {
                return Err(format!(
                    "{} 已存在且不是命令链接，请先移开该文件",
                    target.display()
                ));
            }
            fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
        if let Some(image) = appimage {
            use std::os::unix::fs::PermissionsExt;
            let quoted = image.to_string_lossy().replace("'", "'\\''");
            fs::write(
                &target,
                format!("#!/bin/sh\n# zhixing CLI\nexec '{quoted}' --cli \"$@\"\n"),
            )
            .map_err(|e| e.to_string())?;
            fs::set_permissions(&target, fs::Permissions::from_mode(0o755))
                .map_err(|e| e.to_string())?;
        } else {
            symlink(&source, &target).map_err(|e| e.to_string())?;
        }
        let shell = std::env::var("SHELL").unwrap_or_default();
        let profile = home.join(if shell.ends_with("zsh") {
            ".zprofile"
        } else if shell.ends_with("bash") {
            if cfg!(target_os = "macos") {
                ".bash_profile"
            } else {
                ".bashrc"
            }
        } else {
            ".profile"
        });
        let line = "export PATH=\"$HOME/.local/bin:$PATH\"";
        let content = fs::read_to_string(&profile).unwrap_or_default();
        if !content.contains(line) {
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&profile)
                .map_err(|e| e.to_string())?;
            writeln!(file, "\n{line}").map_err(|e| e.to_string())?;
        }
        Ok(
            json!({"installed":true,"executable":source,"link":target,"profile":profile,"command":"zhixing","restartTerminal":true,"message":"命令链接已建立，重新打开终端后可用"}),
        )
    }
    #[cfg(not(any(windows, unix)))]
    {
        Err("当前平台请直接调用 CLI 完整路径".into())
    }
}
pub(super) fn install() -> Result<Value, String> {
    let result = install_entry()?;
    let directory = default_data_directory()?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    fs::write(directory.join("cli-installed"), b"zhixing\n").map_err(|e| e.to_string())?;
    Ok(result)
}

#[cfg(desktop)]
pub(super) fn refresh_installed() -> Result<(), String> {
    let mut installed = default_data_directory()?.join("cli-installed").is_file();
    #[cfg(unix)]
    {
        let target = home()?.join(".local/bin/zhixing");
        installed |= fs::read_link(&target)
            .map(|path| path.file_name() == Some(std::ffi::OsStr::new("zhixing")))
            .unwrap_or(false)
            || fs::read_to_string(&target).unwrap_or_default()
                .starts_with("#!/bin/sh\n# zhixing CLI\n");
    }
    #[cfg(windows)]
    if !installed {
        let source = executable()?;
        let result = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$parts=@([Environment]::GetEnvironmentVariable('Path','User') -split ';'); if($parts -contains $env:ZHIXING_CLI_DIRECTORY) { exit 0 } else { exit 1 }"])
            .env("ZHIXING_CLI_DIRECTORY", source.parent().unwrap())
            .output().map_err(|e| e.to_string())?;
        installed = result.status.success();
    }
    if installed {
        install()?;
    }
    Ok(())
}

#[tauri::command]
pub fn cli_info() -> Result<Value, String> {
    info()
}
#[tauri::command]
pub fn install_cli() -> Result<Value, String> {
    if cfg!(target_os = "android") {
        return Err("命令行工具仅随桌面应用提供".into());
    }
    install()
}
