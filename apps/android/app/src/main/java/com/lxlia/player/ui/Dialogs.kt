package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
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
                Text(
                    "关闭",
                    fontSize = 13.sp,
                    color = MUTED,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onCancel() }.padding(8.dp),
                )
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
                        Text("≡", fontSize = 18.sp, color = MUTED, modifier = Modifier.width(28.dp))
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
                Text(
                    "关闭",
                    fontSize = 13.sp,
                    color = MUTED,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onCancel() }.padding(8.dp),
                )
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
