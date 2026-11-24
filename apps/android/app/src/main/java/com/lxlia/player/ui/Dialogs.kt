package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import kotlin.math.roundToInt

/** 全屏浮层底：铺底负责拦截点击，根节点保持默认命中（禁止整层 Block 子树）。 */
@Composable
fun OverlayScaffold(
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xB3000000))
                .tapNoRipple(onDismiss),
        )
        content()
    }
}

/** 手动排列 / 播放队列排序：长按并拖动条目排序，确认后把顺序写回当前列表。 */
@Composable
fun SongOrderDialog(
    songs: List<Song>,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    title: String = "手动排列",
    onCancel: () -> Unit,
    onDone: (List<String>) -> Unit,
) {
    val order = remember(songs) { mutableStateListOf<Song>().apply { addAll(songs) } }
    var draggingIndex by remember { mutableIntStateOf(-1) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    val itemHeight = 48.dp
    val itemHeightPx = with(density) { itemHeight.toPx() }
    val listState = rememberLazyListState()
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    GlassSheet(onDismiss = onCancel, wide = wide, large = true) {
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
                        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text("长按歌曲并拖动，松手即可调整顺序", fontSize = 12.sp, color = MUTED)
                    }
                    SheetHeaderTextAction("关闭", color = MUTED, onClick = onCancel)
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
                    PillButton("取消", filled = false, onClick = onCancel)
                    PillButton("完成", filled = true, onClick = { onDone(order.map { it.key }) })
                }
            },
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 84.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                // key 必须用歌曲本身：用 index 会让每次换位都重建条目，长按拖动只能挪一格。
                itemsIndexed(order, key = { _, song -> song.key }) { index, song ->
                    val isDragging = index == draggingIndex
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(itemHeight)
                            .zIndex(if (isDragging) 1f else 0f)
                            .graphicsLayer { translationY = if (isDragging) dragOffset else 0f }
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isDragging) ROW_ACTIVE_BG else Color.Transparent)
                            .pointerInput(song.key, order.size) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = {
                                        draggingIndex = order.indexOfFirst { it.key == song.key }
                                        dragOffset = 0f
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        dragOffset += amount.y
                                        val step = (dragOffset / itemHeightPx).roundToInt()
                                        if (step != 0) {
                                            val from = draggingIndex
                                            if (from in order.indices) {
                                                val to = (from + step).coerceIn(0, order.lastIndex)
                                                if (to != from) {
                                                    val moved = order.removeAt(from)
                                                    order.add(to, moved)
                                                    draggingIndex = to
                                                    dragOffset -= (to - from) * itemHeightPx
                                                }
                                            }
                                        }
                                    },
                                    onDragEnd = {
                                        draggingIndex = -1
                                        dragOffset = 0f
                                    },
                                    onDragCancel = {
                                        draggingIndex = -1
                                        dragOffset = 0f
                                    },
                                )
                            }
                            .padding(horizontal = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            (index + 1).toString().padStart(2, '0'),
                            fontSize = 11.sp,
                            color = MUTED,
                            modifier = Modifier.width(22.dp),
                        )
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(song.name, fontSize = 13.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(song.singer, fontSize = 10.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Box(Modifier.width(28.dp), contentAlignment = Alignment.Center) {
                            AssetIcon("ic_queue.svg", size = 18.dp, tint = MUTED, systemSymbol = false)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PillButton(
    label: String,
    filled: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    textual: Boolean = false,
    onClick: () -> Unit,
) {
    val textColor = when {
        textual && filled -> ACCENT
        textual -> BLUE
        filled -> ON_ACCENT
        else -> TEXT
    }
    GlassSurface(
        modifier = modifier
            .height(40.dp)
            .defaultMinSize(minWidth = 64.dp)
            .then(if (enabled) Modifier.tapNoRipple(onClick) else Modifier),
        shape = RoundedCornerShape(20.dp),
        tone = GlassTone.UltraThin,
        tintOverride = if (filled && !textual) ACCENT else null,
        interactive = enabled,
    ) {
        Text(
            label,
            fontSize = if (textual) 16.sp else 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = textColor.copy(alpha = if (enabled) 1f else 0.4f),
            modifier = Modifier.align(Alignment.Center)
                .padding(horizontal = if (textual) 16.dp else 18.dp),
        )
    }
}

/** 智能识别结果确认窗：逐项勾选 + 全选；确认后只把勾选的 URI 交给本地音乐服务。 */
@Composable
fun LocalScanDialog(
    items: List<Pair<String, String>>,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onCancel: () -> Unit,
    onConfirm: (List<String>) -> Unit,
) {
    val selected = remember(items) { mutableStateListOf<Boolean>().apply { items.forEach { add(true) } } }
    val selectedCount = selected.count { it }
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    GlassSheet(onDismiss = onCancel, wide = wide, large = true) {
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
                        Text("发现 ${items.size} 个本地音频", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text("取消勾选不想添加的文件", fontSize = 12.sp, color = MUTED)
                    }
                    SheetHeaderTextAction("关闭", color = MUTED, onClick = onCancel)
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
                    PillButton("取消", filled = false, onClick = onCancel)
                    PillButton(
                        "添加选中 $selectedCount",
                        filled = true,
                        enabled = selectedCount > 0,
                        onClick = {
                            onConfirm(items.filterIndexed { index, _ -> selected.getOrElse(index) { false } }.map { it.first })
                        },
                    )
                }
            },
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 84.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                item(key = "scan-select-all") {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Checkbox(
                            checked = selectedCount == items.size && items.isNotEmpty(),
                            onCheckedChange = { value -> selected.indices.forEach { selected[it] = value } },
                            colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                        )
                        Text("全选", fontSize = 14.sp, color = TEXT)
                        Spacer(Modifier.weight(1f))
                        Text("$selectedCount / ${items.size}", fontSize = 12.sp, color = MUTED)
                    }
                }
                itemsIndexed(items, key = { index, item -> "${item.first}:$index" }) { index, item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { if (index in selected.indices) selected[index] = !selected[index] }
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Checkbox(
                            checked = selected.getOrElse(index) { false },
                            onCheckedChange = { value -> if (index in selected.indices) selected[index] = value },
                            colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                        )
                        Text(
                            item.second,
                            fontSize = 13.sp,
                            color = TEXT,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

private data class EditableSongItem(val uid: String, val song: Song)

/** 编辑歌单（严格对齐鸿蒙 PlaylistEditDialog）：修改名称、多选批量收藏/移除/下载与长按拖动排序。 */
@Composable
fun PlaylistEditDialog(
    playlist: MusicPlaylist,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onCancel: () -> Unit,
    onCollectSelected: (List<Song>) -> Unit = {},
    onDownloadSelected: (List<Song>) -> Unit,
    onSave: (String, List<Song>) -> Unit,
) {
    var nameDraft by remember(playlist.id) { mutableStateOf(playlist.name) }
    val items = remember(playlist.id, playlist.updatedAt) {
        mutableStateListOf<EditableSongItem>().apply {
            playlist.songs.forEachIndexed { index, song ->
                add(EditableSongItem("${song.key}#$index", song))
            }
        }
    }
    val checkedMap = remember(playlist.id, playlist.updatedAt) { mutableStateMapOf<String, Boolean>() }
    var draggingIndex by remember { mutableIntStateOf(-1) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    val itemHeight = 50.dp
    val itemHeightPx = with(density) { itemHeight.toPx() }
    val listState = rememberLazyListState()
    val selectedItems = items.filter { checkedMap[it.uid] == true }
    val selectedCount = selectedItems.size
    val allChecked = items.isNotEmpty() && selectedCount == items.size
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    GlassSheet(onDismiss = onCancel, wide = wide, large = true) {
        FixedSheetScrollScaffold(
            headerBlurHeight = 84f,
            modifier = Modifier.fillMaxSize().imePadding(),
            header = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 22.dp, end = 18.dp, top = 20.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("编辑歌单", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text("修改歌单名称，或勾选多首歌曲批量收藏／移除／下载", fontSize = 12.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    SheetHeaderTextAction("关闭", color = MUTED, onClick = onCancel)
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
                    PillButton("取消", filled = false, onClick = onCancel)
                    PillButton(
                        "保存",
                        filled = true,
                        enabled = nameDraft.trim().isNotEmpty(),
                        onClick = { onSave(nameDraft.trim(), items.map { it.song }) },
                    )
                }
            },
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 84.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                item(key = "edit-name-field") {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .height(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(INPUT_BG)
                            .padding(horizontal = 14.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (nameDraft.isEmpty()) {
                            Text("歌单名称", fontSize = 14.sp, color = MUTED)
                        }
                        BasicTextField(
                            value = nameDraft,
                            cursorBrush = SolidColor(CONTROL_BLUE),
                            onValueChange = { nameDraft = it },
                            singleLine = true,
                            textStyle = TextStyle(color = TEXT, fontSize = 14.sp, fontWeight = FontWeight.Medium),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                item(key = "edit-batch-bar") {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Checkbox(
                            checked = allChecked,
                            enabled = items.isNotEmpty(),
                            onCheckedChange = { value ->
                                items.forEach { checkedMap[it.uid] = value }
                            },
                            colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                        )
                        Text(
                            "全选（已选 $selectedCount / ${items.size} 首）",
                            fontSize = 12.sp,
                            color = TEXT,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f)
                                .clickable(enabled = items.isNotEmpty()) {
                                    val next = !allChecked
                                    items.forEach { checkedMap[it.uid] = next }
                                },
                        )
                        if (selectedCount > 0) {
                            if (!playlist.isFavorite) {
                                Box(
                                    modifier = Modifier
                                        .height(32.dp)
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(ACCENT.copy(alpha = 0.16f))
                                        .clickable { onCollectSelected(selectedItems.map { it.song }) }
                                        .padding(horizontal = 10.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("批量收藏", fontSize = 12.sp, color = ACCENT, maxLines = 1)
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .height(32.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(HEART_RED.copy(alpha = 0.16f))
                                    .clickable {
                                        val toRemove = selectedItems.map { it.uid }.toSet()
                                        items.removeAll { it.uid in toRemove }
                                        toRemove.forEach { checkedMap.remove(it) }
                                    }
                                    .padding(horizontal = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("移除所选", fontSize = 12.sp, color = Color(0xFFFF6B76), maxLines = 1)
                            }
                            Box(
                                modifier = Modifier
                                    .height(32.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(CHIP_BG)
                                    .clickable { onDownloadSelected(selectedItems.map { it.song }) }
                                    .padding(horizontal = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("下载所选", fontSize = 12.sp, color = TEXT, maxLines = 1)
                            }
                        }
                    }
                }
                if (items.isEmpty()) {
                    item(key = "edit-empty") {
                        Box(Modifier.fillMaxWidth().padding(vertical = 72.dp), contentAlignment = Alignment.Center) {
                            Text("歌单暂无歌曲，点击保存应用更改", fontSize = 13.sp, color = MUTED)
                        }
                    }
                } else {
                    itemsIndexed(items, key = { _, entry -> entry.uid }) { index, entry ->
                        val isDragging = index == draggingIndex
                        val isChecked = checkedMap[entry.uid] == true
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(itemHeight)
                                .zIndex(if (isDragging) 1f else 0f)
                                .graphicsLayer { translationY = if (isDragging) dragOffset else 0f }
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isDragging) ROW_ACTIVE_BG else Color.Transparent)
                                .pointerInput(entry.uid, items.size) {
                                    detectDragGesturesAfterLongPress(
                                        onDragStart = {
                                            draggingIndex = items.indexOfFirst { it.uid == entry.uid }
                                            dragOffset = 0f
                                        },
                                        onDrag = { change, amount ->
                                            change.consume()
                                            dragOffset += amount.y
                                            val step = (dragOffset / itemHeightPx).roundToInt()
                                            if (step != 0) {
                                                val from = draggingIndex
                                                if (from in items.indices) {
                                                    val to = (from + step).coerceIn(0, items.lastIndex)
                                                    if (to != from) {
                                                        val moved = items.removeAt(from)
                                                        items.add(to, moved)
                                                        draggingIndex = to
                                                        dragOffset -= (to - from) * itemHeightPx
                                                    }
                                                }
                                            }
                                        },
                                        onDragEnd = {
                                            draggingIndex = -1
                                            dragOffset = 0f
                                        },
                                        onDragCancel = {
                                            draggingIndex = -1
                                            dragOffset = 0f
                                        },
                                    )
                                }
                                .clickable { checkedMap[entry.uid] = !isChecked }
                                .padding(horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checkedMap[entry.uid] = it },
                                colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                            )
                            Text(
                                (index + 1).toString().padStart(2, '0'),
                                fontSize = 11.sp,
                                color = MUTED,
                                modifier = Modifier.width(22.dp),
                            )
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(entry.song.name, fontSize = 13.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(entry.song.singer, fontSize = 10.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .clickable {
                                        checkedMap.remove(entry.uid)
                                        items.removeAll { it.uid == entry.uid }
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                AssetIcon("ic_trash.svg", size = 16.dp, tint = MUTED, systemSymbol = false)
                            }
                            Box(Modifier.width(24.dp), contentAlignment = Alignment.Center) {
                                AssetIcon("ic_queue.svg", size = 16.dp, tint = MUTED, systemSymbol = false)
                            }
                        }
                    }
                }
            }
        }
    }
}

private val PLATFORM_FILTER_OPTIONS = listOf(
    "all" to "智能推荐",
    "wy" to "网易云",
    "tx" to "QQ音乐",
    "kg" to "酷狗",
    "kw" to "酷我",
)

private fun bestQualityBadge(song: Song): String = when {
    song.qualitys.any { it.equals("flac24bit", ignoreCase = true) } -> "Hi-Res"
    song.qualitys.any { it.contains("flac", ignoreCase = true) } -> "FLAC"
    song.qualitys.contains("320k") -> "320k"
    else -> "128k"
}

/** 切换歌曲平台固定玻璃独立页（严格对齐鸿蒙 PlatformSwitchDialog）。 */
@Composable
fun SwitchPlatformDialog(
    vm: AppViewModel,
    target: SwitchPlatformTarget,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onDismiss: () -> Unit,
    onSelect: (Song) -> Unit,
) {
    var selectedSource by remember(target.song.key) { mutableStateOf("all") }
    var loading by remember(target.song.key) { mutableStateOf(true) }
    var candidates by remember(target.song.key) { mutableStateOf<List<Song>>(emptyList()) }
    var errorMsg by remember(target.song.key) { mutableStateOf("") }
    val navBottom = if (wide) 0.dp else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val contextLabel = if (target.fromQueue) "播放队列" else "歌单"

    LaunchedEffect(target.song.key, selectedSource) {
        loading = true
        errorMsg = ""
        val sources = if (selectedSource == "all") listOf("wy", "tx", "kg", "kw") else listOf(selectedSource)
        runCatching {
            vm.engine.platformCandidates(target.song, sources)
        }.onSuccess { items ->
            candidates = items
            loading = false
        }.onFailure { err ->
            candidates = emptyList()
            errorMsg = err.message ?: "检索其他平台版本失败"
            loading = false
        }
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
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("切换歌曲平台", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text(
                            "${target.song.name} · ${target.song.singer.ifEmpty { "未知歌手" }}（当前：${platformName(target.song.source)} · $contextLabel）",
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
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 86.dp, bottom = navBottom + 28.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item(key = "switch-tabs") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 6.dp)
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PLATFORM_FILTER_OPTIONS.forEach { (sourceId, label) ->
                            val active = selectedSource == sourceId
                            Box(
                                modifier = Modifier
                                    .height(34.dp)
                                    .clip(CircleShape)
                                    .background(if (active) ACCENT else CHIP_BG)
                                    .clickable { selectedSource = sourceId }
                                    .padding(horizontal = 12.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    label,
                                    fontSize = 12.sp,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                                    color = if (active) ON_ACCENT else TEXT,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
                when {
                    loading -> {
                        item(key = "switch-loading") {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 84.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                CircularProgressIndicator(color = ACCENT, strokeWidth = 2.2.dp, modifier = Modifier.size(30.dp))
                                Text("正在匹配各平台同曲目音源…", fontSize = 13.sp, color = MUTED)
                            }
                        }
                    }
                    candidates.isEmpty() -> {
                        item(key = "switch-empty") {
                            Box(Modifier.fillMaxWidth().padding(vertical = 84.dp), contentAlignment = Alignment.Center) {
                                Text(
                                    errorMsg.ifEmpty { "暂未检索到同曲目其他平台版本" },
                                    fontSize = 14.sp,
                                    color = MUTED,
                                )
                            }
                        }
                    }
                    else -> {
                        itemsIndexed(candidates, key = { index, item -> "${item.key}:$index" }) { _, cand ->
                            val isCurrent = cand.key == target.song.key
                            val subtitle = buildList {
                                if (cand.singer.isNotEmpty()) add(cand.singer)
                                if (cand.albumName.isNotEmpty()) add(cand.albumName)
                            }.joinToString(" · ")
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(if (isCurrent) ACCENT.copy(alpha = 0.14f) else CARD_SURFACE)
                                    .clickable { onSelect(cand) }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                SongCover(cand.coverUrl, cand.source, size = 46.dp, radius = 10.dp, name = cand.name)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        cand.name,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = if (isCurrent) ACCENT else TEXT,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        subtitle.ifEmpty { platformName(cand.source) },
                                        fontSize = 11.sp,
                                        color = MUTED,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            platformName(cand.source),
                                            fontSize = 10.sp,
                                            color = ACCENT,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(ACCENT.copy(alpha = 0.14f))
                                                .padding(horizontal = 6.dp, vertical = 2.dp),
                                        )
                                        Text(
                                            bestQualityBadge(cand),
                                            fontSize = 9.sp,
                                            color = TEXT,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(5.dp))
                                                .background(CHIP_BG)
                                                .padding(horizontal = 5.dp, vertical = 2.dp),
                                        )
                                    }
                                    if (cand.durationMs > 0) {
                                        Text(formatTime(cand.durationMs), fontSize = 11.sp, color = MUTED)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AppUpdateDialog(
    vm: AppViewModel,
    wide: Boolean,
) {
    if (!vm.updateDialogVisible) return
    val info = vm.updateInfo
    val errorText = vm.updateError
    val downloading = vm.updateDownloading
    val progress = vm.updateProgress
    val downloadedApk = vm.updateDownloadedApk
    val needsPerm = vm.updateNeedsInstallPermission

    GlassDialog(
        onDismiss = { if (!downloading) vm.dismissUpdateDialog() },
        maxWidth = if (wide) 460.dp else 380.dp,
        dismissible = !downloading,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val title = when {
                info != null && info.hasUpdate -> "发现新版本 v${info.latestVersion}"
                info != null -> "已是最新版本"
                else -> "检查更新失败"
            }
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TEXT)

            val subtitle = when {
                info != null && info.hasUpdate -> {
                    val sizeMb = info.asset?.size?.takeIf { it > 0 }?.let { " · %.1f MB".format(it / 1048576.0) } ?: ""
                    val date = info.publishedAt.take(10).takeIf { it.isNotEmpty() }?.let { " · $it" } ?: ""
                    "v${info.currentVersion} → v${info.latestVersion}$sizeMb$date"
                }
                info != null -> "当前版本 v${info.currentVersion} 已是最新，无需更新。"
                else -> errorText.ifEmpty { "无法连接更新服务器，请检查网络后重试。" }
            }
            Text(subtitle, fontSize = 13.sp, color = MUTED, lineHeight = 19.sp)

            if (info != null && info.hasUpdate) {
                val notes = info.notes.ifEmpty { "包含最新功能优化与问题修复，支持在线下载并直接覆盖安装升级。" }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 160.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(CARD_SURFACE)
                        .verticalScroll(rememberScrollState())
                        .padding(12.dp),
                ) {
                    Text(notes, fontSize = 12.sp, color = TEXT, lineHeight = 18.sp)
                }
            }

            if (downloading) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(TRACK_BG),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth((progress.percent.coerceIn(0, 100) / 100f).coerceAtLeast(0.03f))
                                .clip(RoundedCornerShape(3.dp))
                                .background(ACCENT),
                        )
                    }
                    val recv = "%.1f MB".format(progress.received / 1048576.0)
                    val tot = if (progress.total > 0) " / %.1f MB".format(progress.total / 1048576.0) else ""
                    val tag = if (progress.mirror.isNotEmpty()) "[${progress.mirror}] " else ""
                    Text("${tag}已下载 ${progress.percent}%（$recv$tot）", fontSize = 12.sp, color = ACCENT)
                }
            } else if (needsPerm && downloadedApk != null) {
                Text("已下载完成，请允许 LxMine 安装应用后点击「立即覆盖安装」。", fontSize = 12.sp, color = ACCENT, lineHeight = 18.sp)
            } else if (errorText.isNotEmpty() && info != null) {
                Text(errorText, fontSize = 12.sp, color = Color(0xFFFF8E9B), lineHeight = 18.sp)
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(CHIP_BG)
                        .clickable {
                            if (downloading) vm.cancelAppUpdateDownload()
                            else vm.dismissUpdateDialog()
                        }
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                ) {
                    Text(
                        when {
                            downloading -> "取消下载"
                            info != null && info.hasUpdate -> "稍后再说"
                            else -> "知道了"
                        },
                        fontSize = 13.sp,
                        color = TEXT,
                    )
                }

                if (info == null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(ACCENT)
                            .clickable {
                                vm.dismissUpdateDialog()
                                vm.checkAppUpdate(silent = false)
                            }
                            .padding(horizontal = 18.dp, vertical = 10.dp),
                    ) {
                        Text("重试", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ON_ACCENT)
                    }
                } else if (info.hasUpdate && !downloading) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(ACCENT)
                            .clickable {
                                if (downloadedApk != null) vm.triggerDownloadedApkInstall()
                                else vm.startAppUpdateDownload()
                            }
                            .padding(horizontal = 18.dp, vertical = 10.dp),
                    ) {
                        Text(
                            if (downloadedApk != null) "立即覆盖安装" else "立即下载并覆盖安装",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = ON_ACCENT,
                        )
                    }
                }
            }
        }
    }
}
