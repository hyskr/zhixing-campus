package cn.zhixing.bjtu

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var campusView:WebView?=null
  override fun onCreate(savedInstanceState:Bundle?) {
    enableEdgeToEdge();super.onCreate(savedInstanceState)
    onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
      override fun handleOnBackPressed(){
        val view=campusView
        if(view==null){moveTaskToBack(true);return}
        if(ViewCompat.getRootWindowInsets(view)?.isVisible(WindowInsetsCompat.Type.ime())==true){
          WindowInsetsControllerCompat(window,view).hide(WindowInsetsCompat.Type.ime());return
        }
        view.evaluateJavascript("Boolean(window.__campusBack && window.__campusBack())"){handled->
          if(handled!="true")moveTaskToBack(true)
        }
      }
    })
  }
  override fun onWebViewCreate(webView:WebView) {
    super.onWebViewCreate(webView);campusView=webView
    webView.post {
    val container=(webView.parent as? android.view.View)?:webView
    ViewCompat.setOnApplyWindowInsetsListener(container){view,insets->
      val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left,bars.top,bars.right,bars.bottom)
      val keyboard=if(insets.isVisible(WindowInsetsCompat.Type.ime()))"open" else "closed"
      webView.evaluateJavascript("document.documentElement?.setAttribute('data-keyboard','$keyboard')",null)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(container)
    }
  }
}
