package com.lxlia.player.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.MINE_RADIO_MODES

/**
 * 播放详情页原生层：舞台与歌词由 Web 渲染，这里只保留顶排操作球与空歌词提示。
 * 顶排与二级页顶栏同一水平线（视觉球顶 statusInset + 6vp）。
 */
@Composable
fun PlayerOverlay(vm: AppViewModel, controlsReveal: androidx.compose.runtime.State<Float>) {
    val show = vm.showPlayer
    var mounted by remember { mutableStateOf(false) }
    val reveal = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(show) {
        if (show) {
            mounted = true
            // 从沉浸态退出后再进详情页，控件应该是可见的。
            vm.positionMs = com.lxlia.player.audio.PlaybackController.positionMs
            reveal.animateTo(
                targetValue = 1f,
                animationSpec = spring(dampingRatio = 0.80f, stiffness = Spring.StiffnessMediumLow),
            )
        } else if (mounted) {
            reveal.animateTo(
                targetValue = 0f,
                animationSpec = spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessMedium),
            )
            mounted = false
        }
    }
    if (!mounted) return
    val controlsVisible = vm.stageControlsVisible
    val topOffset = (vm.statusInset + 6).dp
    Box(
        Modifier
            .fillMaxSize()
            .playerChromeVisibility(controlsVisible, controlsReveal, (-12).dp, gateInput = false)
            .graphicsLayer {
                alpha = reveal.value
                translationY = (1f - reveal.value) * 160f
            },
    ) {
        // 无歌词时的占位由舞台自己绘制（与鸿蒙一致），原生层只在解析地址时给一句提示。
        if (show && vm.resolving) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "正在准备音乐…",
                    fontSize = 18.sp,
                    color = TEXT,
                    modifier = Modifier.graphicsLayer { alpha = 0.7f },
                )
            }
        }
        if (!show && reveal.value < 0.05f) return@Box
        val topWash = if (AppAppearance.light) Color(0x70EEF1F6) else Color(0x6E080A0E)
        Box(
            Modifier
                .fillMaxWidth()
                .height((vm.statusInset + 86).dp)
                .background(Brush.verticalGradient(listOf(topWash, Color.Transparent)))
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .blockHiddenPlayerChrome(controlsVisible)
                .pointerInput(Unit) { detectTapGestures { } }
                .padding(
                    start = maxOf(if (vm.wide) 32f else 20f, vm.leftInset + 12f).dp,
                    end = maxOf(if (vm.wide) 32f else 20f, vm.rightInset + 12f).dp,
                    top = topOffset,
                ),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MaterialIconButton("ic_back.svg", "返回", diameter = 38.dp, onClick = { vm.showPlayer = false })
            Spacer(Modifier.weight(1f))
            // 统一对齐鸿蒙顶栏顺序：投播 -> 分享 -> 耳返 -> 动效 -> 沉浸
            CastBall(vm)
            val shareContext = androidx.compose.ui.platform.LocalContext.current
            androidx.compose.runtime.key(vm.foreground) {
                MaterialIconButton("ic_share_official.svg", "分享歌曲", diameter = 38.dp, onClick = {
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        vm.shareCurrent(shareContext)
                    }
                })
            }
            MaterialIconButton(
                icon = if (vm.earMonitorState.active) "mic_on.svg" else "mic.svg",
                label = "耳返",
                diameter = 38.dp,
                selected = vm.earMonitorState.active,
                systemSymbol = false,
                onClick = { vm.openSheet("耳返监听") },
            )
            StyleBall(vm)
            // 横屏与竖屏统一显示沉浸模式入口；双指上滑或返回键退出沉浸。
            MaterialIconButton("fullscreen.svg", "沉浸模式", diameter = 38.dp, onClick = { vm.toggleStageControls(false) })
        }
    }
}

/** 构造与鸿蒙 NativePlayer / AlignedSettings 完全一致的「选择动效」锚点毛玻璃菜单项。 */
internal fun buildStyleMenuItems(
    vm: AppViewModel,
    onShowSmartTip: () -> Unit,
): List<GlassMenuItem> = MINE_RADIO_MODES.map { mode ->
    val selected = vm.styleName == mode.id
    val isSmart = mode.id == com.lxlia.player.audio.SMART_STAGE_MODE_ID
    GlassMenuItem(
        label = mode.label,
        selected = selected,
        subtitle = if (isSmart && selected && vm.resolvedStyleLabel().isNotEmpty()) "当前匹配：${vm.resolvedStyleLabel()}" else "",
        badgeText = if (isSmart) "!" else "",
        showCheck = true,
        onBadgeClick = if (isSmart) onShowSmartTip else null,
        onClick = { vm.setStyleName(mode.id) },
    )
}

@Composable
private fun StyleBall(vm: AppViewModel) {
    var tipOpen by remember { mutableStateOf(false) }
    val styleMenu = rememberGlassMenuTrigger(widthDp = 228f) {
        buildStyleMenuItems(vm) { tipOpen = true }
    }
    MaterialIconButton(
        "ic_style_wand.svg",
        "选择动效",
        modifier = styleMenu.modifier,
        diameter = 38.dp,
        rawNoTint = true,
        systemSymbol = false,
        onClick = { styleMenu.show() },
    )
    if (tipOpen) {
        SmartStageTipDialog(onDismiss = { tipOpen = false })
    }
}

@Composable
internal fun SmartStageTipDialog(onDismiss: () -> Unit) {
    GlassDialog(onDismiss = onDismiss) {
        Text("随声绘色", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TEXT)
        Text(com.lxlia.player.audio.SMART_STAGE_MODE_TIP, fontSize = 14.sp, color = TEXT, lineHeight = 20.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            SheetHeaderTextAction("知道了", color = ACCENT, onClick = onDismiss)
        }
    }
}

/** 投播：安卓用系统音频路由（蓝牙/耳机等），没有可用路由时明确提示。 */
@Composable
private fun CastBall(vm: AppViewModel) {
    var open by remember { mutableStateOf(false) }
    var routes by remember { mutableStateOf<List<String>>(emptyList()) }
    val context = androidx.compose.ui.platform.LocalContext.current
    MaterialIconButton("ic_cast.svg", "投播", diameter = 38.dp, onClick = {
        routes = AudioRoutes.available(context)
        open = true
    })
    if (open) {
        GlassDialog(onDismiss = { open = false }) {
            Text("选择播放设备", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TEXT)
            if (routes.isEmpty()) {
                Text("此设备暂不支持投播，可用蓝牙从系统设置切换输出", color = MUTED, fontSize = 13.sp)
            } else {
                Column {
                    routes.forEach { name ->
                        Text(
                            name,
                            color = TEXT,
                            fontSize = 15.sp,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp).tapNoRipple {
                                AudioRoutes.select(context, name)
                                open = false
                            },
                        )
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                SheetHeaderTextAction("关闭", color = ACCENT) { open = false }
            }
        }
    }
}
