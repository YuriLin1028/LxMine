package com.lxlia.player.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.MINE_RADIO_MODES
import kotlinx.coroutines.delay

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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .blockHiddenPlayerChrome(controlsVisible)
                .padding(
                    start = if (vm.wide) 32.dp else 20.dp,
                    end = if (vm.wide) 32.dp else 20.dp,
                    top = topOffset,
                ),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MaterialIconButton("ic_back.svg", "返回", diameter = 38.dp, onClick = { vm.showPlayer = false })
            Spacer(Modifier.weight(1f))
            QualityBall(vm)
            CastBall(vm)
            MaterialIconButton("ic_share_official.svg", "分享歌曲", diameter = 38.dp, onClick = { vm.shareCurrent() })
            MaterialIconButton("ic_comment_official.svg", "查看评论", diameter = 38.dp, onClick = { vm.commentsOpen = true })
            StyleBall(vm)
            if (vm.landscape) {
                MaterialIconButton("fullscreen.svg", "沉浸模式", diameter = 38.dp, onClick = { vm.toggleStageControls(false) })
            }
        }
    }
}

@Composable
private fun QualityBall(vm: AppViewModel) {
    val menu = rememberGlassMenuTrigger {
        listOf("标准 128k" to "128k", "高品质 320k" to "320k", "无损 flac" to "flac").map { (label, value) ->
            GlassMenuItem(label, selected = vm.quality == value) { vm.setQuality(value) }
        }
    }
    GlassBall(modifier = menu.modifier, diameter = 38.dp, onClick = { menu.show() }) {
        Text("SQ", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = LocalGlassInk.current, letterSpacing = 0.4.sp)
    }
}

@Composable
private fun StyleBall(vm: AppViewModel) {
    val menu = rememberGlassMenuTrigger {
        MINE_RADIO_MODES.map { mode ->
            GlassMenuItem(mode.label, selected = vm.styleName == mode.id) { vm.setStyleName(mode.id) }
        }
    }
    MaterialIconButton("ic_style_wand.svg", "选择动效", modifier = menu.modifier, diameter = 38.dp, onClick = { menu.show() })
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
                androidx.compose.foundation.layout.Column {
                    routes.forEach { name ->
                        Text(
                            name,
                            color = TEXT,
                            fontSize = 15.sp,
                            modifier = Modifier.padding(vertical = 10.dp).tapNoRipple {
                                AudioRoutes.select(context, name)
                                open = false
                            },
                        )
                    }
                }
            }
            Box(Modifier.fillMaxWidth()) {
                Text(
                    "关闭",
                    color = ACCENT,
                    fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.CenterEnd).tapNoRipple { open = false }.padding(8.dp),
                )
            }
        }
    }
}
