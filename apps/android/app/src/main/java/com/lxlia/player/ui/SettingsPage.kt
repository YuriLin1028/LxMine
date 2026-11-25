@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.lxlia.player.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.MINE_RADIO_MODES
import com.lxlia.player.model.SyncSourcePayload
import kotlin.math.abs
import kotlin.math.roundToInt

/** 设置页：分组顺序（音乐源、播放、歌词、系统与互联、关于）与鸿蒙 AlignedSettings 一致。 */
@Composable
fun SettingsTab(vm: AppViewModel) {
    val route = if (vm.sourcesOpen) "sources" else vm.settingsPanel
    AnimatedContent(
        targetState = route,
        transitionSpec = {
            val enteringSub = targetState != "main" && initialState == "main"
            val returningMain = targetState == "main" && initialState != "main"
            val slideSpec = spring<androidx.compose.ui.unit.IntOffset>(dampingRatio = 0.84f, stiffness = 420f)
            when {
                enteringSub -> (slideInHorizontally(slideSpec) { it / 5 } + fadeIn(tween(220)))
                    .togetherWith(slideOutHorizontally(slideSpec) { -it / 10 } + fadeOut(tween(180)))
                returningMain -> (slideInHorizontally(slideSpec) { -it / 10 } + fadeIn(tween(220)))
                    .togetherWith(slideOutHorizontally(slideSpec) { it / 5 } + fadeOut(tween(180)))
                else -> fadeIn(tween(200)).togetherWith(fadeOut(tween(160)))
            }
        },
        label = "settings-route",
    ) { currentRoute ->
        if (currentRoute == "sources") {
            SourcesPage(vm)
        } else {
            val scroll = rememberScrollState(initial = if (currentRoute == "main") vm.settingsScrollOffset else 0)
            val density = LocalDensity.current.density.coerceAtLeast(1f)
            LaunchedEffect(scroll, currentRoute, density) {
                snapshotFlow { scroll.value to scroll.isScrollInProgress }.collect { (offset, moving) ->
                    if (vm.tab == "设置" && !vm.showPlayer && !vm.sourcesOpen && currentRoute == vm.settingsPanel) {
                        if (currentRoute == "main") vm.settingsScrollOffset = offset
                        vm.homeScroll(offset / density, canTrackDock = moving)
                    }
                }
            }
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scroll)
                    .padding(top = (vm.headerHeight() + 12).dp, bottom = 180.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                when (currentRoute) {
                    "playback" -> PlaybackSettingsPanel(vm)
                    "appearance" -> AppearanceSettingsPanel(vm)
                    "lyrics" -> LyricSettingsPanel(vm)
                    "general" -> GeneralSettingsPanel(vm)
                    "sync" -> SyncPanel(vm)
                    else -> SettingsMainPanel(vm)
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        color = MUTED,
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, top = 24.dp, bottom = 10.dp),
    )
}

@Composable
private fun SettingsCard(spacing: Dp = 1.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(if (AppAppearance.light) Color(0x09000000) else Color(0x0BFFFFFF)),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

@Composable
private fun RowCopy(title: String, detail: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(title, fontSize = 16.sp, color = TEXT, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (detail.isNotEmpty()) {
            Text(detail, fontSize = 12.sp, color = MUTED, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun LinkRow(title: String, detail: String, label: String = "›", onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RowCopy(title, detail, Modifier.weight(1f))
        if (label == "›") {
            AssetIcon("ic_back.svg", size = 16.dp, tint = MUTED, systemSymbol = false, modifier = Modifier.rotate(180f))
        } else {
            Text(label, fontSize = 14.sp, color = MUTED, maxLines = 1)
        }
    }
}

@Composable
private fun ToggleRow(title: String, detail: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RowCopy(title, detail, Modifier.weight(1f))
        GlassSwitch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun SelectRow(
    title: String,
    detail: String = "",
    labels: List<String>,
    values: List<String>,
    current: String,
    onSelect: (String) -> Unit,
) {
    val index = values.indexOf(current).coerceAtLeast(0)
    val menu = rememberGlassMenuTrigger {
        labels.mapIndexed { itemIndex, label ->
            GlassMenuItem(label, selected = itemIndex == index) {
                onSelect(values.getOrElse(itemIndex) { current })
            }
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        RowCopy(title, detail, Modifier.weight(1f))
        GlassSurface(
            modifier = Modifier.width(148.dp).height(40.dp).then(menu.modifier).tapNoRipple { menu.show() },
            shape = RoundedCornerShape(20.dp),
            tone = GlassTone.UltraThin,
            interactive = true,
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    labels.getOrElse(index) { labels.firstOrNull().orEmpty() },
                    fontSize = 13.sp,
                    color = TEXT,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun SettingsMainPanel(vm: AppViewModel) {
    val qualityShort = when (vm.quality) { "flac" -> "无损"; "320k" -> "高品质"; else -> "标准" }
    val themeShort = when (vm.appearance) { "light" -> "浅色"; "dark" -> "深色"; else -> "跟随系统" }
    val styleLabel = MINE_RADIO_MODES.firstOrNull { it.id == vm.styleName }?.label ?: "默认动效"
    val scalePct = (vm.lyricPrefs.lyricScale * 100f).roundToInt()
    val spacingPct = (vm.lyricPrefs.lyricLineSpacing * 100f).roundToInt()
    val limitLabel = if (vm.lyricPrefs.lyricMaxLines > 0) "${vm.lyricPrefs.lyricMaxLines} 行" else "铺满"

    SectionLabel("音乐源")
    SettingsCard {
        LinkRow(
            title = vm.sources.firstOrNull { it.id == vm.activeId }?.name
                ?: vm.sources.firstOrNull()?.name
                ?: "未添加音源",
            detail = "${vm.sources.size} 个音源 · 当前使用",
            onClick = { vm.openSources() },
        )
    }

    SectionLabel("个性化与播放")
    SettingsCard {
        LinkRow(
            title = "播放与音效",
            detail = "$qualityShort · ${com.lxlia.player.audio.AudioFxPresets.summary(vm.audioFx)}${if (vm.autoMixEnabled) " · 混韵天成" else ""}",
            onClick = { vm.openSettingsPanel("playback") },
        )
        LinkRow(
            title = "外观与背景",
            detail = "$themeShort · $styleLabel",
            onClick = { vm.openSettingsPanel("appearance") },
        )
        LinkRow(
            title = "歌词设置",
            detail = "字号 $scalePct% · 行距 $spacingPct% · $limitLabel",
            onClick = { vm.openSettingsPanel("lyrics") },
        )
    }

    SectionLabel("系统与互联")
    SettingsCard {
        LinkRow(
            title = "下载管理",
            detail = "${vm.downloadItems.count { it.state == "complete" }} 首已完成",
            label = "查看",
            onClick = { vm.openDownloads() },
        )
        LinkRow(
            title = "局域网同步",
            detail = if (vm.lanAutoSync) "已开启信任圈自动同步 · 手机、平板与电脑双向合并" else "设备信任圈 · 手机、平板与电脑之间双向同步歌单、音源与设置",
            onClick = { vm.openSettingsPanel("sync") },
        )
        LinkRow(
            title = "通用与交互",
            detail = "启动行为、推荐刷新与不感兴趣管理",
            onClick = { vm.openSettingsPanel("general") },
        )
    }

    SectionLabel("关于")
    SettingsCard {
        LinkRow(
            title = "LxMine",
            detail = "LX 音源 · MineRadio 视觉 · 全端统一体验",
            label = vm.currentAppVersion(),
            onClick = { },
        )
        LinkRow(
            title = "检查更新",
            detail = "自动通过国内加速镜像获取 GitHub 最新版并覆盖安装",
            label = if (vm.updateChecking) "检测中…" else "检查",
            onClick = { vm.checkAppUpdate(silent = false) },
        )
    }
}

@Composable
private fun PlaybackSettingsPanel(vm: AppViewModel) {
    val effectiveBands = com.lxlia.player.audio.AudioFxPresets.effectiveBands(vm.audioFx)
    SectionLabel("播放选项")
    SettingsCard {
        SelectRow(
            title = "音质",
            detail = "播放和下载优先使用该档位",
            labels = listOf("标准 128k", "高品质 320k", "无损 FLAC"),
            values = listOf("128k", "320k", "flac"),
            current = vm.quality,
            onSelect = { vm.setQuality(it) },
        )
        SelectRow(
            title = "播放顺序",
            detail = "列表循环 / 单曲 / 随机 / 顺序",
            labels = listOf("列表循环", "单曲循环", "随机播放", "顺序播放"),
            values = listOf("列表循环", "单曲循环", "随机播放", "顺序播放"),
            current = vm.mode,
            onSelect = { vm.setPlayMode(it) },
        )
        var autoMixTipOpen by remember { mutableStateOf(false) }
        Row(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("混韵天成", fontSize = 16.sp, color = TEXT)
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(ACCENT.copy(alpha = 0.2f))
                            .tapNoRipple { autoMixTipOpen = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("!", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ACCENT)
                    }
                }
                Text("切歌时提前预载下一首并平滑淡出衔接", fontSize = 12.sp, color = MUTED, maxLines = 2)
            }
            GlassSwitch(checked = vm.autoMixEnabled, onCheckedChange = { vm.setAutoMixEnabled(it) })
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
                Box(Modifier.fillMaxWidth()) {
                    Text(
                        "知道了",
                        color = ACCENT,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.align(Alignment.CenterEnd).tapNoRipple { autoMixTipOpen = false }.padding(8.dp),
                    )
                }
            }
        }
        ToggleRow(
            title = "播放/暂停淡入淡出",
            detail = "开始播放时音量渐强、暂停时音量渐弱，避免声音戛然而止",
            value = vm.playPauseFadeEnabled,
            onChange = { vm.setPlayPauseFadeEnabled(it) },
        )
        ToggleRow(
            title = "切歌自动归位舞台视角",
            detail = "开启后每次切歌将 360° 舞台视角平滑回正；关闭则保持上一首的旋转角度",
            value = vm.stageResetCameraOnSong,
            onChange = { vm.setStageResetCameraOnSong(it) },
        )
        ToggleRow(
            title = "旋转锁定时允许播放页横屏",
            detail = "开启后即使系统开启竖屏锁定，横置手机仍可进入横屏沉浸播放",
            value = vm.allowLandscapeWhenLocked,
            onChange = { vm.setAllowLandscapeWhenLocked(it) },
        )
        ToggleRow(
            title = "允许与其他应用同时播放",
            detail = "开启后与其他视频、游戏或导航等应用混音播放，互不打断",
            value = vm.mixWithOthers,
            onChange = { vm.setMixWithOthers(it) },
        )
    }

    SectionLabel("音效与均衡器")
    SettingsCard {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                RowCopy("当前音效", "可在播控栏「更多」中随时快速切换", Modifier.weight(1f))
                Text(com.lxlia.player.audio.AudioFxPresets.summary(vm.audioFx), fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                com.lxlia.player.audio.AudioFxPresets.ALL.forEach { preset ->
                    val selected = vm.audioFx.preset == preset.id
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(15.dp))
                            .background(if (selected) ACCENT else CHIP_BG)
                            .clickable {
                                vm.setAudioFx(
                                    com.lxlia.player.audio.AudioFxConfig(
                                        preset = preset.id,
                                        customBands = if (preset.id == "custom") vm.audioFx.customBands else preset.bands,
                                        spatial = preset.spatial,
                                        reverb = preset.reverb,
                                        spatialMode = vm.audioFx.spatialMode,
                                    )
                                )
                            }
                            .padding(horizontal = 11.dp, vertical = 7.dp),
                    ) {
                        Text(preset.label, fontSize = 12.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, color = if (selected) ON_ACCENT else TEXT)
                    }
                }
            }
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                RowCopy("空间音频（Spatial Audio）", vm.spatialHardwareStatus.label)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("off" to "关闭", "system" to "系统自适应", "binaural" to "双耳模拟").forEach { (id, label) ->
                        val active = vm.audioFx.spatialMode == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
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
                RowCopy("3D 空间环绕", "实时 Mid-Side 立体声展宽 + Haas 交叉延迟，耳机外放皆明显", Modifier.weight(1f))
                GlassSwitch(checked = vm.audioFx.spatial, onCheckedChange = { vm.setAudioFx(vm.audioFx.copy(spatial = it)) })
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
                        Text(label, fontSize = 12.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal, color = if (active) ON_ACCENT else TEXT)
                    }
                }
            }
            com.lxlia.player.audio.AudioFxPresets.BAND_LABELS.forEachIndexed { idx, bandLabel ->
                val db = effectiveBands.getOrElse(idx) { 0 }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(bandLabel, fontSize = 12.sp, color = MUTED, modifier = Modifier.width(46.dp))
                    Box(Modifier.weight(1f)) {
                        GlassSlider(
                            value = db.toFloat(),
                            onValueChange = { v ->
                                val next = effectiveBands.toMutableList()
                                next[idx] = v.roundToInt().coerceIn(-12, 12)
                                vm.setAudioFx(vm.audioFx.copy(preset = "custom", customBands = next))
                            },
                            valueRange = -12f..12f,
                            step = 1f,
                        )
                    }
                    Text("${if (db > 0) "+" else ""}${db}dB", fontSize = 12.sp, color = TEXT, modifier = Modifier.width(40.dp))
                    SliderResetIcon(active = db != 0) {
                        val next = effectiveBands.toMutableList()
                        next[idx] = 0
                        vm.setAudioFx(vm.audioFx.copy(preset = "custom", customBands = next))
                    }
                }
            }
        }
    }
}

@Composable
private fun AppearanceSettingsPanel(vm: AppViewModel) {
    var tipOpen by remember { mutableStateOf(false) }
    val styleMenu = rememberGlassMenuTrigger(widthDp = 228f) {
        buildStyleMenuItems(vm) { tipOpen = true }
    }
    val pickStageBgLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.GetContent(),
    ) { uri -> if (uri != null) vm.importStageBgImage(uri) }
    val pickPageBgLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.GetContent(),
    ) { uri -> if (uri != null) vm.importPageBgImage(uri) }

    SectionLabel("主题与动效")
    SettingsCard {
        SelectRow(
            title = "外观",
            detail = "深浅色全局适配，自定义背景蒙层同步自动优化可读性",
            labels = listOf("深色", "浅色", "跟随系统"),
            values = listOf("dark", "light", "system"),
            current = vm.appearance,
            onSelect = { vm.appearance = it; vm.save() },
        )
        val styleIndex = MINE_RADIO_MODES.indexOfFirst { it.id == vm.styleName }.coerceAtLeast(0)
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("MineRadio 动效", fontSize = 16.sp, color = TEXT)
                Text(
                    if (vm.styleName == com.lxlia.player.audio.SMART_STAGE_MODE_ID && vm.resolvedStyleLabel().isNotEmpty())
                        "随声绘色已开启 · 当前匹配：${vm.resolvedStyleLabel()}"
                    else "选择播放页动效；选「随声绘色」由 AI 按歌曲内容与封面自动匹配",
                    fontSize = 12.sp,
                    color = MUTED,
                    maxLines = 3,
                )
            }
            GlassSurface(
                modifier = Modifier.width(148.dp).height(40.dp).then(styleMenu.modifier).tapNoRipple { styleMenu.show() },
                shape = RoundedCornerShape(20.dp),
                tone = GlassTone.UltraThin,
                interactive = true,
            ) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(MINE_RADIO_MODES.getOrElse(styleIndex) { MINE_RADIO_MODES.first() }.label, fontSize = 13.sp, color = TEXT, maxLines = 1, modifier = Modifier.padding(horizontal = 12.dp))
                }
            }
        }
    }

    SectionLabel("播放页背景")
    SettingsCard {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowCopy(
                title = "播放页自定义背景图",
                detail = if (vm.stageBgImagePath.isNotEmpty()) "已启用自定义背景图（所有播放页模式生效）" else "默认跟随当前歌曲专辑封面",
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(ACCENT).clickable { pickStageBgLauncher.launch("image/*") }.padding(horizontal = 12.dp, vertical = 7.dp),
            ) { Text("选择图片", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = ON_ACCENT) }
            if (vm.stageBgImagePath.isNotEmpty()) {
                Box(
                    modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(CHIP_BG).clickable { vm.clearStageBgImage() }.padding(horizontal = 12.dp, vertical = 7.dp),
                ) { Text("恢复默认", fontSize = 12.sp, color = TEXT) }
            }
        }
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                RowCopy("播放页背景透明度", "实时调节封面或自定义背景图的透明程度", Modifier.weight(1f))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${(vm.stageBgOpacity * 100).roundToInt()}%", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                    SliderResetIcon(active = abs(vm.stageBgOpacity - 0.78f) > 0.005f, onClick = { vm.updateStageBgOpacity(0.78f) })
                }
            }
            GlassSlider(value = (vm.stageBgOpacity * 100f).roundToInt().coerceIn(0, 100).toFloat(), onValueChange = { vm.updateStageBgOpacity(it / 100f) }, valueRange = 0f..100f, step = 1f)
        }
    }

    SectionLabel("非播放页背景（首页 / 曲库 / 设置）")
    SettingsCard {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowCopy(
                title = "页面自定义背景图",
                detail = if (vm.pageBgImagePath.isNotEmpty()) "已启用自定义背景，自动适配深浅色可读蒙层" else "默认使用纯净深浅主题底色",
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(ACCENT).clickable { pickPageBgLauncher.launch("image/*") }.padding(horizontal = 12.dp, vertical = 7.dp),
            ) { Text("选择图片", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = ON_ACCENT) }
            if (vm.pageBgImagePath.isNotEmpty()) {
                Box(
                    modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(CHIP_BG).clickable { vm.clearPageBgImage() }.padding(horizontal = 12.dp, vertical = 7.dp),
                ) { Text("恢复默认", fontSize = 12.sp, color = TEXT) }
            }
        }
        if (vm.pageBgImagePath.isNotEmpty()) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    RowCopy("背景显示强度", "深浅模式下自动叠加文字可读保护蒙层", Modifier.weight(1f))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${(vm.pageBgOpacity * 100).roundToInt()}%", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                        SliderResetIcon(active = abs(vm.pageBgOpacity - 0.35f) > 0.005f, onClick = { vm.updatePageBgOpacity(0.35f) })
                    }
                }
                GlassSlider(value = (vm.pageBgOpacity * 100f).roundToInt().coerceIn(10, 85).toFloat(), onValueChange = { vm.updatePageBgOpacity(it / 100f) }, valueRange = 10f..85f, step = 1f)
            }
        }
    }

    if (tipOpen) {
        SmartStageTipDialog(onDismiss = { tipOpen = false })
    }
}

