package com.lxlia.player.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.input.InputManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.TextPaint
import android.text.TextUtils
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.lxlia.player.lx.LyricParser
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

data class DesktopLyricsConfig(
    val enabled: Boolean = false,
    val locked: Boolean = false,
    val fontScale: Float = 1.0f,
    val lineCount: Int = 1,
    val colorMode: String = "cover-gradient",
    val primaryHex: String = "#7DD3FC",
    val secondaryHex: String = "#A5B4FC",
    val xFraction: Float = 0.07f,
    val yFraction: Float = 0.045f,
    val widthFraction: Float = 0.86f,
)

/**
 * 手机/平板纯文字桌面歌词悬浮窗：
 * - 无花哨特效、纯文字、平滑逐字滚动与长句横向跟随；
 * - 颜色完全融入「歌词设置」体系（默认封面取色渐变，同步支持封面纯色 / 自定义纯色 / 自定义渐变）；
 * - 支持全屏自由 2D 拖动（含状态栏与挖孔区域上方）、双指捏合缩放、编辑态左右边缘与右下角拖拽调整窗口宽/字号；
 * - Android 12+ 锁定态显式下调窗口 alpha <= maximumObscuringOpacityForTouch，保证系统触摸穿透不被拦截；
 * - 仅在播放中且亮屏可见时以 postOnAnimation 驱动 60fps 逐字推进，暂停/熄屏/播放详情页内零耗电。
 */
object DesktopLyricsOverlay {
    private const val VISUAL_LEAD_MS = 60L
    const val MIN_FONT_SCALE = 0.60f
    const val MAX_FONT_SCALE = 1.65f
    const val MIN_WIDTH_FRACTION = 0.36f
    const val MAX_WIDTH_FRACTION = 1.00f
    const val MIN_X_FRACTION = -0.08f
    const val MAX_X_FRACTION = 1.00f
    const val MIN_Y_FRACTION = -0.18f
    const val MAX_Y_FRACTION = 0.98f

    private val main = Handler(Looper.getMainLooper())
    private var appContext: Context? = null
    private var windowManager: WindowManager? = null
    private var rootContainer: LinearLayout? = null
    private var lyricBoxFrame: FrameLayout? = null
    private var lyricView: PlainLyricCanvasView? = null
    private var leftHandleView: View? = null
    private var rightHandleView: View? = null
    private var cornerHandleView: View? = null
    private var toolbarLayout: LinearLayout? = null
    private var toolbarPlaybackRow: LinearLayout? = null
    private var toolbarToolsRow: LinearLayout? = null
    private var playPauseBtn: TextView? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var attached = false
    private var toolbarVisible = false
    private var toolbarAbove = false
    private var observedOriginOffsetY: Int = -1

    private var config = DesktopLyricsConfig()
    private var appForeground = true
    private var playerDetailOpen = false
    private var screenOn = true
    private var screenReceiver: BroadcastReceiver? = null

    private var currentSong: Song? = null
    private var lyricLines: List<LyricLine> = emptyList()
    private var translationLines: List<LyricLine> = emptyList()
    private var lyricOffsetMs: Long = 0L
    private var playing: Boolean = false
    private var anchorPositionMs: Long = 0L
    private var anchorElapsedRealtimeMs: Long = 0L

    var onLockChanged: ((Boolean) -> Unit)? = null
    var onCloseRequested: (() -> Unit)? = null
    var onGeometryChanged: ((xFraction: Float, yFraction: Float, widthFraction: Float, fontScale: Float) -> Unit)? = null

    private val hideToolbarRunnable = Runnable {
        setToolbarVisible(false)
    }

    fun canDrawOverlays(context: Context): Boolean =
        runCatching { Settings.canDrawOverlays(context.applicationContext) }.getOrDefault(false)

    fun init(context: Context) {
        if (appContext == null) {
            appContext = context.applicationContext
            windowManager = appContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        }
    }

