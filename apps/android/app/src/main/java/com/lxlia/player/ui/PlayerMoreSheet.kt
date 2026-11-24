@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.audio.AudioFxConfig
import com.lxlia.player.audio.AudioFxPresets
import kotlin.math.roundToInt

/**
 * 播控栏「更多」固定玻璃独立页内容（严格对齐鸿蒙 PlayerMoreSheet 顺序与样式）：
 * 音质采用与设置页一致的轻弹窗菜单，音效 / 定时关闭以独立固定玻璃页打开。
 */
@Composable
fun PlayerMoreSheet(
    vm: AppViewModel,
    modifier: Modifier = Modifier,
    topPadding: Dp = 74.dp,
    bottomPadding: Dp = 28.dp,
) {
    val song = vm.selected
    val liked = song != null && song.key in vm.likedKeys
    val inLibrary = vm.isSongInUserLibrary(song)
    var autoMixTipOpen by remember { mutableStateOf(false) }

    val qualityLabel = when (vm.quality) {
        "flac" -> "无损 FLAC"
        "320k" -> "高品质 320k"
        else -> "标准 128k"
    }
    val artistDisplay = song?.singer?.trim()?.takeIf { it.isNotEmpty() && it != "未知歌手" } ?: "未知艺人"
    val albumDisplay = song?.albumName?.trim()?.takeIf { it.isNotEmpty() } ?: (song?.name ?: "当前单曲")
    val sleepTrailing = when (vm.sleepMode) {
        "off" -> "未开启"
        "song" -> "播完本首关闭"
        else -> vm.sleepRemainingText.ifEmpty { "已开启" }
    }
    val fxActive = AudioFxPresets.isActive(vm.audioFx)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 24.dp, end = 24.dp, top = topPadding, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // 歌曲摘要头
        if (song != null) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SongCover(song.coverUrl, song.source, size = 46.dp, radius = 10.dp, name = song.name)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(song.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "$artistDisplay${if (song.albumName.isNotEmpty()) " · ${song.albumName}" else ""}",
                        fontSize = 12.sp,
                        color = MUTED,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(CARD_SURFACE)
                .padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            // 1. 添加至歌单
            MoreSheetItem(
                icon = "ic_plus.svg",
                title = "添加至歌单",
                onClick = { song?.let { vm.closeSheet(); vm.addToPlaylist(it) } },
            )
            // 2. 切换歌曲平台（三端统一排序）
            if (song != null && song.source != "local") {
                MoreSheetItem(
                    icon = "ic_switch_platform.svg",
                    title = "切换歌曲平台",
                    subtitle = "当前来源：${platformName(song.source)} · 搜索并替换同名跨平台版本",
                    onClick = { vm.openSwitchPlatformFromPlayer(song) },
                )
            }
            // 3. 评论
            MoreSheetItem(
                icon = "ic_comment_official.svg",
                title = "评论",
                onClick = { vm.closeSheet(); vm.commentsOpen = true },
            )
            // 4. 收藏
            MoreSheetItem(
                icon = if (liked) "ic_heart_fill.svg" else "ic_heart.svg",
                title = if (liked) "已收藏" else "收藏",
                accent = liked,
                rawNoTint = liked,
                onClick = { song?.let { vm.like(it) } },
            )
            // 5. 下载歌曲
            MoreSheetItem(
                icon = "ic_download.svg",
                title = "下载歌曲",
                subtitle = if (song?.source == "local") "当前已是本地音频" else "按当前音质（$qualityLabel）下载保存",
                onClick = { song?.let { vm.closeSheet(); vm.downloadSong(it) } },
            )
            // 6. 音质（与设置页一致的玻璃选择框弹窗）
            val qualityOptions = listOf("128k" to "标准 128k", "320k" to "高品质 320k", "flac" to "无损 FLAC")
            val qualitySelectLabel = qualityOptions.firstOrNull { it.first == vm.quality }?.second ?: "标准 128k"
            val qualityMenu = rememberGlassMenuTrigger {
                qualityOptions.map { (id, label) ->
                    GlassMenuItem(label, selected = vm.quality == id) {
                        vm.setQuality(id)
                        vm.notify("已切换音质为 $label", 1600)
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { qualityMenu.show() }
                    .padding(start = 14.dp, end = 12.dp, top = 9.dp, bottom = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                AssetIcon("ic_music.svg", size = 20.dp, tint = TEXT, systemSymbol = false)
                Text(
                    "音质",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = TEXT,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                GlassSurface(
                    modifier = Modifier.width(148.dp).height(40.dp).then(qualityMenu.modifier).tapNoRipple { qualityMenu.show() },
                    shape = RoundedCornerShape(20.dp),
                    tone = GlassTone.UltraThin,
                    interactive = true,
                ) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            qualitySelectLabel,
                            fontSize = 13.sp,
                            color = TEXT,
                            maxLines = 1,
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                    }
                }
            }
            // 7. 音效（独立固定玻璃页）
            MoreSheetItem(
                icon = "ic_sparkle.svg",
                title = "音效",
                subtitle = "16 种风格预设 · 5 段均衡器 · 空间环绕与混响",
                trailing = AudioFxPresets.summary(vm.audioFx),
                accent = fxActive,
                chevron = true,
                onClick = { vm.moreSubSheet = "音效" },
            )
            // 8. 查看艺人
            MoreSheetItem(
                icon = "ic_search.svg",
                title = "查看艺人：$artistDisplay",
                onClick = { vm.viewCurrentArtist() },
            )
            // 9. 查看专辑
            MoreSheetItem(
                icon = "ic_library.svg",
                title = "查看专辑：$albumDisplay",
                onClick = { vm.viewCurrentAlbum() },
            )
            // 10. 混韵天成
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { vm.setAutoMixEnabled(!vm.autoMixEnabled) }
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                AssetIcon("ic_style_wand.svg", size = 20.dp, tint = if (vm.autoMixEnabled) ACCENT else TEXT, systemSymbol = false)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            "混韵天成",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (vm.autoMixEnabled) ACCENT else TEXT,
                            maxLines = 1,
                        )
                        Box(
                            modifier = Modifier
                                .size(19.dp)
                                .clip(CircleShape)
                                .background(ACCENT.copy(alpha = 0.2f))
                                .tapNoRipple { autoMixTipOpen = true },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("!", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ACCENT)
                        }
                    }
                    Text(
                        if (vm.autoMixEnabled) vm.autoMixPreview.ifEmpty { "自动分析前后首节奏与尾奏/前奏，平滑衔接下一首" }
                        else "自动分析队列相邻歌曲的节奏与尾奏/前奏，平滑衔接下一首",
                        fontSize = 11.sp,
                        color = if (vm.autoMixEnabled && vm.autoMixPreview.isNotEmpty()) ACCENT else MUTED,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                GlassSwitch(checked = vm.autoMixEnabled, onCheckedChange = { vm.setAutoMixEnabled(it) })
            }
            // 11. 播放/暂停淡入淡出
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { vm.setPlayPauseFadeEnabled(!vm.playPauseFadeEnabled) }
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                AssetIcon("ic_volume.svg", size = 20.dp, tint = if (vm.playPauseFadeEnabled) ACCENT else TEXT, systemSymbol = false)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        "播放/暂停淡入淡出",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (vm.playPauseFadeEnabled) ACCENT else TEXT,
                        maxLines = 1,
                    )
                    Text(
                        "开始播放时渐强、暂停时渐弱，避免声音戛然而止",
                        fontSize = 11.sp,
                        color = MUTED,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                GlassSwitch(checked = vm.playPauseFadeEnabled, onCheckedChange = { vm.setPlayPauseFadeEnabled(it) })
            }
            if (autoMixTipOpen) {
                GlassDialog(onDismiss = { autoMixTipOpen = false }) {
                    Text("混韵天成", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TEXT)
                    Text(
                        "开启后，系统将自动分析前后两首歌曲的节奏、尾奏与前奏区间，在歌曲结尾提前预载下一首并以平滑过渡曲线无缝衔接，避免切歌生硬中断。",
                        fontSize = 14.sp,
                        color = TEXT,
                        lineHeight = 20.sp,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        SheetHeaderTextAction("知道了", color = ACCENT) { autoMixTipOpen = false }
                    }
                }
            }
            // 12. 不感兴趣（曲库内隐藏）
            if (!inLibrary) {
                MoreSheetItem(
                    icon = "ic_close.svg",
                    title = "不感兴趣",
                    subtitle = "减少相似推荐并立即切至下一首",
                    onClick = { vm.dislikeCurrentSong() },
                )
            }
            // 13. 相似歌曲
            MoreSheetItem(
                icon = "ic_sparkle.svg",
                title = "相似歌曲",
                subtitle = "发现与当前曲目同风格的好歌",
                onClick = { vm.openSimilarSongs() },
            )
            // 14. 定时关闭（独立固定玻璃页）
            MoreSheetItem(
                icon = "ic_repeat.svg",
                title = "定时关闭",
                trailing = sleepTrailing,
                accent = vm.sleepMode != "off",
                chevron = true,
                onClick = { vm.moreSubSheet = "定时关闭" },
            )
        }
    }
}

