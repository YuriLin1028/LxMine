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
import androidx.compose.runtime.mutableLongStateOf
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
    lyricScale: Float = 1f,
    lyricLineSpacing: Float = 1.2f,
    lyricMaxLines: Int = 0,
    resetCameraOnSong: Boolean = true,
    mode: String,
    light: Boolean,
    bgImage: String = "",
    bgOpacity: Float = 0.78f,
    duration: Long,
    lyricOffset: Long,
    playing: Boolean,
    positionMsProvider: () -> Long,
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
    val stageKind = when {
        plain -> "plain"
        mode.startsWith("folia-") -> "folia"
        else -> "mine"
    }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var lastPushKey by remember { mutableStateOf("") }
    var lastSongKey by remember { mutableStateOf("") }
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
            fun ready() {
                mainHandler.post {
                    ready = true
                    onVisualReadyState.value()
                }
            }
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

    val cachedLinesPair = remember(lines, translationLines) {
        val trArray = org.json.JSONArray().apply { translationLines.forEach { put(it.toJson()) } }
        val linesArray = org.json.JSONArray()
        val trLen = translationLines.size
        var trCursor = 0
        for (line in lines) {
            val obj = line.toJson()
            if (trLen > 0) {
                while (trCursor + 1 < trLen && translationLines[trCursor + 1].timeMs <= line.timeMs) {
                    trCursor++
                }
                var bestText = ""
                var bestDiff = 681L
                val from = (trCursor - 2).coerceAtLeast(0)
                val to = (trCursor + 3).coerceAtMost(trLen - 1)
                for (j in from..to) {
                    val tr = translationLines[j]
                    val diff = kotlin.math.abs(tr.timeMs - line.timeMs)
                    if (diff < bestDiff) {
                        bestDiff = diff
                        bestText = tr.text
                    }
                }
                if (bestText.isNotEmpty()) {
                    obj.put("translation", bestText)
                }
            }
            linesArray.put(obj)
        }
        trArray to linesArray
    }

    fun push(target: WebView?, metadata: Boolean, clock: Boolean, clockPosMs: Long = positionMsProvider()) {
        if (target == null || !ready) return
        if (metadata) {
            if (lastSongKey != song.key) {
                lastSongKey = song.key
                lastPushKey = ""
            }
            val metaSig = "${song.key}|$mode|$light|$lyricColorMode|$lyricPrimary|$lyricSecondary|$lyricScale|$lyricLineSpacing|$lyricMaxLines|$resetCameraOnSong|$bgImage|$bgOpacity|$duration|$lyricOffset|${lines.size}|${translationLines.size}|${lines.firstOrNull()?.text.orEmpty().take(12)}|${song.coverUrl}"
            if (lastPushKey != metaSig) {
                val data = JSONObject()
                data.put("translationLines", cachedLinesPair.first)
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
                data.put("lines", cachedLinesPair.second)
                data.put("name", song.name)
                data.put("singer", song.singer)
                data.put("cover", app.server.coverProxy(song.coverUrl))
                data.put("bgImage", bgImage)
                data.put("bgOpacity", bgOpacity.coerceIn(0f, 1f).toDouble())
                data.put("duration", duration)
                data.put("lyricOffset", lyricOffset)
                data.put("lyricScale", lyricScale.coerceIn(0.55f, 1.50f).toDouble())
                data.put("lyricLineSpacing", lyricLineSpacing.coerceIn(0.85f, 1.80f).toDouble())
                data.put("lyricMaxLines", lyricMaxLines.coerceIn(0, 10))
                data.put("resetCameraOnSong", resetCameraOnSong)
                data.put("topInset", topInset)
                data.put("bottomInset", bottomInset)
                data.put("positionMs", clockPosMs)
                data.put("playing", playing)
                lastPushKey = metaSig
                target.evaluateJavascript("window.lxmineStage?.metadata(${data})", null)
            }
        }
        if (clock) {
            val clockJson = JSONObject().put("positionMs", clockPosMs).put("playing", playing)
            target.evaluateJavascript(stageBridgeCall("clock", clockJson), null)
        }
        target.evaluateJavascript(stageBridgeCall("presentation", JSONObject().put("visible", visible).put("detail", visible && seekable)), null)
    }
    // WebView callbacks outlive their factory composition. They must send the
    // current presentation/metadata when a cached page finishes loading late.
    val latestPush = rememberUpdatedState<(WebView?, Boolean, Boolean) -> Unit> { target, metadata, clock -> push(target, metadata, clock) }

    // 元数据变化（换歌/换词/换配色/字号）时仅在当前舞台可见时下发；同歌非换曲波次合并 16ms 防止切歌风暴。
    LaunchedEffect(ready, visible, song.key, audioUrl, lines, translationLines, lyricColorMode, lyricPrimary, lyricSecondary, lyricScale, lyricLineSpacing, lyricMaxLines, resetCameraOnSong, mode, light, bgImage, bgOpacity, duration, lyricOffset) {
        if (!ready || !visible) return@LaunchedEffect
        if (lastSongKey == song.key) delay(16)
        push(webView, metadata = true, clock = true)
    }
    // 横竖屏/沉浸切换只轻量同步安全区边距，不重新序列化整首歌词数组。
    LaunchedEffect(ready, visible, topInset, bottomInset) {
        val view = webView ?: return@LaunchedEffect
        if (!ready || !visible) return@LaunchedEffect
        val insetsJson = JSONObject().put("topInset", topInset).put("bottomInset", bottomInset)
        view.evaluateJavascript("window.lxmineStage?.setInsets?.($insetsJson)", null)
    }
    var lastClockAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(ready, visible, playing) {
        if (!ready || !visible) return@LaunchedEffect
        androidx.compose.runtime.snapshotFlow { positionMsProvider() }.collect { posMs ->
            val now = android.os.SystemClock.elapsedRealtime()
            val expected = lastPosition + if (lastPlaying && lastClockAt > 0L) (now - lastClockAt) else 0L
            val drift = kotlin.math.abs(posMs - expected)
            val changed = lastClockAt == 0L || lastPlaying != playing || drift > 90L || (playing && now - lastClockAt >= 1000L)
            val pausedSeek = !playing && kotlin.math.abs(posMs - lastPosition) > 40L
            if (changed || pausedSeek) {
                lastPlaying = playing
                lastPosition = posMs
                lastClockAt = now
                push(webView, metadata = false, clock = true, clockPosMs = posMs)
            }
        }
    }
    LaunchedEffect(visible, seekable, webView) {
        val view = webView ?: return@LaunchedEffect
        // 前后台状态控制舞台运行，隐藏后 180ms 暂停 Chromium 合成线程节省功耗。
        val visibility = if (visible) android.view.View.VISIBLE else android.view.View.INVISIBLE
        if (view.visibility != visibility) view.visibility = visibility
        if (visible) {
            view.onResume()
            push(view, metadata = true, clock = true)
        } else {
            view.evaluateJavascript("window.lxmineStage?.presentation({visible:false,detail:false})", null)
            delay(180)
            if (!visibleState.value) runCatching { view.onPause() }
        }
    }
    LaunchedEffect(visible, seekable, playing, plain, webView) {
        val view = webView ?: return@LaunchedEffect
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            // 播放态请求高刷新率（120Hz），暂停或隐藏态交还系统 VRR 节能降频。
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
            delay(36)
        }
    }

    Box(modifier.zIndex(if (visible && interactive) 1f else 0f)) {
      key(rendererGeneration, stageKind) {
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
                            onVisualReadyState.value()
                            if (visibleState.value) {
                                latestPush.value(view, true, true)
                            } else {
                                view?.evaluateJavascript("window.lxmineStage?.presentation({visible:false,detail:false})", null)
                            }
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
                    val entryFile = when (stageKind) {
                        "plain" -> "plain-stage.html"
                        "folia" -> "folia-stage/index.html"
                        else -> "harmony-stage.html"
                    }
                    loadUrl(app.server.stageUrl().replace("harmony-stage.html", entryFile) + "?revision=$MINE_STAGE_REVISION")
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