@Composable
private fun GeneralSettingsPanel(vm: AppViewModel) {
    SectionLabel("行为与交互")
    SettingsCard {
        ToggleRow(
            title = "启动时继续播放上次内容",
            detail = "默认关闭，保留歌曲和进度，打开软件保持暂停",
            value = vm.resumeOnStartup,
            onChange = { vm.setResumeOnStartup(it) },
        )
        ToggleRow(
            title = "双击刷新同步重算推荐",
            detail = "双击首页左上角标题刷新时，同时重洗猜你喜欢与每日推荐内容",
            value = vm.refreshAlgoOnDoubleTap,
            onChange = { vm.setRefreshAlgoOnDoubleTap(it) },
        )
        LinkRow(
            title = "清空「不感兴趣」屏蔽列表",
            detail = if (vm.dislikedKeys.isNotEmpty()) "已屏蔽 ${vm.dislikedKeys.size} 首歌曲，点击恢复推荐" else "暂无屏蔽歌曲",
            label = if (vm.dislikedKeys.isNotEmpty()) "清空" else "无",
            onClick = { if (vm.dislikedKeys.isNotEmpty()) vm.clearDislikedSongs() },
        )
    }
}

@Composable
private fun LyricSettingsPanel(vm: AppViewModel) {
    val previewText = vm.lyrics.lastOrNull { it.timeMs <= vm.positionMs }?.text ?: "音乐在这里，与你相遇"
    val scalePercent = (vm.lyricPrefs.lyricScale * 100f).roundToInt().coerceIn(55, 150)
    val spacingPercent = (vm.lyricPrefs.lyricLineSpacing * 100f).roundToInt().coerceIn(85, 180)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFF151619))
            .padding(24.dp),
    ) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy((10f * vm.lyricPrefs.lyricLineSpacing).dp),
        ) {
            Text("播放详情页歌词预览", fontSize = 11.sp, color = MUTED, modifier = Modifier.fillMaxWidth())
            Text(
                previewText,
                fontSize = (22f * vm.lyricPrefs.lyricScale).sp,
                fontWeight = FontWeight.Bold,
                color = parseColor(vm.previewPrimary()),
                maxLines = 2,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Text(
                "Music meets you right here",
                fontSize = (15f * vm.lyricPrefs.lyricScale).sp,
                fontWeight = FontWeight.Medium,
                color = parseColor(vm.previewSecondary()).copy(alpha = 0.82f),
                maxLines = 1,
            )
            Box(
                Modifier
                    .fillMaxWidth(0.7f)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Brush.horizontalGradient(listOf(parseColor(vm.previewPrimary()), parseColor(vm.previewSecondary())))),
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp, bottom = 2.dp)
                    .height(0.8.dp)
                    .background(Color(0x22FFFFFF)),
            )
            Text("桌面歌词预览（独立配色与字号）", fontSize = 11.sp, color = MUTED, modifier = Modifier.fillMaxWidth())
            Text(
                previewText,
                fontSize = (20f * vm.mobileDesktopLyricScale.coerceIn(0.65f, 1.35f)).sp,
                fontWeight = FontWeight.Bold,
                color = parseColor(vm.desktopPreviewPrimary()),
                maxLines = 2,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Box(
                Modifier
                    .fillMaxWidth(0.54f)
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Brush.horizontalGradient(listOf(parseColor(vm.desktopPreviewPrimary()), parseColor(vm.desktopPreviewSecondary())))),
            )
        }
    }
    SectionLabel("排版与显示")
    SettingsCard {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("歌词字体大小", "调整播放详情页歌词字号比例（55%–150%）", Modifier.weight(1f))
                Text("$scalePercent%", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                SliderResetIcon(active = abs(vm.lyricPrefs.lyricScale - 1f) >= 0.01f, onClick = { vm.setLyricScale(1f) })
            }
            GlassSlider(value = scalePercent.toFloat(), onValueChange = { vm.setLyricScale(it / 100f) }, valueRange = 55f..150f, step = 1f)
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("歌词行间距", "英文与大字号下适当加大行距更舒展（85%–180%）", Modifier.weight(1f))
                Text("$spacingPercent%", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                SliderResetIcon(active = abs(vm.lyricPrefs.lyricLineSpacing - 1.2f) >= 0.01f, onClick = { vm.setLyricLineSpacing(1.2f) })
            }
            GlassSlider(value = spacingPercent.toFloat(), onValueChange = { vm.setLyricLineSpacing(it / 100f) }, valueRange = 85f..180f, step = 1f)
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            RowCopy("同时显示行数", "默认铺满屏幕，也可固定为单行或 3 / 5 / 7 / 9 行聚焦显示")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(0 to "铺满屏幕", 1 to "1 行", 3 to "3 行", 5 to "5 行", 7 to "7 行", 9 to "9 行").forEach { (cnt, label) ->
                    val active = vm.lyricPrefs.lyricMaxLines == cnt
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(15.dp))
                            .background(if (active) ACCENT else CHIP_BG)
                            .clickable { vm.setLyricMaxLines(cnt) }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    ) {
                        Text(label, fontSize = 12.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal, color = if (active) ON_ACCENT else TEXT)
                    }
                }
            }
        }
        ToggleRow(
            title = "显示翻译",
            detail = "自动跨平台补齐外语歌曲中文翻译歌词",
            value = vm.lyricPrefs.showTranslation,
            onChange = { vm.setShowTranslation(it) },
        )
        ToggleRow(
            title = "显示音译 / 罗马音",
            detail = "日韩外语歌词显示罗马音（无官源时自动智能转写）",
            value = vm.lyricPrefs.showRomaji,
            onChange = { vm.setShowRomaji(it) },
        )
    }
    SectionLabel("颜色与时间")
    SettingsCard {
        SelectRow(
            title = "颜色来源",
            detail = "封面取色或自定义；纯色／渐变",
            labels = listOf("封面取色 · 纯色", "封面取色 · 渐变", "自定义 · 纯色", "自定义 · 渐变"),
            values = listOf("cover-solid", "cover-gradient", "custom-solid", "custom-gradient"),
            current = vm.lyricPrefs.colorMode,
            onSelect = { vm.setLyricColorMode(it) },
        )
        if (vm.lyricPrefs.colorMode.startsWith("custom")) {
            ColorPickerTriggerRow("主色", vm.lyricPrefs.primary) { vm.colorPickerTarget = "primary" }
            if (vm.lyricPrefs.colorMode.endsWith("gradient")) {
                ColorPickerTriggerRow("辅色", vm.lyricPrefs.secondary) { vm.colorPickerTarget = "secondary" }
            }
        }
        var offsetDraft by remember { mutableStateOf(vm.lyricOffset.toString()) }
        LaunchedEffect(vm.lyricOffset) {
            if (parseLyricOffset(offsetDraft) != vm.lyricOffset) {
                offsetDraft = vm.lyricOffset.toString()
            }
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("时间偏移", "正值提前显示，负值延后显示", Modifier.weight(1f))
                Box(Modifier.width(74.dp).height(40.dp), contentAlignment = Alignment.Center) {
                    BasicTextField(
                        value = offsetDraft,
                        cursorBrush = SolidColor(CONTROL_BLUE),
                        onValueChange = { value ->
                            offsetDraft = value
                            val parsed = parseLyricOffset(value)
                            if (parsed != null) vm.setLyricOffset(parsed)
                        },
                        singleLine = true,
                        textStyle = TextStyle(color = TEXT, fontSize = 16.sp),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp),
                    )
                }
                Text("ms", fontSize = 12.sp, color = MUTED)
                SliderResetIcon(active = vm.lyricOffset != 0L, onClick = { offsetDraft = "0"; vm.setLyricOffset(0) })
            }
            GlassSlider(
                value = vm.lyricOffset.toFloat(),
                onValueChange = { value -> val offset = value.toLong(); offsetDraft = offset.toString(); vm.setLyricOffset(offset) },
                valueRange = -10000f..10000f,
                step = 50f,
            )
        }
    }
    SectionLabel("桌面歌词")
    SettingsCard {
        ToggleRow(
            title = "桌面歌词",
            detail = "在桌面、其他应用及状态栏上方自由悬浮显示纯文本逐字滚动歌词，支持任意拖动、双指缩放及点按拖拽边角调整窗口大小",
            value = vm.mobileDesktopLyricsEnabled,
            onChange = { vm.setMobileDesktopLyricsEnabled(it) },
        )
        if (vm.mobileDesktopLyricsEnabled) {
            ToggleRow(
                title = "锁定桌面歌词（触摸穿透）",
                detail = "开启后桌面歌词不拦截点击，可随时在此处或播放页「更多」中解锁",
                value = vm.mobileDesktopLyricsLocked,
                onChange = { vm.setMobileDesktopLyricsLocked(it) },
            )
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("桌面歌词字号", "独立调节悬浮纯文字歌词大小（60%–165%，也可双指捏合或拖拽右下角缩放）", Modifier.weight(1f))
                Text("${(vm.mobileDesktopLyricScale * 100f).roundToInt()}%", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                SliderResetIcon(active = kotlin.math.abs(vm.mobileDesktopLyricScale - 1.0f) > 0.01f) {
                    vm.setMobileDesktopLyricScale(1.0f)
                }
            }
            GlassSlider(
                value = (vm.mobileDesktopLyricScale * 100f).roundToInt().coerceIn(60, 165).toFloat(),
                onValueChange = { value -> vm.setMobileDesktopLyricScale(value / 100f) },
                valueRange = 60f..165f,
                step = 1f,
            )
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("桌面歌词宽度", "独立调节悬浮窗宽度（36%–100%，可调窄贴合状态栏或拉宽展示长句）", Modifier.weight(1f))
                Text("${(vm.mobileDesktopLyricWidth * 100f).roundToInt()}%", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                SliderResetIcon(active = kotlin.math.abs(vm.mobileDesktopLyricWidth - 0.86f) > 0.01f) {
                    vm.setMobileDesktopLyricWidth(0.86f)
                }
            }
            GlassSlider(
                value = (vm.mobileDesktopLyricWidth * 100f).roundToInt().coerceIn(36, 100).toFloat(),
                onValueChange = { value -> vm.setMobileDesktopLyricWidth(value / 100f) },
                valueRange = 36f..100f,
                step = 1f,
            )
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("桌面歌词纵向位置", "支持负值直接上移覆盖状态栏（也可在悬浮歌词上直接自由拖动）", Modifier.weight(1f))
                Text("${(vm.mobileDesktopLyricY * 100f).roundToInt()}%", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT)
                SliderResetIcon(active = kotlin.math.abs(vm.mobileDesktopLyricY - 0.045f) > 0.008f) {
                    vm.setMobileDesktopLyricY(0.045f)
                }
            }
            GlassSlider(
                value = (vm.mobileDesktopLyricY * 100f).roundToInt().coerceIn(-18, 96).toFloat(),
                onValueChange = { value -> vm.setMobileDesktopLyricY(value / 100f) },
                valueRange = -18f..96f,
                step = 1f,
            )
        }
        SelectRow(
            title = "桌面歌词显示行数",
            detail = "单行极简聚焦，或双行显示翻译 / 下一句",
            labels = listOf("1 行（推荐）", "2 行（含翻译 / 下句）"),
            values = listOf("1", "2"),
            current = vm.mobileDesktopLyricLines.toString(),
            onSelect = { vm.setMobileDesktopLyricLines(it.toIntOrNull() ?: 1) },
        )
        SelectRow(
            title = "桌面歌词颜色来源",
            detail = "独立于播放详情页设置桌面歌词配色，默认封面取色渐变",
            labels = listOf("封面取色 · 纯色", "封面取色 · 渐变", "自定义 · 纯色", "自定义 · 渐变"),
            values = listOf("cover-solid", "cover-gradient", "custom-solid", "custom-gradient"),
            current = vm.mobileDesktopLyricColorMode,
            onSelect = { vm.setMobileDesktopLyricColorMode(it) },
        )
        if (vm.mobileDesktopLyricColorMode.startsWith("custom")) {
            ColorPickerTriggerRow("桌面歌词主色", vm.mobileDesktopLyricColor) {
                vm.colorPickerTarget = "desktop-primary"
            }
            if (vm.mobileDesktopLyricColorMode.endsWith("gradient")) {
                ColorPickerTriggerRow("桌面歌词辅色", vm.mobileDesktopLyricColor2) {
                    vm.colorPickerTarget = "desktop-secondary"
                }
            }
        }
        LinkRow(
            title = "重置桌面歌词位置与大小",
            detail = "恢复默认居中靠上位置、86% 宽度与 100% 字号",
            label = "重置",
            onClick = { vm.resetMobileDesktopLyricsGeometry() },
        )
    }
    SectionLabel("车载与蓝牙歌词")
    SettingsCard {
        ToggleRow(
            title = "蓝牙车载歌词",
            detail = "连接蓝牙车载音响时通过 AVRCP 协议同步推送实时歌词（是否显示及刷新频率取决于车型车机支持）",
            value = vm.bluetoothCarLyricsEnabled,
            onChange = { vm.setBluetoothCarLyricsEnabled(it) },
        )
        if (vm.bluetoothCarLyricsEnabled) {
            SelectRow(
                title = "车机显示方式",
                detail = "默认将歌词写入曲目名（兼容绝大多数车机），也可按车型切换",
                labels = listOf("歌词替换歌名（推荐）", "歌词替换歌手", "歌词 + 歌名拼接"),
                values = listOf(
                    com.lxlia.player.audio.BluetoothCarLyrics.MODE_TITLE,
                    com.lxlia.player.audio.BluetoothCarLyrics.MODE_ARTIST,
                    com.lxlia.player.audio.BluetoothCarLyrics.MODE_COMBINED,
                ),
                current = vm.bluetoothCarLyricsMode,
                onSelect = { vm.setBluetoothCarLyricsMode(it) },
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    if (vm.bluetoothAudioConnected) "已检测到蓝牙音频设备，播放歌曲时自动向车机同步歌词"
                    else "未检测到蓝牙音频设备（连接车载蓝牙后将自动生效）",
                    fontSize = 12.sp,
                    color = if (vm.bluetoothAudioConnected) ACCENT else MUTED,
                )
            }
        }
    }
}

