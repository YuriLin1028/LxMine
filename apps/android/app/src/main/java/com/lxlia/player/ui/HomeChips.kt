package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class ChipItem(val label: String, val anchor: String, val icon: String, val iconOn: String)

private val CHIPS = listOf(
    ChipItem("新歌", "newSongs", "chip_music.svg", "chip_music_on.svg"),
    ChipItem("歌单", "playlists", "chip_library.svg", "chip_library_on.svg"),
    ChipItem("排行榜", "charts", "chip_queue.svg", "chip_queue_on.svg"),
    ChipItem("热门", "hot", "chip_play.svg", "chip_play_on.svg"),
    ChipItem("分类", "category", "chip_more.svg", "chip_more_on.svg"),
)

/**
 * 首页快捷胶囊（严格对齐鸿蒙 HomeChips.ets）：
 * 5 枚等宽独立液态玻璃胶囊，高度 40dp、图标 16dp、文字 14sp；
 * 窄窗（可用宽度 < 370dp）自动隐藏文字仅留图标，防止 3 字标签截断。
 */
@Composable
fun HomeChips(active: String, onChip: (String) -> Unit) {
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    var barWidthDp by remember { mutableFloatStateOf(0f) }
    val hideLabels = barWidthDp > 0f && barWidthDp < 370f

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .onSizeChanged { barWidthDp = it.width / density },
        horizontalArrangement = Arrangement.spacedBy(if (hideLabels) 8.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CHIPS.forEach { chip ->
            val selected = chip.anchor == active
            val content: @Composable () -> Unit = {
                Box(
                    Modifier.fillMaxWidth().height(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AssetIcon(
                            if (selected) chip.iconOn else chip.icon,
                            size = 16.dp,
                            tint = if (selected) ON_ACCENT else LocalGlassInk.current,
                            systemSymbol = false,
                        )
                        if (!hideLabels) {
                            Text(
                                chip.label,
                                fontSize = 14.sp,
                                color = if (selected) ON_ACCENT else LocalGlassInk.current,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                maxLines = 1,
                                modifier = Modifier.padding(start = 5.dp),
                            )
                        }
                    }
                }
            }
            if (selected) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(40.dp)
                        .pressDeform()
                        .background(ACCENT, CircleShape)
                        .tapNoRipple { onChip(chip.anchor) },
                ) { content() }
            } else {
                GlassSurface(
                    modifier = Modifier.weight(1f).height(40.dp).tapNoRipple { onChip(chip.anchor) },
                    shape = CircleShape,
                    tone = GlassTone.UltraThin,
                    interactive = true,
                ) { content() }
            }
        }
    }
}
