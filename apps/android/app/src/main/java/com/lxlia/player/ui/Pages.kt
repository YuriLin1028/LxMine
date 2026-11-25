package com.lxlia.player.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.lx.CatalogueEntity
import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song

// ---- 曲库：时刻/相册式随机方块拼贴 ----

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
                cover = favorite.customCover.ifEmpty { favorite.songs.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty() },
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
            cover = vm.recentSongs.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty(),
            iconKind = "clock",
        )
    )
    for (playlist in vm.playlists) {
        if (playlist.isFavorite || playlist.id == favorite?.id) continue
        out.add(
            LibraryTile(
                kind = "playlist",
                id = playlist.id,
                name = playlist.name,
                count = if (playlist.kind == "lx") "${playlist.songs.size} 首歌曲" else "本地文件歌单",
                detail = "歌单",
                cover = playlist.customCover.ifEmpty { playlist.songs.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty() },
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
            cover = vm.localTracks.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty(),
            iconKind = "music",
        )
    )
    return out
}

/** 曲库 Bento 多形态模板池：每次点击刷新除卡片顺序外，连方块大小与纵横形状一并随机变化（#14）。 */
private fun spanFor(index: Int, columns: Int, total: Int, seed: Int): IntArray {
    val variant = ((seed ushr 3) and 0x7FFFFFFF) % 5
    val fourVariants = arrayOf(
        arrayOf(intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 1)),
        arrayOf(intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 1)),
        arrayOf(intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(1, 2), intArrayOf(2, 1)),
        arrayOf(intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(2, 2)),
        arrayOf(intArrayOf(2, 1), intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(1, 1)),
    )
    val fiveVariants = arrayOf(
        arrayOf(intArrayOf(2, 2), intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 1)),
        arrayOf(intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(2, 1)),
        arrayOf(intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 2)),
        arrayOf(intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(1, 2), intArrayOf(1, 2)),
        arrayOf(intArrayOf(2, 2), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 1)),
    )
    val generalVariants = arrayOf(
        arrayOf(
            intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(2, 1),
            intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(1, 2), intArrayOf(2, 1), intArrayOf(1, 1),
        ),
        arrayOf(
            intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 2),
            intArrayOf(1, 1), intArrayOf(1, 1), intArrayOf(2, 1), intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(1, 2),
        ),
        arrayOf(
            intArrayOf(2, 1), intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1),
            intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(2, 1), intArrayOf(1, 1),
        ),
        arrayOf(
            intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(2, 2), intArrayOf(1, 1),
            intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(2, 2),
        ),
        arrayOf(
            intArrayOf(2, 2), intArrayOf(2, 1), intArrayOf(1, 2), intArrayOf(1, 2), intArrayOf(1, 1), intArrayOf(1, 1),
            intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(2, 2), intArrayOf(1, 1), intArrayOf(2, 1),
        ),
    )
    val patterns = generalVariants[variant]
    val pattern = when (total) {
        4 -> fourVariants[variant].getOrElse(index) { patterns[index % patterns.size] }
        5 -> fiveVariants[variant].getOrElse(index) { patterns[index % patterns.size] }
        else -> {
            val offset = ((seed ushr 7) and 0x7FFFFFFF) % patterns.size
            patterns[(index + offset) % patterns.size]
        }
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
    AnimatedContent(
        targetState = page,
        transitionSpec = {
            val enteringDetail = targetState != "library" && initialState == "library"
            val returningRoot = targetState == "library" && initialState != "library"
            val slideSpec = spring<androidx.compose.ui.unit.IntOffset>(dampingRatio = 0.84f, stiffness = 420f)
            when {
                enteringDetail -> (slideInHorizontally(slideSpec) { it / 6 } + fadeIn(tween(220)))
                    .togetherWith(slideOutHorizontally(slideSpec) { -it / 10 } + fadeOut(tween(180)))
                returningRoot -> (slideInHorizontally(slideSpec) { -it / 10 } + fadeIn(tween(220)))
                    .togetherWith(slideOutHorizontally(slideSpec) { it / 6 } + fadeOut(tween(180)))
                else -> fadeIn(tween(200)).togetherWith(fadeOut(tween(160)))
            }
        },
        label = "library-route",
    ) { route ->
        states.SaveableStateProvider(route) {
            when {
                route == "downloads" -> DownloadsPage(vm)
                opened != null && route == opened.id && opened.kind == "local" -> LocalMusicPage(vm)
                opened != null && route == opened.id -> PlaylistDetailPage(vm, opened)
                else -> LibraryMosaicPage(vm)
            }
        }
    }
}

