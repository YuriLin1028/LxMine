package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.FeedSection
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import java.util.Calendar

private val GRADS = listOf(
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
    return GRADS[hash % GRADS.size]
}

/** 封面卡：有封面用封面，缺封面用名称哈希渐变 + 首字兜底。 */
@Composable
fun CoverCard(
    cover: String,
    name: String,
    source: String?,
    radius: Int = 16,
    badgeSize: Int = 20,
    countText: String = "",
    fallbackText: Float = 40f,
    modifier: Modifier = Modifier,
) {
    Box(modifier.aspectRatio(1f)) {
        Box(
            Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(radius.dp))
                .background(Color(0xFF17191C)),
        ) {
            if (cover.isNotEmpty()) {
                RemoteImage(cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                val colors = gradFor(name)
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Brush.linearGradient(colors)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        name.take(2),
                        fontSize = (fallbackText * 0.7f).sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF2F1F7),
                    )
                }
            }
            if (countText.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(6.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(Color(0x66000000))
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    AssetIcon("ic_play.svg", size = 10.dp, tint = TEXT)
                    Text(countText, fontSize = 10.sp, color = TEXT, maxLines = 1)
                }
            }
        }
        val badge = sourceBadgeAsset(source)
        if (badge != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(if (badgeSize >= 20) 5.dp else 4.dp)) {
                Box(Modifier.size(badgeSize.dp).clip(CircleShape)) {
                    AssetIcon(badge, size = badgeSize.dp)
                }
            }
        }
    }
}

private fun bannerNote(item: FeedPlaylist): String {
    if (item.id == "daily-30") {
        val now = Calendar.getInstance()
        return "${now.get(Calendar.MONTH) + 1}月${now.get(Calendar.DAY_OF_MONTH)}日 · 融合推荐 ${item.count} 首"
    }
    val plays = formatPlayCount(item.playCount)
    val parts = mutableListOf<String>()
    if (plays.isNotEmpty()) parts.add("${plays}次播放")
    if (item.count > 0) parts.add("${item.count} 首")
    return parts.joinToString(" · ").ifEmpty { "打开播放" }
}

private fun bannerItems(feed: HomeFeed?): List<FeedPlaylist> {
    val items = mutableListOf<FeedPlaylist>()
    feed?.daily?.let { items.add(it) }
    for (chart in feed?.charts.orEmpty()) {
        if (items.size >= 6) break
        items.add(chart)
    }
    return items
}

/**
 * 首页：华为音乐样式的融合首屏（头图、新歌速递、动效/推荐/热门歌单/分类、相似推荐）。
 * 板块顺序与鸿蒙 MineHome 完全一致，锚点 id 供快捷胶囊使用。
 */
