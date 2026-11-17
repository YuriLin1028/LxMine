package com.lxlia.player.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.lx.CatalogueEntity
import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song

// ---- 歌单库：时刻/相册式随机方块拼贴 ----

private data class LibraryTile(
    val kind: String,
    val id: String,
    val name: String,
    val count: String,
    val detail: String,
    val cover: String,
    val iconKind: String,
)

private data class MosaicSlot(val tile: LibraryTile, val x: Float, val y: Float, val w: Float, val h: Float)

private fun libraryTiles(vm: AppViewModel): List<LibraryTile> {
    val out = mutableListOf<LibraryTile>()
    val favorite = vm.playlists.firstOrNull { it.isFavorite }
    if (favorite != null) {
        out.add(
            LibraryTile(
                kind = "playlist",
                id = favorite.id,
                name = favorite.name,
                count = "${favorite.songs.size} 首歌曲",
                detail = "你收藏的歌曲",
                cover = favorite.songs.firstOrNull()?.coverUrl.orEmpty(),
                iconKind = "heart",
            )
        )
    }
    out.add(
        LibraryTile(
            kind = "recent",
            id = "recent-local",
            name = "最近播放",
            count = "${vm.recentSongs.size} 首歌曲",
            detail = "按最近播放时间排列",
            cover = vm.recentSongs.firstOrNull()?.coverUrl.orEmpty(),
            iconKind = "clock",
        )
    )
    for (playlist in vm.playlists) {
        if (playlist.isFavorite) continue
        out.add(
            LibraryTile(
                kind = "playlist",
                id = playlist.id,
                name = playlist.name,
                count = if (playlist.kind == "lx") "${playlist.songs.size} 首歌曲" else "本地文件歌单",
                detail = "歌单",
                cover = playlist.songs.firstOrNull()?.coverUrl.orEmpty(),
                iconKind = "music",
            )
        )
    }
    out.add(
        LibraryTile(
            kind = "local",
            id = "local-android",
            name = "本地音乐",
            count = "${vm.localTracks.size} 首本地歌曲",
            detail = "智能识别手机里的音频",
            cover = vm.localTracks.firstOrNull()?.coverUrl.orEmpty(),
            iconKind = "music",
        )
    )
    return out
}

private fun spanFor(index: Int, columns: Int, total: Int): IntArray {
    val four = arrayOf(intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 1))
    val five = arrayOf(intArrayOf(2, 2), intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 1))
    val patterns = arrayOf(
        intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(2, 1),
        intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(1, 2), intArrayOf(2, 1), intArrayOf(1, 1),
    )
    val pattern = when (total) {
        4 -> four.getOrElse(index) { patterns[index % patterns.size] }
        5 -> five.getOrElse(index) { patterns[index % patterns.size] }
        else -> patterns[index % patterns.size]
    }
    return intArrayOf(minOf(pattern[0], columns), pattern[1])
}

/** 用持久化种子洗牌一次：哪张卡进大/小格固定，之后每次启动复用同一排列。 */
private fun shuffledTiles(tiles: List<LibraryTile>, seed: Int): List<LibraryTile> {
    val out = tiles.toMutableList()
    var state = if (seed != 0) seed.toLong() else 0x9E3779B9L
    fun rand(): Double {
        state = (state xor (state shl 13)) and 0xFFFFFFFFL
        state = (state xor (state ushr 17)) and 0xFFFFFFFFL
        state = (state xor (state shl 5)) and 0xFFFFFFFFL
        return state.toDouble() / 4294967296.0
    }
    for (index in out.size - 1 downTo 1) {
        val target = (rand() * (index + 1)).toInt().coerceIn(0, index)
        val temp = out[index]
        out[index] = out[target]
        out[target] = temp
    }
    return out
}

@Composable
fun LibraryTab(vm: AppViewModel) {
    val states = rememberSaveableStateHolder()
    val opened = vm.openedPlaylist
    val page = if (vm.downloadsOpen) "downloads" else opened?.id ?: "library"
    states.SaveableStateProvider(page) {
        when {
            vm.downloadsOpen -> DownloadsPage(vm)
            opened?.kind == "local" -> LocalMusicPage(vm)
            opened != null -> PlaylistDetailPage(vm, opened)
            else -> LibraryMosaicPage(vm)
        }
    }
}

