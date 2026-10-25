package cn.zhixing.bjtu

import android.os.Bundle
import android.content.Intent
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.net.toUri

class SchoolBrowserActivity:AppCompatActivity() {
    private lateinit var browser:WebView
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        val toolbarHeight=(52*resources.displayMetrics.density).toInt()
        val bar=LinearLayout(this)
        bar.addView(Button(this).apply{text="关闭";setOnClickListener{finish()}},LinearLayout.LayoutParams(-2,toolbarHeight))
        bar.addView(TextView(this).apply{text="校园网站";textSize=17f;gravity=android.view.Gravity.CENTER_VERTICAL},LinearLayout.LayoutParams(-1,toolbarHeight))
        layout.addView(bar)
        browser=WebView(this).apply {
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true
            webViewClient=object:WebViewClient(){
                override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                    if(request.url.scheme in listOf("http","https"))return false
                    try{startActivity(Intent(Intent.ACTION_VIEW,request.url))}catch(_:Exception){}
                    return true
                }
            }
        }
        layout.addView(browser,LinearLayout.LayoutParams(-1,0,1f));setContentView(layout)
        ViewCompat.setOnApplyWindowInsetsListener(layout){view,insets->
            val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);insets
        }
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
            override fun handleOnBackPressed(){
                if(ViewCompat.getRootWindowInsets(browser)?.isVisible(WindowInsetsCompat.Type.ime())==true){WindowInsetsControllerCompat(window,browser).hide(WindowInsetsCompat.Type.ime());return}
                if(browser.canGoBack())browser.goBack() else finish()
            }
        })
        browser.loadUrl(intent.getStringExtra("url")?:"https://mis.bjtu.edu.cn")
    }
    override fun onDestroy(){browser.destroy();super.onDestroy()}
}
