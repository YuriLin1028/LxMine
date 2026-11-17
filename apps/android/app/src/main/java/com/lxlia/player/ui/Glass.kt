package com.lxlia.player.ui

import android.os.Build
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.BackdropEffectScope
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import com.lxlia.player.ui.liquid.InteractiveHighlight
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tanh
import kotlin.math.min

/**
 * 背景光晕：鸿蒙端 systemMaterial 从窗口取色，安卓端用封面取色做色膜。
 */
val LocalBackdropTint = compositionLocalOf { Pair(Color(0xFFF4D28A), Color(0xFF8FB2A6)) }

/**
 * 液态玻璃的采样源。AppScreen 录制包含 WebView 舞台的背景，
 * 页面内控件采样背景，浮动底栏同时采样页面内容。
 */
val LocalBackdrop = compositionLocalOf<Backdrop?> { null }

/**
 * 玻璃上的前景色：浅色玻璃（按钮/胶囊）上是深色图标与文字，
 * 深色玻璃（菜单/弹窗）上仍是白色。由 [GlassSurface] 自动下发。
 */
val LocalGlassInk = compositionLocalOf { Color(0xFFF4F4F4) }

/** 除内部滑块/开关滑块外，所有按钮统一的按压形变比例。 */
const val GLASS_PRESS_SCALE = 1.03f
// The refracting thumb has its own expansion; ordinary controls stay subtle.
const val LIQUID_THUMB_PRESS_SCALE = 1.45f
internal fun supportsFullLiquidGlass(apiLevel: Int = Build.VERSION.SDK_INT): Boolean = apiLevel >= 33

/**
 * 玻璃色调，直接对应 Kyant0/AndroidLiquidGlass 的组件材质：
 * - UltraThin/Thin 对应 `LiquidButton`：白色 surfaceColor + blur(2dp) + lens(12dp, 24dp)
 * - Thick/Menu/Panel 对应底部弹层：深色 surfaceColor + blur(4dp) + lens(16dp, 32dp)
 * 不再手工叠「深色膜 + 1dp 白描边」，表面膜全部走 `onDrawSurface { drawRect(surfaceColor) }`。
 */
enum class GlassTone {
    UltraThin,
    Thin,
    Thick,
    Menu,
    Panel,
}

private val GlassTone.isLight: Boolean
    get() = this == GlassTone.UltraThin || this == GlassTone.Thin

private val GlassTone.surfaceColor: Color
    get() = if (AppAppearance.light) when (this) {
        GlassTone.UltraThin -> Color.Black.copy(alpha = 0.045f)
        GlassTone.Thin -> Color.Black.copy(alpha = 0.06f)
        GlassTone.Thick -> Color(0xFFE3E6EB).copy(alpha = 0.88f)
        GlassTone.Menu -> Color(0xFFE5E8EC).copy(alpha = 0.92f)
        GlassTone.Panel -> Color(0xFFD3D8DF).copy(alpha = 0.55f)
    } else when (this) {
        // 透明优先：白色膜只留 6%~10%，背景/内容要能直接透出来。
        GlassTone.UltraThin -> Color.White.copy(alpha = 0.06f)
        GlassTone.Thin -> Color.White.copy(alpha = 0.10f)
        GlassTone.Thick -> Color(0xFF101215).copy(alpha = 0.78f)
        GlassTone.Menu -> Color(0xFF101215).copy(alpha = 0.84f)
        GlassTone.Panel -> Color(0xFF101215).copy(alpha = 0.34f)
    }

private val GlassTone.blurRadius: Dp
    get() = when (this) {
        GlassTone.UltraThin, GlassTone.Thin -> 2.dp
        else -> 4.dp
    }

private val GlassTone.lensHeight: Dp
    get() = when (this) {
        GlassTone.UltraThin, GlassTone.Thin -> 12.dp
        else -> 16.dp
    }

private val GlassTone.lensAmount: Dp
    get() = when (this) {
        GlassTone.UltraThin, GlassTone.Thin -> 24.dp
        else -> 32.dp
    }

/** 圆角半径（px）：lens 的折射高度不能超过最小圆角，否则边角会断。 */
private fun BackdropEffectScope.minCornerPx(shape: CornerBasedShape): Float = min(
    min(
        shape.topStart.toPx(size, this),
        shape.topEnd.toPx(size, this),
    ),
    min(
        shape.bottomStart.toPx(size, this),
        shape.bottomEnd.toPx(size, this),
    ),
)

