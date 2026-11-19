package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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

private val dialogShape = RoundedCornerShape(24.dp)

/** 手动排列：长按并拖动条目排序，确认后把顺序写回当前列表。 */
@Composable
fun SongOrderDialog(
    songs: List<Song>,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onCancel: () -> Unit,
    onDone: (List<String>) -> Unit,
) {
    val order = remember(songs) { mutableStateListOf<Song>().apply { addAll(songs) } }
    var draggingIndex by remember { mutableIntStateOf(-1) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    val itemHeight = 46.dp
    val itemHeightPx = with(density) { itemHeight.toPx() }
    val listState = rememberLazyListState()
    val insetTop = statusInset.dp
    val insetBottom = bottomInset.dp

    Box(Modifier.fillMaxSize().padding(top = insetTop, bottom = insetBottom)) {
        Box(Modifier.fillMaxSize().background(Color(0xA6000000)))
        GlassSurface(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = if (wide) 620.dp else androidx.compose.ui.unit.Dp.Infinity)
                .fillMaxWidth(if (wide) 1f else 0.92f)
                .fillMaxHeight(0.72f),
            shape = dialogShape,
            tone = GlassTone.Thick,
            floating = true,
            nested = true,
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("手动排列", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TEXT)
                    Text("长按歌曲并拖动，松手即可调整顺序", fontSize = 11.sp, color = MUTED)
                }
                MaterialIconButton("ic_close.svg", "关闭", diameter = 34.dp, grouped = true, systemSymbol = false, onClick = onCancel)
            }
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
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
                            .pointerInput(song.key, order.size) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = {
                                        // 用当前列表里的真实位置，避免捕获组合时的旧 index。
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
                            .padding(horizontal = 4.dp),
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
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Spacer(Modifier.weight(1f))
                PillButton("取消", filled = false, onClick = onCancel)
                PillButton("完成", filled = true, onClick = { onDone(order.map { it.key }) })
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
    val insetTop = statusInset.dp
    val insetBottom = bottomInset.dp
    val selectedCount = selected.count { it }
    Box(Modifier.fillMaxSize().padding(top = insetTop, bottom = insetBottom)) {
        Box(Modifier.fillMaxSize().background(Color(0xA6000000)))
        GlassSurface(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = if (wide) 620.dp else androidx.compose.ui.unit.Dp.Infinity)
                .fillMaxWidth(if (wide) 1f else 0.92f)
                .fillMaxHeight(0.72f),
            shape = dialogShape,
            tone = GlassTone.Thick,
            floating = true,
            nested = true,
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("发现 ${items.size} 个本地音频", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TEXT)
                    Text("取消勾选不想添加的文件", fontSize = 11.sp, color = MUTED)
                }
                MaterialIconButton("ic_close.svg", "关闭", diameter = 34.dp, grouped = true, systemSymbol = false, onClick = onCancel)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Checkbox(
                    checked = selectedCount == items.size && items.isNotEmpty(),
                    onCheckedChange = { value -> selected.indices.forEach { selected[it] = value } },
                    colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                )
                Text("全选", fontSize = 14.sp, color = TEXT)
                Spacer(Modifier.weight(1f))
                Text("$selectedCount / ${items.size}", fontSize = 12.sp, color = MUTED)
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                itemsIndexed(items, key = { index, item -> "${item.first}:$index" }) { index, item ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
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
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
            }
        }
    }
}

private data class EditableSongItem(val uid: String, val song: Song)

