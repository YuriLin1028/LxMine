package com.lxlia.player.ui

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.LocalOverscrollFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import kotlin.math.hypot

/**
 * 窗口内固定玻璃弹层 / 对话框条目：统一托管到根部 [GlassModalHost]，
 * 从而直接采样主窗口 [LocalBackdrop] 渲染实时毛玻璃，彻底摆脱 Material 3 ModalBottomSheet
 * 独立窗口的拖拽撞顶抽搐与实心遮罩。
 */
class GlassModalEntry(
    val id: Long,
    onDismiss: () -> Unit,
    dismissible: Boolean,
    content: @Composable () -> Unit,
) {
    var onDismiss by mutableStateOf(onDismiss)
    var dismissible by mutableStateOf(dismissible)
    var content by mutableStateOf(content)
}

/**
 * 应用内浮层宿主状态：菜单（下拉/锚点浮窗）与固定玻璃独立页 / 对话框都留在主窗口内。
 */
class GlassOverlayState {
    var menu by mutableStateOf<GlassMenuRequest?>(null)
        private set

    val modals = mutableStateListOf<GlassModalEntry>()
    private var nextModalId = 1L

    fun nextId(): Long = nextModalId++

    fun showMenu(anchor: Rect, items: List<GlassMenuItem>, widthDp: Float = 224f) {
        menu = GlassMenuRequest(anchor, items, widthDp)
    }

    fun dismissMenu() {
        menu = null
    }
}

data class GlassMenuItem(
    val label: String,
    val selected: Boolean = false,
    val enabled: Boolean = true,
    val subtitle: String = "",
    val badgeText: String = "",
    val showCheck: Boolean = false,
    val onBadgeClick: (() -> Unit)? = null,
    val onClick: () -> Unit,
)

data class GlassMenuRequest(
    val anchor: Rect,
    val items: List<GlassMenuItem>,
    val widthDp: Float = 224f,
)

val LocalGlassOverlay = staticCompositionLocalOf { GlassOverlayState() }
val LocalRootGlassOverlay = staticCompositionLocalOf { GlassOverlayState() }

class GlassMenuTrigger(val modifier: Modifier, val show: () -> Unit)

/**
 * 给按钮挂一个液态玻璃锚点菜单：记录锚点位置，点击时把菜单交给根部的 [GlassOverlayHost]。
 */
@Composable
fun rememberGlassMenuTrigger(
    widthDp: Float = 224f,
    items: () -> List<GlassMenuItem>,
): GlassMenuTrigger {
    val overlay = LocalGlassOverlay.current
    val latestItems = rememberUpdatedState(items)
    var anchor by remember { mutableStateOf(Rect.Zero) }
    val modifier = remember {
        Modifier.onGloballyPositioned { coordinates ->
            if (coordinates.isAttached) {
                anchor = coordinates.boundsInWindow()
            }
        }
    }
    return remember(overlay, modifier, widthDp) {
        GlassMenuTrigger(modifier) {
            overlay.showMenu(anchor, latestItems.value(), widthDp)
        }
    }
}

/**
 * 固定玻璃独立页 / 对话框的根宿主：放在主内容、顶栏、底栏与评论浮层之后，
 * 紧邻 [GlassOverlayHost] 之下，使下拉锚点菜单可浮于弹层之上且无裁切。
 */
@Composable
fun GlassModalHost(state: GlassOverlayState, modifier: Modifier = Modifier.fillMaxSize()) {
    if (state.modals.isEmpty()) return
    BackHandler(enabled = true) {
        val top = state.modals.lastOrNull() ?: return@BackHandler
        if (top.dismissible) top.onDismiss()
    }
    Box(modifier) {
        state.modals.forEach { entry ->
            key(entry.id) {
                entry.content()
            }
        }
    }
}