@Composable
fun HomePage(
    vm: AppViewModel,
    contentTop: Float,
    wide: Boolean,
    onAnchorOffset: (String, Float) -> Unit,
    onScrollOffset: (Float, Boolean) -> Unit,
    onEdgeBottom: (Boolean) -> Unit,
) {
    val feed = vm.homeFeed
    val scroll = rememberScrollState()
    var newSongsSort by rememberSaveable { mutableStateOf("added") }
    var newSongsManual by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var orderOpen by remember { mutableStateOf(false) }
    var orderSongs by remember { mutableStateOf<List<Song>>(emptyList()) }
    androidx.activity.compose.BackHandler(enabled = orderOpen) { orderOpen = false }

    LaunchedEffect(scroll) {
        snapshotFlow {
            if (vm.tab == "发现" && !vm.showPlayer && !vm.searchOpen && vm.feedSection.isEmpty())
                Triple(scroll.value, scroll.maxValue, scroll.isScrollInProgress) else null
        }.collect { state ->
            val (value, max, moving) = state ?: return@collect
            onScrollOffset(value.toFloat(), moving)
            onEdgeBottom(max > 0 && value >= max - 2)
            vm.updateChipAnchorFromScroll(value.toFloat())
        }
    }

    fun sortedNewSongs(): List<Song> = orderSongList(feed?.newSongs.orEmpty(), newSongsSort, newSongsManual)

    // 快捷胶囊点击 → 滚到对应板块（与鸿蒙 onHomeChip 的几何算法等价）。
    LaunchedEffect(vm.scrollRequest) {
        val anchor = vm.scrollRequest ?: return@LaunchedEffect
        val target = vm.anchorOffsets[anchor]
        if (target != null) {
            val offset = (target - (contentTop + 64)).toInt().coerceAtLeast(0)
            scroll.animateScrollTo(offset)
        }
        vm.scrollRequest = null
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(top = (contentTop + 64).dp, bottom = 180.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            if (feed == null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 140.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(26.dp), color = ACCENT, strokeWidth = 2.5.dp)
                            Text("正在载入首页内容…", fontSize = 14.sp, color = MUTED)
                        }
                    }
                }
            }
            val banners = bannerItems(feed)
            if (banners.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().onGloballyPositioned { onAnchorOffset("banner", it.positionInParent().y) }) {
                    LazyRow(
                        modifier = Modifier.fillMaxWidth().height(238.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(horizontal = 20.dp),
                    ) {
                        items(banners, key = { "${it.source}:${it.id}" }) { item ->
                            HomeBannerCard(
                                item = item,
                                playing = vm.playing,
                                isActive = vm.openedFeedSourceId == item.id || vm.openedPlaylist?.id == "feed-${item.id}",
                                modifier = Modifier.width((vm.viewportWidth * 0.46f).dp),
                                onOpen = { vm.openFeedPlaylist(item) },
                                onPlay = { vm.playFeedFromHome(item) },
                            )
                        }
                    }
                }
            }
            if (feed != null && feed.newSongs.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { onAnchorOffset("newSongs", it.positionInParent().y) },
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SectionTitle("新歌速递", section = "newSongs", onMore = { vm.openFeedSection("newSongs") })
                    SongListTools(
                        countText = "${feed.newSongs.size} 首歌曲",
                        modifier = Modifier.padding(horizontal = 20.dp),
                        onPlayAll = {
                            val list = sortedNewSongs()
                            if (list.isNotEmpty()) vm.playSong(list.first(), list)
                        },
                        onSort = { newSongsSort = it },
                        onManual = {
                            orderSongs = sortedNewSongs()
                            orderOpen = true
                        },
                    )
                    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        sortedNewSongs().take(10).forEach { song ->
                            SongRow(
                                song = song,
                                active = vm.playing && vm.selected?.key == song.key,
                                liked = vm.liked(song),
                                wide = wide,
                                onClick = { vm.playSong(song, sortedNewSongs()) },
                                onLike = { vm.like(song) },
                                onMore = { vm.addToPlaylist(song) },
                                onDownload = { vm.downloadSong(song) },
                            )
                        }
                    }
                }
            }
            if (!feed?.sections.isNullOrEmpty()) {
                feed!!.sections.forEach { section ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .onGloballyPositioned { onAnchorOffset(section.id, it.positionInParent().y) },
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (section.kind == "playlist") {
                            SectionTitle(
                                section.title,
                                section = section.id,
                                onMore = { vm.openFeedSection(section.id) },
                            )
                            if (section.items.isNotEmpty()) {
                                FeedPlaylistRow(section.items) { vm.openFeedPlaylist(it) }
                            } else {
                                Text(
                                    section.error ?: "平台暂无内容",
                                    color = MUTED,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(horizontal = 20.dp),
                                )
                            }
                        }
                    }
                }
            }
            if (!feed?.similar.isNullOrEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { onAnchorOffset("similar", it.positionInParent().y) },
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionTitle("相似推荐", section = "similar", onMore = { vm.openFeedSection("similar") })
                    FeedSongCardRow(feed!!.similar) { vm.playSong(it, feed.similar) }
                }
            }
        }
        if (orderOpen) {
            SongOrderDialog(
                songs = orderSongs,
                wide = wide,
                statusInset = vm.statusInset,
                bottomInset = vm.bottomInset,
                onCancel = { orderOpen = false },
                onDone = { keys ->
                    newSongsManual = keys
                    newSongsSort = "manual"
                    orderOpen = false
                },
            )
        }
    }
}

