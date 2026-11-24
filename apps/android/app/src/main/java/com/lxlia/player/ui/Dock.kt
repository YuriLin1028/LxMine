package com.lxlia.player.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import com.lxlia.player.model.Song
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * 唯一常驻底栏：播控胶囊 + 导航胶囊在竖屏、横屏、搜索、二级页与详情页之间从不重建，
 * 只改变几何（对应鸿蒙 DockLayer/MineDock 的同一套规则）。
 */
@Composable
fun DockLayer(
    song: Song?,
    tab: String,
    playing: Boolean,
    busy: Boolean,
    availableWidth: Int,
    landscape: Boolean,
    searchOpen: Boolean,
    secondary: Boolean,
    detail: Boolean,
    compact: Boolean,
    mode: String,
    positionMsProvider: () -> Long,
    duration: Long,
    colorFirst: Color,
    colorLast: Color,
    stageDark: Boolean = !AppAppearance.light,
    liked: Boolean,
    onTab: (String) -> Unit,
    onPlayer: () -> Unit,
    onToggle: () -> Unit,
    onNext: (Int) -> Unit,
    onQueue: () -> Unit,
    onMode: () -> Unit,
    onMore: () -> Unit,
    onExpand: () -> Unit,
    onSeek: (Long) -> Unit,
) {
    val centered = searchOpen || secondary || detail
    val split = landscape && availableWidth >= 820
    val capsule = split || searchOpen || secondary
    val collapsed = compact && !detail && !centered && !split
    val dockWidth = maxOf(260f, minOf(availableWidth - 48f, 700f))
    val dockLeft = (availableWidth - dockWidth) / 2
    val barWidth = when {
        searchOpen || secondary -> minOf(760f, availableWidth - 32f)
        detail -> if (split) minOf(760f, availableWidth - 32f) else dockWidth
        split -> maxOf(520f, minOf(620f, availableWidth * 0.54f))
        collapsed -> dockWidth - 66f
        else -> dockWidth
    }
    val barX = when {
        searchOpen || secondary -> (availableWidth - barWidth) / 2
        detail -> if (split) (availableWidth - barWidth) / 2 else dockLeft
        split -> availableWidth - 16f - barWidth
        collapsed -> dockLeft + 66f
        else -> dockLeft
    }
    val barHeight = when {
        detail -> if (split || searchOpen || secondary) 56f else 54f
        searchOpen || secondary || split -> 56f
        collapsed -> 54f
        else -> 44f
    }
    val barY = if (detail) 34f else 0f
    val coverSize = when {
        capsule -> 42f
        !detail && !collapsed && barHeight == 44f -> 32f
        else -> 38f
    }
    val navWidth = if (split && !centered) 240f else dockWidth
    val navX = when {
        split && !centered -> 16f
        collapsed -> dockLeft
        else -> dockLeft
    }
    val navY = when {
        split && !centered -> 0f
        collapsed -> 0f
        else -> 48f
    }
    val rootHeight = when {
        detail -> if (split || searchOpen || secondary) 90f else 92f
        centered -> 56f
        split -> 56f
        collapsed -> 56f
        else -> 110f
    }
    val navVisible = !centered

    val spec = remember { spring<Float>(dampingRatio = 0.82f, stiffness = Spring.StiffnessMediumLow) }
    val widthAnim = remember { Animatable(barWidth) }
    val heightAnim = remember { Animatable(barHeight) }
    val xAnim = remember { Animatable(barX) }
    val yAnim = remember { Animatable(if (collapsed) 0f else barY) }
    val navWAnim = remember { Animatable(if (collapsed) 56f else navWidth) }
    val navXAnim = remember { Animatable(navX) }
    val navYAnim = remember { Animatable(if (collapsed || (split && !centered)) 0f else 48f) }
    val rootAnim = remember { Animatable(rootHeight) }
    var lastViewportKey by remember { mutableStateOf(availableWidth to landscape) }
    val targetY = if (collapsed) 0f else barY
    val targetNavW = if (collapsed) 56f else navWidth
    val targetNavY = if (collapsed || (split && !centered)) 0f else 48f

    LaunchedEffect(barWidth, barHeight, barX, targetY, targetNavW, navX, targetNavY, rootHeight, availableWidth, landscape) {
        val viewportKey = availableWidth to landscape
        val snap = lastViewportKey != viewportKey
        lastViewportKey = viewportKey
        if (snap) {
            widthAnim.snapTo(barWidth)
            heightAnim.snapTo(barHeight)
            xAnim.snapTo(barX)
            yAnim.snapTo(targetY)
            navWAnim.snapTo(targetNavW)
            navXAnim.snapTo(navX)
            navYAnim.snapTo(targetNavY)
            rootAnim.snapTo(rootHeight)
        } else {
            coroutineScope {
                launch { widthAnim.animateTo(barWidth, spec) }
                launch { heightAnim.animateTo(barHeight, spec) }
                launch { xAnim.animateTo(barX, spec) }
                launch { yAnim.animateTo(targetY, spec) }
                launch { navWAnim.animateTo(targetNavW, spec) }
                launch { navXAnim.animateTo(navX, spec) }
                launch { navYAnim.animateTo(targetNavY, spec) }
                launch { rootAnim.animateTo(rootHeight, spec) }
            }
        }
    }

    val width = widthAnim.value
    val height = heightAnim.value
    val x = xAnim.value
    val y = yAnim.value
    val navW = navWAnim.value
    val navXAnimated = navXAnim.value
    val navYAnimated = navYAnim.value
    val root = rootAnim.value
    val radius = 28f
    val navReveal by animateFloatAsState(
        targetValue = if (navVisible) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.84f, stiffness = Spring.StiffnessMediumLow),
        label = "nav-pill-reveal",
    )

    Box(Modifier.fillMaxWidth().height(root.dp)) {
        // 播控胶囊（弹簧会过冲，padding 必须钳到非负）
        Box(Modifier.padding(start = x.coerceAtLeast(0f).dp).padding(top = y.coerceAtLeast(0f).dp)) {
            GlassSurface(
                modifier = Modifier.width(width.dp).height(height.dp),
                shape = RoundedCornerShape(radius.dp),
                tone = GlassTone.UltraThin,
                liquid = true,
                interactive = true,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(height.dp)
                        .padding(horizontal = if (width < 320f) 4.dp else 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(if (width < 320f) 2.dp else 3.dp),
                ) {
                    DockCover(
                        song = song,
                        playing = playing,
                        size = coverSize,
                        positionMsProvider = positionMsProvider,
                        duration = duration,
                        colorLast = colorLast,
                        onClick = onPlayer,
                    )
                    Column(
                        modifier = Modifier.weight(1f).padding(start = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            song?.name ?: "尚未播放",
                            fontSize = 13.sp,
                            color = LocalGlassInk.current,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth().tapNoRipple(onPlayer),
                        )
                        Text(
                            if (busy) "正在准备…" else song?.singer ?: "选择歌曲，开始聆听",
                            fontSize = 10.sp,
                            color = MUTED,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth().tapNoRipple(onPlayer),
                        )
                    }
                    val ctrlSize = when {
                        width < 305f -> 24.dp
                        width < 460f -> 26.dp
                        else -> 30.dp
                    }
                    val playCtrlSize = when {
                        width < 305f -> 28.dp
                        width < 460f -> 32.dp
                        else -> 36.dp
                    }
                    DockControls(
                        song = song,
                        playing = playing,
                        busy = busy,
                        mode = mode,
                        size = ctrlSize,
                        playSize = playCtrlSize,
                        onNext = onNext,
                        onToggle = onToggle,
                        onMode = onMode,
                        onQueue = onQueue,
                        onMore = onMore,
                    )
                }
            }
        }
        if (navVisible || navReveal > 0.02f) {
            Box(
                Modifier
                    .padding(start = navXAnimated.coerceAtLeast(0f).dp)
                    .padding(top = navYAnimated.coerceAtLeast(0f).dp)
                    .graphicsLayer {
                        alpha = navReveal.coerceIn(0f, 1f)
                        val s = 0.92f + 0.08f * navReveal
                        scaleX = s
                        scaleY = s
                    },
            ) {
                NavigationPill(
                    tab = tab,
                    width = navW,
                    collapsed = collapsed,
                    onTab = onTab,
                    onExpand = onExpand,
                )
            }
        }
        if (detail) {
            Box(Modifier.zIndex(5f)) {
                DockTimeline(
                    songKey = song?.key,
                    width = width,
                    x = x,
                    positionMsProvider = positionMsProvider,
                    duration = duration,
                    enabled = song != null && duration > 0 && !busy,
                    colorFirst = colorFirst,
                    colorLast = colorLast,
                    stageDark = stageDark,
                    onSeek = onSeek,
                )
            }
        }
    }
}