@Composable
private fun ColorPickerTriggerRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        RowCopy(label, "点击打开可视化色盘自由选色", Modifier.weight(1f))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(18.dp))
                .background(CHIP_BG)
                .border(0.6.dp, BORDER_SUBTLE, RoundedCornerShape(18.dp))
                .padding(start = 6.dp, end = 10.dp, top = 5.dp, bottom = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(parseColor(value))
                    .border(1.dp, BORDER_SUBTLE, CircleShape)
            )
            Text(value.uppercase(), fontSize = 13.sp, fontWeight = FontWeight.Medium, color = TEXT)
            Text("调色 ›", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = ACCENT)
        }
    }
}

@Composable
private fun SyncPanel(vm: AppViewModel) {
    var manualInput by rememberSaveable(vm.lanManualTarget) { mutableStateOf(vm.lanManualTarget) }
    val localEndpoint = when {
        vm.localLanIp.isNotEmpty() && vm.lanPort > 0 -> "${vm.localLanIp}:${vm.lanPort}"
        vm.lanPort > 0 -> "0.0.0.0:${vm.lanPort}"
        else -> "正在初始化…"
    }
    SectionLabel("本机信息与自动同步")
    SettingsCard {
        Row(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            RowCopy(
                title = "本机局域网地址",
                detail = if (vm.lanSsid.isNotEmpty()) "Wi‑Fi：${vm.lanSsid} · 其他设备可直连此地址" else "请确保设备连接同一局域网",
                modifier = Modifier.weight(1f),
            )
            Text(localEndpoint, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT, maxLines = 1)
        }
        ToggleRow(
            title = "同局域网自动同步歌单",
            detail = "仅与已加入「设备信任圈」且开启此项的设备自动合并歌单与收藏（不覆盖音源与设置）",
            value = vm.lanAutoSync,
            onChange = { vm.setLanAutoSync(it) },
        )
        ToggleRow(
            title = "信任圈成员互通",
            detail = "开启后，配对新设备时自动同步对方信任圈里的设备并互相引荐；关闭则仅拉入当前配对设备",
            value = vm.trustCircleTransitive,
            onChange = { vm.setTrustCircleTransitive(it) },
        )
    }

    val trustedIds = remember(vm.trustedDevices) { vm.trustedDevices.map { it.id }.toSet() }
    val onlineMap = remember(vm.devices) { vm.devices.associateBy { it.id } }

    SectionLabel("设备信任圈（${vm.trustedDevices.size} 台）")
    Text(
        "仅信任圈内的设备可在此发送同步或自动合并歌单，防止同 Wi-Fi 下陌生设备误同步。",
        fontSize = 12.sp,
        color = MUTED,
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, bottom = 10.dp),
    )
    SettingsCard {
        if (vm.trustedDevices.isEmpty()) {
            Text(
                "尚未信任任何设备：请在下方「附近未信任设备」点击「加入信任圈」，对端核对验证码确认后即可在此发送同步。",
                fontSize = 13.sp,
                color = MUTED,
                modifier = Modifier.fillMaxWidth().padding(18.dp),
            )
        }
        vm.trustedDevices.forEach { item ->
            val online = onlineMap[item.id]
            val platformLabel = when (item.platform) {
                "harmony" -> "HarmonyOS"
                "android" -> "Android"
                "win32", "windows" -> "Windows"
                "darwin", "macos" -> "macOS"
                "linux" -> "Linux"
                else -> item.platform
            }
            val meta = buildList {
                add(platformLabel)
                add(if (online != null) "在线 · ${online.address}:${online.port}" else "离线")
                if (online?.autoSyncPlaylists == true) add("自动同步已开启")
            }.joinToString(" · ")
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RowCopy(title = item.name, detail = meta, modifier = Modifier.weight(1f))
                PillButton(
                    label = if (online != null) "发送" else "离线",
                    filled = online != null,
                    enabled = online != null && !vm.busy,
                    onClick = { if (online != null) vm.send(online) },
                )
                PillButton(
                    label = "移除",
                    filled = false,
                    onClick = { vm.requestRemoveTrustedDevice(item) },
                )
            }
        }
    }

    SectionLabel("手动直连（广播隔离时使用）")
    SettingsCard {
        Column(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            RowCopy(
                title = "输入目标 IP:端口",
                detail = "广播被路由器隔离时填写对端 IP（默认端口 41300）；未信任目标将先发起验证码信任配对",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(42.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (AppAppearance.light) Color(0x0D000000) else Color(0x14FFFFFF))
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (manualInput.isEmpty()) {
                        Text("例如 192.168.1.20:41300", fontSize = 14.sp, color = MUTED, maxLines = 1)
                    }
                    BasicTextField(
                        value = manualInput,
                        cursorBrush = SolidColor(CONTROL_BLUE),
                        onValueChange = { manualInput = it },
                        singleLine = true,
                        textStyle = TextStyle(color = TEXT, fontSize = 14.sp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                PillButton(
                    label = if (vm.busy) "处理中…" else "直连",
                    filled = true,
                    enabled = !vm.busy && manualInput.trim().isNotEmpty(),
                    onClick = { vm.sendDirect(manualInput) },
                )
            }
        }
    }

    val untrustedDevices = remember(vm.devices, trustedIds) {
        vm.devices.filter { it.id !in trustedIds }.sortedBy { it.name }
    }
    SectionLabel("附近未信任设备")
    Text(
        "此处仅用于发现附近未信任设备并发起「加入信任圈」，已信任设备请直接在上方信任圈中操作。",
        fontSize = 12.sp,
        color = MUTED,
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, bottom = 10.dp),
    )
    SettingsCard {
        if (vm.devices.isEmpty()) {
            Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    color = MUTED,
                    strokeWidth = 2.dp,
                )
                Text("正在寻找附近的 LxMine…", fontSize = 14.sp, color = MUTED)
            }
        } else if (untrustedDevices.isEmpty()) {
            Text(
                "附近发现的 ${vm.devices.size} 台设备均已在上方信任圈内，请在信任圈中发送或管理。",
                fontSize = 13.sp,
                color = MUTED,
                modifier = Modifier.fillMaxWidth().padding(18.dp),
            )
        }
        untrustedDevices.forEach { device ->
            val platformLabel = when (device.platform) {
                "harmony" -> "HarmonyOS"
                "android" -> "Android"
                "win32", "windows" -> "Windows"
                "darwin", "macos" -> "macOS"
                "linux" -> "Linux"
                else -> device.platform
            }
            val meta = buildList {
                add("未信任")
                add(platformLabel)
                add("${device.address}:${device.port}")
                if (device.ssid.isNotEmpty()) add(device.ssid)
                if (device.autoSyncPlaylists) add("自动同步已开启")
            }.joinToString(" · ")
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RowCopy(title = device.name, detail = meta, modifier = Modifier.weight(1f))
                PillButton(
                    label = "加入信任圈",
                    filled = true,
                    enabled = !vm.busy,
                    onClick = { vm.pairDevice(device) },
                )
            }
        }
    }
    if (vm.message.isNotEmpty()) {
        Text(vm.message, fontSize = 13.sp, color = ACCENT, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
    }
}

