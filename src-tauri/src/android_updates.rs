use super::*;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;

const CHANNEL: &str = "https://raw.githubusercontent.com/hyskr/zhixing-campus/update-channel/android.json";
#[derive(Default)]
pub struct UpdateDownload(Mutex<Option<tokio::sync::watch::Sender<bool>>>);
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct AndroidRelease { version:String, version_code:u64, notes:String, url:String, apk_url:String, size:u64, date:String }
async fn manifest()->Result<AndroidRelease,String>{
    Client::builder().timeout(Duration::from_secs(20)).user_agent(concat!("zhixing-campus/",env!("CARGO_PKG_VERSION"))).build().map_err(|e|e.to_string())?
        .get(CHANNEL).send().await.map_err(network_error)?.error_for_status().map_err(network_error)?.json().await.map_err(|_|"Android 更新清单格式无效".into())
}
fn cache_path(app:&tauri::AppHandle,release:&AndroidRelease)->Result<PathBuf,String>{
    // 安装包以原生 versionCode 命名，与发布清单保持一致。
    Ok(app.path().app_cache_dir().map_err(|e|e.to_string())?.join("updates").join(format!("android-{}.apk",release.version_code)))
}
pub async fn release_info(app:&tauri::AppHandle)->Result<Value,String>{
    let release=manifest().await?;let path=cache_path(app,&release)?;
    let cached=fs::metadata(&path).is_ok_and(|meta|meta.len()==release.size && release.size>0);
    Ok(json!({"version":release.version,"versionCode":release.version_code,"notes":release.notes,"url":release.url,"apkUrl":release.apk_url,"size":release.size,"date":release.date,"downloadedPath":if cached{Some(path)}else{None}}))
}
#[tauri::command]
pub fn cancel_android_update(state:tauri::State<'_,UpdateDownload>)->Result<(),String>{
    if let Some(cancel)=state.0.lock().map_err(|e|e.to_string())?.as_ref(){let _=cancel.send(true);}
    Ok(())
}
#[tauri::command]
pub async fn download_android_update(app:tauri::AppHandle,state:tauri::State<'_,UpdateDownload>)->Result<Value,String>{
    if !cfg!(target_os="android"){return Err("APK 更新仅供 Android 使用".into());}
    let (cancel,mut cancelled)=tokio::sync::watch::channel(false);
    {let mut active=state.0.lock().map_err(|e|e.to_string())?;if active.is_some(){return Err("更新包正在下载".into());}*active=Some(cancel);}
    let mut partial=None;
    let result=tokio::select!{
        value=async {
            let release=manifest().await?;
            let path=cache_path(&app,&release)?;
            if fs::metadata(&path).is_ok_and(|meta|meta.len()==release.size && release.size>0){return Ok(json!({"path":path,"version":release.version}));}
            tokio::fs::create_dir_all(path.parent().unwrap()).await.map_err(|e|e.to_string())?;
            let temp=path.with_extension("apk.part");partial=Some(temp.clone());
            let url=Url::parse(&release.apk_url).map_err(|_|"APK 下载地址无效")?;
            if url.scheme()!="https"{return Err("APK 下载需要 HTTPS 地址".into());}
            let response=Client::builder().timeout(Duration::from_secs(30*60)).build().map_err(|e|e.to_string())?.get(url).send().await.map_err(network_error)?.error_for_status().map_err(network_error)?;
            let total=response.content_length().unwrap_or(release.size);
            let mut response=response;let mut file=tokio::fs::File::create(&temp).await.map_err(|e|e.to_string())?;let mut loaded=0u64;
            let _=app.emit("app-update-download",json!({"loaded":0,"total":total}));
            let mut emitted=std::time::Instant::now();
            while let Some(bytes)=response.chunk().await.map_err(network_error)?{
                file.write_all(&bytes).await.map_err(|e|e.to_string())?;loaded+=bytes.len() as u64;
                if emitted.elapsed()>=Duration::from_millis(150){let _=app.emit("app-update-download",json!({"loaded":loaded,"total":total}));emitted=std::time::Instant::now();}
            }
            if loaded==0 || (release.size>0 && loaded!=release.size){return Err("APK 未完整下载，请重试".into());}
            file.flush().await.map_err(|e|e.to_string())?;drop(file);
            tokio::fs::rename(&temp,&path).await.map_err(|e|e.to_string())?;
            let _=app.emit("app-update-download",json!({"loaded":loaded,"total":loaded}));
            Ok(json!({"path":path,"version":release.version}))
        }=>value,
        _=cancelled.changed()=>Err("已取消更新下载".into()),
    };
    if let Some(path)=partial{let _=tokio::fs::remove_file(path).await;}
    *state.0.lock().map_err(|e|e.to_string())?=None;
    result
}