@Composable
private fun GlassModalPortal(
    dismissible: Boolean,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    val rootOverlay = LocalRootGlassOverlay.current
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    val entry = remember(rootOverlay) {
        GlassModalEntry(
            id = rootOverlay.nextId(),
            onDismiss = { currentOnDismiss() },
            dismissible = dismissible,
            content = content,
        )
    }
    SideEffect {
        entry.dismissible = dismissible
        entry.content = content
    }
    DisposableEffect(rootOverlay, entry) {
        rootOverlay.modals.add(entry)
        onDispose { rootOverlay.modals.remove(entry) }
    }
}

/** 拦截背后所有点击与滚动穿透，仅在轻点遮罩本身时触发关闭。 */
private fun Modifier.scrimDismissPointer(
    dismissible: Boolean,
    onDismiss: () -> Unit,
): Modifier = this.pointerInput(dismissible) {
    val slopPx = 16.dp.toPx()
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val start = down.position
        var moved = false
        down.consume()
        while (true) {
            val event = awaitPointerEvent()
            val anyPressed = event.changes.any { it.pressed }
            event.changes.forEach { change ->
                if (hypot(change.position.x - start.x, change.position.y - start.y) > slopPx) {
                    moved = true
                }
                change.consume()
            }
            if (!anyPressed) break
        }
        if (dismissible && !moved) onDismiss()
    }
}

/**
 * 根部锚点液态玻璃菜单宿主：必须放在所有内容与 [GlassModalHost] 之后（最上层）。
 * 支持副标题、右侧辅助徽标（如随声绘色 `!` 说明）与超长列表滚动（对齐鸿蒙 maxHeight: 360）。
 */
