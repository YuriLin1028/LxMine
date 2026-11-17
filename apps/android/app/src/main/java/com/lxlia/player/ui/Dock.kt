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
    positionMs: Long,
    duration: Long,
    colorFirst: Color,
    colorLast: Color,
    liked: Boolean,
    onTab: (String) -> Unit,
    onPlayer: () -> Unit,
    onToggle: () -> Unit,
    onNext: (Int) -> Unit,
    onQueue: () -> Unit,
    onMode: () -> Unit,
    onDownload: () -> Unit,
    onLike: () -> Unit,
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
    val wideControls = capsule || availableWidth >= 620

    val spec = spring<Float>(dampingRatio = 0.82f, stiffness = Spring.StiffnessMediumLow)
    val width by animateFloatAsState(barWidth, spec, label = "dock-w")
    val height by animateFloatAsState(barHeight, spec, label = "dock-h")
    val x by animateFloatAsState(barX, spec, label = "dock-x")
    // 与鸿蒙 DockLayer 一致：一栏时两条都从 0 起；两栏时播控 0、导航 48（4vp 间隙）。
    val y by animateFloatAsState(if (collapsed) 0f else barY, spec, label = "dock-y")
    val navW by animateFloatAsState(if (collapsed) 56f else navWidth, spec, label = "nav-w")
    val navXAnimated by animateFloatAsState(navX, spec, label = "nav-x")
    val navYAnimated by animateFloatAsState(
        if (collapsed || (split && !centered)) 0f else 48f,
        spec,
        label = "nav-y",
    )
    val root by animateFloatAsState(rootHeight, spec, label = "dock-root")
    val radius = 28f

    Box(Modifier.fillMaxWidth().height(root.dp)) {
        if (detail) {
            DockTimeline(
                songKey = song?.key,
                width = width,
                x = x,
                positionMs = positionMs,
                duration = duration,
                enabled = song != null && duration > 0 && !busy,
                colorFirst = colorFirst,
                colorLast = colorLast,
                onSeek = onSeek,
            )
        }
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
                        .padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    DockCover(
                        song = song,
                        playing = playing,
                        size = coverSize,
                        positionMs = positionMs,
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
                    if (capsule) {
                        DockControls(
                            song = song,
                            playing = playing,
                            busy = busy,
                            liked = liked,
                            mode = mode,
                            size = 28.dp,
                            playSize = 34.dp,
                            wide = true,
                            capsule = true,
                            onNext = onNext,
                            onToggle = onToggle,
                            onLike = onLike,
                            onMode = onMode,
                            onDownload = onDownload,
                            onQueue = onQueue,
                        )
                    } else {
                        DockControls(
                            song = song,
                            playing = playing,
                            busy = busy,
                            liked = liked,
                            mode = mode,
                            size = 28.dp,
                            playSize = 34.dp,
                            wide = wideControls,
                            capsule = false,
                            onNext = onNext,
                            onToggle = onToggle,
                            onLike = onLike,
                            onMode = onMode,
                            onDownload = onDownload,
                            onQueue = onQueue,
                        )
                    }
                }
            }
        }
        if (navVisible) {
            Box(Modifier.padding(start = navXAnimated.coerceAtLeast(0f).dp).padding(top = navYAnimated.coerceAtLeast(0f).dp)) {
                NavigationPill(
                    tab = tab,
                    width = navW,
                    collapsed = collapsed,
                    onTab = onTab,
                    onExpand = onExpand,
                )
            }
        }
    }
}