/**
 * 保持歌曲封面取色的原始色相与饱和度，仅根据当前舞台明暗极性调节 HSL 亮度，
 * 确保任意深浅色背景与 3D 动效下进度条都清晰可见，绝不胡乱变色。
 */
private fun adaptProgressColor(color: Color, onDark: Boolean): Color {
    val r = color.red.coerceIn(0f, 1f)
    val g = color.green.coerceIn(0f, 1f)
    val b = color.blue.coerceIn(0f, 1f)
    val max = maxOf(r, g, b)
    val min = minOf(r, g, b)
    val d = max - min
    var l = (max + min) * 0.5f
    val s = if (d <= 0.0001f) 0f else d / (1f - kotlin.math.abs(2f * l - 1f)).coerceAtLeast(0.0001f)
    val h = when {
        d <= 0.0001f -> 0f
        max == r -> (((g - b) / d) + (if (g < b) 6f else 0f)) / 6f
        max == g -> (((b - r) / d) + 2f) / 6f
        else -> (((r - g) / d) + 4f) / 6f
    }
    l = if (onDark) {
        if (l < 0.58f) 0.58f + (l / 0.58f) * 0.12f else l.coerceAtMost(0.88f)
    } else {
        if (l > 0.46f) 0.30f + ((1f - l) / 0.54f) * 0.16f else l.coerceAtLeast(0.22f)
    }
    if (s <= 0.0001f) return Color(l, l, l, 1f)
    val q = if (l < 0.5f) l * (1f + s) else l + s - l * s
    val p = 2f * l - q
    fun hue2rgb(tRaw: Float): Float {
        var t = tRaw
        if (t < 0f) t += 1f
        if (t > 1f) t -= 1f
        return when {
            t < 1f / 6f -> p + (q - p) * 6f * t
            t < 0.5f -> q
            t < 2f / 3f -> p + (q - p) * (2f / 3f - t) * 6f
            else -> p
        }
    }
    return Color(
        red = hue2rgb(h + 1f / 3f).coerceIn(0f, 1f),
        green = hue2rgb(h).coerceIn(0f, 1f),
        blue = hue2rgb(h - 1f / 3f).coerceIn(0f, 1f),
        alpha = 1f,
    )
}

