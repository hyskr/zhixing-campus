use super::*;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

const ID: &str = "campus-tray";

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
        {
            eprintln!("显示主窗口失败：{error}");
        }
    }
}

// Tauri 官方托盘与单实例接口：
// https://v2.tauri.app/learn/system-tray/
// https://v2.tauri.app/plugin/single-instance/
pub fn init(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray-show", "显示知行 Campus", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "tray-hide", "隐藏主窗口", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray-quit", "退出知行 Campus", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;
    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = app.default_window_icon().expect("应用图标已配置").clone();
    TrayIconBuilder::with_id(ID)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("知行 Campus")
        .menu(&menu)
        .show_menu_on_left_click(!cfg!(windows))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_main(app),
            "tray-hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(error) = window.hide() {
                        eprintln!("隐藏主窗口失败：{error}");
                    }
                }
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            #[cfg(windows)]
            if matches!(
                event,
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    button_state: tauri::tray::MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
            #[cfg(not(windows))]
            let _ = (tray, event);
        })
        .build(app)?;
    Ok(())
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let enabled = app
            .state::<CampusState>()
            .preferences
            .lock()
            .map(|p| p.close_to_tray)
            .unwrap_or(false);
        if enabled && app.tray_by_id(ID).is_some() {
            match window.hide() {
                Ok(()) => api.prevent_close(),
                Err(error) => eprintln!("隐藏主窗口失败：{error}"),
            }
        }
    }
}
