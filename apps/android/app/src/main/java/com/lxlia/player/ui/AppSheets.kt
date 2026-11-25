package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 独立页顶栏统一的纯文字操作按钮（对齐鸿蒙 ButtonStyleMode.TEXTUAL）。 */
@Composable
internal fun SheetHeaderTextAction(
    label: String,
    color: Color = ACCENT,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        fontSize = 15.sp,
        fontWeight = FontWeight.Medium,
        color = color.copy(alpha = if (enabled) 1f else 0.4f),
        maxLines = 1,
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .pressDeform()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    )
}

@Composable
fun AppSheets(vm: AppViewModel) {
    if (vm.sourceImportReport.isNotEmpty()) {
        GlassDialog(onDismiss = { vm.sourceImportReport = "" }) {
            Text("音源导入结果", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = TEXT)
            Text(
                vm.sourceImportReport,
                fontSize = 14.sp,
                color = TEXT,
                modifier = Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                SheetHeaderTextAction("完成", color = ACCENT) { vm.sourceImportReport = "" }
            }
        }
        return
    }
    vm.pendingDeletePlaylist?.let { playlist ->
        ConfirmRemovalDialog(
            title = "删除歌单",
            message = "删除「${playlist.name}」？",
            confirmLabel = "删除",
            onDismiss = { vm.pendingDeletePlaylist = null },
            onConfirm = { vm.confirmDeletePlaylist() },
        )
        return
    }
    vm.pendingRemoveSource?.let { source ->
        ConfirmRemovalDialog(
            title = "移除音源",
            message = "移除「${source.name}」？",
            confirmLabel = "移除",
            onDismiss = { vm.pendingRemoveSource = null },
            onConfirm = { vm.confirmRemoveSource() },
        )
        return
    }
    vm.pendingRemoveTrusted?.let { item ->
        ConfirmRemovalDialog(
            title = "移出信任圈",
            message = "确定将「${item.name}」移出设备信任圈吗？移出后双方将无法手动发送或自动同步数据。",
            confirmLabel = "确认移出",
            onDismiss = { vm.pendingRemoveTrusted = null },
            onConfirm = { vm.confirmRemoveTrustedDevice() },
        )
        return
    }
    if (vm.pendingClearRecent) {
        ConfirmRemovalDialog(
            title = "清空最近播放",
            message = "确定清空全部 ${vm.recentSongs.size} 条最近播放记录？",
            confirmLabel = "清空",
            onDismiss = { vm.pendingClearRecent = false },
            onConfirm = { vm.confirmClearRecentSongs() },
        )
        return
    }
    val navBottom = if (vm.wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    if (vm.moreSubSheet.isNotEmpty()) {
        val sub = vm.moreSubSheet
        val subLarge = sub == "音效"
        key("sub:$sub") {
            GlassSheet(onDismiss = { vm.moreSubSheet = "" }, wide = vm.wide, large = subLarge) {
                if (subLarge) {
                    FixedSheetScrollScaffold(
                        headerBlurHeight = 86f,
                        header = {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 24.dp, end = 20.dp, top = 20.dp, bottom = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text("音效", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(com.lxlia.player.audio.AudioFxPresets.summary(vm.audioFx), fontSize = 12.sp, color = ACCENT, maxLines = 1)
                                }
                                SheetHeaderTextAction("完成", color = ACCENT) { vm.moreSubSheet = "" }
                            }
                        },
                    ) {
                        PlayerAudioFxSheetContent(
                            vm = vm,
                            topPadding = 86.dp,
                            bottomPadding = navBottom + 28.dp,
                        )
                    }
                } else {
                    val sleepStatus = when (vm.sleepMode) {
                        "off" -> "当前未开启定时关闭"
                        "song" -> "将在本首歌曲播放完成后自动暂停"
                        else -> "倒计时剩余：${vm.sleepRemainingText.ifEmpty { "已开启" }}"
                    }
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("定时关闭", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(sleepStatus, fontSize = 12.sp, color = if (vm.sleepMode != "off") ACCENT else MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            SheetHeaderTextAction("完成", color = ACCENT) { vm.moreSubSheet = "" }
                        }
                        PlayerSleepTimerSheetContent(vm, Modifier.weight(1f, fill = false))
                    }
                }
            }
        }
        return
    }
    if (!vm.showSheet) {
        return
    }
    if (vm.sheet == "添加到歌单") {
        AddToPlaylistDialog(vm)
        return
    }
    val largeSheet = vm.sheet == "播放队列" || vm.sheet == "更多" || vm.sheet == "耳返监听"
    key("main:${vm.sheet}") {
        GlassSheet(onDismiss = { vm.closeSheet() }, wide = vm.wide, large = largeSheet) {
            if (largeSheet) {
                FixedSheetScrollScaffold(
                    headerBlurHeight = 76f,
                    header = {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 24.dp, end = 20.dp, top = 20.dp, bottom = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    vm.sheet,
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TEXT,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (vm.sheet == "耳返监听") {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(ACCENT.copy(alpha = 0.2f))
                                            .padding(horizontal = 8.dp, vertical = 3.dp),
                                    ) {
                                        Text("Beta", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ACCENT)
                                    }
                                }
                            }
                            if (vm.sheet == "播放队列" && vm.queue.size > 1) {
                                SheetHeaderTextAction("排序", color = TEXT) {
                                    vm.openSubSheetFromSheet("播放队列") {
                                        vm.queueOrderOpen = true
                                    }
                                }
                            }
                            SheetHeaderTextAction("完成", color = ACCENT, enabled = !vm.busy) { vm.closeSheet() }
                        }
                    },
                ) {
                    when (vm.sheet) {
                        "播放队列" -> SongListInputQueue(vm, topPadding = 74.dp, bottomPadding = navBottom + 28.dp)
                        "更多" -> PlayerMoreSheet(vm, topPadding = 74.dp, bottomPadding = navBottom + 28.dp)
                        "耳返监听" -> EarMonitorSheetContent(vm, topPadding = 74.dp, bottomPadding = navBottom + 28.dp)
                    }
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 24.dp, end = 24.dp, top = 22.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            vm.sheet,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = TEXT,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        SheetHeaderTextAction("取消", color = MUTED, enabled = !vm.busy) { vm.closeSheet() }
                        SheetHeaderTextAction(
                            label = if (vm.busy) "处理中…" else when (vm.sheet) {
                                "新建歌单" -> "创建"
                                "重命名歌单" -> "保存"
                                "导入歌单" -> "导入"
                                else -> "添加"
                            },
                            color = ACCENT,
                            enabled = !vm.busy && vm.draft.trim().isNotEmpty(),
                        ) { vm.submitSheet() }
                    }
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        if (vm.error.isNotEmpty()) {
                            Text(vm.error, fontSize = 13.sp, color = Color(0xFFFFB4B4))
                        }
                        Text(
                            when (vm.sheet) {
                                "导入歌单" -> "粘贴网易云、QQ、酷我、酷狗、汽水的分享内容，或选择 .lxmc / JSON 文件。汽水歌曲播放时匹配同名同歌手版本。"
                                "添加音源" -> "粘贴 LX 音源脚本，或一次选择多个 .js / .txt 文件。"
                                "重命名歌单" -> "输入新的歌单名称"
                                else -> "输入歌单名称"
                            },
                            fontSize = 14.sp,
                            color = MUTED,
                        )
                        if (vm.sheet == "新建歌单" || vm.sheet == "重命名歌单") {
                            EditBox(
                                value = vm.draft,
                                onValueChange = { vm.draft = it },
                                placeholder = "歌单名称",
                                height = 48.dp,
                                singleLine = true,
                                onSubmit = { vm.submitSheet() },
                            )
                        } else {
                            EditBox(
                                value = vm.draft,
                                onValueChange = { vm.draft = it },
                                placeholder = "在这里粘贴…",
                                height = 180.dp,
                            )
                        }
                        if (vm.sheet == "导入歌单" || vm.sheet == "添加音源") {
                            GlassSurfaceButton(
                                if (vm.sheet == "导入歌单") "选择歌单文件" else "批量导入音源",
                                Modifier.fillMaxWidth(),
                            ) {
                                vm.showFilePicker(forSource = vm.sheet == "添加音源")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfirmRemovalDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    GlassDialog(onDismiss = onDismiss) {
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = TEXT, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(message, fontSize = 15.sp, color = MUTED, maxLines = 4, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)) {
            SheetHeaderTextAction("取消", color = MUTED, onClick = onDismiss)
            SheetHeaderTextAction(confirmLabel, color = HEART_RED, onClick = onConfirm)
        }
    }
}

@Composable
private fun EditBox(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    height: Dp,
    singleLine: Boolean = false,
    onSubmit: () -> Unit = {},
) {
    val focusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(14.dp))
            .background(INPUT_BG)
            .tapNoRipple {
                runCatching { focusRequester.requestFocus() }
            }
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        if (value.isEmpty()) {
            Text(placeholder, fontSize = 15.sp, color = MUTED)
        }
        BasicTextField(
            value = value,
            cursorBrush = SolidColor(CONTROL_BLUE),
            onValueChange = onValueChange,
            keyboardOptions = KeyboardOptions(imeAction = if (singleLine) ImeAction.Done else ImeAction.Default),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            singleLine = singleLine,
            textStyle = TextStyle(color = TEXT, fontSize = 15.sp),
            modifier = Modifier
                .fillMaxSize()
                .focusRequester(focusRequester),
        )
    }
}