@Composable
private fun DockTimeline(
    songKey: String?,
    width: Float,
    x: Float,
    positionMsProvider: () -> Long,
    duration: Long,
    enabled: Boolean,
    colorFirst: Color,
    colorLast: Color,
    stageDark: Boolean,
    onSeek: (Long) -> Unit,
) {
    val positionMs = positionMsProvider()
    var scrubbing by remember(songKey) { mutableStateOf(false) }
    var seekValue by remember(songKey) { mutableStateOf(0f) }
    var holdTarget by remember(songKey) { mutableStateOf<Long?>(null) }
    var commitSeq by remember(songKey) { mutableStateOf(0) }
    LaunchedEffect(songKey, commitSeq) {
        if (commitSeq > 0) {
            delay(850)
            holdTarget = null
        }
    }
    val displayPos: Long = when {
        scrubbing -> seekValue.toLong()
        holdTarget != null && kotlin.math.abs(positionMs - holdTarget!!) > 2000L -> holdTarget!!
        else -> positionMs
    }
    val adaptedFirst = remember(colorFirst, stageDark) { adaptProgressColor(colorFirst, stageDark) }
    val adaptedLast = remember(colorLast, stageDark) { adaptProgressColor(colorLast, stageDark) }
    val timeColor = if (stageDark) Color(0xFFF4F6FA) else Color(0xFF141923)
    val timeStyle = remember(stageDark) {
        androidx.compose.ui.text.TextStyle(
            fontFeatureSettings = "tnum",
            shadow = androidx.compose.ui.graphics.Shadow(
                color = if (stageDark) Color(0xD9000000) else Color(0xE0FFFFFF),
                offset = Offset(0f, 1f),
                blurRadius = if (stageDark) 4.5f else 3.5f,
            ),
        )
    }
    Row(
        modifier = Modifier
            .padding(start = x.coerceAtLeast(0f).dp)
            .width(width.coerceAtLeast(0f).dp)
            .height(34.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            formatTime(displayPos),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = timeColor,
            style = timeStyle,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.width(38.dp),
        )
        // 完全对齐 PC 端进度条规格：4dp 胶囊轨道 + 保留封面原色相自适应亮度渐变 + 双对比护边/投影 + 12dp 护边滑块
        TimelineSlider(
            modifier = Modifier.weight(1f).height(34.dp),
            songKey = songKey,
            value = displayPos,
            duration = duration,
            enabled = enabled,
            colorFirst = adaptedFirst,
            colorLast = adaptedLast,
            stageDark = stageDark,
            onTapSeek = { target ->
                scrubbing = false
                seekValue = target.toFloat()
                holdTarget = target
                commitSeq++
                onSeek(target)
            },
            onScrubStart = { scrubbing = true },
            onScrub = { seekValue = it.toFloat() },
            onScrubEnd = {
                val target = seekValue.toLong()
                if (scrubbing) {
                    holdTarget = target
                    commitSeq++
                    onSeek(target)
                }
                scrubbing = false
            },
            onScrubCancel = { scrubbing = false },
            scrubbing = scrubbing,
        )
        Text(
            formatTime(duration),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = timeColor,
            style = timeStyle,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.width(38.dp),
        )
    }
}

