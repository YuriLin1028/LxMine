package com.lxlia.player.ui

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
    if (vm.sourcesOpen) {
        SourcesPage(vm)
        return
    }
    val scroll = rememberScrollState(initial = if (vm.settingsPanel == "main") vm.settingsScrollOffset else 0)
    var previousPanel by rememberSaveable { mutableStateOf(vm.settingsPanel) }
    LaunchedEffect(vm.settingsPanel) {
        if (previousPanel != vm.settingsPanel) {
            if (previousPanel == "main") vm.settingsScrollOffset = scroll.value
            scroll.scrollTo(if (vm.settingsPanel == "main") vm.settingsScrollOffset else 0)
            previousPanel = vm.settingsPanel
        }
    }
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.value to scroll.isScrollInProgress }.collect { (offset, moving) ->
            if (vm.tab == "设置" && !vm.showPlayer && !vm.sourcesOpen) {
                if (vm.settingsPanel == "main") vm.settingsScrollOffset = offset
                vm.homeScroll(offset.toFloat(), canTrackDock = moving)
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
        when (vm.settingsPanel) {
            "lyrics" -> LyricSettingsPanel(vm)
            "sync" -> SyncPanel(vm)
            else -> SettingsMainPanel(vm)
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
    SectionLabel("播放")
    SettingsCard {
        SelectRow(
            title = "音质",
            detail = "播放和下载优先使用该档位",
            labels = listOf("标准 128k", "高品质 320k", "无损 flac"),
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
        SelectRow(
            title = "MineRadio 动效",
            detail = "仅播放页生效，关闭后保留模糊封面与纯文字歌词",
            labels = MINE_RADIO_MODES.map { it.label },
            values = MINE_RADIO_MODES.map { it.id },
            current = vm.styleName,
            onSelect = { vm.setStyleName(it) },
        )
        val pickBgLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
            contract = androidx.activity.result.contract.ActivityResultContracts.GetContent(),
        ) { uri -> if (uri != null) vm.importStageBgImage(uri) }
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RowCopy(
                    title = "播放页背景透明度",
                    detail = "实时调节封面或自定义背景图的透明程度，所有动效模式生效",
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${(vm.stageBgOpacity * 100).roundToInt()}%",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = ACCENT,
                )
            }
            androidx.compose.material3.Slider(
                value = vm.stageBgOpacity,
                onValueChange = { vm.updateStageBgOpacity(it) },
                valueRange = 0f..1f,
                colors = androidx.compose.material3.SliderDefaults.colors(
                    thumbColor = Color.White,
                    activeTrackColor = ACCENT,
                ),
            )
        }
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
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(ACCENT)
                    .clickable { pickBgLauncher.launch("image/*") }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            ) {
                Text("选择图片", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF081018))
            }
            if (vm.stageBgImagePath.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (AppAppearance.light) Color(0x14000000) else Color(0x18FFFFFF))
                        .clickable { vm.clearStageBgImage() }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text("恢复默认", fontSize = 12.sp, color = TEXT)
                }
            }
        }
        ToggleRow(
            title = "旋转锁定时允许播放页横屏",
            detail = "开启后即使系统开启竖屏锁定，横置手机仍可进入横屏沉浸播放；关闭则跟随系统方向锁定",
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
    SectionLabel("歌词")
    SettingsCard {
        LinkRow(
            title = "歌词设置",
            detail = "详情页颜色、字号、翻译／罗马音与时间偏移",
            onClick = { vm.openSettingsPanel("lyrics") },
        )
    }
    SectionLabel("系统与互联")
    SettingsCard {
        SelectRow(
            title = "外观",
            detail = "全局配色，播放页背景随之调整",
            labels = listOf("深色", "浅色", "跟随系统"),
            values = listOf("dark", "light", "system"),
            current = vm.appearance,
            onSelect = { vm.appearance = it; vm.save() },
        )
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
            title = "局域网同步",
            detail = "手机、平板与电脑之间双向同步歌单、音源和设置",
            label = "管理",
            onClick = { vm.openSettingsPanel("sync") },
        )
        LinkRow(
            title = "下载管理",
            detail = "${vm.downloadItems.count { it.state == "complete" }} 首已完成",
            label = "查看",
            onClick = { vm.openDownloads() },
        )
    }
    SectionLabel("关于")
    SettingsCard {
        LinkRow(
            title = "LxMine",
            detail = "LX 音源 · MineRadio 视觉 · 手机和平板同源界面",
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
    Text(
        "LxMine · 1.2.0\n融合 LX Music 与 MineRadio",
        fontSize = 12.sp,
        color = MUTED,
        lineHeight = 22.sp,
        modifier = Modifier.padding(top = 32.dp, bottom = 28.dp, start = 4.dp),
    )
}

@Composable
private fun LyricSettingsPanel(vm: AppViewModel) {
    val previewText = vm.lyrics.lastOrNull { it.timeMs <= vm.positionMs }?.text ?: "音乐在这里，与你相遇"
    val scalePercent = (vm.lyricPrefs.lyricScale * 100f).roundToInt().coerceIn(75, 140)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFF151619))
            .padding(24.dp),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                previewText,
                fontSize = (22f * vm.lyricPrefs.lyricScale).sp,
                fontWeight = FontWeight.Medium,
                color = parseColor(vm.previewPrimary()),
                maxLines = 2,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Box(
                Modifier
                    .fillMaxWidth(0.7f)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Brush.horizontalGradient(listOf(parseColor(vm.previewPrimary()), parseColor(vm.previewSecondary())))),
            )
        }
    }
    SectionLabel("播放详情页歌词")
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
            ColorInputRow("主色", vm.lyricPrefs.primary, "#7DD3FC") { vm.setLyricPrimary(it) }
            if (vm.lyricPrefs.colorMode.endsWith("gradient")) {
                ColorInputRow("辅色", vm.lyricPrefs.secondary, "#A5B4FC") { vm.setLyricSecondary(it) }
            }
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("歌词字体大小", "调整播放详情页歌词字号比例（75%–140%）", Modifier.weight(1f))
                Text("$scalePercent%", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TEXT)
                if (abs(vm.lyricPrefs.lyricScale - 1f) >= 0.01f) {
                    Box(
                        Modifier.height(36.dp).padding(start = 4.dp).tapNoRipple { vm.setLyricScale(1f) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("重置", fontSize = 14.sp, color = BLUE)
                    }
                }
            }
            GlassSlider(
                value = scalePercent.toFloat(),
                onValueChange = { percent -> vm.setLyricScale(percent / 100f) },
                valueRange = 75f..140f,
                step = 1f,
            )
        }
        ToggleRow(
            title = "显示翻译",
            detail = "在主歌词下方显示中文等翻译歌词（数据源提供时）",
            value = vm.lyricPrefs.showTranslation,
            onChange = { vm.setShowTranslation(it) },
        )
        ToggleRow(
            title = "显示音译 / 罗马音",
            detail = "外语歌词显示音译或罗马音（数据源提供时）",
            value = vm.lyricPrefs.showRomaji,
            onChange = { vm.setShowRomaji(it) },
        )
    }
    SectionLabel("时间")
    SettingsCard {
        var offsetDraft by remember { mutableStateOf(vm.lyricOffset.toString()) }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RowCopy("时间偏移", "正值提前显示，负值延后显示", Modifier.weight(1f))
                Box(
                    Modifier.width(74.dp).height(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
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
                Box(
                    Modifier.width(64.dp).height(40.dp).tapNoRipple {
                        offsetDraft = "0"
                        vm.setLyricOffset(0)
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("重置", fontSize = 16.sp, color = BLUE)
                }
            }
            GlassSlider(
                value = vm.lyricOffset.toFloat(),
                onValueChange = { value ->
                    val offset = value.toLong()
                    offsetDraft = offset.toString()
                    vm.setLyricOffset(offset)
                },
                valueRange = -10000f..10000f,
                step = 100f,
            )
        }
    }
}

