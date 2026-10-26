package cn.zhixing.bjtu

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.webkit.CookieManager
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg class SecretArgs { lateinit var operation:String; lateinit var key:String; var value:String="" }
@InvokeArg class SchoolCookie { lateinit var url:String; lateinit var value:String }
@InvokeArg class SchoolArgs { lateinit var url:String; var cookies:Array<SchoolCookie> = emptyArray() }
@InvokeArg class FileArgs { lateinit var path:String; var relativePath:String="" }

// Android Keystore AES-GCM；学校网页使用独立 Activity，不向远程页面注入 Tauri IPC。
@TauriPlugin
class CampusMobilePlugin(private val activity:Activity):Plugin(activity) {
    private val secrets=AndroidSecretStore(activity)
    @Command fun secret(invoke:Invoke) {
        try {
            val args=invoke.parseArgs(SecretArgs::class.java)
            val result=JSObject()
            when(args.operation) {
                "get" -> { val value=secrets.get(args.key);result.put("exists",value!=null);if(value!=null)result.put("value",value) }
                "set" -> secrets.set(args.key,args.value)
                "delete" -> secrets.delete(args.key)
                else -> throw IllegalArgumentException("未知凭据操作")
            }
            invoke.resolve(result)
        } catch(error:Exception){invoke.reject("Android 安全存储操作失败：${error.message}")}
    }
    @Command fun openSchool(invoke:Invoke) {
        val args=invoke.parseArgs(SchoolArgs::class.java)
        activity.runOnUiThread {
            val manager=CookieManager.getInstance()
            manager.setAcceptCookie(true)
            fun install(index:Int) {
                if(index==args.cookies.size) {
                    manager.flush()
                    activity.startActivity(Intent(activity,SchoolBrowserActivity::class.java).putExtra("url",args.url))
                    invoke.resolve(JSObject())
                } else { val cookie=args.cookies[index]; manager.setCookie(cookie.url,cookie.value){install(index+1)} }
            }
            manager.removeAllCookies{install(0)}
        }
    }
    @Command fun openFile(invoke:Invoke) {
        try {
            val file=File(invoke.parseArgs(FileArgs::class.java).path)
            val uri=FileProvider.getUriForFile(activity,"${activity.packageName}.fileprovider",file)
            val mime=android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())?:"application/octet-stream"
            val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.clipData=ClipData.newRawUri(file.name,uri)
            activity.startActivity(Intent.createChooser(intent,"打开 ${file.name}"))
            invoke.resolve(JSObject())
        } catch(error:Exception){invoke.reject("无法打开下载文件：${error.message}")}
    }
    @Command fun exportFile(invoke:Invoke) {
        var destination:android.net.Uri?=null
        try {
            val args=invoke.parseArgs(FileArgs::class.java)
            val file=File(args.path)
            val mime=android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())?:"application/octet-stream"
            val values=android.content.ContentValues().apply{
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME,file.name)
                put(android.provider.MediaStore.Downloads.MIME_TYPE,mime)
                put(android.provider.MediaStore.Downloads.RELATIVE_PATH,"Download/知行Campus/"+args.relativePath)
                put(android.provider.MediaStore.Downloads.IS_PENDING,1)
            }
            val resolver=activity.contentResolver
            destination=resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:throw IllegalStateException("无法创建下载文件")
            resolver.openOutputStream(destination)!!.use{output->file.inputStream().use{input->input.copyTo(output)}}
            resolver.update(destination,android.content.ContentValues().apply{put(android.provider.MediaStore.Downloads.IS_PENDING,0)},null,null)
            invoke.resolve(JSObject().apply{put("uri",destination.toString())})
        } catch(error:Exception){destination?.let{activity.contentResolver.delete(it,null,null)};invoke.reject("导出文件失败：${error.message}")}
    }

    @Command fun restartApp(invoke:Invoke) {
        activity.runOnUiThread {
            val request=Intent(activity,RestartActivity::class.java)
                .putExtra("previousPid",android.os.Process.myPid())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                activity.startActivity(request)
                invoke.resolve(JSObject())
            } catch(error:Exception){invoke.reject("无法重启应用：${error.message}")}
        }
    }

}
