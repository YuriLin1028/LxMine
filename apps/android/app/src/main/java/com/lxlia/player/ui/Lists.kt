package com.lxlia.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.Song

/** 封面 + 平台角标（来源标注统一用封面角标，禁止文字小胶囊）。 */
@Composable
fun SongCover(
    coverUrl: String,
    source: String?,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 48.dp,
    radius: androidx.compose.ui.unit.Dp = 10.dp,
    showBadge: Boolean = true,
) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(radius))
            .background(Color(0x17FFFFFF)),
        contentAlignment = Alignment.Center,
    ) {
        AssetIcon("ic_music.svg", size = size * 0.46f, tint = ACCENT)
        if (coverUrl.isNotEmpty()) {
            RemoteImage(coverUrl, modifier = Modifier.fillMaxWidth().height(size))
        }
        val badge = sourceBadgeAsset(source)
        if (showBadge && badge != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(2.dp).size(15.dp).clip(CircleShape)) {
                AssetIcon(badge, size = 15.dp)
            }
        }
    }
}

/**
 * 搜索、歌单、播放队列共用的歌曲行（禁止自造第二种歌曲行样式）。
 * 宽屏行内直接显示时长/爱心/加号；窄屏显示下载 + 展开箭头。
 */
@Composable
fun SongRow(
    song: Song,
    active: Boolean,
    liked: Boolean,
    wide: Boolean,
    showDownload: Boolean = true,
    onClick: () -> Unit,
    onLike: () -> Unit,
    onMore: () -> Unit,
    onDownload: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (active) Color(0x0FFFFFFF) else Color.Transparent)
            .clickable { onClick() },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 9.dp, bottom = 9.dp, start = 8.dp, end = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SongCover(song.coverUrl, song.source)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    song.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (active) ACCENT else TEXT,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    song.singer,
                    fontSize = 11.sp,
                    color = MUTED,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (wide) {
                Text(formatTime(song.durationMs), fontSize = 11.sp, color = MUTED)
                MaterialIconButton("ic_heart.svg", if (liked) "取消喜欢" else "喜欢", diameter = 44.dp, selected = liked, grouped = true, onClick = onLike)
                MaterialIconButton("ic_plus.svg", "加入歌单", diameter = 44.dp, grouped = true, onClick = onMore)
            }
            if (showDownload && song.source != "local") {
                MaterialIconButton("ic_download.svg", "下载歌曲", diameter = 44.dp, grouped = true, onClick = onDownload)
            }
            if (!wide) {
                val rotation by animateFloatAsState(if (expanded) 180f else 0f, tween(220), label = "row-chevron")
                Box(
                    Modifier
                        .size(width = 36.dp, height = 44.dp)
                        .semantics { contentDescription = "展开歌曲操作" }
                        .pressDeform()
                        .clickable { expanded = !expanded },
                    contentAlignment = Alignment.Center,
                ) {
                    // 系统 chevron_down 的替代：Material 下箭头，展开时旋转 180°。
                    AssetIcon(
                        "ic_down.svg",
                        size = 16.dp,
                        tint = MUTED,
                        modifier = Modifier.rotate(rotation),
                    )
                }
            }
        }
        AnimatedVisibility(visible = expanded && !wide) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(end = 20.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                MaterialIconButton("ic_heart.svg", if (liked) "取消喜欢" else "喜欢", diameter = 44.dp, selected = liked, grouped = true, onClick = onLike)
                MaterialIconButton("ic_plus.svg", "加入歌单", diameter = 44.dp, grouped = true, onClick = onMore)
                Text(formatTime(song.durationMs), fontSize = 12.sp, color = MUTED)
            }
        }
    }
}

/** 所有歌曲列表统一的头部动作：播放全部 + 排列；删除歌单只由歌单库详情传入。 */
@Composable
fun SongListTools(
    countText: String,
    modifier: Modifier = Modifier,
    disabled: Boolean = false,
    showDelete: Boolean = false,
    onPlayAll: () -> Unit,
    onSort: (String) -> Unit,
    onManual: () -> Unit,
    onDelete: () -> Unit = {},
) {
    val sortMenu = rememberGlassMenuTrigger {
        listOf(
            "添加顺序" to "added",
            "歌名首字母" to "name",
            "歌手名" to "artist",
            "专辑名首字" to "album",
        ).map { (label, sortMode) -> GlassMenuItem(label) { onSort(sortMode) } } +
            GlassMenuItem("手动排列") { onManual() }
    }
    Row(
        modifier = modifier.fillMaxWidth().height(52.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            countText,
            fontSize = 13.sp,
            color = MUTED,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        TextAction("播放全部", enabled = !disabled, onClick = onPlayAll)
        Box(sortMenu.modifier) {
            TextAction("排列", onClick = { sortMenu.show() })
        }
        if (showDelete) {
            TextAction("删除歌单", color = MUTED, onClick = onDelete)
        }
    }
}

@Composable
fun TextAction(
    label: String,
    enabled: Boolean = true,
    color: Color = BLUE,
    onClick: () -> Unit,
) {
    Text(
        label,
        fontSize = 13.sp,
        color = if (enabled) color else color.copy(alpha = 0.4f),
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .pressDeform()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
    )
}
