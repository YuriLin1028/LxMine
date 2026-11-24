package com.lxlia.player.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.selection.toggleable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import com.lxlia.player.ui.liquid.DampedDragAnimation
import kotlinx.coroutines.flow.collectLatest
import kotlin.math.roundToInt

/** Kyant0 LiquidToggle geometry with the shared restrained press scale. */
@Composable
fun GlassSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    if (!supportsFullLiquidGlass()) {
        val progress by animateFloatAsState(if (checked) 1f else 0f, label = "basic-switch")
        Box(
            modifier.size(64.dp, 28.dp).pressDeform()
                .clip(RoundedCornerShape(14.dp))
                .background(if (checked) CONTROL_BLUE else MUTED.copy(alpha = .25f))
                .toggleable(checked, role = Role.Switch, onValueChange = onCheckedChange),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(Modifier.offset(x = (2f + progress * 20f).dp).size(40.dp, 24.dp)
                .clip(RoundedCornerShape(12.dp)).background(Color(0xFFF4F4F4)))
        }
        return
    }
    val currentChecked = rememberUpdatedState(checked)
    val currentOnChange = rememberUpdatedState(onCheckedChange)
    val density = LocalDensity.current
    val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
    val dragWidth = with(density) { 20.dp.toPx() }
    val animationScope = rememberCoroutineScope()
    var fraction by remember { mutableFloatStateOf(if (checked) 1f else 0f) }
    var didDrag by remember { mutableStateOf(false) }
    val animation = remember(animationScope, isLtr, dragWidth) {
        DampedDragAnimation(
            animationScope = animationScope,
            initialValue = fraction,
            valueRange = 0f..1f,
            visibilityThreshold = 0.001f,
            initialScale = 1f,
            pressedScale = LIQUID_THUMB_PRESS_SCALE,
            onDragStarted = { didDrag = false },
            onDragStopped = {
                val next = if (didDrag) fraction >= 0.5f else !currentChecked.value
                fraction = if (next) 1f else 0f
                updateValue(fraction)
                currentOnChange.value(next)
                didDrag = false
            },
            onDrag = { _, amount ->
                if (amount.x != 0f) didDrag = true
                val delta = amount.x / dragWidth
                fraction = (fraction + if (isLtr) delta else -delta).coerceIn(0f, 1f)
            },
            onDragCancelled = {
                fraction = if (currentChecked.value) 1f else 0f
                updateValue(fraction)
                didDrag = false
            },
        )
    }
    LaunchedEffect(animation) {
        snapshotFlow { fraction }.collectLatest { animation.updateValue(it) }
    }
    LaunchedEffect(checked) {
        val target = if (checked) 1f else 0f
        if (fraction != target) {
            fraction = target
            animation.animateToValue(target)
        }
    }
    val backdrop = LocalBackdrop.current
    val trackBackdrop = rememberLayerBackdrop()
    val knobBackdrop = rememberCombinedBackdrop(
        backdrop ?: trackBackdrop,
        rememberBackdrop(trackBackdrop) { drawBackdrop ->
            val progress = animation.pressProgress
            scale(2f / 3f + progress / 12f, 0.75f * progress) { drawBackdrop() }
        },
    )
    Box(
        modifier = modifier.size(64.dp, 28.dp).semantics {
            role = Role.Switch
            toggleableState = if (checked) ToggleableState.On else ToggleableState.Off
            onClick { currentOnChange.value(!currentChecked.value); true }
        },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier.matchParentSize()
                .layerBackdrop(trackBackdrop)
                .clip(RoundedCornerShape(14.dp))
                .drawBehind { drawRect(lerp(Color(0x28787880), CONTROL_BLUE, animation.value)) }
                .tapNoRipple { currentOnChange.value(!currentChecked.value) },
        )
        LiquidControlThumb(
            animation = animation,
            backdrop = knobBackdrop,
            diameter = 24.dp,
            width = 40.dp,
            velocityDivisor = 50f,
            modifier = Modifier.graphicsLayer {
                val fraction = if (isLtr) animation.value else 1f - animation.value
                translationX = 2.dp.toPx() + dragWidth * fraction
            },
        )
    }
}

