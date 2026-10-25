package cn.zhixing.bjtu

import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var campusView: WebView? = null
  @Volatile private var insetState = "{\"top\":0,\"bottom\":0,\"left\":0,\"right\":0,\"keyboard\":false}"
  inner class CampusWindow {
    @JavascriptInterface fun systemInsets(): String = insetState
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // App surfaces are light in both supported styles; bars draw over the WebView.
    // https://developer.android.com/develop/ui/views/layout/edge-to-edge
    enableEdgeToEdge(statusBarStyle=SystemBarStyle.light(Color.TRANSPARENT,Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.light(Color.TRANSPARENT,Color.TRANSPARENT))
    window.isStatusBarContrastEnforced = false
    window.isNavigationBarContrastEnforced = false
    window.decorView.setBackgroundColor(Color.WHITE)
    onBackPressedDispatcher.addCallback(this, object: OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val view = campusView
        if (view == null) { moveTaskToBack(true); return }
        if (ViewCompat.getRootWindowInsets(view)?.isVisible(WindowInsetsCompat.Type.ime()) == true) {
          WindowInsetsControllerCompat(window,view).hide(WindowInsetsCompat.Type.ime()); return
        }
        view.evaluateJavascript("Boolean(window.__campusBack && window.__campusBack())") { handled ->
          if (handled != "true") moveTaskToBack(true)
        }
      }
    })
  }
  override fun onDestroy() {
    campusView?.let { view ->
      ViewCompat.setOnApplyWindowInsetsListener((view.parent as? android.view.View) ?: view, null)
      view.removeJavascriptInterface("CampusWindow")
    }
    campusView = null
    super.onDestroy()
  }
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    campusView = webView
    webView.addJavascriptInterface(CampusWindow(), "CampusWindow")
    webView.post {
      val container = (webView.parent as? android.view.View) ?: webView
      ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val keyboard = insets.isVisible(WindowInsetsCompat.Type.ime())
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
        // Resize for IME; system bar and cutout spacing belongs to the web surface.
        view.setPadding(0, 0, 0, if (keyboard) ime.bottom else 0)
        insetState = "{\"top\":${bars.top},\"bottom\":${if(keyboard)0 else bars.bottom},\"left\":${bars.left},\"right\":${bars.right},\"keyboard\":$keyboard}"
        webView.evaluateJavascript("window.dispatchEvent(new Event('campus:window-insets'))", null)
        WindowInsetsCompat.CONSUMED
      }
      ViewCompat.requestApplyInsets(container)
    }
  }
}
