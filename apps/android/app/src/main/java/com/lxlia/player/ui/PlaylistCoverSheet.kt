package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.MusicPlaylist

/**
 * 自定义歌单封面选择器（严格对齐鸿蒙 PlaylistCoverSheet）：
 * 固定玻璃独立页 + 顶部渐进模糊 + 等宽网格无末尾拉伸 + 本地相册/歌单内封面选取。
 */
@Composable
fun PlaylistCoverDialog(
    playlist: MusicPlaylist,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onDismiss: () -> Unit,
    onPickLocalImage: () -> Unit,
    onSelectCover: (String) -> Unit,
) {
    val coverCandidates = remember(playlist.id, playlist.songs) {
        playlist.songs
            .filter { it.coverUrl.isNotBlank() }
            .distinctBy { it.coverUrl }
            .take(24)
    }
    val cols = if (wide) 4 else 3
    val rows = remember(coverCandidates, cols) { coverCandidates.chunked(cols) }
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
                        Text("自定义歌单封面", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text(
                            "「${playlist.name}」· 选取歌单内歌曲封面或本地图片",
                            fontSize = 12.sp,
                            color = MUTED,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    SheetHeaderTextAction("关闭", color = MUTED, onClick = onDismiss)
                }
            },
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 22.dp, end = 22.dp, top = 84.dp, bottom = navBottom + 28.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "cover-actions") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                                .clip(RoundedCornerShape(19.dp))
                                .background(ACCENT)
                                .pressDeform()
                                .clickable(onClick = onPickLocalImage),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("从本地选择图片", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ON_ACCENT)
                        }
                        if (playlist.customCover.isNotEmpty()) {
                            Box(
                                modifier = Modifier
                                    .height(38.dp)
                                    .clip(RoundedCornerShape(19.dp))
                                    .background(CHIP_BG)
                                    .pressDeform()
                                    .clickable { onSelectCover("") }
                                    .padding(horizontal = 14.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("恢复默认封面", fontSize = 13.sp, color = TEXT)
                            }
                        }
                    }
                }
                item(key = "cover-section-label") {
                    Text("从歌单内歌曲封面选取", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MUTED)
                }
                if (rows.isEmpty()) {
                    item(key = "cover-empty") {
                        Box(Modifier.fillMaxWidth().padding(vertical = 80.dp), contentAlignment = Alignment.Center) {
                            Text("歌单中暂无可用歌曲封面，可直接从本地选择图片", fontSize = 13.sp, color = MUTED)
                        }
                    }
                } else {
                    itemsIndexed(rows, key = { idx, row -> "cover-row:$idx:${row.firstOrNull()?.coverUrl.orEmpty()}" }) { _, row ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            row.forEach { song ->
                                val selected = playlist.customCover == song.coverUrl
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .clickable { onSelectCover(song.coverUrl) },
                                    verticalArrangement = Arrangement.spacedBy(5.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .aspectRatio(1f)
                                            .clip(RoundedCornerShape(12.dp))
                                            .border(
                                                if (selected) 2.dp else 0.7.dp,
                                                if (selected) ACCENT else BORDER_SUBTLE,
                                                RoundedCornerShape(12.dp),
                                            ),
                                    ) {
                                        RemoteImage(song.coverUrl, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                        if (selected) {
                                            Box(
                                                Modifier
                                                    .align(Alignment.TopEnd)
                                                    .padding(6.dp)
                                                    .size(22.dp)
                                                    .clip(CircleShape)
                                                    .background(ACCENT),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Text("✓", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ON_ACCENT)
                                            }
                                        }
                                    }
                                    Text(song.name, fontSize = 11.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            repeat(cols - row.size) {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}
