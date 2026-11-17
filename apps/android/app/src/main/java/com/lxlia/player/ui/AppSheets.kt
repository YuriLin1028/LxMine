package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun AppSheets(vm: AppViewModel) {
    if (vm.sourceImportReport.isNotEmpty()) {
        GlassDialog(onDismiss = { vm.sourceImportReport = "" }) {
            Text("音源导入结果", fontSize = 24.sp, fontWeight = FontWeight.Medium, color = TEXT)
            Text(vm.sourceImportReport, fontSize = 14.sp, color = TEXT,
                modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp).verticalScroll(rememberScrollState()))
            PillButton("完成", filled = false, textual = true) { vm.sourceImportReport = "" }
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
    if (!vm.showSheet) {
        return
    }
    if (vm.sheet == "添加到歌单") {
        AddToPlaylistDialog(vm)
        return
    }
    GlassSheet(onDismiss = { vm.closeSheet() }, wide = vm.wide, large = vm.sheet == "播放队列") {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (vm.sheet == "播放队列") Modifier.fillMaxHeight() else Modifier)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(vm.sheet, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TEXT, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                when (vm.sheet) {
                    "播放队列" -> PillButton("完成", filled = false, textual = true) { vm.closeSheet() }
                    else -> {
                        PillButton("取消", filled = false, textual = true, enabled = !vm.busy) { vm.closeSheet() }
                        PillButton(
                            if (vm.busy) "处理中…" else when (vm.sheet) {
                                "新建歌单" -> "创建"
                                "导入歌单" -> "导入"
                                else -> "添加"
                            },
                            filled = true,
                            textual = true,
                            enabled = !vm.busy && vm.draft.trim().isNotEmpty(),
                        ) { vm.submitSheet() }
                    }
                }
            }
            when (vm.sheet) {
                "播放队列" -> SongListInputQueue(vm, Modifier.weight(1f))
                else -> {
                    if (vm.error.isNotEmpty()) {
                        Text(vm.error, fontSize = 13.sp, color = Color(0xFFFFB4B4))
                    }
                    Text(
                        when (vm.sheet) {
                            "导入歌单" -> "粘贴网易云、QQ、酷我、酷狗、汽水的分享内容，或选择 .lxmc / JSON 文件。汽水歌曲播放时匹配同名同歌手版本。"
                            "添加音源" -> "粘贴 LX 音源脚本，或一次选择多个 .js / .txt 文件。"
                            else -> "输入歌单名称"
                        },
                        fontSize = 14.sp,
                        color = MUTED,
                    )
                    if (vm.sheet == "新建歌单") {
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

@Composable
private fun ConfirmRemovalDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    GlassDialog(onDismiss = onDismiss) {
        Text(title, fontSize = 24.sp, fontWeight = FontWeight.Medium, color = TEXT, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(message, fontSize = 16.sp, color = TEXT, maxLines = 4, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)) {
            PillButton("取消", filled = false, textual = true, onClick = onDismiss)
            PillButton(confirmLabel, filled = false, textual = true, onClick = onConfirm)
        }
    }
}

@Composable
private fun EditBox(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    height: androidx.compose.ui.unit.Dp,
    singleLine: Boolean = false,
    onSubmit: () -> Unit = {},
) {
    val focusRequester = androidx.compose.runtime.remember { androidx.compose.ui.focus.FocusRequester() }
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x14FFFFFF))
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
private fun SongListInputQueue(vm: AppViewModel, modifier: Modifier) {
    val songs = vm.queue
    LazyColumn(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        itemsIndexed(songs, key = { index, song -> "${song.key}:$index" }) { _, song ->
            SongRow(
                song = song,
                active = vm.selected?.key == song.key,
                liked = vm.liked(song),
                wide = vm.wide,
                onClick = { vm.playSong(song, songs) },
                onLike = { vm.like(song) },
                onMore = { vm.addToPlaylist(song) },
                onDownload = { vm.downloadSong(song) },
            )
        }
    }
}

@Composable
private fun AddToPlaylistDialog(vm: AppViewModel) {
    GlassDialog(onDismiss = { vm.closeSheet() }) {
        Text("添加到歌单", fontSize = 24.sp, fontWeight = FontWeight.Medium, color = TEXT, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(vm.addToPlaylistSong?.name.orEmpty(), fontSize = 16.sp, color = TEXT, maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
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
                Modifier.fillMaxWidth().heightIn(max = 360.dp).verticalScroll(rememberScrollState()),
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

/** 接收同步确认：与鸿蒙 askIncoming 同一段文案与按钮语义。 */
@Composable
internal fun IncomingSyncDialog(vm: AppViewModel) {
    val request = vm.incoming ?: return
    GlassDialog(onDismiss = { }) {
        Text("接收同步", fontSize = 24.sp, fontWeight = FontWeight.Medium, color = TEXT, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(
            "「${request.peerName}」将发送 ${request.summary.playlists} 个歌单、${request.summary.sources} 个音源及 ${request.summary.settings} 项设置。接收后覆盖本机对应数据。",
            color = MUTED,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Spacer(Modifier.weight(1f))
            PillButton("拒绝", filled = false, textual = true, enabled = !vm.applying) { vm.respondSync(false) }
            PillButton("接收并覆盖", filled = false, textual = true, enabled = !vm.applying) { vm.respondSync(true) }
        }
    }
}
