package com.lxlia.player.ui

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.lxlia.player.LxMineApp
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import com.lxlia.player.model.MINE_STAGE_REVISION
import androidx.compose.ui.zIndex
import androidx.compose.ui.layout.layout
import kotlinx.coroutines.delay
import org.json.JSONObject

internal fun stageBridgeCall(method: String, payload: JSONObject): String =
    "window.lxmineStage?.$method($payload)"

/**
 * MineRadio 舞台：与 PC / 鸿蒙同一份 Web 引擎（three.js + 频谱 + 歌词）。
 * 频谱直接读取原生播放器的 PCM，WebView 只负责绘制。
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MineRadioStage(
    song: Song,
    audioUrl: String,
    lines: List<LyricLine>,
    translationLines: List<LyricLine>,
    lyricColorMode: String,
    lyricPrimary: String,
    lyricSecondary: String,
    mode: String,
    light: Boolean,
    duration: Long,
    lyricOffset: Long,
    playing: Boolean,
    positionMs: Long,
    topInset: Float,
    bottomInset: Float,
    visible: Boolean,
    seekable: Boolean,
    interactive: Boolean = seekable,
    onSeek: (Long) -> Unit,
    onDegraded: () -> Unit = {},
    onVisualReady: () -> Unit = {},
    onImmersiveToggle: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val app = LxMineApp.instance
    val blurRadius = with(LocalDensity.current) { 36.dp.toPx() }
    val backgroundBlur = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
        remember(seekable, blurRadius) {
            if (seekable) null else android.graphics.RenderEffect.createBlurEffect(
                blurRadius, blurRadius, android.graphics.Shader.TileMode.CLAMP,
            )
        }
    } else null
    var ready by remember { mutableStateOf(false) }
    var rendererGeneration by remember { mutableIntStateOf(0) }
    var rendererFailures by remember { mutableIntStateOf(0) }
    var emergencyPlain by remember(mode) { mutableStateOf(false) }
    val plain = mode == "off" || emergencyPlain
    var webView by remember { mutableStateOf<WebView?>(null) }
    var lastPushKey by remember { mutableStateOf("") }
    var lastPlaying by remember { mutableStateOf(false) }
    var lastPosition by remember { mutableStateOf(0L) }

    // JS 桥对象只创建一次，必须通过 rememberUpdatedState 取最新回调；
    // 直接捕获首帧的 seekable（当时详情页还没打开，恒为 false）会让拖动歌词永久失效。
    val seekableState = rememberUpdatedState(seekable)
    val interactiveState = rememberUpdatedState(interactive)
    val visibleState = rememberUpdatedState(visible)
    val onSeekState = rememberUpdatedState(onSeek)
    val onImmersiveState = rememberUpdatedState(onImmersiveToggle)
    val onVisualReadyState = rememberUpdatedState(onVisualReady)
    val onDegradedState = rememberUpdatedState(onDegraded)
    val mainHandler = remember { android.os.Handler(android.os.Looper.getMainLooper()) }

    val host = remember {
        object {
            @JavascriptInterface
            fun ready() { mainHandler.post { ready = true } }
            @JavascriptInterface
            fun visualReady() { mainHandler.post { onVisualReadyState.value() } }
            @JavascriptInterface
            fun degraded() { mainHandler.post { onDegradedState.value() } }

            @JavascriptInterface
            fun seek(timeMs: Double) {
                if (!seekableState.value) return
                val target = timeMs.toLong().coerceAtLeast(0)
                // JS 桥回调在 WebView 线程；ExoPlayer 在 main 线程创建，必须切回去。
                mainHandler.post { onSeekState.value(target) }
            }

            /** 详情页的双指纵向滑动：上滑显示控件，下滑进入沉浸。 */
            @JavascriptInterface
            fun immersive(show: String) {
                val visible = show == "1" || show == "true"
                mainHandler.post {
                    if (visibleState.value && seekableState.value && interactiveState.value) onImmersiveState.value(visible)
                }
            }
        }
    }

    fun push(target: WebView?, metadata: Boolean, clock: Boolean) {
        if (target == null || !ready) return
        if (clock) {
            val clockJson = JSONObject().put("positionMs", positionMs).put("playing", playing)
            target.evaluateJavascript(stageBridgeCall("clock", clockJson), null)
        }
        if (metadata) {
            val data = JSONObject()
            data.put("translationLines", org.json.JSONArray().apply { translationLines.forEach { put(it.toJson()) } })
            data.put("lyricColorMode", lyricColorMode)
            data.put(
                "lyricColors",
                JSONObject()
                    .put("primary", lyricPrimary)
                    .put("secondary", lyricSecondary)
                    .put("highlight", lyricSecondary)
                    .put("glow", lyricSecondary),
            )
            data.put("id", song.key)
            data.put("nativeSpectrum", true)
            data.put("mode", mode)
            data.put("appearance", if (light) "light" else "dark")
            data.put("lines", org.json.JSONArray().apply { lines.forEach { put(it.toJson()) } })
            data.put("name", song.name)
            data.put("singer", song.singer)
            data.put("cover", app.server.coverProxy(song.coverUrl))
            data.put("duration", duration)
            data.put("lyricOffset", lyricOffset)
            data.put("topInset", topInset)
            data.put("bottomInset", bottomInset)
            val pushKey = data.toString()
            if (lastPushKey != pushKey) {
                lastPushKey = pushKey
                target.evaluateJavascript(stageBridgeCall("metadata", data), null)
            }
        }
        target.evaluateJavascript(stageBridgeCall("presentation", JSONObject().put("visible", visible).put("detail", visible && seekable)), null)
    }
    // WebView callbacks outlive their factory composition. They must send the
    // current presentation/metadata when a cached page finishes loading late.
    val latestPush = rememberUpdatedState<(WebView?, Boolean, Boolean) -> Unit> { target, metadata, clock -> push(target, metadata, clock) }

    // 元数据变化（换歌/换词/换配色）时整体下发；时钟按播放状态与进度跳变下发。
    LaunchedEffect(ready, song.key, audioUrl, lines, translationLines, lyricColorMode, lyricPrimary, lyricSecondary, mode, light, duration, lyricOffset, topInset, bottomInset) {
        if (!ready) return@LaunchedEffect
        push(webView, metadata = true, clock = true)
    }
    LaunchedEffect(ready, playing, positionMs) {
        if (!ready) return@LaunchedEffect
        val changed = lastPlaying != playing || kotlin.math.abs(positionMs - lastPosition) > 1500
        lastPlaying = playing
        lastPosition = positionMs
        // 进度每 200ms 变化时也只在跳变或播放状态变化时下发，舞台自己的时钟负责插值。
        if (changed || !playing) push(webView, metadata = false, clock = true)
    }
    LaunchedEffect(visible, seekable, webView) {
        val view = webView ?: return@LaunchedEffect
        // 前后台状态控制舞台运行，一级页通过原生模糊保留背景动效。
        val visibility = if (visible) android.view.View.VISIBLE else android.view.View.INVISIBLE
        if (view.visibility != visibility) view.visibility = visibility
        if (visible) {
            view.onResume()
            push(view, metadata = true, clock = true)
        } else {
            view.evaluateJavascript("window.lxmineStage?.presentation({visible:false,detail:false})", null)
        }
    }
    LaunchedEffect(visible, seekable, playing, plain, webView) {
        val view = webView ?: return@LaunchedEffect
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            view.requestedFrameRate = if (visible && seekable && playing && !plain) android.view.View.REQUESTED_FRAME_RATE_CATEGORY_HIGH else 0f
        }
    }
    LaunchedEffect(backgroundBlur, webView) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) webView?.setRenderEffect(backgroundBlur)
    }

    LaunchedEffect(ready, visible, seekable, playing, plain, webView) {
        val view = webView ?: return@LaunchedEffect
        if (!ready || !visible || !seekable || !playing || plain) return@LaunchedEffect
        var lastSequence = -1L
        while (true) {
            val frame = PlaybackController.spectrumFrame()
            if (frame != null && frame.sequence != lastSequence) {
                lastSequence = frame.sequence
                val flags = android.util.Base64.NO_WRAP
                val data = JSONObject().put("sampleRate", frame.sampleRate)
                    .put("positionMs", frame.positionUs / 1000)
                    .put("frequency", android.util.Base64.encodeToString(frame.frequency, flags))
                    .put("waveform", android.util.Base64.encodeToString(frame.waveform, flags))
                view.evaluateJavascript(stageBridgeCall("spectrum", data), null)
            }
            delay(40)
        }
    }

    Box(modifier.zIndex(if (visible && interactive) 1f else 0f)) {
      key(rendererGeneration, plain) {
        AndroidView(
            modifier = Modifier.fillMaxSize().layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                layout(placeable.width, placeable.height) {
                    // Keep the cached WebView measured without leaving an
                    // invisible AndroidView touch holder over the active stage.
                    if (visible) placeable.place(0, 0)
                    else placeable.place(-placeable.width - 1, -placeable.height - 1)
                }
            },
            factory = { context ->
                WebView(context).apply {
                    visibility = if (visible) android.view.View.VISIBLE else android.view.View.INVISIBLE
                    lastPushKey = ""
                    setBackgroundColor(0x00000000)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO)) {
                        WebViewCompat.setAudioMuted(this, true)
                    }
                    settings.allowFileAccess = true
                    settings.loadsImagesAutomatically = true
                    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    addJavascriptInterface(host, "__lxmineNative")
                    setOnTouchListener { _, _ -> !seekableState.value || !interactiveState.value }
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            if (view !== webView) return
                            ready = true
                            latestPush.value(view, true, true)
                            // 诊断只在播放状态/进度跳变时采集，避免首页滚动时持续写盘。
                            view?.evaluateJavascript(
                                "JSON.stringify(window.lxmineStage ? window.lxmineStage.diagnostics() : {ready:false})",
                            ) { value -> com.lxlia.player.LxMineApp.instance.store.saveStageDiagnostics(value) }
                        }

                        override fun onRenderProcessGone(
                            view: WebView?,
                            detail: android.webkit.RenderProcessGoneDetail?,
                        ): Boolean {
                            ready = false
                            webView = null
                            rendererFailures++
                            if (rendererFailures >= 2 && !emergencyPlain) {
                                emergencyPlain = true
                                onDegraded()
                            }
                            rendererGeneration++
                            return true
                        }
                    }
                    ready = false
                    loadUrl(app.server.stageUrl().replace("harmony-stage.html", if (plain) "plain-stage.html" else "harmony-stage.html") + "?revision=$MINE_STAGE_REVISION")
                    webView = this
                }
            },
            onRelease = { view ->
                view.stopLoading()
                view.removeJavascriptInterface("__lxmineNative")
                view.destroy()
            },
            update = { view ->
                val visibility = if (visible) android.view.View.VISIBLE else android.view.View.INVISIBLE
                if (view.visibility != visibility) view.visibility = visibility
            },
        )
      }
    }
    DisposableEffect(Unit) {
        onDispose {
            webView = null
            ready = false
        }
    }
}
