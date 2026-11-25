package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song

/**
 * 批量收藏多选固定玻璃独立页（严格遵循固定式独立页与「上模糊、下穿透」规范，对齐鸿蒙 BatchCollectSheet）。
 */
@Composable
fun BatchCollectDialog(
    title: String = "选择要收藏的歌曲",
    songs: List<Song>,
    playlists: List<MusicPlaylist>,
    likedKeys: Set<String>,
    wide: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (selectedSongs: List<Song>, targetPlaylistId: String?, newPlaylistName: String?) -> Unit,
) {
    val checkedMap = remember(songs) {
        mutableStateMapOf<String, Boolean>().apply {
            songs.forEach { put(it.key, true) }
        }
    }
    val customLists = remember(playlists) {
        playlists.filter { it.kind == "lx" && !it.isFavorite && it.name != "我喜欢的" && it.name != "我的收藏" }
    }
    var targetMode by remember { mutableStateOf("favorites") } // "favorites" | "playlist" | "new"
    var targetPlaylistId by remember { mutableStateOf<String?>(null) }
    var targetPlaylistName by remember { mutableStateOf("我的收藏") }
    var newPlaylistName by remember { mutableStateOf("") }

    val targetExistingKeys = remember(targetMode, targetPlaylistId, likedKeys, customLists) {
        when (targetMode) {
            "favorites" -> likedKeys
            "playlist" -> customLists.firstOrNull { it.id == targetPlaylistId }?.songs?.mapTo(HashSet()) { it.key } ?: emptySet()
            else -> emptySet()
        }
    }
    val chosen = songs.filter { checkedMap[it.key] == true }
    val allSelected = songs.isNotEmpty() && chosen.size == songs.size
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val canConfirm = chosen.isNotEmpty() && (targetMode != "new" || newPlaylistName.trim().isNotEmpty())
    val confirmLabel = when (targetMode) {
        "new" -> "新建并收藏（${chosen.size} 首）"
        "favorites" -> "收藏到我喜欢的（${chosen.size} 首）"
        else -> "收藏到「$targetPlaylistName」（${chosen.size} 首）"
    }

    GlassSheet(onDismiss = onDismiss, wide = wide, large = true) {
        FixedSheetScrollScaffold(
            headerBlurHeight = 84f,
            header = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 22.dp, end = 18.dp, top = 20.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("勾选歌曲并选择收藏目标歌单，自动跳过重复曲目", fontSize = 12.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    SheetHeaderTextAction("关闭", color = MUTED, onClick = onDismiss)
                }
            },
            footer = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 22.dp, end = 22.dp, top = 10.dp, bottom = navBottom + 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Spacer(Modifier.weight(1f))
                    PillButton("取消", filled = false, onClick = onDismiss)
                    PillButton(
                        confirmLabel,
                        filled = true,
                        enabled = canConfirm,
                        onClick = {
                            val cleanNew = if (targetMode == "new") newPlaylistName.trim() else null
                            val cleanId = if (targetMode == "playlist") targetPlaylistId else null
                            onConfirm(chosen, cleanId, cleanNew)
                        },
                    )
                }
            },
        ) {
            if (songs.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(top = 84.dp), contentAlignment = Alignment.Center) {
                    Text("当前列表没有可收藏的歌曲", fontSize = 14.sp, color = MUTED)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 84.dp, bottom = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item(key = "batch-collect-targets") {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                @Composable
                                fun TargetChip(label: String, selected: Boolean, onClick: () -> Unit) {
                                    Box(
                                        modifier = Modifier
                                            .height(32.dp)
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(if (selected) ACCENT else CHIP_BG)
                                            .clickable(onClick = onClick)
                                            .padding(horizontal = 13.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            label,
                                            fontSize = 12.sp,
                                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                            color = if (selected) ON_ACCENT else TEXT,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                                TargetChip("我的收藏", targetMode == "favorites") {
                                    targetMode = "favorites"
                                    targetPlaylistId = null
                                    targetPlaylistName = "我的收藏"
                                }
                                customLists.forEach { pl ->
                                    TargetChip(pl.name.ifBlank { "未命名歌单" }, targetMode == "playlist" && targetPlaylistId == pl.id) {
                                        targetMode = "playlist"
                                        targetPlaylistId = pl.id
                                        targetPlaylistName = pl.name.ifBlank { "未命名歌单" }
                                    }
                                }
                                TargetChip("+ 新建歌单", targetMode == "new") {
                                    targetMode = "new"
                                    targetPlaylistId = null
                                    targetPlaylistName = ""
                                }
                            }
                            if (targetMode == "new") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(40.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(INPUT_BG)
                                        .border(1.dp, BORDER_SUBTLE, RoundedCornerShape(12.dp))
                                        .padding(horizontal = 12.dp),
                                    contentAlignment = Alignment.CenterStart,
                                ) {
                                    if (newPlaylistName.isEmpty()) {
                                        Text("输入新歌单名称", fontSize = 13.sp, color = MUTED)
                                    }
                                    BasicTextField(
                                        value = newPlaylistName,
                                        onValueChange = { if (it.length <= 40) newPlaylistName = it },
                                        singleLine = true,
                                        textStyle = TextStyle(color = TEXT, fontSize = 13.sp),
                                        cursorBrush = SolidColor(ACCENT),
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                        }
                    }
                    item(key = "batch-collect-toolbar") {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Checkbox(
                                checked = allSelected,
                                onCheckedChange = { v -> songs.forEach { checkedMap[it.key] = v } },
                                colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                            )
                            Text(
                                "已选 ${chosen.size} / ${songs.size} 首",
                                fontSize = 12.sp,
                                color = TEXT,
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable {
                                        val next = !allSelected
                                        songs.forEach { checkedMap[it.key] = next }
                                    },
                            )
                            Box(
                                modifier = Modifier
                                    .height(30.dp)
                                    .clip(RoundedCornerShape(15.dp))
                                    .background(CHIP_BG)
                                    .clickable {
                                        val next = !allSelected
                                        songs.forEach { checkedMap[it.key] = next }
                                    }
                                    .padding(horizontal = 11.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(if (allSelected) "取消全选" else "全选", fontSize = 12.sp, color = TEXT)
                            }
                            Box(
                                modifier = Modifier
                                    .height(30.dp)
                                    .clip(RoundedCornerShape(15.dp))
                                    .background(CHIP_BG)
                                    .clickable {
                                        songs.forEach { checkedMap[it.key] = !(checkedMap[it.key] == true) }
                                    }
                                    .padding(horizontal = 11.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("反选", fontSize = 12.sp, color = TEXT)
                            }
                        }
                    }
                    itemsIndexed(songs, key = { idx, s -> "${s.key}:$idx" }) { index, song ->
                        val isChecked = checkedMap[song.key] == true
                        val alreadyInTarget = song.key in targetExistingKeys
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isChecked) ACCENT.copy(alpha = 0.08f) else Color.Transparent)
                                .clickable { checkedMap[song.key] = !isChecked }
                                .padding(horizontal = 6.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checkedMap[song.key] = it },
                                colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                            )
                            Text(
                                (index + 1).toString().padStart(2, '0'),
                                fontSize = 11.sp,
                                color = MUTED,
                                modifier = Modifier.width(24.dp),
                            )
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(song.name, fontSize = 13.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(song.singer, fontSize = 10.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (alreadyInTarget) {
                                Text("已在歌单", fontSize = 11.sp, color = MUTED, modifier = Modifier.padding(end = 6.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