@Composable
private fun DockTimeline(
    songKey: String?,
    width: Float,
    x: Float,
    positionMs: Long,
    duration: Long,
    enabled: Boolean,
    colorFirst: Color,
    colorLast: Color,
    onSeek: (Long) -> Unit,
) {
    var scrubbing by remember(songKey) { mutableStateOf(false) }
    var seekValue by remember(songKey) { mutableStateOf(0f) }
    val value = if (scrubbing) seekValue else positionMs.toFloat()
    Row(
        modifier = Modifier
            .padding(start = x.coerceAtLeast(0f).dp)
            .width(width.coerceAtLeast(0f).dp)
            .height(34.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(formatTime(if (scrubbing) seekValue.toLong() else positionMs), fontSize = 10.sp, color = TEXT, modifier = Modifier.width(34.dp))
        // 自绘进度条：3dp 轨道 + 7dp 滑块（拖动时 11dp），颜色从封面渐变——与鸿蒙 Slider 规格一致。
        TimelineSlider(
            modifier = Modifier.weight(1f).height(30.dp),
            songKey = songKey,
            value = value.toLong(),
            duration = duration,
            enabled = enabled,
            colorFirst = colorFirst,
            colorLast = colorLast,
            onScrubStart = { scrubbing = true },
            onScrub = { seekValue = it.toFloat() },
            onScrubEnd = {
                if (scrubbing) onSeek(seekValue.toLong())
                scrubbing = false
            },
            onScrubCancel = { scrubbing = false },
            scrubbing = scrubbing,
        )
        Text(
            formatTime(duration),
            fontSize = 10.sp,
            color = TEXT,
            modifier = Modifier.width(34.dp),
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
    scrubbing: Boolean,
    onScrubStart: () -> Unit,
    onScrub: (Long) -> Unit,
    onScrubEnd: () -> Unit,
    onScrubCancel: () -> Unit,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    val total = maxOf(1L, duration)
    val progress = (value.toFloat() / total).coerceIn(0f, 1f)
    Canvas(
        modifier
            .pointerInput(songKey, enabled, total) {
                if (!enabled) return@pointerInput
                detectTapGestures { offset ->
                    onScrub((offset.x / size.width * total).toLong().coerceIn(0L, total))
                    onScrubStart()
                    onScrubEnd()
                }
            }
            .pointerInput(songKey, enabled, total) {
                if (!enabled) return@pointerInput
                detectHorizontalDragGestures(
                    onDragStart = { offset ->
                        onScrubStart()
                        onScrub((offset.x / size.width * total).toLong().coerceIn(0L, total))
                    },
                    onHorizontalDrag = { change, _ ->
                        onScrub((change.position.x / size.width * total).toLong().coerceIn(0L, total))
                    },
                    onDragEnd = { onScrubEnd() },
                    onDragCancel = { onScrubCancel() },
                )
            },
    ) {
        val centerY = size.height / 2f
        val track = 3.dp.toPx()
        val radius = track / 2f
        val corner = androidx.compose.ui.geometry.CornerRadius(radius, radius)
        drawRoundRect(
            color = Color(0x38FFFFFF),
            topLeft = Offset(0f, centerY - radius),
            size = Size(size.width, track),
            cornerRadius = corner,
        )
        if (progress > 0f) {
            drawRoundRect(
                brush = Brush.horizontalGradient(listOf(colorFirst, colorLast)),
                topLeft = Offset(0f, centerY - radius),
                size = Size(size.width * progress, track),
                cornerRadius = corner,
            )
        }
        if (enabled) {
            val thumbRadius = with(density) { (if (scrubbing) 5.5f else 3.5f).dp.toPx() }
            drawCircle(color = colorLast, radius = thumbRadius, center = Offset(size.width * progress, centerY))
        }
    }
}

@Composable
private fun DockCover(
    song: Song?,
    playing: Boolean,
    size: Float,
    positionMs: Long,
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
    val progress = if (duration > 0) (positionMs.toFloat() / duration).coerceIn(0f, 1f) else 0f
    Box(
        modifier = Modifier
            .size(size.dp)
            .semantics { contentDescription = "打开歌曲详情" }
            .tapNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size.dp)) {
            val stroke = 3.dp.toPx()
            val inset = stroke / 2
            drawArc(
                color = Color(0x55FFFFFF),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(this.size.width - stroke, this.size.height - stroke),
                style = Stroke(width = stroke),
            )
            if (progress > 0f) {
                drawArc(
                    brush = Brush.sweepGradient(listOf(ACCENT, colorLast)),
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
                .background(Color(0x18FFFFFF)),
            contentAlignment = Alignment.Center,
        ) {
            AssetIcon("symbol_queue.svg", size = ((size - 8) * 0.45f).dp, tint = TEXT)
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
    liked: Boolean,
    mode: String,
    size: androidx.compose.ui.unit.Dp,
    playSize: androidx.compose.ui.unit.Dp,
    wide: Boolean,
    capsule: Boolean,
    onNext: (Int) -> Unit,
    onToggle: () -> Unit,
    onLike: () -> Unit,
    onMode: () -> Unit,
    onDownload: () -> Unit,
    onQueue: () -> Unit,
) {
    val moreMenu = rememberGlassMenuTrigger {
        listOf(
            GlassMenuItem("播放顺序 · $mode") { onMode() },
            GlassMenuItem("下载歌曲", enabled = song != null) { onDownload() },
            GlassMenuItem("播放队列") { onQueue() },
        )
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        // 非胶囊模式与鸿蒙一致：喜欢键固定在最左，随后是上一首/播放/下一首。
        if (!capsule) {
            MaterialIconButton("ic_heart.svg", if (liked) "取消喜欢" else "喜欢", diameter = size - 2.dp, grouped = true, selected = liked, enabled = song != null, onClick = onLike)
        }
        MaterialIconButton("ic_previous.svg", "上一首", diameter = size, grouped = true, enabled = song != null && !busy, onClick = { onNext(-1) })
        MaterialIconButton(if (playing) "ic_pause.svg" else "ic_play.svg", if (playing) "暂停" else "播放", diameter = playSize, grouped = true, enabled = song != null && !busy, onClick = onToggle)
        MaterialIconButton("ic_next.svg", "下一首", diameter = size, grouped = true, enabled = song != null && !busy, onClick = { onNext(1) })
        if (wide) {
            if (capsule) {
                MaterialIconButton("ic_heart.svg", if (liked) "取消喜欢" else "喜欢", diameter = size, grouped = true, selected = liked, enabled = song != null, onClick = onLike)
            }
            val actionSize = if (capsule) size else size + 2.dp
            MaterialIconButton(if (mode == "随机播放") "ic_shuffle.svg" else "ic_repeat.svg", "播放顺序：$mode", diameter = actionSize, grouped = true, onClick = onMode)
            MaterialIconButton("ic_download.svg", "下载歌曲", diameter = actionSize, grouped = true, enabled = song != null, onClick = onDownload)
            MaterialIconButton("ic_queue.svg", "播放队列", diameter = size + 2.dp, grouped = true, onClick = onQueue)
        } else {
            MaterialIconButton(
                "ic_more.svg",
                "更多播放操作",
                modifier = moreMenu.modifier,
                diameter = size + 2.dp,
                grouped = true,
                onClick = { moreMenu.show() },
            )
        }
    }
}
