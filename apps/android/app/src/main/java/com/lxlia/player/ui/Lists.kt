package com.lxlia.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.Song

/** 封面 + 平台角标（无封面时展示冰川蓝紫渐变卡片与首字兜底，绝不留死黑空洞）。 */
@Composable
fun SongCover(
    coverUrl: String,
    source: String?,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 48.dp,
    radius: androidx.compose.ui.unit.Dp = 10.dp,
    showBadge: Boolean = true,
    name: String = "",
) {
    val coverShape = RoundedCornerShape(radius)
    val fallbackGrad = remember(name, source) { glacialGradFor(name.ifEmpty { source.orEmpty() }) }
    Box(
        modifier
            .size(size)
            .clip(coverShape)
            .background(Brush.linearGradient(fallbackGrad))
            .border(0.6.dp, BORDER_SUBTLE, coverShape),
        contentAlignment = Alignment.Center,
    ) {
        AssetIcon("ic_music.svg", size = size * 0.46f, tint = Color(0xFFF2F8FF), systemSymbol = false)
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
 * 宽屏与窄屏均在行内直接显示红心，确保点击喜欢当帧立即变红；支持切换平台与移除。
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
    onSwitchPlatform: (() -> Unit)? = null,
    onRemove: (() -> Unit)? = null,
    removeLabel: String = "从歌单移除",
) {
    var expanded by remember { mutableStateOf(false) }
    val canSwitch = onSwitchPlatform != null && song.source != "local"
    val rowMenu = rememberGlassMenuTrigger {
        buildList {
            add(GlassMenuItem(if (liked) "取消收藏" else "收藏") { onLike() })
            add(GlassMenuItem("添加到歌单") { onMore() })
            if (canSwitch) {
                add(GlassMenuItem("切换歌曲平台") { onSwitchPlatform?.invoke() })
            }
            if (showDownload && song.source != "local") {
                add(GlassMenuItem("下载歌曲") { onDownload() })
            }
            if (onRemove != null) {
                add(GlassMenuItem(removeLabel) { onRemove() })
            }
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(rowMenu.modifier)
            .clip(RoundedCornerShape(12.dp))
            .background(if (active) ROW_ACTIVE_BG else Color.Transparent)
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = androidx.compose.foundation.LocalIndication.current,
                onClick = onClick,
                onLongClick = { rowMenu.show() },
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 9.dp, bottom = 9.dp, start = 8.dp, end = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(if (wide) 12.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SongCover(song.coverUrl, song.source, name = song.name)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    song.name,
                    fontSize = 15.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
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
                MaterialIconButton(
                    icon = if (liked) "ic_heart_fill.svg" else "ic_heart.svg",
                    label = if (liked) "取消收藏" else "收藏",
                    diameter = 42.dp,
                    rawNoTint = liked,
                    systemSymbol = false,
                    selected = false,
                    grouped = true,
                    onClick = onLike,
                )
                if (canSwitch) {
                    MaterialIconButton("ic_switch_platform.svg", "切换平台", diameter = 42.dp, grouped = true, systemSymbol = false, onClick = { onSwitchPlatform?.invoke() })
                }
                MaterialIconButton("ic_plus.svg", "加入歌单", diameter = 42.dp, grouped = true, systemSymbol = false, onClick = onMore)
                if (onRemove != null) {
                    MaterialIconButton("ic_trash.svg", removeLabel, diameter = 42.dp, grouped = true, systemSymbol = false, onClick = onRemove)
                }
                if (showDownload && song.source != "local") {
                    MaterialIconButton("ic_download.svg", "下载歌曲", diameter = 42.dp, grouped = true, onClick = onDownload)
                }
            } else {
                MaterialIconButton(
                    icon = if (liked) "ic_heart_fill.svg" else "ic_heart.svg",
                    label = if (liked) "取消收藏" else "收藏",
                    diameter = 38.dp,
                    rawNoTint = liked,
                    systemSymbol = false,
                    selected = false,
                    grouped = true,
                    onClick = onLike,
                )
                if (showDownload && song.source != "local") {
                    MaterialIconButton("ic_download.svg", "下载歌曲", diameter = 38.dp, grouped = true, onClick = onDownload)
                }
                val rotation by animateFloatAsState(if (expanded) 180f else 0f, tween(220), label = "row-chevron")
                Box(
                    Modifier
                        .size(width = 34.dp, height = 42.dp)
                        .semantics { contentDescription = "展开歌曲操作" }
                        .pressDeform()
                        .clickable { expanded = !expanded },
                    contentAlignment = Alignment.Center,
                ) {
                    AssetIcon(
                        "ic_down.svg",
                        size = 16.dp,
                        tint = MUTED,
                        systemSymbol = false,
                        modifier = Modifier.rotate(rotation),
                    )
                }
            }
        }
        AnimatedVisibility(visible = expanded && !wide) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(end = 18.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Spacer(Modifier.weight(1f))
                if (canSwitch) {
                    MaterialIconButton("ic_switch_platform.svg", "切换平台", diameter = 42.dp, grouped = true, systemSymbol = false, onClick = { onSwitchPlatform?.invoke() })
                }
                MaterialIconButton("ic_plus.svg", "加入歌单", diameter = 42.dp, grouped = true, systemSymbol = false, onClick = onMore)
                if (onRemove != null) {
                    MaterialIconButton("ic_trash.svg", removeLabel, diameter = 42.dp, grouped = true, systemSymbol = false, onClick = onRemove)
                }
                Text(formatTime(song.durationMs), fontSize = 12.sp, color = MUTED)
            }
        }
    }
}