@Composable
fun GlassOverlayHost(state: GlassOverlayState, modifier: Modifier = Modifier.fillMaxSize()) {
    val request = state.menu ?: return
    BackHandler(enabled = true) { state.dismissMenu() }
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val screenWidth = with(density) { configuration.screenWidthDp.dp.toPx() }
    val screenHeight = with(density) { configuration.screenHeightDp.dp.toPx() }
    var hostBounds by remember { mutableStateOf(Rect.Zero) }
    val hostW = if (hostBounds.width > 0f) hostBounds.width else screenWidth
    val hostH = if (hostBounds.height > 0f) hostBounds.height else screenHeight
    val margin = with(density) { 12.dp.toPx() }
    val gap = with(density) { 8.dp.toPx() }
    val cardWidth = request.widthDp.dp
    val pad = 6.dp
    val estimatedContentDp = request.items.sumOf { if (it.subtitle.isNotEmpty()) 54 else 42 }.dp + pad * 2
    val cardHeight = estimatedContentDp.coerceAtMost(360.dp)
    val cardWidthPx = with(density) { cardWidth.toPx() }
    val cardHeightPx = with(density) { cardHeight.toPx() }
    val localLeft = request.anchor.left - hostBounds.left
    val localRight = request.anchor.right - hostBounds.left
    val localTop = request.anchor.top - hostBounds.top
    val localBottom = request.anchor.bottom - hostBounds.top
    val preferredX = if (request.anchor.width > cardWidthPx) (localRight - cardWidthPx) else localLeft
    val x = preferredX.coerceIn(margin, (hostW - cardWidthPx - margin).coerceAtLeast(margin))
    val below = localBottom + gap
    val above = localTop - gap - cardHeightPx
    val fitsBelow = below + cardHeightPx <= hostH - margin
    val y = if (fitsBelow) below else above.coerceAtLeast(margin)

    val appear = remember(request) { Animatable(0f) }
    LaunchedEffect(request) {
        appear.animateTo(1f, spring(dampingRatio = 0.76f, stiffness = 520f))
    }

    Box(modifier.onGloballyPositioned { if (it.isAttached) hostBounds = it.boundsInWindow() }) {
        Box(
            Modifier
                .fillMaxSize()
                .background(if (AppAppearance.light) Color(0x28000000) else Color(0x4D000000))
                .scrimDismissPointer(dismissible = true) { state.dismissMenu() },
        )
        GlassSurface(
            modifier = Modifier
                .offsetPx(x, y)
                .width(cardWidth)
                .heightIn(max = 360.dp)
                .graphicsLayer {
                    alpha = appear.value
                    val scale = 0.94f + 0.06f * appear.value
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0.5f, if (fitsBelow) 0f else 1f)
                }
                .border(0.6.dp, BORDER_SUBTLE, RoundedCornerShape(22.dp)),
            shape = RoundedCornerShape(22.dp),
            tone = GlassTone.Menu,
            floating = true,
            nested = true,
        ) {
            CompositionLocalProvider(LocalOverscrollFactory provides null) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(pad),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    request.items.forEach { item ->
                        GlassMenuRow(
                            item = item,
                            onBadgeClick = item.onBadgeClick?.let { handler ->
                                {
                                    state.dismissMenu()
                                    handler()
                                }
                            },
                            onClick = {
                                state.dismissMenu()
                                item.onClick()
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GlassMenuRow(
    item: GlassMenuItem,
    onBadgeClick: (() -> Unit)?,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressedBg = if (AppAppearance.light) Color(0x14000000) else Color(0x1FFFFFFF)
    val selectedBg = if (item.showCheck && item.selected) ACCENT.copy(alpha = 0.14f) else Color.Transparent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 42.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (pressed) pressedBg else selectedBg)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = item.enabled,
                onClick = onClick,
            )
            .padding(start = 14.dp, end = 12.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                item.label,
                fontSize = 14.sp,
                color = when {
                    !item.enabled -> MUTED.copy(alpha = 0.45f)
                    item.selected -> ACCENT
                    else -> TEXT
                },
                fontWeight = if (item.selected) FontWeight.Medium else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.subtitle.isNotEmpty()) {
                Text(
                    item.subtitle,
                    fontSize = 11.sp,
                    color = MUTED,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (item.badgeText.isNotEmpty() && onBadgeClick != null) {
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(ACCENT.copy(alpha = 0.2f))
                    .tapNoRipple(onBadgeClick),
                contentAlignment = Alignment.Center,
            ) {
                Text(item.badgeText, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ACCENT)
            }
        }
        if (item.showCheck && item.selected) {
            Text("✓", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = ACCENT)
        }
    }
}

fun Modifier.offsetPx(x: Float, y: Float): Modifier = this.then(
    Modifier.graphicsLayer {
        translationX = x
        translationY = y
    }
)

/**
 * 原地顶部渐进淡出：配合同层的 [layerBackdrop] 与上方 [TopProgressiveBlur]，
 * 让顶部滚动内容被真正的渐进模糊像素无缝替代，彻底消除深色不透明遮罩与清晰文字重影，
 * 同时底部完全不做遮罩（严格对齐鸿蒙「上模糊、下穿透」）。
 */
fun Modifier.topProgressiveFade(blurHeightDp: Float): Modifier =
    if (blurHeightDp <= 0f || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        this
    } else {
        this
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                val h = blurHeightDp.dp.toPx().coerceAtMost(size.height)
                if (h > 1f) {
                    drawRect(
                        brush = Brush.verticalGradient(
                            0.00f to Color.Transparent,
                            0.46f to Color.White.copy(alpha = 0.14f),
                            0.76f to Color.White.copy(alpha = 0.68f),
                            1.00f to Color.White,
                            startY = 0f,
                            endY = h,
                        ),
                        size = Size(size.width, h),
                        blendMode = BlendMode.DstIn,
                    )
                }
            }
    }

/**
 * 顶部单向渐进模糊层（仅上模糊，绝无底部模糊遮罩）：
 * 采样下方 [backdrop] 的清晰画面做强雾化并由上到下渐隐至透明，只保留极轻通透底色以衬托标题可读性。
 */
@Composable
internal fun TopProgressiveBlur(
    backdrop: Backdrop,
    heightDp: Float,
    sheetMode: Boolean = false,
) {
    val light = AppAppearance.light
    val scrimTop = when {
        sheetMode && light -> Color(0x40E5E8EC)
        sheetMode -> Color(0x3D101215)
        light -> Color(0x46DCE0E5)
        else -> Color(0x40151619)
    }
    val scrimMid = when {
        sheetMode && light -> Color(0x16E5E8EC)
        sheetMode -> Color(0x14101215)
        light -> Color(0x16DCE0E5)
        else -> Color(0x14151619)
    }
    val blurDp = if (sheetMode) 18.dp else 20.dp
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(heightDp.dp)
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    drawRect(
                        Brush.verticalGradient(
                            0.00f to Color.White,
                            0.48f to Color.White.copy(alpha = 0.90f),
                            0.78f to Color.White.copy(alpha = 0.36f),
                            1.00f to Color.Transparent,
                        ),
                        blendMode = BlendMode.DstIn,
                    )
                }
                .drawBackdrop(
                    backdrop = backdrop,
                    shape = { RectangleShape },
                    effects = { runCatching { blur(blurDp.toPx()) } },
                    highlight = null,
                    shadow = null,
                )
                .background(Brush.verticalGradient(listOf(scrimTop, scrimMid, Color.Transparent))),
        )
    } else {
        val fallbackTop = when {
            sheetMode && light -> Color(0xDCE5E8EC)
            sheetMode -> Color(0xDC14171C)
            light -> Color(0xDCDCE0E5)
            else -> Color(0xDC151619)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(heightDp.dp)
                .background(Brush.verticalGradient(listOf(fallbackTop, scrimMid, Color.Transparent))),
        )
    }
}

