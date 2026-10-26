package cn.zhixing.bjtu

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

// 独立进程负责重新启动主进程，让热更新资源在原生启动时重新加载。
class RestartActivity:Activity(){
    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        val previous=intent.getIntExtra("previousPid",-1)
        if(previous>0 && previous!=Process.myPid())Process.killProcess(previous)
        val launch=Intent.makeRestartActivityTask(android.content.ComponentName(this,MainActivity::class.java))
        startActivity(launch)
        finish()
        Process.killProcess(Process.myPid())
    }
}