@Composable
private fun ColorInputRow(label: String, value: String, placeholder: String, onChange: (String) -> Unit) {
    var draft by remember(value) { mutableStateOf(value) }
    Row(
        modifier = Modifier.fillMaxWidth().padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RowCopy(label, "#RRGGBB", Modifier.weight(1f))
        Box(Modifier.size(24.dp).clip(RoundedCornerShape(12.dp)).background(parseColor(value)))
        Box(
            Modifier.width(116.dp).height(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            BasicTextField(
                value = draft,
                cursorBrush = SolidColor(CONTROL_BLUE),
                onValueChange = { next ->
                    draft = next
                    if (Regex("^#[0-9a-fA-F]{6}$").matches(next)) onChange(next)
                },
                singleLine = true,
                textStyle = TextStyle(color = TEXT, fontSize = 16.sp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp),
                decorationBox = { inner ->
                    Box {
                        if (draft.isEmpty()) Text(placeholder, color = MUTED, fontSize = 16.sp)
                        inner()
                    }
                },
            )
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
            detail = "开启后与同样开启此项的设备自动合并歌单与喜欢列表（保留最新修改，不覆盖音源与设置）",
            value = vm.lanAutoSync,
            onChange = { vm.setLanAutoSync(it) },
        )
    }

    SectionLabel("手动直连发送")
    SettingsCard {
        Column(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            RowCopy(
                title = "输入目标 IP:端口",
                detail = "广播被路由器隔离时，可直接填写接收端 IP（默认端口 41300）发送整份同步",
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
                    label = if (vm.busy) "发送中…" else "发送",
                    filled = true,
                    enabled = !vm.busy && manualInput.trim().isNotEmpty(),
                    onClick = { vm.sendDirect(manualInput) },
                )
            }
        }
    }

    SectionLabel("附近设备")
    Text(
        "发送后由对方确认接收，支持手机、平板与电脑之间双向同步。",
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
        }
        vm.devices.forEach { device ->
            val platformLabel = when (device.platform) {
                "harmony" -> "HarmonyOS"
                "android" -> "Android"
                "win32", "windows" -> "Windows"
                else -> device.platform
            }
            val meta = buildList {
                add(platformLabel)
                add("${device.address}:${device.port}")
                if (device.ssid.isNotEmpty()) add(device.ssid)
                if (device.autoSyncPlaylists) add("自动同步已开启")
            }.joinToString(" · ")
            LinkRow(
                title = device.name,
                detail = meta,
                label = "发送",
                onClick = { vm.send(device) },
            )
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
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.value }.collect { vm.homeScroll(it.toFloat()) }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(top = vm.headerHeight().dp, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Row(Modifier.fillMaxWidth().height(90.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
                    drawLine(INK, Offset(size.width * 0.2f, size.height * 0.5f), joint, 2.dp.toPx(), StrokeCap.Round)
                    drawLine(INK, joint, Offset(size.width * 0.83f, size.height * 0.28f), 2.dp.toPx(), StrokeCap.Round)
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
