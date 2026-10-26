#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::args().nth(1).as_deref() == Some("--cli") {
        let binary = std::env::current_exe()
            .expect("application path")
            .with_file_name("zhixing");
        let result = std::process::Command::new(binary)
            .args(std::env::args_os().skip(2))
            .status();
        std::process::exit(result.ok().and_then(|s| s.code()).unwrap_or(1));
    }
    zhixing_campus_lib::run()
}
