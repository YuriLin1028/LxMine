package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
 * 首页快捷胶囊：5 枚各自独立的毛玻璃胶囊（鸿蒙端每枚 Button 自带 systemMaterial），
 * 当前板块为不透明白色胶囊。点击滚动到对应板块。
 */
@Composable
fun HomeChips(active: String, onChip: (String) -> Unit) {
    // 五个胶囊等宽，均匀铺满整行横向宽度。
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CHIPS.forEach { chip ->
            val selected = chip.anchor == active
            val content: @Composable () -> Unit = {
                Box(
                    Modifier.fillMaxWidth().height(36.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 4.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AssetIcon(
                            if (selected) chip.iconOn else chip.icon,
                            size = 14.dp,
                            tint = if (selected) null else LocalGlassInk.current,
                        )
                        Text(
                            chip.label,
                            fontSize = 12.sp,
                            color = if (selected) Color(0xFF08090B) else LocalGlassInk.current,
                            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                            maxLines = 1,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                }
            }
            if (selected) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(36.dp)
                        .background(Color(0xFFF2F1F7), CircleShape)
                        .tapNoRipple { onChip(chip.anchor) },
                ) { content() }
            } else {
                GlassSurface(
                    modifier = Modifier.weight(1f).height(36.dp).tapNoRipple { onChip(chip.anchor) },
                    shape = CircleShape,
                    tone = GlassTone.UltraThin,
                    interactive = true,
                ) { content() }
            }
        }
    }
}