@Composable
private fun TimelineSlider(
    modifier: Modifier = Modifier,
    songKey: String?,
    value: Long,
    duration: Long,
    enabled: Boolean,
    colorFirst: Color,
    colorLast: Color,
    stageDark: Boolean,
    scrubbing: Boolean,
    onTapSeek: (Long) -> Unit,
    onScrubStart: () -> Unit,
    onScrub: (Long) -> Unit,
    onScrubEnd: () -> Unit,
    onScrubCancel: () -> Unit,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    val total = maxOf(1L, duration)
    val progress = (value.toFloat() / total).coerceIn(0f, 1f)
    val progressBrush = remember(colorFirst, colorLast) { Brush.horizontalGradient(listOf(colorFirst, colorLast)) }
    val currentOnScrubStart = androidx.compose.runtime.rememberUpdatedState(onScrubStart)
    val currentOnScrub = androidx.compose.runtime.rememberUpdatedState(onScrub)
    val currentOnScrubEnd = androidx.compose.runtime.rememberUpdatedState(onScrubEnd)
    val currentOnScrubCancel = androidx.compose.runtime.rememberUpdatedState(onScrubCancel)
    Canvas(
        modifier
            .pointerInput(songKey, enabled, total) {
                if (!enabled) return@pointerInput
                // 单一统一手势处理器：按下即消费事件并立刻跳到点击位置，避免 tap/drag 双监听竞争或被下滑手势吞掉。
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    down.consume()
                    val widthPx = size.width.toFloat().coerceAtLeast(1f)
                    var target = (down.position.x / widthPx * total).toLong().coerceIn(0L, total)
                    currentOnScrubStart.value()
                    currentOnScrub.value(target)
                    val pointerId = down.id
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == pointerId } ?: event.changes.firstOrNull() ?: break
                        if (!change.pressed) {
                            change.consume()
                            target = (change.position.x / widthPx * total).toLong().coerceIn(0L, total)
                            currentOnScrub.value(target)
                            break
                        }
                        change.consume()
                        target = (change.position.x / widthPx * total).toLong().coerceIn(0L, total)
                        currentOnScrub.value(target)
                    }
                    currentOnScrubEnd.value()
                }
            },
    ) {
        val centerY = size.height / 2f
        val track = 4.dp.toPx()
        val radius = track / 2f
        val corner = androidx.compose.ui.geometry.CornerRadius(radius, radius)
        val shadowOffset = 1.dp.toPx()
        val rimPad = 0.75.dp.toPx()
        val rimCorner = androidx.compose.ui.geometry.CornerRadius(radius + rimPad, radius + rimPad)
        // PC 同款软投影 + 0.75dp 双对比外描边，深浅背景及高亮动效下清晰可见。
        drawRoundRect(
            color = if (stageDark) Color(0x52000000) else Color(0x24000000),
            topLeft = Offset(-rimPad, centerY - radius - rimPad + shadowOffset),
            size = Size(size.width + rimPad * 2f, track + rimPad * 2f + shadowOffset),
            cornerRadius = rimCorner,
        )
        drawRoundRect(
            color = if (stageDark) Color(0x75000000) else Color(0xA6FFFFFF),
            topLeft = Offset(-rimPad, centerY - radius - rimPad),
            size = Size(size.width + rimPad * 2f, track + rimPad * 2f),
            cornerRadius = rimCorner,
        )
        drawRoundRect(
            color = if (stageDark) Color(0x57FFFFFF) else Color(0x420F172A),
            topLeft = Offset(0f, centerY - radius),
            size = Size(size.width, track),
            cornerRadius = corner,
        )
        if (progress > 0f) {
            drawRoundRect(
                brush = progressBrush,
                topLeft = Offset(0f, centerY - radius),
                size = Size(size.width * progress, track),
                cornerRadius = corner,
            )
        }
        if (enabled) {
            val thumbRadius = with(density) { (if (scrubbing) 7f else 6f).dp.toPx() }
            val haloPx = 1.5.dp.toPx()
            val clampedX = (size.width * progress).coerceIn(thumbRadius, (size.width - thumbRadius).coerceAtLeast(thumbRadius))
            val center = Offset(clampedX, centerY)
            drawCircle(
                color = if (stageDark) Color(0x66000000) else Color(0x400F172A),
                radius = thumbRadius + haloPx + 0.8.dp.toPx(),
                center = Offset(clampedX, centerY + shadowOffset),
            )
            drawCircle(
                color = if (stageDark) Color(0x7A000000) else Color(0xDBFFFFFF),
                radius = thumbRadius + haloPx,
                center = center,
            )
            drawCircle(color = colorLast, radius = thumbRadius, center = center)
        }
    }
}