/** Harmony's continuous track and round thumb with Kyant0's refractive drag. */
@Composable
fun GlassSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    modifier: Modifier = Modifier,
    step: Float = 0f,
) {
    val currentValue = rememberUpdatedState(value)
    val currentOnChange = rememberUpdatedState(onValueChange)
    val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
    val span = (valueRange.endInclusive - valueRange.start).coerceAtLeast(0.0001f)
    fun snap(raw: Float): Float {
        val clamped = raw.coerceIn(valueRange)
        return if (step > 0f) {
            (valueRange.start + ((clamped - valueRange.start) / step).roundToInt() * step).coerceIn(valueRange)
        } else clamped
    }
    if (!supportsFullLiquidGlass()) {
        var dragging by remember { mutableStateOf(false) }
        var dragValue by remember(valueRange) { mutableFloatStateOf(value.coerceIn(valueRange)) }
        var trackWidth by remember { mutableFloatStateOf(1f) }
        LaunchedEffect(value) {
            if (!dragging) dragValue = value.coerceIn(valueRange)
        }
        fun commit(raw: Float) {
            val snapped = snap(raw)
            dragValue = snapped
            currentOnChange.value(snapped)
        }
        val activeValue = if (dragging) dragValue else value.coerceIn(valueRange)
        val progress = ((activeValue - valueRange.start) / span).coerceIn(0f, 1f)
        val thumbScale by animateFloatAsState(if (dragging) 1.18f else 1f, label = "basic-slider-thumb")
        BoxWithConstraints(
            modifier.fillMaxWidth().height(40.dp).semantics {
                contentDescription = "滑动条"
                progressBarRangeInfo = ProgressBarRangeInfo(
                    activeValue,
                    valueRange,
                    steps = if (step > 0f) (span / step).roundToInt().minus(1).coerceAtLeast(0) else 0,
                )
                setProgress { commit(it); true }
            },
            contentAlignment = Alignment.CenterStart,
        ) {
            val density = LocalDensity.current
            val width = with(density) { maxWidth.toPx() }
            val thumb = with(density) { 16.dp.toPx() }
            trackWidth = (width - thumb).coerceAtLeast(1f)
            Canvas(
                Modifier.fillMaxWidth().height(40.dp)
                    .pointerInput(width, isLtr, valueRange, step) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            down.consume()
                            dragging = true
                            fun rawFromX(x: Float): Float {
                                val frac = ((x - thumb / 2f) / trackWidth).coerceIn(0f, 1f)
                                return (valueRange.start + span * if (isLtr) frac else 1f - frac).coerceIn(valueRange)
                            }
                            var raw = rawFromX(down.position.x)
                            dragValue = raw
                            var lastLiveAt = android.os.SystemClock.uptimeMillis()
                            var lastEmitted = snap(raw)
                            currentOnChange.value(lastEmitted)
                            val pointerId = down.id
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == pointerId } ?: event.changes.firstOrNull() ?: break
                                raw = rawFromX(change.position.x)
                                change.consume()
                                if (!change.pressed) break
                                // 拖动期视觉严格连续跟随手指，不按 step 跳格，彻底消除一顿一顿。
                                dragValue = raw
                                val now = android.os.SystemClock.uptimeMillis()
                                val snapped = snap(raw)
                                if (snapped != lastEmitted && now - lastLiveAt >= 28L) {
                                    lastLiveAt = now
                                    lastEmitted = snapped
                                    currentOnChange.value(snapped)
                                }
                            }
                            val finalSnapped = snap(raw)
                            dragValue = finalSnapped
                            dragging = false
                            if (finalSnapped != lastEmitted) {
                                currentOnChange.value(finalSnapped)
                            }
                        }
                    },
            ) {
                val thickness = 4.dp.toPx()
                val start = thumb / 2f
                val top = (size.height - thickness) / 2f
                val radius = CornerRadius(thickness / 2f)
                drawRoundRect(TRACK_BG, Offset(start, top), Size(trackWidth, thickness), radius)
                val left = if (isLtr) start else start + trackWidth * (1f - progress)
                drawRoundRect(ACCENT, Offset(left, top), Size(trackWidth * progress, thickness), radius)
            }
            Box(
                Modifier.graphicsLayer {
                    val frac = if (isLtr) progress else 1f - progress
                    translationX = trackWidth * frac.coerceIn(0f, 1f)
                    scaleX = thumbScale
                    scaleY = thumbScale
                }
                    .size(16.dp)
                    .shadow(3.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.25f))
                    .clip(CircleShape)
                    .background(Color(0xFFF6F6F6))
                    .border(0.75.dp, Color.White.copy(alpha = 0.72f), CircleShape),
            )
        }
        return
    }
    val animationScope = rememberCoroutineScope()
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember(valueRange) { mutableFloatStateOf(value.coerceIn(valueRange)) }
    var trackWidth by remember { mutableFloatStateOf(1f) }
    fun commit(next: Float) {
        val stepped = snap(next)
        dragValue = stepped
        currentOnChange.value(stepped)
    }
    val animation = remember(animationScope, valueRange, isLtr, step) {
        DampedDragAnimation(
            animationScope = animationScope,
            initialValue = value.coerceIn(valueRange),
            valueRange = valueRange,
            visibilityThreshold = 0.0005f,
            initialScale = 1f,
            pressedScale = LIQUID_THUMB_PRESS_SCALE,
            onDragStarted = {},
            onDragStopped = {},
            onDrag = { _, _ -> },
            onDragCancelled = {},
        )
    }
    LaunchedEffect(value) {
        if (!dragging) {
            dragValue = value.coerceIn(valueRange)
            animation.updateValue(dragValue)
        }
    }
    val backdrop = LocalBackdrop.current
    val trackBackdrop = rememberLayerBackdrop()
    val knobBackdrop = rememberCombinedBackdrop(
        backdrop ?: trackBackdrop,
        rememberBackdrop(trackBackdrop) { drawBackdrop ->
            val progress = animation.pressProgress
            scale(2f / 3f + progress / 3f, progress) { drawBackdrop() }
        },
    )
    BoxWithConstraints(
        modifier.fillMaxWidth().height(40.dp).semantics {
            contentDescription = "滑动条"
            progressBarRangeInfo = ProgressBarRangeInfo(
                if (dragging) dragValue else value.coerceIn(valueRange),
                valueRange,
                steps = if (step > 0f) (span / step).roundToInt().minus(1).coerceAtLeast(0) else 0,
            )
            setProgress { commit(it); true }
        },
        contentAlignment = Alignment.CenterStart,
    ) {
        val density = LocalDensity.current
        val width = with(density) { maxWidth.toPx() }
        val thumb = with(density) { 16.dp.toPx() }
        trackWidth = (width - thumb).coerceAtLeast(1f)
        val visualFraction = if (dragging) {
            ((dragValue - valueRange.start) / span).coerceIn(0f, 1f)
        } else {
            animation.progress.coerceIn(0f, 1f)
        }
        Canvas(
            Modifier.fillMaxWidth().height(40.dp).layerBackdrop(trackBackdrop)
                .pointerInput(width, isLtr, valueRange, step) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        down.consume()
                        dragging = true
                        animation.press()
                        fun rawFromX(x: Float): Float {
                            val frac = ((x - thumb / 2f) / trackWidth).coerceIn(0f, 1f)
                            return (valueRange.start + span * if (isLtr) frac else 1f - frac).coerceIn(valueRange)
                        }
                        var raw = rawFromX(down.position.x)
                        dragValue = raw
                        animation.updateValue(raw)
                        var lastLiveAt = android.os.SystemClock.uptimeMillis()
                        var lastEmitted = snap(raw)
                        currentOnChange.value(lastEmitted)
                        val pointerId = down.id
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == pointerId } ?: event.changes.firstOrNull() ?: break
                            raw = rawFromX(change.position.x)
                            change.consume()
                            if (!change.pressed) break
                            dragValue = raw
                            animation.updateValue(raw)
                            val now = android.os.SystemClock.uptimeMillis()
                            val snapped = snap(raw)
                            if (snapped != lastEmitted && now - lastLiveAt >= 28L) {
                                lastLiveAt = now
                                lastEmitted = snapped
                                currentOnChange.value(snapped)
                            }
                        }
                        val finalSnapped = snap(raw)
                        dragValue = finalSnapped
                        animation.updateValue(finalSnapped)
                        animation.release()
                        dragging = false
                        if (finalSnapped != lastEmitted) {
                            currentOnChange.value(finalSnapped)
                        }
                    }
                },
        ) {
            val thickness = 4.dp.toPx()
            val start = thumb / 2f
            val top = (size.height - thickness) / 2f
            val radius = CornerRadius(thickness / 2f)
            drawRoundRect(TRACK_BG, Offset(start, top), Size(trackWidth, thickness), radius)
            val left = if (isLtr) start else start + trackWidth * (1f - visualFraction)
            drawRoundRect(ACCENT, Offset(left, top), Size(trackWidth * visualFraction, thickness), radius)
        }
        LiquidControlThumb(
            animation = animation,
            backdrop = knobBackdrop,
            diameter = 16.dp,
            velocityDivisor = 10f,
            attachDrag = false,
            modifier = Modifier.graphicsLayer {
                val fraction = if (isLtr) visualFraction else 1f - visualFraction
                translationX = trackWidth * fraction.coerceIn(0f, 1f)
            },
        )
    }
}

