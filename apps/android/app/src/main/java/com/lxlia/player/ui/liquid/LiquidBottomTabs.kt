/*
 * Adapted from Kyant0/AndroidLiquidGlass 1.0.6.
 * Commit 896a94a3ade1cc1a940b92365f942a34971fecda, Apache-2.0.
 * LxMine adapts the package, Harmony geometry, colors and current callbacks.
 */
package com.lxlia.player.ui.liquid

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.fastCoerceIn
import androidx.compose.ui.util.fastRoundToInt
import androidx.compose.ui.util.lerp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.lxlia.player.ui.liquid.DampedDragAnimation
import com.lxlia.player.ui.liquid.InteractiveHighlight
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.lxlia.player.ui.GlassSurface
import com.lxlia.player.ui.GlassTone
import com.lxlia.player.ui.AppAppearance
import com.lxlia.player.ui.GLASS_PRESS_SCALE
import com.lxlia.player.ui.LIQUID_THUMB_PRESS_SCALE
import com.lxlia.player.ui.LocalBackdrop
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.sign

@Composable
fun LiquidBottomTabs(
    selectedTabIndex: () -> Int,
    onTabSelected: (index: Int) -> Unit,
    backdrop: Backdrop,
    tabsCount: Int,
    modifier: Modifier = Modifier,
    accentColor: Color,
    content: @Composable RowScope.() -> Unit
) {
    val currentOnTabSelected = rememberUpdatedState(onTabSelected)
    val currentSelectedTabIndex = rememberUpdatedState(selectedTabIndex)
    val tabsBackdrop = rememberLayerBackdrop()

    BoxWithConstraints(
        modifier,
        contentAlignment = Alignment.CenterStart
    ) {
        val density = LocalDensity.current
        val tabWidth = with(density) {
            (constraints.maxWidth.toFloat() - 8f.dp.toPx()) / tabsCount
        }

        val offsetAnimation = remember { Animatable(0f) }
        val panelOffset by remember(density, constraints.maxWidth) {
            derivedStateOf {
                val fraction = (offsetAnimation.value / constraints.maxWidth).fastCoerceIn(-1f, 1f)
                with(density) {
                    4f.dp.toPx() * fraction.sign * EaseOut.transform(abs(fraction))
                }
            }
        }

        val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
        val animationScope = rememberCoroutineScope()
        var currentIndex by remember {
            mutableIntStateOf(selectedTabIndex())
        }
        var dragIndex by remember { mutableFloatStateOf(currentIndex.toFloat()) }
        var isPressing by remember { mutableStateOf(false) }
        val tabPadding = with(density) { 4.dp.toPx() }
        val dampedDragAnimation = remember(animationScope, tabWidth, tabsCount, isLtr) {
            DampedDragAnimation(
                animationScope = animationScope,
                initialValue = selectedTabIndex().toFloat(),
                valueRange = 0f..(tabsCount - 1).toFloat(),
                visibilityThreshold = 0.001f,
                initialScale = 1f,
                pressedScale = LIQUID_THUMB_PRESS_SCALE,
                onDragStarted = { position ->
                    val slot = ((position.x - tabPadding) / tabWidth).toInt().fastCoerceIn(0, tabsCount - 1)
                    dragIndex = (if (isLtr) slot else tabsCount - 1 - slot).toFloat()
                    snapToValue(dragIndex)
                    isPressing = true
                },
                onDragStopped = {
                    val targetIndex = dragIndex.fastRoundToInt().fastCoerceIn(0, tabsCount - 1)
                    currentIndex = targetIndex
                    isPressing = false
                    updateValue(targetIndex.toFloat())
                    currentOnTabSelected.value(targetIndex)
                    animationScope.launch {
                        offsetAnimation.animateTo(
                            0f,
                            spring(1f, 300f, 0.5f)
                        )
                    }
                },
                onDrag = { _, dragAmount ->
                    dragIndex = (dragIndex + dragAmount.x / tabWidth * if (isLtr) 1f else -1f)
                        .fastCoerceIn(0f, (tabsCount - 1).toFloat())
                    updateValue(dragIndex)
                    animationScope.launch {
                        offsetAnimation.snapTo(offsetAnimation.value + dragAmount.x)
                    }
                },
                onDragCancelled = {
                    isPressing = false
                    dragIndex = currentIndex.toFloat()
                    updateValue(currentIndex.toFloat())
                    animationScope.launch { offsetAnimation.animateTo(0f, spring(1f, 300f, 0.5f)) }
                },
            )
        }
        LaunchedEffect(dampedDragAnimation) {
            snapshotFlow { currentSelectedTabIndex.value() }
                .collectLatest { index ->
                    currentIndex = index
                    if (!isPressing) dampedDragAnimation.updateValue(index.toFloat())
                }
        }
        DisposableEffect(dampedDragAnimation) {
            onDispose {
                if (isPressing) dampedDragAnimation.endDrag(cancelled = true)
            }
        }

        val interactiveHighlight = remember(animationScope, dampedDragAnimation, tabWidth, isLtr) {
            InteractiveHighlight(
                animationScope = animationScope,
                position = { size, offset ->
                    Offset(
                        if (isLtr) (dampedDragAnimation.value + 0.5f) * tabWidth + panelOffset
                        else size.width - (dampedDragAnimation.value + 0.5f) * tabWidth + panelOffset,
                        size.height / 2f
                    )
                }
            )
        }

        CompositionLocalProvider(LocalBackdrop provides backdrop) {
            // 外层与上方播控胶囊共用材质，选中滑块继续单独采样、折射。
            GlassSurface(
                modifier = Modifier.graphicsLayer {
                    translationX = panelOffset
                    val progress = dampedDragAnimation.pressProgress
                    val scale = lerp(1f, GLASS_PRESS_SCALE, progress)
                    scaleX = scale
                    scaleY = scale
                },
                shape = RoundedCornerShape(28.dp),
                tone = GlassTone.UltraThin,
                interactive = true,
            ) {
                Row(
                    Modifier.then(interactiveHighlight.modifier)
                        .height(56.dp).fillMaxWidth().padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    content = content,
                )
            }
        }

        CompositionLocalProvider(
            LocalBackdrop provides backdrop,
            LocalLiquidBottomTabScale provides {
                // build10 magnifies the sampled labels inside the lens, separately
                // from the restrained deformation of the visible bar.
                lerp(1f, 1.2f, dampedDragAnimation.pressProgress)
            }
        ) {
            Row(
                Modifier
                    .clearAndSetSemantics {}
                    .alpha(0f)
                    .layerBackdrop(tabsBackdrop)
                    .graphicsLayer {
                        translationX = panelOffset
                    }
                    // Keep build10's full-height lens in the captured tab layer.
                    // The ordinary GlassSurface lens is only 12dp deep and loses
                    // the top/bottom refraction when reused as this sampling layer.
                    .drawBackdrop(
                        backdrop = backdrop,
                        shape = { CircleShape },
                        effects = {
                            val progress = dampedDragAnimation.pressProgress
                            vibrancy()
                            blur(8.dp.toPx())
                            lens(24.dp.toPx() * progress, 24.dp.toPx() * progress)
                        },
                        highlight = { Highlight.Default.copy(alpha = dampedDragAnimation.pressProgress) },
                        onDrawSurface = {
                            drawRect(if (AppAppearance.light) Color.Black.copy(alpha = 0.045f)
                                else Color.White.copy(alpha = 0.06f))
                        },
                    )
                    .then(interactiveHighlight.modifier)
                    .height(48.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp)
                    .graphicsLayer(colorFilter = ColorFilter.tint(accentColor)),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        }

        Box(
            Modifier
                .padding(horizontal = 4f.dp)
                .graphicsLayer {
                    translationX =
                        if (isLtr) dampedDragAnimation.value * tabWidth + panelOffset
                        else size.width - (dampedDragAnimation.value + 1f) * tabWidth + panelOffset
                }
                .drawBackdrop(
                    backdrop = rememberCombinedBackdrop(backdrop, tabsBackdrop),
                    shape = { CircleShape },
                    effects = {
                        val progress = dampedDragAnimation.pressProgress
                        lens(
                            10f.dp.toPx() * progress,
                            14f.dp.toPx() * progress,
                            chromaticAberration = true
                        )
                    },
                    highlight = {
                        val progress = dampedDragAnimation.pressProgress
                        Highlight.Default.copy(alpha = progress)
                    },
                    shadow = {
                        val progress = dampedDragAnimation.pressProgress
                        Shadow(alpha = progress)
                    },
                    innerShadow = {
                        val progress = dampedDragAnimation.pressProgress
                        InnerShadow(
                            radius = 8f.dp * progress,
                            alpha = progress
                        )
                    },
                    layerBlock = {
                        scaleX = dampedDragAnimation.scaleX
                        scaleY = dampedDragAnimation.scaleY
                        val velocity = dampedDragAnimation.velocity / 10f
                        // Restore build10's velocity-driven stretch/squash. The
                        // 1% limits used by ordinary controls erase this inertia.
                        scaleX /= 1f - (velocity * 0.75f).fastCoerceIn(-0.2f, 0.2f)
                        scaleY *= 1f - (velocity * 0.25f).fastCoerceIn(-0.2f, 0.2f)
                    },
                    onDrawSurface = {
                        val progress = dampedDragAnimation.pressProgress
                        drawRect(
                            Color.White.copy(0.1f),
                            alpha = 1f - progress
                        )
                        drawRect(Color.Black.copy(alpha = 0.03f * progress))
                    }
                )
                .height(48f.dp)
                .fillMaxWidth(1f / tabsCount)
        )

        // The full bar owns touch input so a press starts at the touched tab.
        // The visible tab buttons retain their accessibility click actions.
        Box(
            Modifier.fillMaxWidth().height(56.dp)
                .then(interactiveHighlight.gestureModifier)
                .pointerInput(dampedDragAnimation) {
                    var travel = Offset.Zero
                    var horizontal = false
                    var cancelled = false
                    inspectDragGestures(
                        onDragStart = { down ->
                            travel = Offset.Zero
                            horizontal = false
                            cancelled = false
                            dampedDragAnimation.beginDrag(down.position)
                        },
                        onDragEnd = {
                            if (!cancelled) dampedDragAnimation.endDrag(cancelled = false)
                        },
                        onDragCancel = {
                            if (!cancelled) dampedDragAnimation.endDrag(cancelled = true)
                        },
                    ) { _, amount ->
                        if (!cancelled) {
                            travel += amount
                            if (horizontal) {
                                dampedDragAnimation.dragBy(size, amount)
                            } else if (maxOf(abs(travel.x), abs(travel.y)) > viewConfiguration.touchSlop) {
                                horizontal = abs(travel.x) > abs(travel.y) * 1.2f
                                if (horizontal) {
                                    dampedDragAnimation.dragBy(size, Offset(travel.x, 0f))
                                } else {
                                    cancelled = true
                                    dampedDragAnimation.endDrag(cancelled = true)
                                }
                            }
                        }
                    }
                }
        )
    }
}