/** 编辑歌单：修改名称、多选勾选（全选 / 移除选中 / 下载选中）与长按拖动排序，保存写回曲库。 */
@Composable
fun PlaylistEditDialog(
    playlist: MusicPlaylist,
    wide: Boolean,
    statusInset: Float,
    bottomInset: Float,
    onCancel: () -> Unit,
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
    val insetTop = statusInset.dp
    val insetBottom = bottomInset.dp

    val selectedItems = items.filter { checkedMap[it.uid] == true }
    val selectedCount = selectedItems.size
    val allChecked = items.isNotEmpty() && selectedCount == items.size

    Box(Modifier.fillMaxSize().padding(top = insetTop, bottom = insetBottom)) {
        Box(Modifier.fillMaxSize().background(Color(0xA6000000)).tapNoRipple(onCancel))
        GlassSurface(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = if (wide) 640.dp else androidx.compose.ui.unit.Dp.Infinity)
                .fillMaxWidth(if (wide) 1f else 0.94f)
                .fillMaxHeight(0.82f),
            shape = dialogShape,
            tone = GlassTone.Thick,
            floating = true,
            nested = true,
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("编辑歌单", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text("修改名称、勾选批量操作或长按拖动调整顺序", fontSize = 11.sp, color = MUTED)
                    }
                    MaterialIconButton("ic_close.svg", "关闭", diameter = 34.dp, grouped = true, systemSymbol = false, onClick = onCancel)
                }

                // 歌单名称输入框
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0x14FFFFFF))
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (nameDraft.isEmpty()) {
                        Text("歌单名称", fontSize = 15.sp, color = MUTED)
                    }
                    BasicTextField(
                        value = nameDraft,
                        cursorBrush = SolidColor(CONTROL_BLUE),
                        onValueChange = { nameDraft = it },
                        singleLine = true,
                        textStyle = TextStyle(color = TEXT, fontSize = 15.sp, fontWeight = FontWeight.Medium),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                // 多选操作栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Checkbox(
                        checked = allChecked,
                        enabled = items.isNotEmpty(),
                        onCheckedChange = { value ->
                            items.forEach { checkedMap[it.uid] = value }
                        },
                        colors = CheckboxDefaults.colors(checkedColor = ACCENT, checkmarkColor = ON_ACCENT),
                    )
                    Text("全选 ($selectedCount/${items.size})", fontSize = 13.sp, color = TEXT, maxLines = 1)
                    Spacer(Modifier.weight(1f))
                    TextAction(
                        label = "下载选中",
                        enabled = selectedCount > 0,
                        onClick = { onDownloadSelected(selectedItems.map { it.song }) },
                    )
                    TextAction(
                        label = "移除选中",
                        enabled = selectedCount > 0,
                        color = HEART_RED,
                        onClick = {
                            val toRemove = selectedItems.map { it.uid }.toSet()
                            items.removeAll { it.uid in toRemove }
                            toRemove.forEach { checkedMap.remove(it) }
                        },
                    )
                }

                if (items.isEmpty()) {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text("歌单暂无歌曲，点击保存应用更改", fontSize = 13.sp, color = MUTED)
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
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
                                    .background(if (isDragging) Color(0x1FFFFFFF) else Color.Transparent)
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
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(entry.song.name, fontSize = 14.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(entry.song.singer, fontSize = 11.sp, color = MUTED, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Box(Modifier.width(26.dp), contentAlignment = Alignment.Center) {
                                    AssetIcon("ic_queue.svg", size = 18.dp, tint = MUTED, systemSymbol = false)
                                }
                            }
                        }
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Spacer(Modifier.weight(1f))
                    PillButton("取消", filled = false, onClick = onCancel)
                    PillButton(
                        "保存",
                        filled = true,
                        enabled = nameDraft.trim().isNotEmpty(),
                        onClick = { onSave(nameDraft.trim(), items.map { it.song }) },
                    )
                }
            }
        }
    }
}

private val PLATFORM_FILTER_OPTIONS = listOf(
    "all" to "全部推荐",
    "wy" to "网易云",
    "tx" to "QQ音乐",
    "kg" to "酷狗",
    "kw" to "酷我",
)

private fun bestQualityBadge(song: Song): String = when {
    song.qualitys.any { it.contains("flac", ignoreCase = true) } -> "FLAC"
    song.qualitys.contains("320k") -> "320K"
    song.qualitys.isNotEmpty() -> song.qualitys.last().uppercase()
    else -> "128K"
}