/**
 * 固定玻璃独立页内的「上模糊、下穿透」滚动容器（严格对齐鸿蒙 `Index.ets` / `PlayerMoreSheet.ets`）：
 * 滚动内容铺满全高并从标题下方穿过，顶部经渐进模糊柔和过渡，底部完全通透无遮罩。
 */
@Composable
fun FixedSheetScrollScaffold(
    headerBlurHeight: Float = 78f,
    modifier: Modifier = Modifier.fillMaxSize(),
    header: @Composable BoxScope.() -> Unit,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val scrollBackdrop = rememberLayerBackdrop()
    Column(modifier) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .topProgressiveFade(headerBlurHeight)
                    .layerBackdrop(scrollBackdrop),
                content = content,
            )
            Box(Modifier.align(Alignment.TopCenter).fillMaxWidth()) {
                TopProgressiveBlur(scrollBackdrop, headerBlurHeight, sheetMode = true)
            }
            Box(Modifier.align(Alignment.TopStart).fillMaxWidth(), content = header)
        }
        if (footer != null) {
            footer()
        }
    }
}

/** 轻提示：液态玻璃气泡，用于下载完成/导入结果/需要先建歌单等反馈。 */
@Composable
fun GlassToast(text: String, bottomPadding: Dp, modifier: Modifier = Modifier) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        GlassSurface(
            modifier = modifier
                .padding(bottom = bottomPadding)
                .widthIn(max = 420.dp)
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(50),
            tone = GlassTone.Thick,
            floating = true,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text, fontSize = 13.sp, color = TEXT)
            }
        }
    }
}

/**
 * 主窗口内实时毛玻璃居中对话框（与鸿蒙 musicMenuMaterial() 弹窗一致）：
 * 不再创建遮断 backdrop 的独立系统 Dialog 窗口，支持平滑缩放淡入、返回键与外部点击关闭。
 */
@Composable
fun GlassDialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    maxWidth: Dp = 420.dp,
    dismissible: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val rootOverlay = LocalRootGlassOverlay.current
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    GlassModalPortal(dismissible = dismissible, onDismiss = { currentOnDismiss() }) {
        val maxDialogHeight = (LocalConfiguration.current.screenHeightDp * 0.86f).dp
        val appear = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
            appear.animateTo(1f, spring(dampingRatio = 0.84f, stiffness = 500f))
        }
        Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(if (AppAppearance.light) Color(0x3D000000) else Color(0x66000000))
                    .graphicsLayer { alpha = appear.value }
                    .scrimDismissPointer(dismissible = dismissible) { currentOnDismiss() },
            )
            GlassSurface(
                modifier = modifier
                    .padding(horizontal = 20.dp, vertical = 24.dp)
                    .widthIn(max = maxWidth)
                    .heightIn(max = maxDialogHeight)
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = appear.value
                        val scale = 0.94f + 0.06f * appear.value
                        scaleX = scale
                        scaleY = scale
                    }
                    .border(0.6.dp, BORDER_SUBTLE, RoundedCornerShape(28.dp))
                    .pointerInput(Unit) { detectTapGestures { } },
                shape = RoundedCornerShape(28.dp),
                tone = GlassTone.Menu,
                nested = true,
                floating = true,
            ) {
                CompositionLocalProvider(
                    LocalOverscrollFactory provides null,
                    LocalGlassOverlay provides rootOverlay,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        content = content,
                    )
                }
            }
        }
    }
}