@Composable
private fun LibraryMosaicPage(vm: AppViewModel) {
    val scroll = rememberScrollState()
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    LaunchedEffect(scroll, density) {
        snapshotFlow { scroll.value to scroll.isScrollInProgress }.collect { (offset, moving) ->
            if (vm.tab == "资料库" && !vm.showPlayer && vm.openedPlaylist == null && !vm.downloadsOpen) {
                vm.homeScroll(offset / density, canTrackDock = moving)
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
        buildMosaic(shuffledTiles(tiles, vm.libraryMosaicSeed), columns, cell, rowHeight, gap, vm.libraryMosaicSeed)
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

private fun buildMosaic(tiles: List<LibraryTile>, columns: Int, cell: Float, rowHeight: Float, gap: Float, seed: Int): List<MosaicSlot> {
    val occupied = mutableListOf<BooleanArray>()
    fun row(index: Int): BooleanArray {
        while (occupied.size <= index) occupied.add(BooleanArray(columns))
        return occupied[index]
    }
    val slots = mutableListOf<MosaicSlot>()
    var maxRow = 0
    tiles.forEachIndexed { index, tile ->
        val span = spanFor(index, columns, tiles.size, seed)
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
    val tileShape = RoundedCornerShape(18.dp)
    val borderBrush = if (AppAppearance.light) {
        Brush.verticalGradient(listOf(Color(0x22000000), Color(0x08000000)))
    } else {
        Brush.verticalGradient(listOf(Color(0x2EFFFFFF), Color(0x0AFFFFFF)))
    }
    Box(
        modifier = Modifier
            .offset(x = slot.x.dp, y = slot.y.dp)
            .width(slot.w.dp)
            .height(slot.h.dp)
            .clip(tileShape)
            .border(0.75.dp, borderBrush, tileShape)
            .tapNoRipple(onOpen),
    ) {
        if (slot.tile.cover.isNotEmpty()) {
            RemoteImage(slot.tile.cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            val colors = if (slot.tile.iconKind == "heart") {
                listOf(Color(0xFF5E1D28), Color(0xFFB8334A))
            } else {
                gradFor(slot.tile.name)
            }
            Box(
                Modifier.fillMaxSize().background(Brush.linearGradient(colors)),
                contentAlignment = Alignment.Center,
            ) {
                AssetIcon(
                    when (slot.tile.iconKind) {
                        "heart" -> "ic_heart_fill.svg"
                        "clock" -> "symbol_clock.svg"
                        else -> "ic_music.svg"
                    },
                    size = 50.dp,
                    tint = when (slot.tile.iconKind) {
                        "heart" -> null
                        "clock" -> Color(0xFFF2F8FF)
                        else -> ACCENT
                    },
                    systemSymbol = false,
                )
            }
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0x0005070A), Color(0xD605070A)), startY = 54f)),
        )
        Column(Modifier.fillMaxSize().padding(12.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Spacer(Modifier.weight(1f))
                Text(
                    slot.tile.count,
                    fontSize = 10.sp,
                    color = Color(0xEEFFFFFF),
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color(0x6B000000))
                        .border(0.5.dp, Color(0x24FFFFFF), RoundedCornerShape(9.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    slot.tile.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.15).sp,
                    color = Color(0xFFF6F6F8),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(slot.tile.detail, fontSize = 11.sp, color = Color(0xC9FFFFFF), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private val GRADS_LOCAL = listOf(
    listOf(Color(0xFF0B2B5B), Color(0xFF38BDF8)),
    listOf(Color(0xFF162456), Color(0xFF64D2FF)),
    listOf(Color(0xFF1E295E), Color(0xFF818CF8)),
    listOf(Color(0xFF0D4A56), Color(0xFF2DD4BF)),
    listOf(Color(0xFF1B3A73), Color(0xFF7DD3FC)),
    listOf(Color(0xFF2B2467), Color(0xFFA5B4FC)),
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
    playQueue: List<Song>? = null,
    fromSearch: Boolean = false,
    preserveQueue: Boolean = false,
    showDownload: Boolean = true,
    autoScrollKey: String = "",
    onSwitchPlatform: ((Song) -> Unit)? = null,
    onRemoveSong: ((Song) -> Unit)? = null,
    removeLabel: String = "从歌单移除",
    header: @Composable () -> Unit,
    empty: @Composable () -> Unit = {},
) {
    val state = rememberLazyListState()
    val likedKeys = vm.likedKeys
    var autoScrolled by remember(autoScrollKey) { mutableStateOf(false) }
    val rowKeys = remember(songs) {
        val occurrences = mutableMapOf<String, Int>()
        songs.map { song ->
            val occurrence = occurrences.getOrDefault(song.key, 0)
            occurrences[song.key] = occurrence + 1
            "${song.key}:$occurrence"
        }
    }
    LaunchedEffect(autoScrollKey, songs.size) {
        if (autoScrollKey.isEmpty() || autoScrolled || songs.isEmpty()) return@LaunchedEffect
        val activeKey = vm.selected?.key ?: return@LaunchedEffect
        val songIndex = songs.indexOfFirst { it.key == activeKey }
        if (songIndex >= 0) {
            autoScrolled = true
            kotlinx.coroutines.yield()
            val viewport = (state.layoutInfo.viewportEndOffset - state.layoutInfo.viewportStartOffset).coerceAtLeast(0)
            val centerOffset = if (viewport > 220) -(viewport / 3) else -110
            runCatching { state.animateScrollToItem((songIndex + 1).coerceAtLeast(0), centerOffset) }
        }
    }
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    LaunchedEffect(state, density) {
        snapshotFlow {
            Triple(
                state.firstVisibleItemIndex * 72f + state.firstVisibleItemScrollOffset / density,
                state.isScrollInProgress,
                Unit,
            )
        }.collect { (offsetDp, moving, _) ->
            vm.homeScroll(offsetDp, canTrackDock = moving)
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(), state = state,
        contentPadding = PaddingValues(top = (vm.headerHeight() + 8).dp, bottom = 180.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item(key = "header", contentType = "header") { Column { header() } }
        itemsIndexed(songs, key = { index, _ -> rowKeys[index] }, contentType = { _, _ -> "song" }) { _, song ->
            SongRow(
                song = song,
                active = vm.selected?.key == song.key,
                liked = song.key in likedKeys,
                wide = vm.wide,
                showDownload = showDownload,
                onClick = {
                    val queueToUse = if (!playQueue.isNullOrEmpty()) playQueue else songs
                    vm.playSong(song, queueToUse, fromSearch = fromSearch, preserveQueue = preserveQueue)
                },
                onLike = { vm.like(song) },
                onMore = { vm.addToPlaylist(song) },
                onDownload = { vm.downloadSong(song) },
                onPlayNext = { vm.playNext(song) },
                onSwitchPlatform = onSwitchPlatform?.let { handler -> ({ handler(song) }) },
                onRemove = onRemoveSong?.let { handler -> ({ handler(song) }) },
                removeLabel = removeLabel,
            )
        }
        if (songs.isEmpty()) item(key = "empty", contentType = "empty") { empty() }
    }
}

@Composable
fun PlaylistDetailPage(vm: AppViewModel, playlist: MusicPlaylist) {
    val fullSongs = remember(playlist.songs, vm.listSortMode, vm.manualOrder) { vm.arrangedSongs(playlist.songs, applyQuery = false) }
    val songs = remember(playlist.songs, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(playlist.songs) }
    val loading = vm.openedFeedLoading && playlist.songs.isEmpty()
    val isRecent = playlist.kind == "recent"
    val canRemove = vm.canEditPlaylistSongs(playlist) || isRecent
    val canManage = vm.canManageOpenedPlaylist()
    val canCollect = vm.canCollectOpenedPlaylist(playlist)
    val canSwitchPlatform = canRemove
    LazySongsPage(
        vm = vm,
        songs = songs,
        playQueue = fullSongs,
        preserveQueue = playlist.preserveQueue,
        autoScrollKey = playlist.id,
        onSwitchPlatform = if (canSwitchPlatform) ({ song -> vm.openSwitchPlatformFromPlaylist(playlist, song) }) else null,
        onRemoveSong = if (canRemove) ({ song -> vm.removeSongFromPlaylist(playlist.id, song) }) else null,
        removeLabel = when {
            isRecent -> "从最近播放移除"
            playlist.isFavorite -> "取消收藏"
            else -> "从歌单移除"
        },
        header = {
            if (loading) {
                Column(Modifier.fillMaxWidth().padding(top = 120.dp), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    CircularProgressIndicator(color = ACCENT, strokeWidth = 2.5.dp, modifier = Modifier.size(34.dp))
                    Text("正在载入歌单…", fontSize = 13.sp, color = MUTED)
                }
            } else {
                if (vm.listSearchOpen) SearchInListBar(vm)
                SongListTools(
                    countText = "${songs.size} 首歌曲",
                    disabled = songs.isEmpty(),
                    showDelete = canManage || (isRecent && songs.isNotEmpty()),
                    deleteLabel = if (isRecent) "清空" else "删除歌单",
                    showEdit = canManage,
                    collectLabel = "收藏到曲库",
                    collected = vm.isCollectionSavedToLibrary(playlist.name, playlist.songs),
                    onCollect = if (canCollect) ({ vm.collectToLibrary(playlist.name, playlist.songs, playlist.customCover) }) else null,
                    onPlayAll = { if (fullSongs.isNotEmpty()) vm.playSong(fullSongs.first(), fullSongs) },
                    onBatchCollect = if (songs.isNotEmpty()) ({ vm.openBatchCollectPicker(songs, "批量收藏 · ${playlist.name}") }) else null,
                    onBatchDownload = if (songs.isNotEmpty() && playlist.kind != "local") ({ vm.openBatchDownloadPicker(songs, "批量下载 · ${playlist.name}") }) else null,
                    wide = vm.wide,
                    onCustomCover = if (vm.canEditPlaylistSongs(playlist)) ({ vm.openPlaylistCoverPicker(playlist) }) else null,
                    onSort = { vm.setListSort(it) },
                    onManual = { vm.openManualOrder() },
                    onDelete = { if (isRecent) vm.pendingClearRecent = true else vm.deleteOpenedPlaylist() },
                    onRename = { vm.openRenamePlaylist(playlist) },
                    onBatchDelete = { vm.openEditPlaylist(playlist) },
                )
            }
        },
        empty = {
            if (!loading) {
                Column(Modifier.fillMaxWidth().padding(top = 64.dp), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(if (vm.listQuery.isNotBlank()) "没有匹配的歌曲"
                        else if (isRecent) "还没有最近播放记录"
                        else if (playlist.kind == "lx") "从歌曲行内操作添加到此歌单" else "此歌单使用电脑上的本地音频文件。",
                        fontSize = 14.sp, color = MUTED)
                    if (canManage) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("重命名", fontSize = 13.sp, color = BLUE,
                                modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable { vm.openRenamePlaylist(playlist) }.padding(8.dp))
                            Text("删除歌单", fontSize = 13.sp, color = MUTED,
                                modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable { vm.deleteOpenedPlaylist() }.padding(8.dp))
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun SearchInListBar(vm: AppViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(INPUT_BG)
            .border(0.6.dp, BORDER_SUBTLE, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssetIcon("ic_search.svg", size = 18.dp, alpha = 0.7f)
        BasicTextField(
            value = vm.listQuery,
            cursorBrush = SolidColor(CONTROL_BLUE),
            onValueChange = { vm.listQuery = it },
            singleLine = true,
            textStyle = TextStyle(color = TEXT, fontSize = 14.sp),
            modifier = Modifier.weight(1f).height(40.dp),
            decorationBox = { innerTextField ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                    if (vm.listQuery.isEmpty()) {
                        Text("搜索本列表", fontSize = 14.sp, color = MUTED)
                    }
                    innerTextField()
                }
            },
        )
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
    val fullSongs = remember(vm.localTracks, vm.listSortMode, vm.manualOrder) { vm.arrangedSongs(vm.localTracks, applyQuery = false) }
    val songs = remember(vm.localTracks, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(vm.localTracks) }
    LazySongsPage(vm, songs, playQueue = fullSongs, showDownload = false, autoScrollKey = "local-android", header = {
        SongListTools(countText = "${songs.size} 首本地歌曲", disabled = songs.isEmpty(),
            onPlayAll = { if (fullSongs.isNotEmpty()) vm.playSong(fullSongs.first(), fullSongs) },
            onBatchCollect = if (songs.isNotEmpty()) ({ vm.openBatchCollectPicker(songs, "批量收藏 · 本地音乐") }) else null,
            wide = vm.wide,
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
    val listState = rememberLazyListState()
    var batchMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }
    var pendingDeleteIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var pendingDeleteTitle by remember { mutableStateOf("") }
    var deleteSourceFile by remember { mutableStateOf(false) }

    LaunchedEffect(vm.downloadItems) {
        if (vm.downloadItems.isEmpty()) {
            batchMode = false
            selectedIds = emptySet()
        } else {
            val valid = vm.downloadItems.map { it.id }.toSet()
            val filtered = selectedIds.intersect(valid)
            if (filtered.size != selectedIds.size) selectedIds = filtered
        }
    }

    val density = LocalDensity.current.density.coerceAtLeast(1f)
    LaunchedEffect(listState, density) {
        snapshotFlow {
            (listState.firstVisibleItemIndex * 96f + listState.firstVisibleItemScrollOffset / density) to listState.isScrollInProgress
        }.collect { (offsetDp, moving) ->
            vm.homeScroll(offsetDp, canTrackDock = moving)
        }
    }

    val selectedCompletedIds = remember(vm.downloadItems, selectedIds) {
        vm.downloadItems.filter { it.id in selectedIds && it.state == "complete" }.map { it.id }
    }
    val pillBg = CHIP_BG

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(top = (vm.headerHeight() + 12).dp, bottom = 180.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (vm.downloadItems.isEmpty()) {
                item(key = "empty") {
                    Text("下载的音乐会保存在这里", fontSize = 17.sp, color = MUTED, modifier = Modifier.padding(24.dp))
                }
            } else {
                item(key = "batch-toolbar") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (batchMode) {
                            val allSelected = selectedIds.size == vm.downloadItems.size
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(pillBg)
                                    .clickable {
                                        selectedIds = if (allSelected) emptySet() else vm.downloadItems.map { it.id }.toSet()
                                    }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            ) {
                                Text(if (allSelected) "取消全选" else "全选", fontSize = 13.sp, color = TEXT, maxLines = 1, softWrap = false)
                            }
                            Text("已选 ${selectedIds.size} 项", fontSize = 13.sp, color = MUTED, maxLines = 1)
                            Spacer(Modifier.weight(1f))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(ACCENT.copy(alpha = if (selectedCompletedIds.isNotEmpty()) 0.18f else 0.07f))
                                    .clickable(enabled = selectedCompletedIds.isNotEmpty()) {
                                        vm.requestBatchDownloadExport(selectedCompletedIds)
                                    }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            ) {
                                Text(
                                    "另存为",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = ACCENT.copy(alpha = if (selectedCompletedIds.isNotEmpty()) 1f else 0.42f),
                                    maxLines = 1,
                                    softWrap = false,
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(Color(0xFFFF6B76).copy(alpha = if (selectedIds.isNotEmpty()) 0.18f else 0.07f))
                                    .clickable(enabled = selectedIds.isNotEmpty()) {
                                        pendingDeleteIds = selectedIds.toList()
                                        pendingDeleteTitle = "确认删除已选的 ${selectedIds.size} 项下载任务吗？"
                                        deleteSourceFile = false
                                    }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            ) {
                                Text(
                                    "删除",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFFFF6B76).copy(alpha = if (selectedIds.isNotEmpty()) 1f else 0.42f),
                                    maxLines = 1,
                                    softWrap = false,
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(pillBg)
                                    .clickable {
                                        batchMode = false
                                        selectedIds = emptySet()
                                    }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            ) {
                                Text("完成", fontSize = 13.sp, color = TEXT, maxLines = 1, softWrap = false)
                            }
                        } else {
                            Spacer(Modifier.weight(1f))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(pillBg)
                                    .clickable {
                                        batchMode = true
                                        selectedIds = emptySet()
                                    }
                                    .padding(horizontal = 14.dp, vertical = 7.dp),
                            ) {
                                Text("批量管理", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = ACCENT, maxLines = 1, softWrap = false)
                            }
                        }
                    }
                }
            }
            items(vm.downloadItems, key = { it.id }) { item ->
                val isSelected = item.id in selectedIds
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (AppAppearance.light) Color(0x09000000) else Color(0x0BFFFFFF))
                        .then(
                            if (batchMode && isSelected) Modifier.border(1.5.dp, ACCENT, RoundedCornerShape(18.dp))
                            else Modifier
                        )
                        .clickable(enabled = batchMode || item.state == "complete") {
                            if (batchMode) {
                                selectedIds = if (isSelected) selectedIds - item.id else selectedIds + item.id
                            } else {
                                vm.playSong(item.song, vm.downloadItems.filter { it.state == "complete" }.map { it.song })
                            }
                        }
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (batchMode) {
                            Box(
                                modifier = Modifier
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(if (isSelected) ACCENT else Color.Transparent)
                                    .border(1.5.dp, if (isSelected) ACCENT else MUTED, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (isSelected) {
                                    Text("✓", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF09111E))
                                }
                            }
                        }
                        SongCover(item.song.coverUrl, item.song.source, size = 46.dp, radius = 10.dp, name = item.song.name)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(item.song.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                        if (!batchMode) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (item.state == "downloading") {
                                    TextAction("取消", color = MUTED) { vm.cancelDownload(item.id) }
                                }
                                if (item.state == "complete") {
                                    TextAction("另存为", color = ACCENT) { vm.requestDownloadExport(item.id) }
                                }
                                if (item.state != "downloading") {
                                    TextAction("删除", color = Color(0xFFFF6B76)) {
                                        pendingDeleteIds = listOf(item.id)
                                        pendingDeleteTitle = "确认删除「${item.song.name}」吗？"
                                        deleteSourceFile = false
                                    }
                                }
                            }
                        }
                    }
                    if (item.state == "downloading") {
                        LinearProgressIndicator(
                            progress = { if (item.total > 0) (item.received.toFloat() / item.total).coerceIn(0f, 1f) else 0f },
                            modifier = Modifier.fillMaxWidth().height(3.dp),
                            color = ACCENT,
                            trackColor = TRACK_BG,
                        )
                    }
                }
            }
        }

        if (pendingDeleteIds.isNotEmpty()) {
            GlassDialog(
                onDismiss = {
                    pendingDeleteIds = emptyList()
                    pendingDeleteTitle = ""
                },
            ) {
                Text(
                    if (pendingDeleteIds.size > 1) "批量删除下载" else "删除下载任务",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TEXT,
                )
                Text(pendingDeleteTitle, fontSize = 14.sp, color = MUTED)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(CARD_SURFACE)
                        .clickable { deleteSourceFile = !deleteSourceFile }
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = deleteSourceFile,
                        onCheckedChange = { deleteSourceFile = it },
                        colors = CheckboxDefaults.colors(checkedColor = Color(0xFFFF5C6C), checkmarkColor = Color.White),
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("同时删除本地音频源文件", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TEXT)
                        Text("勾选后一并清理本地音频文件；不勾选仅移除下载记录", fontSize = 11.sp, color = MUTED)
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SheetHeaderTextAction("取消", color = MUTED) {
                        pendingDeleteIds = emptyList()
                        pendingDeleteTitle = ""
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(18.dp))
                            .background(Color(0xFFFF5C6C))
                            .pressDeform()
                            .clickable {
                                val ids = pendingDeleteIds
                                val delFiles = deleteSourceFile
                                pendingDeleteIds = emptyList()
                                pendingDeleteTitle = ""
                                selectedIds = selectedIds - ids.toSet()
                                if (selectedIds.isEmpty() && ids.size >= vm.downloadItems.size) {
                                    batchMode = false
                                }
                                vm.removeDownloads(ids, delFiles)
                            }
                            .padding(horizontal = 16.dp, vertical = 9.dp),
                    ) {
                        Text(
                            if (deleteSourceFile) "删除记录与源文件" else "仅移除记录",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                        )
                    }
                }
            }
        }
    }
}

// ---- 板块更多页（FeedSectionPage） ----

@Composable
fun FeedOverlay(vm: AppViewModel) {
    val playlists = vm.feedSectionPlaylists()
    val songs = vm.feedSectionSongs()
    val locals = vm.feedSectionLocal()
    val likedKeys = vm.likedKeys
    var sortMode by remember(vm.feedSection) { mutableStateOf("added") }
    var manual by remember(vm.feedSection) { mutableStateOf<List<String>>(emptyList()) }
    var orderOpen by remember { mutableStateOf(false) }
    var orderSongs by remember { mutableStateOf<List<Song>>(emptyList()) }
    androidx.activity.compose.BackHandler(enabled = orderOpen) { orderOpen = false }
    val ordered = remember(songs, sortMode, manual) { orderSongList(songs, sortMode, manual) }
    val appear = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(vm.feedClosing) {
        appear.animateTo(
            if (vm.feedClosing) 0f else 1f,
            spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        )
    }
    val feedBackdrop = rememberLayerBackdrop {
        drawRect(INK)
        drawContent()
    }
    val topBlurHeight = vm.statusInset + 96f
    val feedListState = rememberLazyListState()
    val cols = if (vm.wide) 4 else 2
    val playlistRows = remember(playlists, cols) { playlists.chunked(cols) }
    val localRows = remember(locals, cols) { locals.chunked(cols) }
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                alpha = appear.value
                translationY = (1f - appear.value) * 18.dp.toPx()
            }
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .topProgressiveFade(topBlurHeight)
                .layerBackdrop(feedBackdrop),
        ) {
        LazyColumn(
            state = feedListState,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = 1000.dp)
                .fillMaxWidth()
                .fillMaxHeight(),
            contentPadding = PaddingValues(
                start = if (vm.wide) 32.dp else 20.dp,
                end = if (vm.wide) 32.dp else 20.dp,
                top = (vm.statusInset + 98).dp,
                bottom = 180.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (ordered.isNotEmpty()) {
                item(key = "tools") {
                    Box(Modifier.padding(bottom = 10.dp)) {
                        SongListTools(
                            countText = "${ordered.size} 首歌曲",
                            onPlayAll = { vm.playSong(ordered.first(), ordered) },
                            onBatchCollect = { vm.openBatchCollectPicker(ordered, "批量收藏 · ${vm.feedSectionTitle()}") },
                            wide = vm.wide,
                            onSort = { sortMode = it },
                            onManual = {
                                orderSongs = ordered
                                orderOpen = true
                            },
                        )
                    }
                }
                itemsIndexed(ordered, key = { idx, s -> "feed-s:${s.key}:$idx" }, contentType = { _, _ -> "song" }) { _, song ->
                    SongRow(
                        song = song,
                        active = vm.selected?.key == song.key,
                        liked = song.key in likedKeys,
                        wide = vm.wide,
                        onClick = { vm.playSong(song, ordered, preserveQueue = true) },
                        onLike = { vm.like(song) },
                        onMore = { vm.addToPlaylist(song) },
                        onDownload = { vm.downloadSong(song) },
                        onPlayNext = { vm.playNext(song) },
                    )
                }
            }
            if (playlistRows.isNotEmpty()) {
                itemsIndexed(playlistRows, key = { idx, row -> "feed-p:$idx:${row.firstOrNull()?.id.orEmpty()}" }, contentType = { _, _ -> "playlist-row" }) { _, row ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        row.forEach { item ->
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
                        repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            if (localRows.isNotEmpty()) {
                itemsIndexed(localRows, key = { idx, row -> "feed-l:$idx:${row.firstOrNull()?.id.orEmpty()}" }, contentType = { _, _ -> "local-row" }) { _, row ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        row.forEach { playlist ->
                            Column(
                                modifier = Modifier.weight(1f).tapNoRipple {
                                    vm.openLibraryPlaylist(playlist, vm.tab, vm.feedSection)
                                },
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .aspectRatio(1f)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(Brush.linearGradient(gradFor(playlist.name)))
                                        .border(0.75.dp, Color(0x28FFFFFF), RoundedCornerShape(14.dp)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    AssetIcon(
                                        if (playlist.isFavorite) "ic_heart_fill.svg" else "ic_queue.svg",
                                        size = 34.dp,
                                        tint = if (playlist.isFavorite) null else Color(0xFFF2F8FF),
                                        systemSymbol = false,
                                    )
                                    val cardCover = playlist.customCover.ifEmpty {
                                        playlist.songs.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty()
                                    }
                                    if (cardCover.isNotEmpty()) {
                                        RemoteImage(cardCover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                    }
                                }
                                Text(playlist.name, fontSize = 13.sp, color = TEXT, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${playlist.songs.size} 首歌曲", fontSize = 10.sp, color = MUTED)
                            }
                        }
                        repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            if (ordered.isEmpty() && playlists.isEmpty() && locals.isEmpty()) {
                item(key = "empty") {
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
        }
        }
        TopProgressiveBlur(feedBackdrop, topBlurHeight)
        CompositionLocalProvider(LocalBackdrop provides feedBackdrop) {
            PageHeader(
                title = vm.feedSectionTitle(),
                subtitle = vm.feedSectionSubtitle(),
                wide = vm.wide,
                topInset = vm.statusInset,
                backLabel = "返回首页",
                onBack = { vm.closeFeedSection() },
            )
        }
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
    LazySongsPage(vm, songs, fromSearch = true, header = {
        Text("${platformName(vm.platform.id)} · ${songs.size} 首", fontSize = 12.sp, color = MUTED, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
        SongListTools(countText = "${songs.size} 首歌曲", disabled = songs.isEmpty(),
            onPlayAll = { if (songs.isNotEmpty()) vm.playSong(songs.first(), songs, fromSearch = true, playAllSearch = true) },
            onBatchCollect = if (songs.isNotEmpty()) ({ vm.openBatchCollectPicker(songs, "批量收藏 · 搜索结果") }) else null,
            onBatchDownload = { vm.openBatchDownloadPicker(songs) },
            wide = vm.wide,
            onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrderFor(vm.results) })
    })
}

@Composable
internal fun EntitySongList(vm: AppViewModel) {
    val fullSongs = remember(vm.entitySongs, vm.listSortMode, vm.manualOrder) { vm.arrangedSongs(vm.entitySongs, applyQuery = false) }
    val songs = remember(vm.entitySongs, vm.listSortMode, vm.manualOrder, vm.listQuery) { vm.arrangedSongs(vm.entitySongs) }
    val entity = vm.openedEntity
    LazySongsPage(vm, songs, playQueue = fullSongs, header = {
        Text(
            "${platformName(entity?.source ?: vm.platform.id)} · ${songs.size} 首",
            fontSize = 12.sp,
            color = MUTED,
            modifier = Modifier.padding(top = 12.dp, bottom = 6.dp),
        )
        SongListTools(countText = "${songs.size} 首歌曲", disabled = songs.isEmpty(),
            collectLabel = if (entity?.kind == "album") "收藏专辑" else "收藏到曲库",
            collected = entity != null && vm.isCollectionSavedToLibrary(entity.name, vm.entitySongs),
            onCollect = if (entity != null && vm.entitySongs.isNotEmpty()) ({ vm.collectToLibrary(entity.name, vm.entitySongs, entity.cover) }) else null,
            onPlayAll = { if (fullSongs.isNotEmpty()) vm.playSong(fullSongs.first(), fullSongs) },
            onBatchCollect = if (songs.isNotEmpty()) ({ vm.openBatchCollectPicker(songs, "批量收藏 · ${entity?.name ?: "歌曲列表"}") }) else null,
            onBatchDownload = { vm.openBatchDownloadPicker(songs, "批量下载 · ${entity?.name ?: "歌曲列表"}") },
            wide = vm.wide,
            onSort = { vm.setListSort(it) }, onManual = { vm.openManualOrderFor(vm.entitySongs) })
    })
}

/** 目录检索结果（歌单/歌手/专辑/歌词/播客）：与鸿蒙 CatalogueResults 同结构。 */
@Composable
fun CatalogueResults(vm: AppViewModel) {
    val listState = rememberLazyListState()
    val density = LocalDensity.current.density.coerceAtLeast(1f)
    LaunchedEffect(listState, density) {
        snapshotFlow {
            (listState.firstVisibleItemIndex * 80f + listState.firstVisibleItemScrollOffset / density) to listState.isScrollInProgress
        }.collect { (offsetDp, moving) ->
            vm.homeScroll(offsetDp, canTrackDock = moving)
        }
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
                    color = ACCENT,
                    modifier = Modifier.fillMaxWidth().clickable(enabled = !vm.loading) { vm.search(true) }.padding(16.dp),
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
            modifier = Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(gradFor(item.name)))
                .border(0.6.dp, Color(0x26FFFFFF), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            val initial = item.name.trim().take(1)
            if (initial.isNotEmpty()) {
                Text(initial, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF2F8FF))
            } else {
                AssetIcon("ic_queue.svg", size = 24.dp, tint = Color(0xFFF2F8FF), systemSymbol = false)
            }
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
