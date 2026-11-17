package com.lxlia.player.ui

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

/** Same startup.html, completion bridge and twelve-second fallback as Harmony LaunchScene. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LaunchScene(onFinish: () -> Unit) {
    val currentOnFinish = rememberUpdatedState(onFinish)
    val bridge = remember { StartupBridge { currentOnFinish.value() } }
    var webView by remember { mutableStateOf<WebView?>(null) }
    LaunchedEffect(bridge) {
        delay(12000)
        bridge.done()
    }
    AndroidView(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(0xFF000000.toInt())
                settings.javaScriptEnabled = true
                settings.allowFileAccess = true
                settings.allowFileAccessFromFileURLs = true
                settings.allowUniversalAccessFromFileURLs = true
                settings.domStorageEnabled = true
                addJavascriptInterface(bridge, "__lxStartup")
                loadUrl("file:///android_asset/mine-stage/startup.html")
                webView = this
            }
        },
    )
    DisposableEffect(Unit) {
        onDispose {
            webView?.destroy()
            webView = null
        }
    }
}

private class StartupBridge(private val onFinish: () -> Unit) {
    private var fired = false
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    @JavascriptInterface
    fun done() {
        main.post {
            if (!fired) {
                fired = true
                onFinish()
            }
        }
    }

    @JavascriptInterface
    fun finish() = done()
}
