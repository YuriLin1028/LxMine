@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.audio.EarMonitorEngine
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 播放页实时耳返固定玻璃独立页内容（与「播放队列」「更多」同享上模糊下穿透滚动架构）。
 */
@Composable
fun EarMonitorSheetContent(
    vm: AppViewModel,
    modifier: Modifier = Modifier,
    topPadding: Dp = 74.dp,
    bottomPadding: Dp = 28.dp,
) {
    val st = vm.earMonitorState
    val micPct = (st.micVolume * 100f).roundToInt().coerceIn(0, 150)
    val vocalPct = (st.vocalVolume * 100f).roundToInt().coerceIn(0, 150)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 24.dp, end = 24.dp, top = topPadding, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AssetIcon(
                if (st.active) "mic_on.svg" else "mic.svg",
                size = 20.dp,
                tint = if (st.active) ACCENT else TEXT,
                systemSymbol = false,
            )
            Text(
                st.statusText.ifEmpty { "佩戴耳机开启低延迟实时耳返监听" },
                fontSize = 12.sp,
                color = if (st.active) ACCENT else MUTED,
                modifier = Modifier.weight(1f),
            )
        }

        // 5 档耳返效果切换
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CARD_SURFACE_STRONG)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("混响效果", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MUTED)
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                EarMonitorEngine.MODES.forEach { (id, label, _) ->
                    val selected = st.mode == id
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (selected) ACCENT else CHIP_BG)
                            .border(
                                0.7.dp,
                                if (selected) ACCENT else BORDER_SUBTLE,
                                RoundedCornerShape(16.dp),
                            )
                            .clickable { vm.requestEarMonitorMode(id) }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(
                            label,
                            fontSize = 13.sp,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (selected) ON_ACCENT else TEXT,
                        )
                    }
                }
            }
            val currentDesc = EarMonitorEngine.MODES.firstOrNull { it.first == st.mode }?.third.orEmpty()
            if (currentDesc.isNotEmpty()) {
                Text(currentDesc, fontSize = 11.sp, color = MUTED)
            }
        }

        // 麦克风音量 + 原唱人声（带常驻刷新符号重置按钮）
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CARD_SURFACE_STRONG)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("麦克风音量", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TEXT, modifier = Modifier.weight(1f))
                    Text("$micPct%", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ACCENT)
                    SliderResetIcon(active = abs(st.micVolume - 1f) > 0.01f, onClick = { vm.setEarMonitorMicVolume(1f) })
                }
                GlassSlider(
                    value = micPct.toFloat(),
                    onValueChange = { vm.setEarMonitorMicVolume(it / 100f) },
                    valueRange = 0f..150f,
                    step = 1f,
                )
            }

            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("原唱人声（拉低保留伴奏）", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TEXT, modifier = Modifier.weight(1f))
                    Text("$vocalPct%", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = ACCENT)
                    SliderResetIcon(active = abs(st.vocalVolume - 1f) > 0.01f, onClick = { vm.setEarMonitorVocalVolume(1f) })
                }
                GlassSlider(
                    value = vocalPct.toFloat(),
                    onValueChange = { vm.setEarMonitorVocalVolume(it / 100f) },
                    valueRange = 0f..150f,
                    step = 1f,
                )
            }
        }

        Text(
            "Beta 测试功能：建议佩戴有线或低延迟耳机使用，避免外放啸叫。",
            fontSize = 11.sp,
            color = MUTED,
        )
    }
}

@Composable
internal fun SliderResetIcon(
    active: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(CHIP_BG)
            .alpha(if (active) 1f else 0.55f)
            .tapNoRipple(onClick),
        contentAlignment = Alignment.Center,
    ) {
        AssetIcon(
            "refresh.svg",
            size = 14.dp,
            tint = if (active) ACCENT else MUTED,
            systemSymbol = false,
        )
    }
}
