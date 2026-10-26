package cn.zhixing.bjtu

import android.graphics.Color
import android.os.Bundle
import android.os.Message
import android.content.Intent
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class SchoolBrowserActivity:AppCompatActivity() {
    private lateinit var browser:WebView
    private lateinit var content:FrameLayout
    private lateinit var pageTitle:TextView
    private val pages=mutableListOf<WebView>()

    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        enableEdgeToEdge(statusBarStyle=SystemBarStyle.light(Color.TRANSPARENT,Color.TRANSPARENT),navigationBarStyle=SystemBarStyle.light(Color.TRANSPARENT,Color.TRANSPARENT))
        window.isNavigationBarContrastEnforced=false
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.WHITE)}
        val toolbarHeight=(52*resources.displayMetrics.density).toInt()
        val bar=LinearLayout(this)
        bar.addView(Button(this).apply{text="返回";setOnClickListener{back()}},LinearLayout.LayoutParams(-2,toolbarHeight))
        pageTitle=TextView(this).apply{text="校园网站";textSize=17f;gravity=android.view.Gravity.CENTER_VERTICAL;maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END}
        bar.addView(pageTitle,LinearLayout.LayoutParams(0,toolbarHeight,1f))
        bar.addView(Button(this).apply{text="关闭";setOnClickListener{finish()}},LinearLayout.LayoutParams(-2,toolbarHeight))
        layout.addView(bar)
        content=FrameLayout(this)
        layout.addView(content,LinearLayout.LayoutParams(-1,0,1f));setContentView(layout)
        ViewCompat.setOnApplyWindowInsetsListener(layout){view,insets->
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets
        }
        showPage(createBrowser())
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){back()}})
        browser.loadUrl(intent.getStringExtra("url")?:"https://mis.bjtu.edu.cn")
    }
    private fun showPage(view:WebView){
        pages.add(view);browser=view;content.removeAllViews();content.addView(view,FrameLayout.LayoutParams(-1,-1))
        pageTitle.text=view.title?:"校园网站"
    }
    private fun closePage(view:WebView){
        if(pages.firstOrNull()===view){finish();return}
        if(!pages.remove(view))return
        if(browser===view){content.removeView(view);browser=pages.last();content.addView(browser,FrameLayout.LayoutParams(-1,-1));pageTitle.text=browser.title?:"校园网站"}
        view.destroy()
    }
    private fun back(){
        if(ViewCompat.getRootWindowInsets(browser)?.isVisible(WindowInsetsCompat.Type.ime())==true){WindowInsetsControllerCompat(window,browser).hide(WindowInsetsCompat.Type.ime());return}
        if(browser.canGoBack())browser.goBack() else if(pages.size>1)closePage(browser) else finish()
    }
    private fun createBrowser():WebView=WebView(this).apply {
        settings.javaScriptEnabled=true;settings.domStorageEnabled=true
        settings.setSupportMultipleWindows(true);settings.javaScriptCanOpenWindowsAutomatically=true
        CookieManager.getInstance().setAcceptThirdPartyCookies(this,true)
        webChromeClient=object:WebChromeClient(){
            override fun onReceivedTitle(view:WebView,text:String?){if(view===browser)pageTitle.text=text?:"校园网站"}
            override fun onCreateWindow(view:WebView,isDialog:Boolean,isUserGesture:Boolean,resultMsg:Message):Boolean{
                val child=createBrowser();showPage(child)
                (resultMsg.obj as WebView.WebViewTransport).webView=child
                resultMsg.sendToTarget();return true
            }
            override fun onCloseWindow(window:WebView){closePage(window)}
        }
        webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                if(request.url.scheme in listOf("http","https","about","javascript","data","blob"))return false
                val external=if(request.url.scheme=="intent")Intent.parseUri(request.url.toString(),Intent.URI_INTENT_SCHEME)else Intent(Intent.ACTION_VIEW,request.url)
                try{startActivity(external)}catch(_:Exception){
                    val fallback=external.getStringExtra("browser_fallback_url")
                    if(fallback!=null&&(fallback.startsWith("https://")||fallback.startsWith("http://")))view.loadUrl(fallback)
                    else android.widget.Toast.makeText(this@SchoolBrowserActivity,"无法打开此链接",android.widget.Toast.LENGTH_SHORT).show()
                }
                return true
            }
        }
    }
    override fun onDestroy(){content.removeAllViews();pages.forEach{it.destroy()};pages.clear();super.onDestroy()}
}