@Composable
private fun LibraryMosaicPage(vm: AppViewModel) {
    val scroll = rememberScrollState()
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.value to scroll.isScrollInProgress }.collect { (offset, moving) ->
            if (vm.tab == "资料库" && !vm.showPlayer && vm.openedPlaylist == null && !vm.downloadsOpen) {
                vm.homeScroll(offset.toFloat(), canTrackDock = moving)
            }
        }
    }
    val tiles = remember(vm.playlists, vm.recentSongs, vm.localTracks, vm.libraryMosaicSeed) { libraryTiles(vm) }
    // 容器宽度已经扣掉页面边距：拼贴直接铺满内容区，只固定卡片间距。
    val contentWidth = maxOf(240f, vm.viewportWidth.toFloat() - if (vm.wide) 64f else 40f)
    val columns = if (contentWidth >= 620f) 4 else 2
    val gap = 12f
    val cell = (contentWidth - (columns - 1) * gap) / columns
    val rowHeight = cell * 0.78f
    val slots = remember(tiles, columns, cell, vm.libraryMosaicSeed) {
        buildMosaic(shuffledTiles(tiles, vm.libraryMosaicSeed), columns, cell, rowHeight, gap)
    }
    val mosaicHeight = (slots.maxOfOrNull { it.y + it.h } ?: 0f)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(top = (vm.headerHeight() + 12).dp, bottom = 180.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(mosaicHeight.dp)) {
            slots.forEach { slot ->
                LibraryTileView(slot) { openLibraryTile(vm, slot.tile) }
            }
        }
    }
}

private fun buildMosaic(tiles: List<LibraryTile>, columns: Int, cell: Float, rowHeight: Float, gap: Float): List<MosaicSlot> {
    val occupied = mutableListOf<BooleanArray>()
    fun row(index: Int): BooleanArray {
        while (occupied.size <= index) occupied.add(BooleanArray(columns))
        return occupied[index]
    }
    val slots = mutableListOf<MosaicSlot>()
    var maxRow = 0
    tiles.forEachIndexed { index, tile ->
        val span = spanFor(index, columns, tiles.size)
        val cs = span[0]
        val rs = span[1]
        var placed = false
        var r = 0
        while (!placed && r < 200) {
            var c = 0
            while (!placed && c <= columns - cs) {
                var free = true
                for (rr in r until r + rs) {
                    if (!free) break
                    val current = row(rr)
                    for (cc in c until c + cs) if (current[cc]) {
                        free = false
                        break
                    }
                }
                if (free) {
                    for (rr in r until r + rs) {
                        val current = row(rr)
                        for (cc in c until c + cs) current[cc] = true
                    }
                    val w = cs * cell + (cs - 1) * gap
                    val h = rs * rowHeight + (rs - 1) * gap
                    slots.add(MosaicSlot(tile, c * cell + c * gap, r * rowHeight + r * gap, w, h))
                    if (r + rs > maxRow) maxRow = r + rs
                    placed = true
                }
                c++
            }
            r++
        }
    }
    return slots
}