/** 所有歌曲列表统一的头部动作：播放全部 + 批量下载 + 排列 + 编辑；严格对齐鸿蒙 SongListTools。 */
@Composable
fun SongListTools(
    countText: String,
    modifier: Modifier = Modifier,
    disabled: Boolean = false,
    showDelete: Boolean = false,
    deleteLabel: String = "删除歌单",
    showEdit: Boolean = false,
    collectLabel: String = "收藏到曲库",
    collected: Boolean = false,
    onCollect: (() -> Unit)? = null,
    onPlayAll: () -> Unit,
    onBatchDownload: (() -> Unit)? = null,
    onCustomCover: (() -> Unit)? = null,
    onSort: (String) -> Unit,
    onManual: () -> Unit,
    onDelete: () -> Unit = {},
    onRename: () -> Unit = {},
    onBatchDelete: () -> Unit = {},
) {
    val sortMenu = rememberGlassMenuTrigger {
        listOf(
            "添加顺序" to "added",
            "歌名首字母" to "name",
            "歌手名" to "artist",
            "专辑名首字" to "album",
        ).map { (label, sortMode) -> GlassMenuItem(label) { onSort(sortMode) } } +
            GlassMenuItem("自定义顺序（拖动）") { onManual() }
    }
    val editMenu = rememberGlassMenuTrigger {
        buildList {
            add(GlassMenuItem("重命名歌单") { onRename() })
            if (onCustomCover != null) {
                add(GlassMenuItem("自定义封面") { onCustomCover() })
            }
            if (!disabled) {
                add(GlassMenuItem("批量移除歌曲") { onBatchDelete() })
                add(GlassMenuItem("自定义歌曲顺序") { onManual() })
            }
            if (showDelete) {
                add(GlassMenuItem("删除整个歌单") { onDelete() })
            }
        }
    }
    Row(
        modifier = modifier.fillMaxWidth().height(52.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
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
        if (onCollect != null) {
            TextAction(
                if (collected) "已收藏" else collectLabel,
                enabled = !disabled,
                color = if (collected) MUTED else ACCENT,
                onClick = onCollect,
            )
        }
        if (onBatchDownload != null) {
            TextAction("批量下载", enabled = !disabled, onClick = onBatchDownload)
        }
        Box(sortMenu.modifier) {
            TextAction("排列", onClick = { sortMenu.show() })
        }
        if (!showEdit && onCustomCover != null) {
            TextAction("封面", onClick = onCustomCover)
        }
        if (showEdit) {
            Box(editMenu.modifier) {
                TextAction("编辑", onClick = { editMenu.show() })
            }
        } else if (showDelete) {
            TextAction(deleteLabel, color = MUTED, onClick = onDelete)
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