    fun updateConfig(context: Context, next: DesktopLyricsConfig) {
        init(context)
        main.post {
            val prev = config
            val wFrac = next.widthFraction.coerceIn(MIN_WIDTH_FRACTION, MAX_WIDTH_FRACTION)
            val maxXFrac = (1f - wFrac + 0.08f).coerceAtLeast(0.08f)
            config = next.copy(
                fontScale = next.fontScale.coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE),
                lineCount = if (next.lineCount >= 2) 2 else 1,
                widthFraction = wFrac,
                xFraction = next.xFraction.coerceIn(MIN_X_FRACTION, maxXFrac),
                yFraction = next.yFraction.coerceIn(MIN_Y_FRACTION, MAX_Y_FRACTION),
            )
            if (prev.locked != config.locked && config.locked) {
                setToolbarVisible(false)
            }
            refreshAttachmentLocked()
            lyricView?.applyStyle(config)
            applyWindowParamsLocked()
            lyricView?.syncClock(playing, anchorPositionMs, anchorElapsedRealtimeMs, lyricOffsetMs, forceRedraw = true)
        }
    }

    fun updateAppVisibility(foreground: Boolean, showPlayer: Boolean) {
        main.post {
            if (appForeground == foreground && playerDetailOpen == showPlayer) return@post
            appForeground = foreground
            playerDetailOpen = showPlayer
            refreshAttachmentLocked()
        }
    }

    fun updatePlayback(song: Song?, isPlaying: Boolean, positionMs: Long) {
        val now = SystemClock.elapsedRealtime()
        main.post {
            val songChanged = song?.key != currentSong?.key
            currentSong = song
            playing = isPlaying
            anchorPositionMs = positionMs.coerceAtLeast(0L)
            anchorElapsedRealtimeMs = now
            playPauseBtn?.text = if (isPlaying) "暂停" else "播放"
            if (songChanged) {
                lyricView?.setSong(song)
            }
            lyricView?.syncClock(playing, anchorPositionMs, anchorElapsedRealtimeMs, lyricOffsetMs, forceRedraw = true)
        }
    }

    fun updateLyrics(lines: List<LyricLine>, translations: List<LyricLine>, offsetMs: Long) {
        main.post {
            lyricLines = lines
            translationLines = translations
            lyricOffsetMs = offsetMs
            lyricView?.setLyrics(lines, translations, offsetMs)
        }
    }

    fun updateTranslations(translations: List<LyricLine>) {
        main.post {
            translationLines = translations
            lyricView?.setLyrics(lyricLines, translations, lyricOffsetMs)
        }
    }

    fun updateOffset(offsetMs: Long) {
        main.post {
            lyricOffsetMs = offsetMs
            lyricView?.setOffset(offsetMs)
        }
    }

    fun detach() {
        main.post {
            detachWindowLocked()
        }
    }

    private fun shouldShowWindow(): Boolean {
        val ctx = appContext ?: return false
        if (!config.enabled) return false
        if (!canDrawOverlays(ctx)) return false
        if (appForeground && playerDetailOpen) return false
        return true
    }

    private fun refreshAttachmentLocked() {
        if (shouldShowWindow()) {
            if (!attached) {
                attachWindowLocked()
            } else {
                rootContainer?.visibility = View.VISIBLE
                lyricView?.setActive(screenOn)
            }
        } else {
            detachWindowLocked()
        }
    }

    private fun realScreenSize(ctx: Context): Pair<Int, Int> {
        val wm = windowManager ?: (ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)
        if (wm != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bounds = runCatching { wm.currentWindowMetrics.bounds }.getOrNull()
                if (bounds != null && bounds.width() > 0 && bounds.height() > 0) {
                    return bounds.width().coerceAtLeast(320) to bounds.height().coerceAtLeast(480)
                }
            } else {
                val dm = DisplayMetrics()
                @Suppress("DEPRECATION")
                val ok = runCatching { wm.defaultDisplay?.getRealMetrics(dm); dm.widthPixels > 0 && dm.heightPixels > 0 }.getOrDefault(false)
                if (ok) return dm.widthPixels.coerceAtLeast(320) to dm.heightPixels.coerceAtLeast(480)
            }
        }
        val dm = ctx.resources.displayMetrics
        return dm.widthPixels.coerceAtLeast(320) to dm.heightPixels.coerceAtLeast(480)
    }

    private fun statusBarHeightPx(ctx: Context): Int {
        val dp = ctx.resources.displayMetrics.density
        val resId = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
        val fromRes = if (resId > 0) runCatching { ctx.resources.getDimensionPixelSize(resId) }.getOrDefault(0) else 0
        var fromInsets = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wm = windowManager ?: (ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)
            fromInsets = runCatching {
                wm?.currentWindowMetrics?.windowInsets
                    ?.getInsetsIgnoringVisibility(
                        android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.displayCutout()
                    )?.top ?: 0
            }.getOrDefault(0)
        }
        return maxOf(fromRes, fromInsets, (44f * dp).roundToInt())
    }

    private fun sampleOriginOffsetY(container: View, lpY: Int, ctx: Context) {
        if (lpY < 0) return
        val loc = IntArray(2)
        container.getLocationOnScreen(loc)
        val delta = loc[1] - lpY
        val maxReasonable = statusBarHeightPx(ctx) * 2
        if (delta in 0..maxReasonable) {
            observedOriginOffsetY = delta
        }
    }

    /**
     * 部分机型/容器（含卓易通及部分 Android 11+ ROM）将悬浮窗 y=0 锚定在状态栏底边，
     * 允许 y 进入负坐标（-originOffsetY / -statusBarHeight）才能把歌词主体直接移到状态栏上方甚至齐顶，
     * 同时防止在 y=0 已齐顶的机型上被拖出屏幕外丢失。
     */
    private fun minYpx(ctx: Context): Int {
        val dp = ctx.resources.displayMetrics.density
        val pad = (8f * dp).roundToInt()
        val originOffset = if (observedOriginOffsetY >= 0) observedOriginOffsetY else statusBarHeightPx(ctx)
        return -(originOffset + pad)
    }

    private fun minWindowWidthPx(screenW: Int, dp: Float): Int =
        minOf(screenW, maxOf((128f * dp).roundToInt(), (screenW * MIN_WIDTH_FRACTION).roundToInt()))

    private fun computeWidthPx(ctx: Context, widthFraction: Float): Int {
        val (screenW, _) = realScreenSize(ctx)
        val dp = ctx.resources.displayMetrics.density
        val minW = minWindowWidthPx(screenW, dp)
        return (screenW * widthFraction.coerceIn(MIN_WIDTH_FRACTION, MAX_WIDTH_FRACTION))
            .roundToInt()
            .coerceIn(minW, screenW)
    }

    private fun computeXpx(ctx: Context, xFraction: Float, windowW: Int): Int {
        val (screenW, _) = realScreenSize(ctx)
        val dp = ctx.resources.displayMetrics.density
        val over = (14f * dp).roundToInt()
        val minX = -over
        val maxX = (screenW - windowW + over).coerceAtLeast(minX)
        return (screenW * xFraction.coerceIn(MIN_X_FRACTION, MAX_X_FRACTION)).roundToInt().coerceIn(minX, maxX)
    }

    private fun computeBaseYpx(ctx: Context, yFraction: Float): Int {
        val (_, screenH) = realScreenSize(ctx)
        val dp = ctx.resources.displayMetrics.density
        val maxY = (screenH - (16f * dp).roundToInt()).coerceAtLeast(0)
        return (screenH * yFraction.coerceIn(MIN_Y_FRACTION, MAX_Y_FRACTION))
            .roundToInt()
            .coerceIn(minYpx(ctx), maxY)
    }

    private fun maxObscuringAlpha(ctx: Context): Float {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val im = ctx.getSystemService(Context.INPUT_SERVICE) as? InputManager
            val limit = runCatching { im?.maximumObscuringOpacityForTouch ?: 0.8f }.getOrDefault(0.8f)
            return limit.coerceIn(0.55f, 0.8f)
        }
        return 1.0f
    }

    private fun buildEditFrameDrawable(dp: Float): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 8f * dp
        setColor(Color.argb(82, 16, 20, 28))
        setStroke((0.9f * dp).roundToInt().coerceAtLeast(1), Color.argb(122, 255, 255, 255))
    }

    private fun notifyGeometryChanged() {
        onGeometryChanged?.invoke(
            config.xFraction,
            config.yFraction,
            config.widthFraction,
            config.fontScale,
        )
    }

    private fun attachWindowLocked() {
        val ctx = appContext ?: return
        val wm = windowManager ?: return
        if (attached) return
        val dp = ctx.resources.displayMetrics.density

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            clipChildren = false
            clipToPadding = false
            fitsSystemWindows = false
            setOnApplyWindowInsetsListener { _, insets -> insets }
        }

        val lyricBox = FrameLayout(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            clipChildren = false
            clipToPadding = false
        }

        val canvasView = PlainLyricCanvasView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            )
            setSong(currentSong)
            setLyrics(lyricLines, translationLines, lyricOffsetMs)
            applyStyle(config)
            syncClock(playing, anchorPositionMs, anchorElapsedRealtimeMs, lyricOffsetMs, forceRedraw = true)
        }
        lyricBox.addView(canvasView)

        val leftHandle = buildEdgeHandle(ctx, dp, Gravity.START)
        val rightHandle = buildEdgeHandle(ctx, dp, Gravity.END)
        val cornerHandle = buildCornerHandle(ctx, dp)
        leftHandle.visibility = View.GONE
        rightHandle.visibility = View.GONE
        cornerHandle.visibility = View.GONE
        lyricBox.addView(leftHandle)
        lyricBox.addView(rightHandle)
        lyricBox.addView(cornerHandle)

        container.addView(lyricBox)

        val toolbar = buildToolbar(ctx, dp)
        toolbar.visibility = View.GONE
        container.addView(toolbar)

        // 双指捏合缩放字号 + 单指全屏自由 2D 拖动（含状态栏） + 单击切换编辑与控制条
        val touchSlop = ViewConfiguration.get(ctx).scaledTouchSlop
        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        var hadMultiTouch = false

        val scaleDetector = ScaleGestureDetector(ctx, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                if (config.locked) return false
                hadMultiTouch = true
                dragging = false
                main.removeCallbacks(hideToolbarRunnable)
                return true
            }

            override fun onScale(detector: ScaleGestureDetector): Boolean {
                if (config.locked) return false
                val nextScale = (config.fontScale * detector.scaleFactor).coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
                if (abs(nextScale - config.fontScale) >= 0.004f) {
                    config = config.copy(fontScale = nextScale)
                    canvasView.applyStyle(config)
                }
                return true
            }

            override fun onScaleEnd(detector: ScaleGestureDetector) {
                notifyGeometryChanged()
                if (toolbarVisible) scheduleToolbarAutoHide()
            }
        })

        canvasView.setOnTouchListener { _, event ->
            if (config.locked) return@setOnTouchListener false
            scaleDetector.onTouchEvent(event)
            val lp = layoutParams ?: return@setOnTouchListener false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    sampleOriginOffsetY(container, lp.y, ctx)
                    downRawX = event.rawX
                    downRawY = event.rawY
                    startX = lp.x
                    startY = if (toolbarVisible && toolbarAbove) {
                        val tbH = (toolbarLayout?.height?.takeIf { it > 0 } ?: (40f * dp).roundToInt()) + (10f * dp).roundToInt()
                        lp.y + tbH
                    } else {
                        lp.y
                    }
                    dragging = false
                    hadMultiTouch = false
                    true
                }
                MotionEvent.ACTION_POINTER_DOWN -> {
                    hadMultiTouch = true
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (hadMultiTouch || scaleDetector.isInProgress) return@setOnTouchListener true
                    val dx = event.rawX - downRawX
                    val dy = event.rawY - downRawY
                    if (!dragging && hypot(dx.toDouble(), dy.toDouble()) > touchSlop) {
                        dragging = true
                        if (toolbarVisible) {
                            setToolbarVisible(false)
                            startY = lp.y
                        }
                    }
                    if (dragging) {
                        val (screenW, screenH) = realScreenSize(ctx)
                        val over = (14f * dp).roundToInt()
                        val minX = -over
                        val maxX = (screenW - lp.width + over).coerceAtLeast(minX)
                        val maxY = (screenH - (16f * dp).roundToInt()).coerceAtLeast(0)
                        lp.x = (startX + dx.roundToInt()).coerceIn(minX, maxX)
                        lp.y = (startY + dy.roundToInt()).coerceIn(minYpx(ctx), maxY)
                        runCatching { wm.updateViewLayout(container, lp) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (dragging) {
                        val (screenW, screenH) = realScreenSize(ctx)
                        val maxXFrac = (1f - config.widthFraction + 0.08f).coerceAtLeast(0.08f)
                        val xFrac = (lp.x / screenW.toFloat()).coerceIn(MIN_X_FRACTION, maxXFrac)
                        val yFrac = (lp.y / screenH.toFloat()).coerceIn(MIN_Y_FRACTION, MAX_Y_FRACTION)
                        config = config.copy(xFraction = xFrac, yFraction = yFrac)
                        notifyGeometryChanged()
                    } else if (!hadMultiTouch) {
                        setToolbarVisible(!toolbarVisible)
                    }
                    dragging = false
                    hadMultiTouch = false
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    dragging = false
                    hadMultiTouch = false
                    true
                }
                else -> false
            }
        }

        // 左边缘宽度调节
        bindResizeTouch(leftHandle, ctx, dp, mode = "left")
        // 右边缘宽度调节
        bindResizeTouch(rightHandle, ctx, dp, mode = "right")
        // 右下角同时调节宽度与字号（窗口大小）
        bindResizeTouch(cornerHandle, ctx, dp, mode = "corner")

        val initialW = computeWidthPx(ctx, config.widthFraction)
        val initialX = computeXpx(ctx, config.xFraction, initialW)
        val initialY = computeBaseYpx(ctx, config.yFraction)

        val flags = baseWindowFlags(config.locked)
        val params = WindowManager.LayoutParams(
            initialW,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            flags,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = initialX
            y = initialY
            alpha = if (config.locked) maxObscuringAlpha(ctx) else 1.0f
            applyCutoutAndInsets(this)
        }

        val ok = runCatching {
            wm.addView(container, params)
            true
        }.getOrDefault(false)
        if (!ok) return

        rootContainer = container
        lyricBoxFrame = lyricBox
        lyricView = canvasView
        leftHandleView = leftHandle
        rightHandleView = rightHandle
        cornerHandleView = cornerHandle
        toolbarLayout = toolbar
        layoutParams = params
        attached = true
        toolbarVisible = false
        toolbarAbove = false
        syncToolbarOrientation(initialW, dp)
        registerScreenReceiverLocked(ctx)
        canvasView.setActive(screenOn)
    }

    private fun buildEdgeHandle(ctx: Context, dp: Float, sideGravity: Int): FrameLayout {
        val touchW = (20f * dp).roundToInt()
        return FrameLayout(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(touchW, FrameLayout.LayoutParams.MATCH_PARENT, sideGravity)
            val pill = View(ctx).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = 2f * dp
                    setColor(Color.argb(210, 255, 255, 255))
                }
                layoutParams = FrameLayout.LayoutParams(
                    (3.2f * dp).roundToInt().coerceAtLeast(3),
                    (18f * dp).roundToInt(),
                    Gravity.CENTER,
                )
            }
            addView(pill)
        }
    }

    private fun buildCornerHandle(ctx: Context, dp: Float): FrameLayout {
        val size = (22f * dp).roundToInt()
        return FrameLayout(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.END)
            val glyph = TextView(ctx).apply {
                text = "↘"
                setTextColor(Color.argb(235, 255, 255, 255))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.argb(185, 32, 38, 52))
                    setStroke((1f * dp).roundToInt().coerceAtLeast(1), Color.argb(165, 255, 255, 255))
                }
                layoutParams = FrameLayout.LayoutParams(
                    (16f * dp).roundToInt(),
                    (16f * dp).roundToInt(),
                    Gravity.BOTTOM or Gravity.END,
                ).apply {
                    rightMargin = (1f * dp).roundToInt()
                    bottomMargin = (1f * dp).roundToInt()
                }
            }
            addView(glyph)
        }
    }

    private fun bindResizeTouch(handle: View, ctx: Context, dp: Float, mode: String) {
        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startW = 0
        var startScale = 1f

        handle.setOnTouchListener { _, event ->
            if (config.locked) return@setOnTouchListener false
            val wm = windowManager ?: return@setOnTouchListener false
            val container = rootContainer ?: return@setOnTouchListener false
            val lp = layoutParams ?: return@setOnTouchListener false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    main.removeCallbacks(hideToolbarRunnable)
                    downRawX = event.rawX
                    downRawY = event.rawY
                    startX = lp.x
                    startW = lp.width
                    startScale = config.fontScale
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val (screenW, _) = realScreenSize(ctx)
                    val minW = minWindowWidthPx(screenW, dp)
                    val dx = (event.rawX - downRawX).roundToInt()
                    val dy = event.rawY - downRawY
                    when (mode) {
                        "left" -> {
                            val rightEdge = (startX + startW).coerceAtMost(screenW)
                            val nextW = (startW - dx).coerceIn(minW, rightEdge)
                            val nextX = (rightEdge - nextW).coerceIn(0, (screenW - nextW).coerceAtLeast(0))
                            lp.x = nextX
                            lp.width = nextW
                        }
                        "right" -> {
                            val maxW = (screenW - startX).coerceAtLeast(minW)
                            lp.width = (startW + dx).coerceIn(minW, maxW)
                        }
                        "corner" -> {
                            val maxW = (screenW - startX).coerceAtLeast(minW)
                            lp.width = (startW + dx).coerceIn(minW, maxW)
                            val scaleDelta = dy / (125f * dp)
                            val nextScale = (startScale + scaleDelta).coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
                            if (abs(nextScale - config.fontScale) >= 0.005f) {
                                config = config.copy(fontScale = nextScale)
                                lyricView?.applyStyle(config)
                            }
                        }
                    }
                    config = config.copy(
                        widthFraction = (lp.width / screenW.toFloat()).coerceIn(MIN_WIDTH_FRACTION, MAX_WIDTH_FRACTION),
                        xFraction = (lp.x / screenW.toFloat()).coerceIn(0f, 1f),
                    )
                    syncToolbarOrientation(lp.width, dp)
                    runCatching { wm.updateViewLayout(container, lp) }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    notifyGeometryChanged()
                    if (toolbarVisible) scheduleToolbarAutoHide()
                    true
                }
                else -> false
            }
        }
    }

    private fun buildToolbar(ctx: Context, dp: Float): LinearLayout {
        val bar = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16f * dp
                setColor(Color.argb(222, 16, 20, 28))
                setStroke((0.8f * dp).roundToInt().coerceAtLeast(1), Color.argb(56, 255, 255, 255))
            }
            setPadding((6 * dp).roundToInt(), (4 * dp).roundToInt(), (6 * dp).roundToInt(), (4 * dp).roundToInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = (5 * dp).roundToInt()
                bottomMargin = (5 * dp).roundToInt()
            }
        }

        fun makeBtn(label: String, onClick: () -> Unit): TextView = TextView(ctx).apply {
            text = label
            setTextColor(Color.argb(240, 244, 246, 250))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding((7 * dp).roundToInt(), (4 * dp).roundToInt(), (7 * dp).roundToInt(), (4 * dp).roundToInt())
            setOnClickListener {
                scheduleToolbarAutoHide()
                onClick()
            }
        }

        val playbackRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        playbackRow.addView(makeBtn("上一首") { PlaybackController.advance(-1) })
        val pp = makeBtn(if (playing) "暂停" else "播放") {
            if (PlaybackController.playing) PlaybackController.pause() else PlaybackController.resume()
        }
        playPauseBtn = pp
        playbackRow.addView(pp)
        playbackRow.addView(makeBtn("下一首") { PlaybackController.advance(1) })

        val toolsRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        toolsRow.addView(makeBtn("A-") {
            adjustFontScale(-0.08f)
        })
        toolsRow.addView(makeBtn("A+") {
            adjustFontScale(0.08f)
        })
        toolsRow.addView(makeBtn("锁定") {
            setToolbarVisible(false)
            config = config.copy(locked = true)
            applyWindowParamsLocked()
            onLockChanged?.invoke(true)
        })
        toolsRow.addView(makeBtn("关闭") {
            setToolbarVisible(false)
            config = config.copy(enabled = false)
            detachWindowLocked()
            onCloseRequested?.invoke()
        })

        toolbarPlaybackRow = playbackRow
        toolbarToolsRow = toolsRow
        bar.addView(playbackRow)
        bar.addView(toolsRow)
        return bar
    }

    private fun adjustFontScale(delta: Float) {
        val next = (config.fontScale + delta).coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
        if (abs(next - config.fontScale) < 0.001f) return
        config = config.copy(fontScale = next)
        lyricView?.applyStyle(config)
        notifyGeometryChanged()
    }

    private fun syncToolbarOrientation(windowWidthPx: Int, dp: Float) {
        val bar = toolbarLayout ?: return
        val nextOrientation = if (windowWidthPx >= (308f * dp).roundToInt()) {
            LinearLayout.HORIZONTAL
        } else {
            LinearLayout.VERTICAL
        }
        if (bar.orientation != nextOrientation) {
            bar.orientation = nextOrientation
        }
    }

    private fun setToolbarVisible(visible: Boolean) {
        main.removeCallbacks(hideToolbarRunnable)
        val ctx = appContext
        val dp = ctx?.resources?.displayMetrics?.density ?: 2f
        val nextVisible = visible && !config.locked
        toolbarVisible = nextVisible

        val box = lyricBoxFrame
        val bar = toolbarLayout
        val container = rootContainer
        val wm = windowManager
        val lp = layoutParams

        box?.background = if (nextVisible) buildEditFrameDrawable(dp) else null
        val handleVis = if (nextVisible) View.VISIBLE else View.GONE
        leftHandleView?.visibility = handleVis
        rightHandleView?.visibility = handleVis
        cornerHandleView?.visibility = handleVis

        if (container != null && bar != null && box != null && ctx != null && lp != null) {
            val baseY = computeBaseYpx(ctx, config.yFraction)
            if (nextVisible) {
                syncToolbarOrientation(lp.width, dp)
                val (_, screenH) = realScreenSize(ctx)
                val wantAbove = baseY > (screenH * 0.72f).roundToInt()
                if (wantAbove != toolbarAbove) {
                    toolbarAbove = wantAbove
                    container.removeView(bar)
                    container.addView(bar, if (wantAbove) 0 else 1)
                }
                bar.visibility = View.VISIBLE
                if (toolbarAbove) {
                    val wSpec = View.MeasureSpec.makeMeasureSpec(lp.width, View.MeasureSpec.AT_MOST)
                    val hSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                    bar.measure(wSpec, hSpec)
                    val tbH = bar.measuredHeight + (10f * dp).roundToInt()
                    lp.y = (baseY - tbH).coerceAtLeast(minYpx(ctx))
                } else {
                    lp.y = baseY
                }
            } else {
                bar.visibility = View.GONE
                if (toolbarAbove) {
                    toolbarAbove = false
                    container.removeView(bar)
                    container.addView(bar, 1)
                }
                lp.y = baseY
            }
            if (attached && wm != null) {
                runCatching { wm.updateViewLayout(container, lp) }
            }
        } else {
            bar?.visibility = if (nextVisible) View.VISIBLE else View.GONE
        }

        if (nextVisible) {
            scheduleToolbarAutoHide()
        }
    }

    private fun scheduleToolbarAutoHide() {
        main.removeCallbacks(hideToolbarRunnable)
        main.postDelayed(hideToolbarRunnable, 4500L)
    }

    private fun baseWindowFlags(locked: Boolean): Int {
        var flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        if (locked) {
            flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        }
        return flags
    }

    private fun applyCutoutAndInsets(params: WindowManager.LayoutParams) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            params.fitInsetsTypes = 0
            params.fitInsetsSides = 0
            params.isFitInsetsIgnoringVisibility = true
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
    }

    private fun applyWindowParamsLocked() {
        if (!attached) return
        val ctx = appContext ?: return
        val wm = windowManager ?: return
        val container = rootContainer ?: return
        val lp = layoutParams ?: return
        val dp = ctx.resources.displayMetrics.density
        val nextW = computeWidthPx(ctx, config.widthFraction)
        lp.flags = baseWindowFlags(config.locked)
        applyCutoutAndInsets(lp)
        lp.alpha = if (config.locked) maxObscuringAlpha(ctx) else 1.0f
        lp.width = nextW
        lp.x = computeXpx(ctx, config.xFraction, nextW)
        val baseY = computeBaseYpx(ctx, config.yFraction)
        lp.y = if (toolbarVisible && toolbarAbove) {
            val tbH = (toolbarLayout?.height?.takeIf { it > 0 } ?: (40f * dp).roundToInt()) + (10f * dp).roundToInt()
            (baseY - tbH).coerceAtLeast(minYpx(ctx))
        } else {
            baseY
        }
        syncToolbarOrientation(nextW, dp)
        runCatching { wm.updateViewLayout(container, lp) }
    }

    private fun detachWindowLocked() {
        main.removeCallbacks(hideToolbarRunnable)
        unregisterScreenReceiverLocked()
        lyricView?.setActive(false)
        if (attached) {
            val wm = windowManager
            val container = rootContainer
            if (wm != null && container != null) {
                runCatching { wm.removeViewImmediate(container) }
            }
        }
        attached = false
        toolbarVisible = false
        toolbarAbove = false
        observedOriginOffsetY = -1
        rootContainer = null
        lyricBoxFrame = null
        lyricView = null
        leftHandleView = null
        rightHandleView = null
        cornerHandleView = null
        toolbarLayout = null
        toolbarPlaybackRow = null
        toolbarToolsRow = null
        playPauseBtn = null
        layoutParams = null
    }

    private fun registerScreenReceiverLocked(ctx: Context) {
        if (screenReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_SCREEN_OFF -> {
                        screenOn = false
                        lyricView?.setActive(false)
                    }
                    Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                        screenOn = true
                        lyricView?.setActive(true)
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                ctx.registerReceiver(receiver, filter)
            }
            screenReceiver = receiver
        }
    }

    private fun unregisterScreenReceiverLocked() {
        val ctx = appContext ?: return
        val receiver = screenReceiver ?: return
        runCatching { ctx.unregisterReceiver(receiver) }
        screenReceiver = null
    }

    /** 封面取色用于悬浮文字时，对极暗专辑主色做轻微提亮，确保在状态栏与深浅壁纸上都通透清晰。 */
    private fun liftCoverColorForOverlay(color: Int): Int {
        val hsv = FloatArray(3)
        Color.colorToHSV(color, hsv)
        if (hsv[2] < 0.74f) {
            hsv[2] = 0.78f + (hsv[2] * 0.18f)
        }
        if (hsv[1] in 0.08f..0.38f) {
            hsv[1] = (hsv[1] * 1.25f).coerceAtMost(0.65f)
        }
        return Color.HSVToColor(255, hsv)
    }

    /** 纯文字逐字滚动绘制视图：干净描边 + 封面渐变/纯色逐字高亮 + 超长行平滑跟随，无额外粒子或雾化特效。 */
    private class PlainLyricCanvasView(context: Context) : View(context) {
        private val dp = context.resources.displayMetrics.density
        private val sp = context.resources.displayMetrics.scaledDensity

        private val mainStrokePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
            color = Color.argb(188, 0, 0, 0)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        private val mainUnsungPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.argb(244, 255, 255, 255)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        private val mainSungPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.parseColor("#7DD3FC")
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        private val subStrokePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
            color = Color.argb(176, 0, 0, 0)
            typeface = Typeface.DEFAULT
        }
        private val subFillPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.argb(232, 240, 244, 248)
            typeface = Typeface.DEFAULT
        }

        private var song: Song? = null
        private var lines: List<LyricLine> = emptyList()
        private var translations: List<LyricLine> = emptyList()
        private var offsetMs: Long = 0L
        private var lineCount: Int = 1
        private var fontScale: Float = 1.0f
        private var useGradient: Boolean = true
        private var sungPrimaryColor: Int = Color.parseColor("#7DD3FC")
        private var sungSecondaryColor: Int = Color.parseColor("#A5B4FC")
        private var playing: Boolean = false
        private var active: Boolean = false
        private var anchorPosMs: Long = 0L
        private var anchorElapsedMs: Long = 0L

        private var cachedLineIdx: Int = -2
        private var cachedLineText: String = ""
        private var cachedLineWidth: Float = 0f
        private var cachedWordStarts: FloatArray = FloatArray(0)
        private var cachedWordWidths: FloatArray = FloatArray(0)
        private var smoothScrollX: Float = 0f
        private var frameScheduled: Boolean = false

        private var cachedGradX: Float = Float.NaN
        private var cachedGradW: Float = Float.NaN
        private var cachedGradC1: Int = 0
        private var cachedGradC2: Int = 0
        private var cachedShader: LinearGradient? = null

        private val frameRunnable = Runnable {
            frameScheduled = false
            if (!active || !playing) return@Runnable
            invalidate()
            scheduleNextFrame()
        }

        init {
            applyStyle(DesktopLyricsConfig())
        }

        fun applyStyle(cfg: DesktopLyricsConfig) {
            fontScale = cfg.fontScale.coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
            lineCount = if (cfg.lineCount >= 2) 2 else 1
            val mainSize = 20f * fontScale * sp
            val subSize = 13.5f * fontScale * sp
            mainStrokePaint.textSize = mainSize
            mainStrokePaint.strokeWidth = (mainSize * 0.13f).coerceIn(1.5f * dp, 3.0f * dp)
            mainUnsungPaint.textSize = mainSize
            mainSungPaint.textSize = mainSize

            val rawPrimary = runCatching { Color.parseColor(cfg.primaryHex) }.getOrDefault(Color.parseColor("#7DD3FC"))
            val rawSecondary = runCatching { Color.parseColor(cfg.secondaryHex) }.getOrDefault(Color.parseColor("#A5B4FC"))
            val isCover = cfg.colorMode.startsWith("cover")
            sungPrimaryColor = if (isCover) liftCoverColorForOverlay(rawPrimary) else rawPrimary
            sungSecondaryColor = if (isCover) liftCoverColorForOverlay(rawSecondary) else rawSecondary
            useGradient = cfg.colorMode.endsWith("gradient") && sungPrimaryColor != sungSecondaryColor
            if (!useGradient) {
                mainSungPaint.shader = null
                mainSungPaint.color = sungPrimaryColor
            }
            cachedGradX = Float.NaN

            subStrokePaint.textSize = subSize
            subStrokePaint.strokeWidth = (subSize * 0.14f).coerceIn(1.3f * dp, 2.3f * dp)
            subFillPaint.textSize = subSize
            cachedLineIdx = -2
            requestLayout()
            invalidate()
        }

        fun setSong(nextSong: Song?) {
            song = nextSong
            cachedLineIdx = -2
            smoothScrollX = 0f
            invalidate()
        }

        fun setLyrics(nextLines: List<LyricLine>, nextTranslations: List<LyricLine>, nextOffset: Long) {
            lines = nextLines
            translations = nextTranslations
            offsetMs = nextOffset
            cachedLineIdx = -2
            smoothScrollX = 0f
            invalidate()
        }

        fun setOffset(nextOffset: Long) {
            offsetMs = nextOffset
            invalidate()
        }

        fun setActive(isActive: Boolean) {
            if (active == isActive) return
            active = isActive
            if (active && playing) {
                scheduleNextFrame()
            } else {
                removeCallbacks(frameRunnable)
                frameScheduled = false
            }
            if (active) invalidate()
        }

        fun syncClock(isPlaying: Boolean, posMs: Long, elapsedMs: Long, offset: Long, forceRedraw: Boolean) {
            playing = isPlaying
            anchorPosMs = posMs
            anchorElapsedMs = elapsedMs
            offsetMs = offset
            if (active && playing) {
                scheduleNextFrame()
            } else {
                removeCallbacks(frameRunnable)
                frameScheduled = false
            }
            if (forceRedraw) invalidate()
        }

        private fun scheduleNextFrame() {
            if (frameScheduled || !active || !playing) return
            frameScheduled = true
            postOnAnimation(frameRunnable)
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val w = MeasureSpec.getSize(widthMeasureSpec).coerceAtLeast((120 * dp).roundToInt())
            val mainFm = mainUnsungPaint.fontMetrics
            val mainH = mainFm.descent - mainFm.ascent
            val subFm = subFillPaint.fontMetrics
            val subH = if (lineCount >= 2) (subFm.descent - subFm.ascent) + 2f * dp else 0f
            val h = (mainH + subH + 2f * dp).roundToInt().coerceAtLeast((18f * dp).roundToInt())
            setMeasuredDimension(w, h)
        }

        private fun currentEffectiveTimeMs(): Long {
            val elapsed = if (playing && anchorElapsedMs > 0L) {
                (SystemClock.elapsedRealtime() - anchorElapsedMs).coerceIn(0L, 120_000L)
            } else 0L
            return (anchorPosMs + elapsed + offsetMs + VISUAL_LEAD_MS).coerceAtLeast(0L)
        }

        private fun ensureLineCache(idx: Int, line: LyricLine?) {
            if (idx == cachedLineIdx) return
            cachedLineIdx = idx
            smoothScrollX = 0f
            val text = line?.text?.replace('\n', ' ')?.trim().orEmpty()
            cachedLineText = text
            cachedLineWidth = if (text.isNotEmpty()) mainUnsungPaint.measureText(text) else 0f
            val words = line?.words.orEmpty()
            if (words.isNotEmpty()) {
                val starts = FloatArray(words.size)
                val widths = FloatArray(words.size)
                var cursor = 0f
                for (i in words.indices) {
                    starts[i] = cursor
                    val w = mainUnsungPaint.measureText(words[i].text)
                    widths[i] = w
                    cursor += w
                }
                cachedWordStarts = starts
                cachedWordWidths = widths
                if (cursor > 0f) cachedLineWidth = cursor
            } else {
                cachedWordStarts = FloatArray(0)
                cachedWordWidths = FloatArray(0)
            }
        }

        private fun computeSungWidthPx(idx: Int, line: LyricLine, effectiveMs: Long): Float {
            if (cachedLineWidth <= 0f) return 0f
            val words = line.words
            if (words.isNotEmpty() && cachedWordStarts.size == words.size) {
                var sung = 0f
                for (i in words.indices) {
                    val word = words[i]
                    val startMs = word.timeMs
                    val nextStart = words.getOrNull(i + 1)?.timeMs
                    val durMs = when {
                        word.durationMs > 0L -> word.durationMs
                        nextStart != null && nextStart > startMs -> nextStart - startMs
                        else -> 320L
                    }.coerceAtLeast(40L)
                    if (effectiveMs <= startMs) {
                        break
                    }
                    if (effectiveMs >= startMs + durMs) {
                        sung = cachedWordStarts[i] + cachedWordWidths[i]
                    } else {
                        val frac = ((effectiveMs - startMs).toFloat() / durMs.toFloat()).coerceIn(0f, 1f)
                        sung = cachedWordStarts[i] + cachedWordWidths[i] * frac
                        break
                    }
                }
                return sung.coerceIn(0f, cachedLineWidth)
            }
            val nextTime = lines.getOrNull(idx + 1)?.timeMs ?: (line.timeMs + 4200L)
            val lineDur = (nextTime - line.timeMs).coerceIn(800L, 12000L)
            val frac = ((effectiveMs - line.timeMs).toFloat() / lineDur.toFloat()).coerceIn(0f, 1f)
            return cachedLineWidth * frac
        }

        private fun resolveSubText(idx: Int, activeLine: LyricLine?): String {
            if (lineCount < 2) return ""
            if (activeLine != null && translations.isNotEmpty()) {
                var best: LyricLine? = null
                var bestDiff = Long.MAX_VALUE
                for (tr in translations) {
                    val diff = abs(tr.timeMs - activeLine.timeMs)
                    if (diff <= 650L && diff < bestDiff) {
                        bestDiff = diff
                        best = tr
                    }
                }
                val trText = best?.text?.replace('\n', ' ')?.trim().orEmpty()
                if (trText.isNotEmpty()) return trText
            }
            return lines.getOrNull(idx + 1)?.text?.replace('\n', ' ')?.trim().orEmpty()
        }

        private fun applySungShaderIfNeeded(drawX: Float, textWidth: Float) {
            if (!useGradient) {
                mainSungPaint.shader = null
                mainSungPaint.color = sungPrimaryColor
                return
            }
            val safeW = textWidth.coerceAtLeast(1f)
            if (cachedShader == null ||
                abs(drawX - cachedGradX) > 0.5f ||
                abs(safeW - cachedGradW) > 0.5f ||
                sungPrimaryColor != cachedGradC1 ||
                sungSecondaryColor != cachedGradC2
            ) {
                cachedGradX = drawX
                cachedGradW = safeW
                cachedGradC1 = sungPrimaryColor
                cachedGradC2 = sungSecondaryColor
                cachedShader = LinearGradient(
                    drawX,
                    0f,
                    drawX + safeW,
                    0f,
                    sungPrimaryColor,
                    sungSecondaryColor,
                    Shader.TileMode.CLAMP,
                )
            }
            mainSungPaint.shader = cachedShader
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val sidePad = 4f * dp
            val availWidth = (width - sidePad * 2f).coerceAtLeast(60f)
            val mainFm = mainUnsungPaint.fontMetrics
            val mainH = mainFm.descent - mainFm.ascent
            val subFm = subFillPaint.fontMetrics
            val subH = if (lineCount >= 2) (subFm.descent - subFm.ascent) + 2f * dp else 0f
            val totalTextH = mainH + subH
            val topY = ((height - totalTextH) * 0.5f).coerceAtLeast(0.5f * dp)
            val mainBaseline = topY - mainFm.ascent

            val effectiveMs = currentEffectiveTimeMs()
            val idx = if (lines.isNotEmpty()) LyricParser.findIndex(lines, effectiveMs) else -1
            val activeLine = if (idx in lines.indices) lines[idx] else null

            val displayText: String
            val sungPx: Float
            if (activeLine != null && activeLine.text.isNotBlank()) {
                ensureLineCache(idx, activeLine)
                displayText = cachedLineText
                sungPx = computeSungWidthPx(idx, activeLine, effectiveMs)
            } else {
                val fallback = song?.let { s ->
                    if (s.singer.isNotBlank()) "${s.name} - ${s.singer}" else s.name
                }.orEmpty().ifBlank { "LxMine" }
                if (cachedLineIdx != -1 || cachedLineText != fallback) {
                    cachedLineIdx = -1
                    cachedLineText = fallback
                    cachedLineWidth = mainUnsungPaint.measureText(fallback)
                    cachedWordStarts = FloatArray(0)
                    cachedWordWidths = FloatArray(0)
                    smoothScrollX = 0f
                }
                displayText = cachedLineText
                sungPx = cachedLineWidth
            }

            val drawX: Float
            if (cachedLineWidth <= availWidth) {
                drawX = sidePad + (availWidth - cachedLineWidth) * 0.5f
                smoothScrollX = 0f
            } else {
                val maxScroll = cachedLineWidth - availWidth
                val targetScroll = (sungPx - availWidth * 0.42f).coerceIn(0f, maxScroll)
                smoothScrollX += (targetScroll - smoothScrollX) * 0.28f
                if (abs(targetScroll - smoothScrollX) < 0.5f) smoothScrollX = targetScroll
                drawX = sidePad - smoothScrollX
            }

            canvas.save()
            canvas.clipRect(sidePad, 0f, sidePad + availWidth, height.toFloat())
            canvas.drawText(displayText, drawX, mainBaseline, mainStrokePaint)
            canvas.drawText(displayText, drawX, mainBaseline, mainUnsungPaint)
            if (sungPx > 0.5f) {
                applySungShaderIfNeeded(drawX, cachedLineWidth)
                canvas.save()
                val clipRight = (drawX + sungPx).coerceAtLeast(sidePad)
                canvas.clipRect(sidePad, 0f, clipRight, mainBaseline + mainFm.descent + 4f * dp)
                canvas.drawText(displayText, drawX, mainBaseline, mainSungPaint)
                canvas.restore()
            }
            canvas.restore()

            if (lineCount >= 2) {
                val subRaw = resolveSubText(idx, activeLine)
                if (subRaw.isNotEmpty()) {
                    val subBaseline = mainBaseline + mainFm.descent + 3f * dp - subFm.ascent
                    val subEllipsized = TextUtils.ellipsize(subRaw, subFillPaint, availWidth, TextUtils.TruncateAt.END).toString()
                    val subW = subFillPaint.measureText(subEllipsized)
                    val subX = sidePad + ((availWidth - subW) * 0.5f).coerceAtLeast(0f)
                    canvas.drawText(subEllipsized, subX, subBaseline, subStrokePaint)
                    canvas.drawText(subEllipsized, subX, subBaseline, subFillPaint)
                }
            }
        }
    }
}