@Composable
private fun LiquidControlThumb(
    animation: DampedDragAnimation,
    backdrop: Backdrop,
    diameter: Dp,
    width: Dp = diameter,
    velocityDivisor: Float,
    modifier: Modifier = Modifier,
    attachDrag: Boolean = true,
) {
    Box(
        (if (attachDrag) modifier.then(animation.modifier) else modifier).drawBackdrop(
            backdrop = backdrop,
            shape = { CircleShape },
            effects = {
                val progress = animation.pressProgress
                blur(8.dp.toPx() * (1f - progress))
                lens(5.dp.toPx() * progress, 10.dp.toPx() * progress, chromaticAberration = true)
            },
            highlight = { Highlight.Ambient.copy(
                width = Highlight.Ambient.width / 1.5f,
                blurRadius = Highlight.Ambient.blurRadius / 1.5f,
                alpha = animation.pressProgress,
            ) },
            shadow = { Shadow(radius = 4.dp, color = Color.Black.copy(alpha = 0.05f)) },
            innerShadow = { InnerShadow(radius = 4.dp * animation.pressProgress, alpha = animation.pressProgress) },
            layerBlock = {
                val velocity = animation.velocity / velocityDivisor
                scaleX = animation.scaleX / (1f - (velocity * 0.75f).coerceIn(-0.015f, 0.015f))
                scaleY = animation.scaleY * (1f - (velocity * 0.25f).coerceIn(-0.01f, 0.01f))
            },
            onDrawSurface = { drawRect(Color(0xFFF4F4F4).copy(alpha = 1f - animation.pressProgress)) },
        ).size(width, diameter),
    )
}
