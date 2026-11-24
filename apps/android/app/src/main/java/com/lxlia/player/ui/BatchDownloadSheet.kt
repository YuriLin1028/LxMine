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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.Song

/**
 * 批量下载多选固定玻璃独立页（严格对齐鸿蒙 BatchDownloadSheet）。
 */
@Composable
fun BatchDownloadDialog(
    title: String = "选择要下载的歌曲",
    songs: List<Song>,
    qualityLabel: String = "标准 128k",
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onDismiss: () -> Unit,
    onConfirm: (List<Song>) -> Unit,
) {
    val checkedMap = remember(songs) {
        mutableStateMapOf<String, Boolean>().apply {
            songs.forEach { put(it.key, true) }
        }
    }
    val chosen = songs.filter { checkedMap[it.key] == true }
    val allSelected = songs.isNotEmpty() && chosen.size == songs.size
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

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
                        Text("勾选需要批量下载的歌曲（当前音质：$qualityLabel）", fontSize = 12.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                        "开始下载（${chosen.size} 首）",
                        filled = true,
                        enabled = chosen.isNotEmpty(),
                        onClick = { onConfirm(chosen) },
                    )
                }
            },
        ) {
            if (songs.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(top = 84.dp), contentAlignment = Alignment.Center) {
                    Text("当前列表没有可下载的在线歌曲", fontSize = 14.sp, color = MUTED)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 84.dp, bottom = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item(key = "batch-dl-toolbar") {
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
                        }
                    }
                }
            }
        }
    }
}