/** 音效独立固定玻璃页内容 */
@Composable
fun PlayerAudioFxSheetContent(
    vm: AppViewModel,
    modifier: Modifier = Modifier,
    topPadding: Dp = 86.dp,
    bottomPadding: Dp = 28.dp,
) {
    val effectiveBands = AudioFxPresets.effectiveBands(vm.audioFx)
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 24.dp, end = 24.dp, top = topPadding, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AudioFxPresets.ALL.forEach { preset ->
                val selected = vm.audioFx.preset == preset.id
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(15.dp))
                        .background(if (selected) ACCENT else CHIP_BG)
                        .clickable {
                            vm.setAudioFx(
                                AudioFxConfig(
                                    preset = preset.id,
                                    customBands = if (preset.id == "custom") vm.audioFx.customBands else preset.bands,
                                    spatial = preset.spatial,
                                    reverb = preset.reverb,
                                    spatialMode = vm.audioFx.spatialMode,
                                )
                            )
                        }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text(
                        preset.label,
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (selected) ON_ACCENT else TEXT,
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CARD_SURFACE_STRONG)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("空间音频", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TEXT)
                Text(vm.spatialHardwareStatus.label, fontSize = 11.sp, color = MUTED, maxLines = 2)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("off" to "关闭", "system" to "系统自适应", "binaural" to "双耳模拟").forEach { (id, label) ->
                        val active = vm.audioFx.spatialMode == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (active) ACCENT else CHIP_BG)
                                .clickable { vm.setSpatialMode(id) }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(label, fontSize = 12.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal, color = if (active) ON_ACCENT else TEXT)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("3D 空间环绕", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TEXT)
                    Text("实时 Mid-Side 立体声展宽 + Haas 环绕声场，全设备立竿见影", fontSize = 11.sp, color = MUTED)
                }
                GlassSwitch(checked = vm.audioFx.spatial, onCheckedChange = {
                    vm.setAudioFx(vm.audioFx.copy(spatial = it))
                })
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("空间混响", fontSize = 14.sp, color = TEXT, modifier = Modifier.weight(1f))
                listOf("none" to "无混响", "small" to "室内混响", "hall" to "音乐厅").forEach { (id, label) ->
                    val active = vm.audioFx.reverb == id
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (active) ACCENT else CHIP_BG)
                            .clickable { vm.setAudioFx(vm.audioFx.copy(reverb = id)) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text(label, fontSize = 12.sp, color = if (active) ON_ACCENT else TEXT)
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CARD_SURFACE_STRONG)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("5 段均衡器（-12dB ~ +12dB）", fontSize = 12.sp, color = MUTED)
                if (vm.audioFx.preset == "custom") Text("已自定义", fontSize = 11.sp, color = ACCENT)
            }
            AudioFxPresets.BAND_LABELS.forEachIndexed { idx, bandLabel ->
                val currentDb = effectiveBands.getOrElse(idx) { 0 }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(bandLabel, fontSize = 11.sp, color = MUTED, modifier = Modifier.width(44.dp))
                    Box(Modifier.weight(1f)) {
                        GlassSlider(
                            value = currentDb.toFloat(),
                            onValueChange = { v ->
                                val next = effectiveBands.toMutableList()
                                next[idx] = v.roundToInt().coerceIn(-12, 12)
                                vm.setAudioFx(vm.audioFx.copy(preset = "custom", customBands = next))
                            },
                            valueRange = -12f..12f,
                            step = 1f,
                        )
                    }
                    Text(
                        "${if (currentDb > 0) "+" else ""}${currentDb}dB",
                        fontSize = 11.sp,
                        color = TEXT,
                        textAlign = TextAlign.End,
                        modifier = Modifier.width(36.dp),
                    )
                    SliderResetIcon(active = currentDb != 0) {
                        val next = effectiveBands.toMutableList()
                        next[idx] = 0
                        vm.setAudioFx(vm.audioFx.copy(preset = "custom", customBands = next))
                    }
                }
            }
        }
    }
}