/**
 * 液态玻璃面（Kyant0/AndroidLiquidGlass · Backdrop 1.0.6）。
 *
 * 参数与库里的 `LiquidButton` / 底部弹层保持一致：effects 里只有
 * vibrancy → blur → lens，表面膜由 `onDrawSurface` 一次画完。
 *
 * @param nested 面板类容器传 true：内部再放玻璃球/按钮时采样本面板，
 *   这是库文档里避免自采样递归的正确写法。
 * @param tintOverride 对应 `LiquidButton(tint = ...)`：用 BlendMode.Hue 给整块玻璃上色。
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(28.dp),
    tone: GlassTone = GlassTone.UltraThin,
    liquid: Boolean = true,
    nested: Boolean = false,
    floating: Boolean = false,
    interactive: Boolean = false,
    highlight: Boolean = true,
    tintOverride: Color? = null,
    content: @Composable BoxScope.() -> Unit = {},
) {
    val fullGlass = supportsFullLiquidGlass()
    val rootBackdrop = if (liquid && fullGlass) LocalBackdrop.current else null
    val exported = if (nested) rememberLayerBackdrop() else null
    val canBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val surfaceColor = if (fullGlass) tone.surfaceColor else if (AppAppearance.light) Color(0xFFD3D8DF) else Color(0xFF25272B)
    // 透明玻璃下面是暗色背景，前景统一用白色；只有选中态的不透明白胶囊用深色字。
    val ink = TEXT
    val animationScope = rememberCoroutineScope()
    val interaction = remember(animationScope) { InteractiveHighlight(animationScope) }
    val pressModifier = if (interactive && fullGlass) {
        interaction.modifier.then(interaction.gestureModifier)
    } else if (interactive) Modifier.pressDeform() else Modifier

    val surface = if (rootBackdrop != null && canBlur) {
        modifier.drawBackdrop(
            backdrop = rootBackdrop,
            shape = { shape },
            layerBlock = if (interactive) {
                {
                    // LiquidButton 1.0.6: deformation follows the pointer, with inverse backdrop sampling.
                    val progress = interaction.pressProgress
                    val scale = 1f + (GLASS_PRESS_SCALE - 1f) * progress
                    val offset = interaction.offset
                    val maximumOffset = size.minDimension
                    translationX = maximumOffset * tanh(0.05f * offset.x / maximumOffset)
                    translationY = maximumOffset * tanh(0.05f * offset.y / maximumOffset)
                    val dragScale = GLASS_PRESS_SCALE - 1f
                    val angle = atan2(offset.y, offset.x)
                    scaleX = scale + dragScale * abs(cos(angle) * (offset.x / size.maxDimension).coerceIn(-0.25f, 0.25f)) *
                        (size.width / size.height).coerceAtMost(1f)
                    scaleY = scale + dragScale * abs(sin(angle) * (offset.y / size.maxDimension).coerceIn(-0.25f, 0.25f)) *
                        (size.height / size.width).coerceAtMost(1f)
                }
            } else null,
            effects = {
                // 与 LiquidButton 一致；每项单独容错，避免一个异常把后面全吞掉。
                runCatching { vibrancy() }
                runCatching { blur(tone.blurRadius.toPx()) }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && shape is CornerBasedShape) {
                    val radius = minCornerPx(shape)
                    val height = min(radius * 0.92f, tone.lensHeight.toPx())
                    if (height > 1f) {
                        runCatching {
                            lens(
                                refractionHeight = height,
                                refractionAmount = min(height * 2f, tone.lensAmount.toPx()),
                                chromaticAberration = false,
                            )
                        }
                    }
                }
            },
            // 与底部栏完全一致：直接用库原版 Highlight.Default，不自己加宽/柔化。
            highlight = {
                if (highlight && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Highlight.Default else null
            },
            shadow = {
                if (floating) {
                    Shadow(
                        radius = 26.dp,
                        offset = DpOffset(0.dp, 12.dp),
                        color = Color.Black,
                        alpha = 0.36f,
                    )
                } else null
            },
            innerShadow = { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) InnerShadow.Default else null },
            exportedBackdrop = exported,
            onDrawSurface = {
                if (tintOverride != null && tintOverride.isSpecified) {
                    drawRect(tintOverride, blendMode = BlendMode.Hue)
                    drawRect(tintOverride)
                } else {
                    drawRect(surfaceColor)
                }
            },
        ).then(pressModifier)
    } else {
        // Android 12 and earlier use a stable surface and ordinary press feedback.
        modifier
            .clip(shape)
            .background(if (tintOverride != null) tintOverride else surfaceColor)
            .then(if (!fullGlass) Modifier.border(0.75.dp, if (AppAppearance.light) Color.Black.copy(alpha = .1f) else Color.White.copy(alpha = .12f), shape) else Modifier)
            .then(pressModifier)
    }

    CompositionLocalProvider(
        LocalGlassInk provides ink,
        LocalBackdrop provides if (nested) exported else LocalBackdrop.current,
    ) {
        Box(modifier = surface, content = content)
    }
}

/** 圆形液态玻璃球，使用统一的轻微按压放大与弹簧回弹。 */
@Composable
fun GlassBall(
    modifier: Modifier = Modifier,
    diameter: Dp = 38.dp,
    enabled: Boolean = true,
    liquid: Boolean = true,
    onClick: () -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    GlassSurface(
        modifier = modifier.size(diameter),
        shape = CircleShape,
        tone = if (pressed) GlassTone.Thin else GlassTone.UltraThin,
        liquid = liquid,
        interactive = enabled,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    onClick = onClick,
                ),
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}