/** 音源页：选择文件 / 粘贴脚本 / 启用 / 移除（对应 NativeSettings 的 sourcesOnly 模式）。 */
@Composable
private fun SourcesPage(vm: AppViewModel) {
    val scroll = rememberScrollState()
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    LaunchedEffect(scroll, density) {
        snapshotFlow { scroll.value to scroll.isScrollInProgress }.collect { (offset, moving) ->
            vm.homeScroll(offset / density, canTrackDock = moving)
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(top = vm.headerHeight().dp, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            GlassSurfaceButton("批量导入音源", Modifier.weight(1f)) { vm.showFilePicker(forSource = true) }
            GlassSurfaceButton("粘贴脚本", Modifier.weight(1f)) { vm.openSheet("添加音源") }
        }
        SettingsCard(spacing = 0.dp) {
            vm.sources.forEach { source ->
                SourceRow(vm, source)
            }
        }
        Text(
            "播放使用你启用的音源，公共搜索无需登录。",
            fontSize = 12.sp,
            color = MUTED,
            modifier = Modifier.padding(start = 4.dp, top = 10.dp),
        )
    }
}

@Composable
private fun SourceRow(vm: AppViewModel, source: SyncSourcePayload) {
    val sourceMenu = rememberGlassMenuTrigger {
        listOf(
            GlassMenuItem("启用此音源") { vm.activateSource(source) },
            GlassMenuItem("移除音源") { vm.removeSource(source) },
        )
    }
    Row(
        modifier = Modifier.fillMaxWidth()
            .semantics { selected = vm.activeId == source.id }
            .combinedClickable(
                role = Role.RadioButton,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { vm.activateSource(source) },
                onLongClick = { sourceMenu.show() },
            ).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .padding(6.dp)
                .size(20.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(if (vm.activeId == source.id) ACCENT else Color.Transparent)
                .then(
                    if (vm.activeId == source.id) Modifier
                    else Modifier.border(1.5.dp, MUTED, androidx.compose.foundation.shape.CircleShape)
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (vm.activeId == source.id) {
                Canvas(Modifier.size(16.dp)) {
                    val joint = Offset(size.width * 0.42f, size.height * 0.72f)
                    drawLine(ON_ACCENT, Offset(size.width * 0.2f, size.height * 0.5f), joint, 2.dp.toPx(), StrokeCap.Round)
                    drawLine(ON_ACCENT, joint, Offset(size.width * 0.83f, size.height * 0.28f), 2.dp.toPx(), StrokeCap.Round)
                }
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(source.name, fontSize = 16.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (vm.activeId == source.id) "当前使用" else source.version.ifEmpty { "自定义音源" },
                fontSize = 12.sp,
                color = MUTED,
            )
        }
        Box(
            Modifier.size(22.dp).then(sourceMenu.modifier)
                .semantics { contentDescription = "音源操作" }
                .tapNoRipple { sourceMenu.show() },
            contentAlignment = Alignment.Center,
        ) {
            AssetIcon("ic_more.svg", size = 22.dp, tint = TEXT)
        }
    }
}

@Composable
fun GlassSurfaceButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    GlassSurface(
        modifier = modifier.height(44.dp).tapNoRipple(onClick),
        shape = RoundedCornerShape(22.dp),
        tone = GlassTone.UltraThin,
        interactive = true,
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(label, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = LocalGlassInk.current)
        }
    }
}

/** 文件选择：音源脚本 / 歌单文件（对应鸿蒙 DocumentViewPicker）。 */
fun AppViewModel.showFilePicker(forSource: Boolean) {
    pendingFilePickForSource = forSource
    // 由 AppScreen 观察这个标记去拉起系统文件选择器。
    filePickRequest = System.currentTimeMillis()
}
