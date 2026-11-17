package com.lxlia.player.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

/**
 * 应用内浮层宿主：菜单/弹窗/底部弹层都留在主窗口里（Compose Popup / Dialog 是独立窗口，
 * 拿不到主窗口的 backdrop，只能退化成实心深色面板）。
 */
class GlassOverlayState {
    var menu by mutableStateOf<GlassMenuRequest?>(null)
        private set

    fun showMenu(anchor: Rect, items: List<GlassMenuItem>) {
        menu = GlassMenuRequest(anchor, items)
    }

    fun dismissMenu() {
        menu = null
    }
}

data class GlassMenuItem(
    val label: String,
    val selected: Boolean = false,
    val enabled: Boolean = true,
    val onClick: () -> Unit,
)

data class GlassMenuRequest(val anchor: Rect, val items: List<GlassMenuItem>)

val LocalGlassOverlay = staticCompositionLocalOf { GlassOverlayState() }

class GlassMenuTrigger(val modifier: Modifier, val show: () -> Unit)

/**
 * 给按钮挂一个液态玻璃菜单：记录锚点位置，点击时把菜单交给根部的 [GlassOverlayHost]。
 * 用法：`val menu = rememberGlassMenuTrigger { listOf(...) }`，
 * 然后 `Modifier.then(menu.modifier).tapNoRipple { menu.show() }`。
 */
@Composable
fun rememberGlassMenuTrigger(items: () -> List<GlassMenuItem>): GlassMenuTrigger {
    val overlay = LocalGlassOverlay.current
    val latestItems = rememberUpdatedState(items)
    var anchor by remember { mutableStateOf(Rect.Zero) }
    val modifier = remember {
        Modifier.onGloballyPositioned { coordinates ->
            anchor = coordinates.boundsInWindow()
        }
    }
    return remember(overlay, modifier) {
        GlassMenuTrigger(modifier) {
            overlay.showMenu(anchor, latestItems.value())
        }
    }
}

/** 根部宿主：必须放在所有内容之后（最上层），且位于 LocalBackdrop 作用域内。 */
@Composable
fun GlassOverlayHost(state: GlassOverlayState) {
    val request = state.menu ?: return
    BackHandler(enabled = true) { state.dismissMenu() }
    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val screenWidth = with(density) { configuration.screenWidthDp.dp.toPx() }
    val screenHeight = with(density) { configuration.screenHeightDp.dp.toPx() }
    val margin = with(density) { 12.dp.toPx() }
    val gap = with(density) { 8.dp.toPx() }
    val cardWidth = 224.dp
    val itemHeight = 42.dp
    val pad = 8.dp
    val cardHeight = pad * 2 + itemHeight * request.items.size
    val cardWidthPx = with(density) { cardWidth.toPx() }
    val cardHeightPx = with(density) { cardHeight.toPx() }
    val x = request.anchor.left
        .coerceIn(margin, (screenWidth - cardWidthPx - margin).coerceAtLeast(margin))
    val below = request.anchor.bottom + gap
    val above = request.anchor.top - gap - cardHeightPx
    val fitsBelow = below + cardHeightPx <= screenHeight - margin
    val y = if (fitsBelow) below else above.coerceAtLeast(margin)

    val appear = remember(request) { Animatable(0f) }
    LaunchedEffect(request) {
        appear.animateTo(1f, spring(dampingRatio = 0.72f, stiffness = 520f))
    }

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x59000000))
                .tapNoRipple { state.dismissMenu() },
        )
        GlassSurface(
            modifier = Modifier
                .offsetPx(x, y)
                .width(cardWidth)
                .graphicsLayer {
                    alpha = appear.value
                    val scale = 0.94f + 0.06f * appear.value
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0.5f, if (fitsBelow) 0f else 1f)
                },
            shape = RoundedCornerShape(22.dp),
            tone = GlassTone.Menu,
            floating = true,
            nested = true,
        ) {
            Column(Modifier.fillMaxWidth().padding(pad)) {
                request.items.forEach { item ->
                    GlassMenuRow(item) {
                        state.dismissMenu()
                        item.onClick()
                    }
                }
            }
        }
    }
}

@Composable
private fun GlassMenuRow(item: GlassMenuItem, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(42.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (pressed) Color(0x1FFFFFFF) else Color.Transparent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = item.enabled,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            item.label,
            fontSize = 14.sp,
            color = when {
                !item.enabled -> MUTED.copy(alpha = 0.45f)
                item.selected -> ACCENT
                else -> TEXT
            },
            fontWeight = if (item.selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

fun Modifier.offsetPx(x: Float, y: Float): Modifier = this.then(
    Modifier.graphicsLayer {
        translationX = x
        translationY = y
    }
)

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

/** 应用内液态玻璃对话框（居中卡片 + 压暗层），不是独立窗口，能真实采样主窗口背景。 */
@Composable
fun GlassDialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    maxWidth: Dp = 400.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(enabled = true) { onDismiss() }
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        appear.animateTo(1f, spring(dampingRatio = 0.8f, stiffness = 420f))
    }
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xA6000000))
                .tapNoRipple(onDismiss),
        )
        GlassSurface(
            modifier = modifier
                .align(Alignment.Center)
                .padding(16.dp)
                .widthIn(max = maxWidth)
                .fillMaxWidth()
                .graphicsLayer {
                    alpha = appear.value
                    val scale = 0.95f + 0.05f * appear.value
                    scaleX = scale
                    scaleY = scale
                },
            shape = RoundedCornerShape(28.dp),
            tone = GlassTone.Thick,
            floating = true,
            nested = true,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .tapNoRipple { }
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                content = content,
            )
        }
    }
}

/** 应用内液态玻璃底部弹层（替代 ModalBottomSheet 的独立窗口）。 */
@Composable
fun GlassSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    wide: Boolean = false,
    large: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(enabled = true) { onDismiss() }
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        appear.animateTo(1f, spring(dampingRatio = 0.86f, stiffness = 380f))
    }
    val imeBottom = androidx.compose.foundation.layout.WindowInsets.ime
        .asPaddingValues()
        .calculateBottomPadding()
    val navigationBottom = androidx.compose.foundation.layout.WindowInsets.navigationBars
        .asPaddingValues()
        .calculateBottomPadding()
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x99000000))
                .tapNoRipple(onDismiss),
        )
        GlassSurface(
            modifier = modifier
                .align(if (wide) Alignment.Center else Alignment.BottomCenter)
                .widthIn(max = if (wide) 580.dp else Dp.Infinity)
                .fillMaxWidth()
                .then(if (large) Modifier.heightIn(max = if (wide) 560.dp else Dp.Infinity)
                    .fillMaxHeight(if (wide) 1f else 0.9f) else Modifier)
                .padding(bottom = imeBottom)
                .graphicsLayer {
                    alpha = appear.value
                    translationY = (1f - appear.value) * 140f
                },
            shape = if (wide) RoundedCornerShape(30.dp) else RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
            tone = GlassTone.Menu,
            floating = true,
            nested = true,
        ) {
            Column(Modifier.fillMaxWidth().then(if (large) Modifier.fillMaxHeight() else Modifier).tapNoRipple { }) {
                if (!wide) Box(
                    Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 10.dp, bottom = 8.dp)
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0x33FFFFFF)),
                )
                Column(
                    modifier = Modifier.fillMaxWidth()
                        .then(if (large) Modifier.weight(1f) else Modifier)
                        .padding(bottom = if (!wide && imeBottom == 0.dp) navigationBottom else 0.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    content = content,
                )
            }
        }
    }
}