@Composable
private fun LibraryTileView(slot: MosaicSlot, onOpen: () -> Unit) {
    Box(
        modifier = Modifier
            .offset(x = slot.x.dp, y = slot.y.dp)
            .width(slot.w.dp)
            .height(slot.h.dp)
            .clip(RoundedCornerShape(18.dp))
            .tapNoRipple(onOpen),
    ) {
        if (slot.tile.cover.isNotEmpty()) {
            RemoteImage(slot.tile.cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            val colors = gradFor(slot.tile.name)
            Box(
                Modifier.fillMaxSize().background(Brush.linearGradient(colors)),
                contentAlignment = Alignment.Center,
            ) {
                AssetIcon(
                    when (slot.tile.iconKind) {
                        "heart" -> "ic_heart.svg"
                        "clock" -> "symbol_clock.svg"
                        else -> "symbol_queue.svg"
                    },
                    size = 52.dp,
                    tint = ACCENT,
                )
            }
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0x0005070A), Color(0xCC05070A)), startY = 60f)),
        )
        Column(Modifier.fillMaxSize().padding(12.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                Text(
                    slot.tile.count,
                    fontSize = 10.sp,
                    color = Color(0xE8FFFFFF),
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color(0x66000000))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(slot.tile.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(slot.tile.detail, fontSize = 11.sp, color = Color(0xC9FFFFFF), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private val GRADS_LOCAL = listOf(
    listOf(Color(0xFF2E3A8C), Color(0xFF6C4AB6)),
    listOf(Color(0xFF0F6F5C), Color(0xFF3FA796)),
    listOf(Color(0xFF8C2E2E), Color(0xFFC76B4A)),
    listOf(Color(0xFF3C5A99), Color(0xFF7FA8E0)),
    listOf(Color(0xFF6A3A8C), Color(0xFFB84AB6)),
    listOf(Color(0xFF8C6A1E), Color(0xFFD9B24A)),
)

private fun gradFor(name: String): List<Color> {
    var hash = 0
    for (char in name) hash = (hash * 31 + char.code) and 0x7FFFFFFF
    return GRADS_LOCAL[hash % GRADS_LOCAL.size]
}

private fun openLibraryTile(vm: AppViewModel, tile: LibraryTile) {
    when (tile.kind) {
        "local" -> vm.openLocalPlaylist()
        "recent" -> vm.openLibraryPlaylist(
            MusicPlaylist(
                id = "recent-local",
                name = "最近播放",
                kind = "recent",
                songs = vm.recentSongs,
                createdAt = 0,
                updatedAt = 0,
            ),
            "资料库",
            "",
        )
        else -> vm.playlists.firstOrNull { it.id == tile.id }?.let { vm.openPlaylist(it) }
    }
}

// ---- 歌单详情（通用歌曲列表页） ----


@Composable
private fun LazySongsPage(
    vm: AppViewModel,
    songs: List<Song>,
    showDownload: Boolean = true,
    header: @Composable () -> Unit,
    empty: @Composable () -> Unit = {},
) {
    val state = rememberLazyListState()
    val rowKeys = remember(songs) {
        val occurrences = mutableMapOf<String, Int>()
        songs.map { song ->
            val occurrence = occurrences.getOrDefault(song.key, 0)
            occurrences[song.key] = occurrence + 1
            "${song.key}:$occurrence"
        }
    }
    LaunchedEffect(state) {
        snapshotFlow { state.firstVisibleItemIndex * 72f + state.firstVisibleItemScrollOffset }
            .collect { vm.homeScroll(it) }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(), state = state,
        contentPadding = PaddingValues(top = (vm.headerHeight() + 8).dp, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item(key = "header", contentType = "header") { Column { header() } }
        itemsIndexed(songs, key = { index, _ -> rowKeys[index] }, contentType = { _, _ -> "song" }) { _, song ->
            SongRow(song = song, active = vm.selected?.key == song.key, liked = vm.liked(song), wide = vm.wide,
                showDownload = showDownload, onClick = { vm.playSong(song, songs) }, onLike = { vm.like(song) },
                onMore = { vm.addToPlaylist(song) }, onDownload = { vm.downloadSong(song) })
        }
        if (songs.isEmpty()) item(key = "empty", contentType = "empty") { empty() }
    }
}

@Composable
fun PlaylistDetailPage(vm: AppViewModel, playlist: MusicPlaylist) {
    val songs = remember(playlist.songs, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(playlist.songs) }
    val loading = vm.openedFeedLoading && playlist.songs.isEmpty()
    LazySongsPage(vm, songs, header = {
        if (loading) {
            Column(Modifier.fillMaxWidth().padding(top = 120.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(color = ACCENT, strokeWidth = 2.5.dp, modifier = Modifier.size(34.dp))
                Text("正在载入歌单…", fontSize = 13.sp, color = MUTED)
            }
        } else {
            if (vm.listSearchOpen) SearchInListBar(vm)
            if (playlist.songs.isNotEmpty()) {
                SongListTools(countText = "${songs.size} 首歌曲", disabled = songs.isEmpty(), showDelete = vm.canDeleteOpenedPlaylist(),
                    onPlayAll = { if (songs.isNotEmpty()) vm.playSong(songs.first(), songs) },
                    onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrder() }, onDelete = { vm.deleteOpenedPlaylist() })
            }
        }
    }, empty = {
        if (!loading) {
            Column(Modifier.fillMaxWidth().padding(top = 120.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (vm.listQuery.isNotBlank()) "没有匹配的歌曲"
                    else if (playlist.kind == "lx") "从歌曲行内操作添加到此歌单" else "此歌单使用电脑上的本地音频文件。",
                    fontSize = 14.sp, color = MUTED)
                if (vm.canDeleteOpenedPlaylist()) {
                    Text("删除歌单", fontSize = 13.sp, color = MUTED,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable { vm.deleteOpenedPlaylist() }.padding(8.dp))
                }
            }
        }
    })
}

@Composable
private fun SearchInListBar(vm: AppViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0x0DFFFFFF))
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssetIcon("ic_search.svg", size = 18.dp, alpha = 0.7f)
        Box(Modifier.weight(1f)) {
            if (vm.listQuery.isEmpty()) {
                Text("搜索本列表", fontSize = 14.sp, color = MUTED)
            }
            BasicTextField(
                value = vm.listQuery,
                cursorBrush = SolidColor(CONTROL_BLUE),
                onValueChange = { vm.listQuery = it },
                singleLine = true,
                textStyle = TextStyle(color = TEXT, fontSize = 14.sp),
                modifier = Modifier.fillMaxWidth().height(40.dp),
            )
        }
        Text(
            "取消",
            fontSize = 13.sp,
            color = MUTED,
            modifier = Modifier.clickable {
                vm.listSearchOpen = false
                vm.listQuery = ""
            }.padding(8.dp),
        )
    }
}

// ---- 本地音乐页 ----

@Composable
private fun LocalMusicPage(vm: AppViewModel) {
    val songs = remember(vm.localTracks, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(vm.localTracks) }
    LazySongsPage(vm, songs, showDownload = false, header = {
        SongListTools(countText = "${songs.size} 首本地歌曲", disabled = songs.isEmpty(),
            onPlayAll = { if (songs.isNotEmpty()) vm.playSong(songs.first(), songs) },
            onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrder() })
        if (vm.listSearchOpen) SearchInListBar(vm)
    }, empty = {
        Column(Modifier.padding(top = 44.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.listQuery.isNotBlank()) {
                Text("没有匹配的本地歌曲", fontSize = 14.sp, color = MUTED)
                Text("换个歌名、歌手或专辑试试", fontSize = 12.sp, color = MUTED)
            } else {
                Text("还没有本地音乐", fontSize = 14.sp, color = MUTED)
                Text("点击右上角「智能识别」或「导入」添加手机里的音频", fontSize = 12.sp, color = MUTED)
            }
        }
    })
}

// ---- 下载页 ----

@Composable
private fun DownloadsPage(vm: AppViewModel) {
    val scroll = rememberScrollState()
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.value }.collect { vm.homeScroll(it.toFloat()) }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(top = (vm.headerHeight() + 12).dp, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (vm.downloadItems.isEmpty()) {
            Text("下载的音乐会保存在这里", fontSize = 17.sp, color = MUTED, modifier = Modifier.padding(24.dp))
        }
        vm.downloadItems.forEach { item ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(if (AppAppearance.light) Color(0x09000000) else Color(0x0BFFFFFF))
                    .clickable(enabled = item.state == "complete") {
                        vm.playSong(item.song, vm.downloadItems.filter { it.state == "complete" }.map { it.song })
                    }
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    AssetIcon(
                        "ic_download.svg",
                        size = 26.dp,
                        tint = if (item.state == "complete") ACCENT else MUTED,
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(item.song.name, fontSize = 16.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            when (item.state) {
                                "complete" -> if (item.exportError.isNotEmpty()) "已下载 · ${item.exportError}"
                                    else if (item.publicUri.isNotEmpty()) "已保存到系统 · ${item.publicLocation} · ${item.quality}"
                                    else "已下载 · ${item.quality} · 可另存到系统"
                                "downloading" -> "${"%.1f".format(item.received / 1048576.0)} MB" +
                                    if (item.total > 0) " / ${"%.1f".format(item.total / 1048576.0)} MB" else ""
                                else -> item.error
                            },
                            fontSize = 12.sp,
                            color = MUTED,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (item.state == "downloading") {
                        Text(
                            "取消",
                            fontSize = 13.sp,
                            color = TEXT,
                            modifier = Modifier.clickable { vm.cancelDownload(item.id) }.padding(8.dp),
                        )
                    }
                    if (item.state == "complete") {
                        Text("另存为", fontSize = 13.sp, color = TEXT,
                            modifier = Modifier.clickable { vm.requestDownloadExport(item.id) }.padding(8.dp))
                    }
                }
                if (item.state == "downloading") {
                    LinearProgressIndicator(
                        progress = { if (item.total > 0) (item.received.toFloat() / item.total).coerceIn(0f, 1f) else 0f },
                        modifier = Modifier.fillMaxWidth().height(3.dp),
                        color = ACCENT,
                        trackColor = Color(0x1FFFFFFF),
                    )
                }
            }
        }
    }
}