/**
 * 固定式主窗口毛玻璃独立页（对齐鸿蒙 bindSheet + musicMenuMaterial()）：
 * - 出现后容器位置 100% 锁定不动，绝无 Material 3 ModalBottomSheet 拖拽/撞顶抽搐；
 * - 仅内部列表或内容区自由滚动，关闭通过右上角完成/关闭、点击外部暗幕或系统返回手势触发；
 * - 手机端贴底（顶部 28dp 圆角），平板/宽屏居中（四角 28dp 圆角，最宽 580dp）；
 * - 复用主窗口 LocalBackdrop 呈现真毛玻璃半透效果，内部控件通过 nested=true 安全采样无递归。
 */
@Composable
fun GlassSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    wide: Boolean = false,
    large: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val rootOverlay = LocalRootGlassOverlay.current
    val currentOnDismiss by rememberUpdatedState(onDismiss)
    GlassModalPortal(dismissible = true, onDismiss = { currentOnDismiss() }) {
        val density = LocalDensity.current
        val screenHeightDp = LocalConfiguration.current.screenHeightDp
        val maxSheetHeight = (screenHeightDp * 0.86f).dp
        val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val slidePx = with(density) { 28.dp.toPx() }
        val appear = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
            appear.animateTo(1f, spring(dampingRatio = 0.86f, stiffness = 460f))
        }
        val shape = if (wide) {
            RoundedCornerShape(28.dp)
        } else {
            RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 0.dp, bottomEnd = 0.dp)
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(if (!large) Modifier.imePadding() else Modifier),
            contentAlignment = if (wide) Alignment.Center else Alignment.BottomCenter,
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(if (AppAppearance.light) Color(0x3D000000) else Color(0x66000000))
                    .graphicsLayer { alpha = appear.value }
                    .scrimDismissPointer(dismissible = true) { currentOnDismiss() },
            )
            GlassSurface(
                modifier = modifier
                    .then(
                        if (wide) {
                            Modifier
                                .padding(horizontal = 24.dp, vertical = 24.dp)
                                .widthIn(max = 580.dp)
                                .fillMaxWidth()
                                .then(if (large) Modifier.fillMaxHeight(0.84f) else Modifier.heightIn(max = maxSheetHeight))
                        } else {
                            Modifier
                                .fillMaxWidth()
                                .then(if (large) Modifier.fillMaxHeight(0.88f) else Modifier.heightIn(max = maxSheetHeight))
                        },
                    )
                    .graphicsLayer {
                        alpha = appear.value
                        if (wide) {
                            val s = 0.95f + 0.05f * appear.value
                            scaleX = s
                            scaleY = s
                        } else {
                            translationY = (1f - appear.value) * slidePx
                        }
                    }
                    .border(0.6.dp, BORDER_SUBTLE, shape)
                    .pointerInput(Unit) { detectTapGestures { } },
                shape = shape,
                tone = GlassTone.Menu,
                nested = true,
                floating = true,
            ) {
                CompositionLocalProvider(
                    LocalOverscrollFactory provides null,
                    LocalGlassOverlay provides rootOverlay,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(if (large) Modifier.fillMaxHeight() else Modifier.padding(bottom = if (wide) 0.dp else navBottom)),
                        content = content,
                    )
                }
            }
        }
    }
}