/** 定时关闭独立固定玻璃页内容 */
@Composable
fun PlayerSleepTimerSheetContent(vm: AppViewModel, modifier: Modifier = Modifier) {
    var customMinDraft by remember { mutableStateOf("") }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(CARD_SURFACE_STRONG)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Triple("off", "关闭", 0),
                    Triple("song", "本首播完", -1),
                    Triple("10", "10 分钟", 10),
                    Triple("30", "30 分钟", 30),
                    Triple("45", "45 分钟", 45),
                    Triple("60", "60 分钟", 60),
                    Triple("90", "90 分钟", 90),
                ).forEach { (id, label, mins) ->
                    val selected = vm.sleepMode == id
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (selected) ACCENT else CHIP_BG)
                            .clickable { vm.setSleepTimer(id, mins) }
                            .padding(horizontal = 13.dp, vertical = 8.dp),
                    ) {
                        Text(label, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, color = if (selected) ON_ACCENT else TEXT)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(INPUT_BG)
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (customMinDraft.isEmpty()) {
                        Text("自定义分钟（1–480）", fontSize = 13.sp, color = MUTED)
                    }
                    BasicTextField(
                        value = customMinDraft,
                        onValueChange = { customMinDraft = it.filter(Char::isDigit).take(3) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        cursorBrush = SolidColor(ACCENT),
                        textStyle = TextStyle(color = TEXT, fontSize = 13.sp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Box(
                    modifier = Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(ACCENT)
                        .clickable {
                            val mins = customMinDraft.trim().toIntOrNull()
                            if (mins != null && mins in 1..480) {
                                vm.setSleepTimer("custom", mins)
                                customMinDraft = ""
                            }
                        }
                        .padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("设定", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ON_ACCENT)
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("倒计时结束后播完整首", fontSize = 14.sp, color = TEXT)
                    Text("开启后等待当前歌曲自然播放完毕再暂停", fontSize = 11.sp, color = MUTED)
                }
                GlassSwitch(checked = vm.sleepFinishSong, onCheckedChange = { vm.setSleepFinishSong(it) })
            }
        }
    }
}

@Composable
private fun MoreSheetItem(
    icon: String,
    title: String,
    subtitle: String = "",
    trailing: String = "",
    accent: Boolean = false,
    rawNoTint: Boolean = false,
    chevron: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        AssetIcon(
            icon,
            size = 20.dp,
            tint = if (rawNoTint) Color.Unspecified else (if (accent) ACCENT else TEXT),
            systemSymbol = false,
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = if (accent) ACCENT else TEXT,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle.isNotEmpty()) {
                Text(subtitle, fontSize = 11.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (trailing.isNotEmpty()) {
            Text(trailing, fontSize = 12.sp, color = if (accent) ACCENT else MUTED, maxLines = 1)
        }
        if (chevron) {
            Text("›", fontSize = 18.sp, color = MUTED)
        }
    }
}