// ---- 板块更多页（FeedSectionPage） ----

@Composable
fun FeedOverlay(vm: AppViewModel) {
    val scroll = rememberScrollState(vm.feedScrollOffset)
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.value }.collect { vm.feedScrollOffset = it }
    }
    val playlists = vm.feedSectionPlaylists()
    val songs = vm.feedSectionSongs()
    val locals = vm.feedSectionLocal()
    var sortMode by remember(vm.feedSection) { mutableStateOf("added") }
    var manual by remember(vm.feedSection) { mutableStateOf<List<String>>(emptyList()) }
    var orderOpen by remember { mutableStateOf(false) }
    var orderSongs by remember { mutableStateOf<List<Song>>(emptyList()) }
    androidx.activity.compose.BackHandler(enabled = orderOpen) { orderOpen = false }
    val ordered = orderSongList(songs, sortMode, manual)
    val appear = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(vm.feedClosing) {
        appear.animateTo(
            if (vm.feedClosing) 0f else 1f,
            spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        )
    }
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                alpha = appear.value
                translationY = (1f - appear.value) * 18.dp.toPx()
            }
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = 1000.dp)
                .fillMaxWidth()
                .fillMaxHeight()
                .verticalScroll(scroll)
                .padding(
                    start = if (vm.wide) 32.dp else 20.dp,
                    end = if (vm.wide) 32.dp else 20.dp,
                    top = (vm.statusInset + 98).dp,
                    bottom = 180.dp,
                ),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (ordered.isNotEmpty()) {
                SongListTools(
                    countText = "${ordered.size} 首歌曲",
                    onPlayAll = { vm.playSong(ordered.first(), ordered) },
                    onSort = { sortMode = it },
                    onManual = {
                        orderSongs = ordered
                        orderOpen = true
                    },
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ordered.forEach { song ->
                        SongRow(
                            song = song,
                            active = vm.selected?.key == song.key,
                            liked = vm.liked(song),
                            wide = vm.wide,
                            onClick = { vm.playSong(song, ordered) },
                            onLike = { vm.like(song) },
                            onMore = { vm.addToPlaylist(song) },
                            onDownload = { vm.downloadSong(song) },
                        )
                    }
                }
            }
            if (playlists.isNotEmpty()) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    maxItemsInEachRow = if (vm.wide) 4 else 2,
                ) {
                    playlists.forEach { item ->
                        Column(
                            modifier = Modifier.weight(1f).tapNoRipple { vm.openFeedPlaylist(item) },
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CoverCard(
                                cover = item.cover,
                                name = item.name,
                                source = item.source,
                                radius = 16,
                                badgeSize = 18,
                                fallbackText = 40f,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(item.name, fontSize = 13.sp, color = TEXT, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(if (item.count > 0) "${item.count} 首" else "推荐内容", fontSize = 10.sp, color = MUTED)
                        }
                    }
                }
            }
            if (locals.isNotEmpty()) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    maxItemsInEachRow = if (vm.wide) 4 else 2,
                ) {
                    locals.forEach { playlist ->
                        Column(
                            modifier = Modifier.weight(1f).tapNoRipple {
                                vm.openLibraryPlaylist(playlist, vm.tab, vm.feedSection)
                            },
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(
                                Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(Color(0xFF17191C)),
                                contentAlignment = Alignment.Center,
                            ) {
                                AssetIcon(if (playlist.isFavorite) "ic_heart.svg" else "ic_queue.svg", size = 34.dp, tint = ACCENT)
                                playlist.songs.firstOrNull()?.coverUrl?.takeIf { it.isNotEmpty() }?.let {
                                    RemoteImage(it, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                }
                            }
                            Text(playlist.name, fontSize = 13.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${playlist.songs.size} 首歌曲", fontSize = 10.sp, color = MUTED)
                        }
                    }
                }
            }
            if (ordered.isEmpty() && playlists.isEmpty() && locals.isEmpty()) {
                if (vm.feedSectionLoading) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 120.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Spacer(Modifier.weight(1f))
                        CircularProgressIndicator(color = ACCENT, strokeWidth = 2.5.dp, modifier = Modifier.size(30.dp))
                        Text("正在载入板块内容…", fontSize = 14.sp, color = MUTED)
                        Spacer(Modifier.weight(1f))
                    }
                } else {
                    Text(
                        "这里还没有内容",
                        fontSize = 14.sp,
                        color = MUTED,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(top = 120.dp),
                    )
                }
            }
        }
        PageHeader(
            title = vm.feedSectionTitle(),
            subtitle = vm.feedSectionSubtitle(),
            wide = vm.wide,
            topInset = vm.statusInset,
            backLabel = "返回首页",
            onBack = { vm.closeFeedSection() },
        )
        if (orderOpen) {
            SongOrderDialog(
                songs = orderSongs,
                wide = vm.wide,
                statusInset = vm.statusInset,
                bottomInset = vm.bottomInset,
                onCancel = { orderOpen = false },
                onDone = { keys ->
                    manual = keys
                    sortMode = "manual"
                    orderOpen = false
                },
            )
        }
    }
}