@Composable
private fun SongListInputQueue(
    vm: AppViewModel,
    topPadding: Dp = 74.dp,
    bottomPadding: Dp = 28.dp,
) {
    val songs = vm.queue
    val likedKeys = vm.likedKeys
    val listState = rememberLazyListState()
    var initialPositioned by remember { mutableStateOf(false) }
    LaunchedEffect(songs.size, vm.selected?.key) {
        val activeKey = vm.selected?.key ?: return@LaunchedEffect
        val index = songs.indexOfFirst { it.key == activeKey }
        if (index >= 0) {
            kotlinx.coroutines.yield()
            val viewport = (listState.layoutInfo.viewportEndOffset - listState.layoutInfo.viewportStartOffset).coerceAtLeast(0)
            val centerOffset = if (viewport > 180) -(viewport / 3) else -96
            if (!initialPositioned) {
                initialPositioned = true
                runCatching { listState.scrollToItem(index, centerOffset) }
            } else {
                runCatching { listState.animateScrollToItem(index, centerOffset) }
            }
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = topPadding, bottom = bottomPadding),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        itemsIndexed(songs, key = { index, song -> "${song.key}:$index" }) { index, song ->
            SongRow(
                song = song,
                active = vm.selected?.key == song.key,
                liked = song.key in likedKeys,
                wide = vm.wide,
                onClick = { vm.playSong(song, songs) },
                onLike = { vm.like(song) },
                onMore = { vm.addToPlaylist(song) },
                onDownload = { vm.downloadSong(song) },
                onPlayNext = if (vm.selected?.key != song.key) ({ vm.playNext(song) }) else null,
                onSwitchPlatform = if (song.source != "local") ({ vm.openSwitchPlatformFromQueue(index, song) }) else null,
                onRemove = { vm.removeFromQueue(song) },
                removeLabel = "从队列移除",
            )
        }
    }
}

