package cn.zhixing.bjtu

import android.content.Context
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class AndroidBackTest {
    private fun webView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) {
            webView(view.getChildAt(index))?.let { return it }
        }
        return null
    }
    private fun javascript(scenario: ActivityScenario<MainActivity>, source: String): String {
        val result=AtomicReference("")
        val done=CountDownLatch(1)
        scenario.onActivity { activity ->
            webView(activity.window.decorView)!!.evaluateJavascript(source) { value -> result.set(value);done.countDown() }
        }
        check(done.await(5,TimeUnit.SECONDS)){ "WebView did not answer" }
        return result.get()
    }
    private fun awaitCondition(label:String, condition:()->Boolean) {
        val deadline=SystemClock.uptimeMillis()+8000
        while(SystemClock.uptimeMillis()<deadline) {
            if(condition()) return
            SystemClock.sleep(80)
        }
        throw AssertionError(label)
    }
    @Test fun backClosesKeyboardBeforeWebContent() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            awaitCondition("WebView not created") {
                var ready=false
                scenario.onActivity { ready=webView(it.window.decorView)?.progress==100 }
                ready
            }
            awaitCondition("Application not ready") {javascript(scenario,"Boolean(window.__campusBack && document.body)")=="true"}
            awaitCondition("Safe area not initialized") {javascript(scenario,"parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top'))>0")=="true"}
            scenario.onActivity { activity ->
                assertEquals(android.graphics.Color.TRANSPARENT,activity.window.statusBarColor)
                assertEquals(android.graphics.Color.TRANSPARENT,activity.window.navigationBarColor)
                assertEquals(true,androidx.core.view.WindowInsetsControllerCompat(activity.window,activity.window.decorView).isAppearanceLightStatusBars)
            }
            assertEquals("true",javascript(scenario,"JSON.parse(CampusWindow.systemInsets()).top>0"))
            assertEquals("0",javascript(scenario,"Math.round(document.documentElement.getBoundingClientRect().top)"))
            javascript(scenario,"""
                (()=>{
                    const input=document.createElement('input');input.id='android-back-test';
                    input.style.cssText='position:fixed;top:80px;left:20px;width:250px;height:48px;z-index:999999';
                    document.body.append(input);input.focus();window.__backTestCalls=0;
                    window.__campusBack=()=>{window.__backTestCalls++;input.remove();return true};
                    return true;
                })()
            """.trimIndent())
            scenario.onActivity { activity ->
                val view=webView(activity.window.decorView)!!
                view.requestFocus()
                (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(view,InputMethodManager.SHOW_FORCED)
            }
            fun keyboardVisible():Boolean {
                var visible=false
                scenario.onActivity { visible=ViewCompat.getRootWindowInsets(webView(it.window.decorView)!!)?.isVisible(WindowInsetsCompat.Type.ime())==true }
                return visible
            }
            awaitCondition("Keyboard did not open") {keyboardVisible()}
            scenario.onActivity {it.onBackPressedDispatcher.onBackPressed()}
            awaitCondition("Back did not hide keyboard") {!keyboardVisible()}
            assertEquals("0",javascript(scenario,"window.__backTestCalls"))
            assertEquals("true",javascript(scenario,"Boolean(document.getElementById('android-back-test'))"))
            scenario.onActivity {it.onBackPressedDispatcher.onBackPressed()}
            awaitCondition("Second back did not reach web navigation") {javascript(scenario,"window.__backTestCalls")=="1"}
        }
    }
}