// ---- 搜索页 ----

@Composable
internal fun SearchLanding(vm: AppViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = (vm.headerHeight() + 16).dp, bottom = (92 + vm.bottomInset).dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (vm.searchHistory.isNotEmpty()) {
            Text("搜索历史", fontSize = 14.sp, color = TEXT, fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                vm.searchHistory.forEach { word ->
                    GlassSurface(
                        modifier = Modifier.tapNoRipple { vm.suggestSearch(word) },
                        shape = RoundedCornerShape(18.dp),
                        tone = GlassTone.UltraThin,
                    ) {
                        Text(
                            word,
                            fontSize = 13.sp,
                            color = LocalGlassInk.current.copy(alpha = 0.65f),
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }
        Text("推荐搜索", fontSize = 14.sp, color = TEXT, fontWeight = FontWeight.Medium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            vm.searchSuggestions.forEach { word ->
                GlassSurface(
                    modifier = Modifier.tapNoRipple { vm.suggestSearch(word) },
                    shape = RoundedCornerShape(18.dp),
                    tone = GlassTone.UltraThin,
                ) {
                    Text(
                        word,
                        fontSize = 13.sp,
                        color = LocalGlassInk.current,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
internal fun SearchSongList(vm: AppViewModel) {
    val songs = remember(vm.results, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(vm.results) }
    LazySongsPage(vm, songs, header = {
        Text("${platformName(vm.platform.id)} · ${songs.size} 首", fontSize = 12.sp, color = MUTED, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
        SongListTools(countText = "${songs.size} 首歌曲", disabled = songs.isEmpty(),
            onPlayAll = { if (songs.isNotEmpty()) vm.playSong(songs.first(), songs) },
            onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrderFor(vm.results) })
    })
}

@Composable
internal fun EntitySongList(vm: AppViewModel) {
    val songs = remember(vm.entitySongs, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(vm.entitySongs) }
    LazySongsPage(vm, songs, header = {

        SongListTools(countText = "${songs.size} 首歌曲", disabled = songs.isEmpty(),
            onPlayAll = { if (songs.isNotEmpty()) vm.playSong(songs.first(), songs) },
            onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrderFor(vm.entitySongs) })
    })
}

/** 目录检索结果（歌单/歌手/专辑/歌词/播客）：与鸿蒙 CatalogueResults 同结构。 */
@Composable
fun CatalogueResults(vm: AppViewModel) {
    val listState = rememberLazyListState()
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }
            .collect { vm.homeScroll((it.first * 80 + it.second).toFloat()) }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(top = (vm.headerHeight() + 8).dp, bottom = 180.dp),
    ) {
        items(vm.entities, key = { "${it.source}:${it.kind}:${it.id}" }) { item ->
            CatalogueRow(vm, item)
        }
        if (vm.hasMore) {
            item {
                Text(
                    if (vm.loading) "加载中…" else "加载更多",
                    fontSize = 13.sp,
                    color = TEXT,
                    modifier = Modifier.fillMaxWidth().clickable { vm.search(true) }.padding(16.dp),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun CatalogueRow(vm: AppViewModel, item: CatalogueEntity) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .tapNoRipple { vm.openEntity(item) }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(58.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF151719)),
            contentAlignment = Alignment.Center,
        ) {
            AssetIcon("ic_queue.svg", size = 24.dp, tint = MUTED)
            if (item.cover.isNotEmpty()) {
                RemoteImage(item.cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(item.name, fontSize = 16.sp, color = TEXT, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                item.artist.ifEmpty { if (item.kind == "songlist") "${item.count} 首歌曲" else "" },
                fontSize = 12.sp,
                color = MUTED,
                maxLines = 1,
            )
        }
        if (item.song != null) {
            MaterialIconButton("ic_download.svg", "下载歌曲", diameter = 32.dp, grouped = true, onClick = { item.song?.let { vm.downloadSong(it) } })
        }
        Text(
            when {
                item.kind == "songlist" -> "导入"
                item.song != null -> "播放"
                else -> "查看"
            },
            fontSize = 13.sp,
            color = MUTED,
        )
    }
}
