use super::*;
use serde::Deserialize;
use std::io::Write;
use std::path::Path;
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

fn staging_directory(app: &tauri::AppHandle) -> Result<tempfile::TempDir, String> {
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    tempfile::tempdir_in(cache).map_err(|e| e.to_string())
}

fn save(app: &tauri::AppHandle, path: &Path) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        mobile::export_file(app, path, "导出")?;
    }
    #[cfg(desktop)]
    {
        let name = path.file_name().unwrap().to_string_lossy();
        let Some(target) = app
            .dialog()
            .file()
            .set_file_name(name.as_ref())
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let target = target.into_path().map_err(|e| e.to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(target.parent().ok_or("保存目录不可用")?)
            .map_err(|e| e.to_string())?;
        std::io::copy(
            &mut fs::File::open(path).map_err(|e| e.to_string())?,
            &mut temp,
        )
        .map_err(|e| e.to_string())?;
        temp.persist(target).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
#[tauri::command]
pub async fn export_calendar(app: tauri::AppHandle, calendar: String) -> Result<bool, String> {
    let dir = staging_directory(&app)?;
    let path = dir.path().join("学期课表.ics");
    fs::write(&path, calendar).map_err(|e| e.to_string())?;
    save(&app, &path)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    course_id: String,
    source_id: String,
    kind: usize,
    title: String,
    course: String,
}

#[tauri::command]
pub async fn archive_homework(
    username: String,
    items: Vec<Assignment>,
    app: tauri::AppHandle,
    state: tauri::State<'_, CampusState>,
) -> Result<bool, String> {
    if items.is_empty() {
        return Err("请选择已提交作业".into());
    }
    let session = get_session(&state, &username)?;
    let smart = smart_session(&session).await?;
    let dir = staging_directory(&app)?;
    let path = dir.path().join("已交作业.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(&path).map_err(|e| e.to_string())?);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(true);
    for (i, item) in items.iter().enumerate() {
        if item.kind > 2 {
            return Err("未知作业类型".into());
        }
        let detail = learning::detail_data(
            &session,
            &smart,
            &item.course_id,
            &item.source_id,
            item.kind,
        )
        .await?;
        let folder = format!(
            "{}/{:03}-{}",
            media::safe_name(&item.course),
            i + 1,
            media::safe_name(&item.title)
        );
        let attachments = detail["submittedAttachments"]
            .as_array()
            .ok_or("学校未返回附件信息")?;
        let body = string(&detail["submittedContent"]);
        if body.is_empty() && attachments.is_empty() {
            return Err(format!("《{}》没有可归档的提交正文或附件", item.title));
        }
        archive
            .start_file(format!("{folder}/提交记录.txt"), options)
            .map_err(|e| e.to_string())?;
        writeln!(
            archive,
            "{}\n{}\n提交时间 {}\n\n{}",
            item.course,
            item.title,
            string(&detail["submittedAt"]),
            parsers::multiline(&body)
        )
        .map_err(|e| e.to_string())?;
        for (j, file) in attachments.iter().enumerate() {
            let mut response = media::download_response(&session, &string(&file["url"])).await?;
            let name = string(&file["name"]);
            if response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.contains("text/html"))
                && !name.to_lowercase().ends_with(".html")
            {
                return Err(format!("《{name}》返回了网页，请刷新登录后重试"));
            }
            archive
                .start_file(
                    format!("{folder}/附件/{:03}-{}", j + 1, media::safe_name(&name)),
                    options,
                )
                .map_err(|e| e.to_string())?;
            while let Some(chunk) = response.chunk().await.map_err(network_error)? {
                archive.write_all(&chunk).map_err(|e| e.to_string())?;
            }
        }
    }
    drop(archive.finish().map_err(|e| e.to_string())?);
    save(&app, &path)
}