/** 图标 + 可选液态玻璃底，对应鸿蒙 MaterialIcon（grouped = 已有玻璃容器，不再套球底）。 */
@Composable
fun MaterialIconButton(
    icon: String,
    label: String,
    modifier: Modifier = Modifier,
    diameter: Dp = 38.dp,
    tint: Color = Color.Unspecified,
    selected: Boolean = false,
    enabled: Boolean = true,
    grouped: Boolean = false,
    rawNoTint: Boolean = false,
    systemSymbol: Boolean = true,
    onClick: () -> Unit = {},
) {
    val iconSize = when {
        rawNoTint -> if (diameter > 56.dp) 22.dp else 20.dp
        diameter > 56.dp -> 26.dp
        diameter == 38.dp -> 20.dp
        else -> 21.dp
    }
    val ink = LocalGlassInk.current
    val iconAsset = if (!systemSymbol) icon else when (icon) {
        "ic_download.svg" -> "symbol_download.svg"
        "ic_queue.svg" -> "symbol_queue.svg"
        "ic_more.svg" -> "symbol_more.svg"
        else -> icon
    }
    val buttonModifier = modifier.semantics { contentDescription = label }
    val iconTint = when {
        rawNoTint -> null
        selected -> ACCENT
        tint.isSpecified -> tint
        else -> ink
    }
    val content: @Composable BoxScope.() -> Unit = {
        AssetIcon(
            name = if (rawNoTint) icon else iconAsset,
            size = iconSize,
            tint = iconTint,
            alpha = if (enabled) 1f else 0.4f,
            systemSymbol = systemSymbol,
        )
    }
    if (grouped) {
        Box(
            modifier = buttonModifier
                .size(diameter)
                .pressDeform()
                .then(if (enabled) Modifier.tapNoRipple { onClick() } else Modifier),
            contentAlignment = Alignment.Center,
        ) { Box(Modifier, content = content) }
    } else {
        GlassBall(modifier = buttonModifier, diameter = diameter, enabled = enabled, onClick = onClick, content = content)
    }
}

/** 普通图标的按压形变（不消费点击，可与 tapNoRipple/clickable 叠加）。 */
fun Modifier.pressDeform(pressedScale: Float = GLASS_PRESS_SCALE): Modifier = composed {
    var down by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (down) pressedScale else 1f,
        animationSpec = spring(dampingRatio = 0.5f, stiffness = 500f),
        label = "press-deform",
    )
    this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                down = true
                waitForUpOrCancellation()
                down = false
            }
        }
}

/** 轻点不带动画的点击修饰符，避免与自定义按压缩放叠加。 */
fun Modifier.tapNoRipple(onTap: () -> Unit): Modifier = composed {
    // 必须用 rememberUpdatedState 取最新回调：pointerInput(Unit) 只安装一次，
    // 直接捕获 lambda 会把第一次组合时的行/歌单回调永久冻结（点歌单会打开旧歌单）。
    val current by rememberUpdatedState(onTap)
    semantics { onClick { current(); true } }.pointerInput(Unit) {
        detectTapGestures(onTap = { current() })
    }
}

@Composable
fun ProvideBackdropTint(first: Color, last: Color, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalBackdropTint provides Pair(first, last), content = content)
}