@Composable
private fun SectionTitle(
    title: String,
    note: String = "",
    section: String = "",
    onMore: () -> Unit = {},
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Medium, color = TEXT)
        Spacer(Modifier.weight(1f))
        if (section.isNotEmpty()) {
            MaterialIconButton("ic_more.svg", "$title，更多", diameter = 36.dp, systemSymbol = false, onClick = onMore)
        } else if (note.isNotEmpty()) {
            Text(note, fontSize = 11.sp, color = MUTED)
        }
    }
}

/** 华为音乐样式的头图：竖向长卡片并排（大融合榜单），角标只在单一来源时出现。 */
@Composable
private fun HomeBannerCard(
    item: FeedPlaylist,
    playing: Boolean,
    isActive: Boolean,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onPlay: () -> Unit,
) {
    Box(modifier.height(238.dp)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF17191C))
                .tapNoRipple(onOpen),
        ) {
            if (item.cover.isNotEmpty()) {
                RemoteImage(item.cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0x22000000), Color(0xCC05070A)),
                            startY = 120f,
                        )
                    ),
            )
            Row(
                modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        item.name,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF4F4F4),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        bannerNote(item),
                        fontSize = 11.sp,
                        color = Color(0xB3FFFFFF),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(Modifier.size(34.dp).tapNoRipple(onPlay), contentAlignment = Alignment.Center) {
                    AssetIcon(if (playing && isActive) "ic_pause.svg" else "ic_play.svg", size = 26.dp, tint = ACCENT)
                }
            }
        }
        val badge = sourceBadgeAsset(item.source)
        if (badge != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(12.dp).size(22.dp).clip(CircleShape)) {
                AssetIcon(badge, size = 22.dp)
            }
        }
    }
}

@Composable
private fun FeedPlaylistRow(items: List<FeedPlaylist>, onOpen: (FeedPlaylist) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().height(216.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        items(items, key = { "${it.source.orEmpty()}:${it.id}" }) { item ->
            Column(
                modifier = Modifier.width(148.dp).height(202.dp).tapNoRipple { onOpen(item) },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CoverCard(
                    cover = item.cover,
                    name = item.name,
                    source = item.source,
                    radius = 16,
                    badgeSize = 20,
                    countText = formatPlayCount(item.playCount),
                    fallbackText = 40f,
                    modifier = Modifier.width(148.dp),
                )
                Text(
                    item.name,
                    fontSize = 13.sp,
                    color = TEXT,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().height(36.dp),
                )
            }
        }
    }
}

@Composable
private fun FeedSongCardRow(items: List<Song>, onPlay: (Song) -> Unit) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().height(194.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        items(items, key = { "${it.source}:${it.id}" }) { song ->
            Column(
                modifier = Modifier.width(140.dp).height(190.dp).tapNoRipple { onPlay(song) },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CoverCard(
                    cover = song.coverUrl,
                    name = song.name,
                    source = song.source,
                    radius = 16,
                    badgeSize = 20,
                    fallbackText = 36f,
                    modifier = Modifier.width(140.dp),
                )
                Text(
                    song.name,
                    fontSize = 13.sp,
                    color = TEXT,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().height(18.dp),
                )
                Text(
                    song.singer,
                    fontSize = 10.sp,
                    color = MUTED,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().height(14.dp),
                )
            }
        }
    }
}

/** 歌单库里的本地歌单卡（横向行用）。 */
@Composable
fun LocalPlaylistCard(playlist: MusicPlaylist, onOpen: () -> Unit) {
    Column(
        modifier = Modifier.width(108.dp).height(132.dp).tapNoRipple(onOpen),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(Color(0xFF17191C))) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                AssetIcon(if (playlist.isFavorite) "ic_heart.svg" else "ic_queue.svg", size = 34.dp, tint = ACCENT)
            }
            val cover = playlist.songs.firstOrNull()?.coverUrl.orEmpty()
            if (cover.isNotEmpty()) {
                RemoteImage(cover, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
        }
        Text(
            playlist.name,
            fontSize = 12.sp,
            color = TEXT,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().height(16.dp),
        )
    }
}