@Composable
private fun DockCover(
    song: Song?,
    playing: Boolean,
    size: Float,
    positionMsProvider: () -> Long,
    duration: Long,
    colorLast: Color,
    onClick: () -> Unit,
) {
    val angle = remember { Animatable(0f) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(playing, lifecycle) {
        if (!playing) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (isActive) {
                angle.animateTo(angle.value + 360f, tween(24000, easing = androidx.compose.animation.core.LinearEasing))
                angle.snapTo(angle.value % 360f)
            }
        }
    }
    val ringBrush = remember(colorLast) { Brush.sweepGradient(listOf(ACCENT, colorLast)) }
    val coverGrad = remember(song?.name) { Brush.linearGradient(glacialGradFor(song?.name.orEmpty())) }
    Box(
        modifier = Modifier
            .size(size.dp)
            .semantics { contentDescription = "打开歌曲详情" }
            .tapNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size.dp)) {
            val progress = if (duration > 0) (positionMsProvider().toFloat() / duration).coerceIn(0f, 1f) else 0f
            val stroke = 3.dp.toPx()
            val inset = stroke / 2
            drawArc(
                color = if (AppAppearance.light) Color(0x33000000) else Color(0x55FFFFFF),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(this.size.width - stroke, this.size.height - stroke),
                style = Stroke(width = stroke),
            )
            if (progress > 0f) {
                drawArc(
                    brush = ringBrush,
                    startAngle = -90f,
                    sweepAngle = progress * 360f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(this.size.width - stroke, this.size.height - stroke),
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
        Box(
            modifier = Modifier
                .size((size - 8).dp)
                .clip(CircleShape)
                .background(coverGrad),
            contentAlignment = Alignment.Center,
        ) {
            AssetIcon("ic_music.svg", size = ((size - 8) * 0.45f).dp, tint = Color.White.copy(alpha = 0.9f), systemSymbol = false)
            if (!song?.coverUrl.isNullOrEmpty()) {
                RemoteImage(song.coverUrl, modifier = Modifier.size((size - 8).dp).graphicsLayer { rotationZ = angle.value })
            }
        }
    }
}

@Composable
private fun DockControls(
    song: Song?,
    playing: Boolean,
    busy: Boolean,
    mode: String,
    size: androidx.compose.ui.unit.Dp,
    playSize: androidx.compose.ui.unit.Dp,
    onNext: (Int) -> Unit,
    onToggle: () -> Unit,
    onMode: () -> Unit,
    onQueue: () -> Unit,
    onMore: () -> Unit,
) {
    // 全端统一播控栏右侧 6 键，不按屏幕宽度省略：播放顺序、上一首、暂停/播放、下一首、播放队列、更多。
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(1.dp)) {
        MaterialIconButton(playModeIcon(mode), "播放顺序：$mode", diameter = size, grouped = true, onClick = onMode)
        MaterialIconButton("ic_previous.svg", "上一首", diameter = size, grouped = true, systemSymbol = false, enabled = song != null && !busy, onClick = { onNext(-1) })
        MaterialIconButton(if (playing) "ic_pause.svg" else "ic_play.svg", if (playing) "暂停" else "播放", diameter = playSize, grouped = true, systemSymbol = false, enabled = song != null && !busy, onClick = onToggle)
        MaterialIconButton("ic_next.svg", "下一首", diameter = size, grouped = true, systemSymbol = false, enabled = song != null && !busy, onClick = { onNext(1) })
        MaterialIconButton("ic_queue.svg", "播放队列", diameter = size, grouped = true, onClick = onQueue)
        MaterialIconButton("ic_more.svg", "更多", diameter = size, grouped = true, onClick = onMore)
    }
}
