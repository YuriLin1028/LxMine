package com.lxlia.player.ui

import android.annotation.SuppressLint
import android.os.Build
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

private val LAUNCH_BG = Color(0xFF05070B)
private const val LAUNCH_BG_INT = 0xFF05070B.toInt()

/** Glacial Prism 120fps startup scene with hardware-accelerated WebView and smooth fade-out. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LaunchScene(onFinish: () -> Unit) {
    val currentOnFinish = rememberUpdatedState(onFinish)
    var exiting by remember { mutableStateOf(false) }
    val bridge = remember { StartupBridge { exiting = true } }
    var webView by remember { mutableStateOf<WebView?>(null) }

    val fadeAlpha by animateFloatAsState(
        targetValue = if (exiting) 0f else 1f,
        animationSpec = tween(durationMillis = 340, easing = FastOutSlowInEasing),
        label = "launch-scene-fade",
    )

    LaunchedEffect(bridge) {
        delay(5500L)
        bridge.done()
    }

    LaunchedEffect(exiting) {
        if (!exiting) return@LaunchedEffect
        delay(340L)
        currentOnFinish.value()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = fadeAlpha }
            .background(LAUNCH_BG),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize().background(LAUNCH_BG),
            factory = { context ->
                WebView(context).apply {
                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
                    setBackgroundColor(LAUNCH_BG_INT)
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    if (Build.VERSION.SDK_INT >= 35) {
                        requestedFrameRate = View.REQUESTED_FRAME_RATE_CATEGORY_HIGH
                    }
                    settings.javaScriptEnabled = true
                    settings.allowFileAccess = true
                    @Suppress("DEPRECATION")
                    settings.allowFileAccessFromFileURLs = true
                    @Suppress("DEPRECATION")
                    settings.allowUniversalAccessFromFileURLs = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    setOnTouchListener { _, _ -> exiting }
                    addJavascriptInterface(bridge, "__lxStartup")
                    loadUrl("file:///android_asset/mine-stage/startup.html")
                    webView = this
                }
            },
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            webView?.let { view ->
                runCatching {
                    view.stopLoading()
                    view.removeJavascriptInterface("__lxStartup")
                    view.destroy()
                }
            }
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