/** 切换歌曲平台弹窗：搜索同名同歌手多平台版本，支持原位替换队列或曲库歌单歌曲。 */
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
            errorMsg = err.message ?: "检索平台版本失败"
            loading = false
        }
    }

    val insetTop = statusInset.dp
    val insetBottom = bottomInset.dp

    Box(Modifier.fillMaxSize().padding(top = insetTop, bottom = insetBottom)) {
        Box(Modifier.fillMaxSize().background(Color(0xA6000000)).tapNoRipple(onDismiss))
        GlassSurface(
            modifier = Modifier
                .align(Alignment.Center)
                .widthIn(max = if (wide) 620.dp else androidx.compose.ui.unit.Dp.Infinity)
                .fillMaxWidth(if (wide) 1f else 0.94f)
                .fillMaxHeight(0.78f),
            shape = dialogShape,
            tone = GlassTone.Thick,
            floating = true,
            nested = true,
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // 标题与关闭按钮
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AssetIcon("ic_switch_platform.svg", size = 22.dp, tint = ACCENT, systemSymbol = false)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("切换歌曲平台", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TEXT)
                        Text(
                            if (target.fromQueue) "选择后将原位替换播放队列中的当前歌曲" else "选择后将原位替换歌单中的该首歌曲",
                            fontSize = 11.sp,
                            color = MUTED,
                        )
                    }
                    MaterialIconButton("ic_close.svg", "关闭", diameter = 34.dp, grouped = true, systemSymbol = false, onClick = onDismiss)
                }

                // 当前歌曲信息卡
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (AppAppearance.light) Color(0x0C000000) else Color(0x12FFFFFF))
                        .border(0.6.dp, Color(0x22FFFFFF), RoundedCornerShape(14.dp))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SongCover(target.song.coverUrl, target.song.source, size = 44.dp, radius = 9.dp, name = target.song.name)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(target.song.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${target.song.singer.ifEmpty { "未知歌手" }} · 当前：${platformName(target.song.source)}",
                            fontSize = 11.sp,
                            color = MUTED,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                // 平台筛选胶囊栏
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PLATFORM_FILTER_OPTIONS.forEach { (sourceId, label) ->
                        val active = selectedSource == sourceId
                        val chipShape = CircleShape
                        Box(
                            modifier = Modifier
                                .height(32.dp)
                                .clip(chipShape)
                                .background(
                                    if (active) ACCENT
                                    else if (AppAppearance.light) Color(0x0E000000) else Color(0x14FFFFFF)
                                )
                                .border(
                                    0.6.dp,
                                    if (active) ACCENT else Color(0x24FFFFFF),
                                    chipShape,
                                )
                                .clickable { selectedSource = sourceId }
                                .padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                label,
                                fontSize = 12.sp,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (active) ON_ACCENT else TEXT,
                                maxLines = 1,
                            )
                        }
                    }
                }

                // 候选版本列表
                when {
                    loading -> {
                        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(color = ACCENT, strokeWidth = 2.2.dp, modifier = Modifier.size(24.dp))
                                Text("正在匹配各平台音源版本…", fontSize = 13.sp, color = MUTED)
                            }
                        }
                    }
                    candidates.isEmpty() -> {
                        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text(
                                errorMsg.ifEmpty { "未找到匹配的同曲版本，可尝试切换上方平台标签" },
                                fontSize = 13.sp,
                                color = MUTED,
                            )
                        }
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.weight(1f).fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
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
                                        .background(if (isCurrent) ACCENT.copy(alpha = 0.14f) else Color(0x0AFFFFFF))
                                        .border(
                                            0.6.dp,
                                            if (isCurrent) ACCENT.copy(alpha = 0.45f) else Color(0x16FFFFFF),
                                            RoundedCornerShape(14.dp),
                                        )
                                        .clickable { onSelect(cand) }
                                        .padding(horizontal = 10.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    SongCover(cand.coverUrl, cand.source, size = 46.dp, radius = 10.dp, name = cand.name)
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(
                                                cand.name,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = if (isCurrent) ACCENT else TEXT,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f, fill = false),
                                            )
                                            if (isCurrent) {
                                                Text(
                                                    "当前",
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = ON_ACCENT,
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(6.dp))
                                                        .background(ACCENT)
                                                        .padding(horizontal = 5.dp, vertical = 1.dp),
                                                )
                                            }
                                        }
                                        Text(
                                            subtitle.ifEmpty { platformName(cand.source) },
                                            fontSize = 11.sp,
                                            color = MUTED,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(
                                            bestQualityBadge(cand),
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = ACCENT,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(ACCENT.copy(alpha = 0.14f))
                                                .padding(horizontal = 6.dp, vertical = 2.dp),
                                        )
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .zIndex(92f)
            .background(Color.Black.copy(alpha = 0.58f))
            .clickable(enabled = !downloading) { vm.dismissUpdateDialog() },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = if (wide) 460.dp else 360.dp)
                .fillMaxWidth(0.88f)
                .clip(RoundedCornerShape(24.dp))
                .background(if (AppAppearance.light) Color(0xFFF7F8FA) else Color(0xF5181A1E))
                .border(1.dp, if (AppAppearance.light) Color.Black.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.14f), RoundedCornerShape(24.dp))
                .clickable(enabled = false) {}
                .padding(22.dp),
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
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (AppAppearance.light) Color.Black.copy(alpha = 0.04f) else Color.White.copy(alpha = 0.06f))
                        .padding(12.dp),
                ) {
                    Text(notes, fontSize = 12.sp, color = TEXT, lineHeight = 18.sp, maxLines = 8, overflow = TextOverflow.Ellipsis)
                }
            }

            if (downloading) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.White.copy(alpha = 0.14f)),
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
                        .background(if (AppAppearance.light) Color.Black.copy(alpha = 0.07f) else Color.White.copy(alpha = 0.10f))
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