@Composable
private fun AddToPlaylistDialog(vm: AppViewModel) {
    GlassDialog(onDismiss = { vm.closeSheet() }) {
        Text("添加到歌单", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = TEXT, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(vm.addToPlaylistSong?.name.orEmpty(), fontSize = 15.sp, color = MUTED, maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        if (vm.addToPlaylistChoices.size <= 2) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                vm.addToPlaylistChoices.forEach { playlist ->
                    PillButton(playlist.name, filled = false, textual = true, modifier = Modifier.weight(1f)) {
                        vm.commitAddToPlaylist(playlist.id)
                    }
                }
            }
        } else {
            Column(
                Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                vm.addToPlaylistChoices.forEach { playlist ->
                    PillButton(playlist.name, filled = false, textual = true, modifier = Modifier.fillMaxWidth()) {
                        vm.commitAddToPlaylist(playlist.id)
                    }
                }
            }
        }
    }
}

/** 接收同步或信任圈配对确认：通过主窗口 GlassDialog 呈现，严格对齐鸿蒙与桌面端文案语义。 */
@Composable
internal fun IncomingSyncDialog(vm: AppViewModel) {
    val request = vm.incoming ?: return
    val isPair = request.kind == "pair"
    val platformLabel = when (request.platform) {
        "harmony" -> "HarmonyOS"
        "android" -> "Android"
        "win32", "windows" -> "Windows"
        "darwin", "macos" -> "macOS"
        "linux" -> "Linux"
        else -> request.platform.ifEmpty { "设备" }
    }
    GlassDialog(onDismiss = { }, dismissible = false) {
        Text(
            if (isPair) "信任圈加入请求" else "接收同步",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            color = TEXT,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        if (isPair) {
            Text(
                "「${request.peerName}」（$platformLabel）请求加入您的设备信任圈。请核对对方屏幕上的验证码，确认后可与本机互相发送及自动同步歌单：",
                color = MUTED,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (AppAppearance.light) Color(0x140A66C2) else Color(0x1F64D2FF))
                    .padding(vertical = 12.dp, horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = com.lxlia.player.lx.formatPairCode(request.pairCode),
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 4.sp,
                    color = ACCENT,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                )
            }
            if (request.transitive) {
                Text(
                    "对方已开启「信任圈成员互通」：若本机也开启此开关，确认后双方信任圈内已有设备将自动互相加入。",
                    color = MUTED,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        } else {
            Text(
                "已信任设备「${request.peerName}」将发送 ${request.summary.playlists} 个歌单、${request.summary.sources} 个音源及 ${request.summary.settings} 项设置。接收后覆盖本机对应数据。",
                color = MUTED,
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)) {
            SheetHeaderTextAction("拒绝", color = MUTED, enabled = !vm.applying) { vm.respondSync(false) }
            SheetHeaderTextAction(
                if (isPair) "信任此设备" else "接收并覆盖",
                color = ACCENT,
                enabled = !vm.applying,
            ) { vm.respondSync(true) }
        }
    }
}
