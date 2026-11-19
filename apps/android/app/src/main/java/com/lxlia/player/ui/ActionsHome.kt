package com.lxlia.player.ui

import androidx.lifecycle.viewModelScope
import com.lxlia.player.lx.CatalogueApi
import com.lxlia.player.lx.CatalogueEntity
import com.lxlia.player.lx.HomeFeedApi
import com.lxlia.player.lx.SearchApi
import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.FeedSection
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ---- 搜索页、首页融合板块：对应鸿蒙 Index.ets 的搜索与 openFeedSection 逻辑 ----

fun AppViewModel.search(more: Boolean = false) {
    if (more) return
    val query = keyword.trim()
    if (query.isEmpty()) return
    searchHistory = (listOf(query) + searchHistory.filter { it != query }).take(10)
    settings["lxlia_search_history"] = org.json.JSONArray(searchHistory)
    save()
    val token = ++searchToken
    searchOpen = true
    openedEntity = null
    loading = true
    error = ""
    results = emptyList()
    entities = emptyList()
    searchProgressAt = 0
    viewModelScope.launch {
        try {
            if (searchKind != "music") {
                val response = CatalogueApi.search(
                    host = host,
                    source = platform,
                    kind = searchKind,
                    query = query,
                    page = 1,
                    cancelled = { token != searchToken },
                    onProgress = progress@{ items, _ ->
                        if (token != searchToken) return@progress
                        val now = System.currentTimeMillis()
                        if (now - searchProgressAt < 600) return@progress
                        searchProgressAt = now
                        entities = items
                        submitted = query
                        message = "已获取 ${items.size} 条，正在自动获取其余结果…"
                    },
                )
                if (token != searchToken) return@launch
                entities = response.items
                submitted = query
                message = response.warning.orEmpty()
            } else {
                val result = SearchApi.searchAll(
                    source = platform,
                    keyword = query,
                    onProgress = progress@{ items, _ ->
                        if (token != searchToken) return@progress
                        val now = System.currentTimeMillis()
                        if (now - searchProgressAt < 600) return@progress
                        searchProgressAt = now
                        results = items
                        submitted = query
                        hydrateCoversFor(items.take(24))
                        message = "已获取 ${items.size} 条，正在自动获取其余结果…"
                    },
                    cancelled = { token != searchToken },
                )
                if (token != searchToken) return@launch
                results = result.items
                submitted = query
                hydrateCoversFor(result.items.take(40))
                message = result.warning ?: "共 ${result.items.size} 条结果"
                if (results.isEmpty()) message = "没有找到歌曲，试试其他关键词或平台"
            }
        } catch (exception: Exception) {
            if (token == searchToken) error = "搜索失败：${exception.message}"
        } finally {
            if (token == searchToken) loading = false
        }
    }
}

fun AppViewModel.suggestSearch(word: String) {
    keyword = word
    search()
}

fun AppViewModel.openEntity(entity: CatalogueEntity) {
    viewModelScope.launch {
        try {
            val song = entity.song
            if (song != null) {
                playSong(song, entities.mapNotNull { it.song })
                return@launch
            }
            if (entity.kind == "songlist") {
                val json = engine.importPlaylist(entity.id, entity.source)
                val lists = parsePlaylists(json)
                playlists = playlists.filter { existing -> lists.none { it.id == existing.id } } + lists
                persist()
                scheduleAutoPlaylistSync()
                hydrateLibraryPlaylistCovers()
                lists.firstOrNull()?.let { hydrateCoversFor(it.songs.take(36)) }
                message = "已导入「${entity.name}」"
                tab = "资料库"
                libraryRestoreOffset = 0
                openedPlaylist = lists.firstOrNull()
                return@launch
            }
            loading = true
            openedEntity = entity
            entitySongs = emptyList()
            val tracks = CatalogueApi.tracks(
                host = host,
                entity = entity,
                onProgress = { items, _ ->
                    if (openedEntity?.id != entity.id) return@tracks
                    entitySongs = items
                    hydrateCoversFor(items.take(24))
                    message = "已获取 ${items.size} 首，正在自动获取其余歌曲…"
                },
                cancelled = { openedEntity?.id != entity.id },
            )
            // 用户可能在加载中已经返回：不要再把旧结果塞回页面。
            if (openedEntity?.id != entity.id) return@launch
            entitySongs = tracks.items
            hydrateCoversFor(tracks.items.take(40))
            openedEntity = entity
            message = tracks.warning.orEmpty()
        } catch (exception: Exception) {
            error = exception.message ?: "打开失败"
        } finally {
            loading = false
        }
    }
}

// ---- 首页融合数据 ----

private fun AppViewModel.collectTasteSeed(seedOffset: Int = algoRefreshSeed): Pair<List<String>, Set<String>> {
    val artists = HomeFeedApi.extractTopTasteArtists(
        playlists = playlists,
        recentSongs = recentSongs,
        currentSong = selected,
        maxArtists = 3,
        seedOffset = seedOffset,
    )
    val known = buildSet {
        recentSongs.take(15).forEach { add(it.key) }
        playlists.firstOrNull { it.isFavorite || it.name == "我喜欢的" }?.songs?.take(20)?.forEach { add(it.key) }
    }
    return artists to known
}

/** 双击首页左上角 LxMine 标题：按开关决定是否同步重算猜你喜欢与每日推荐。 */
fun AppViewModel.onDoubleTapHomeHeader() {
    if (refreshAlgoOnDoubleTap) {
        algoRefreshSeed++
        pendingHomeFeed = null
        refreshHomeFeed(force = true, recalculateAlgo = true, immediateApply = true)
        notify("首页与算法推荐已刷新", 2000)
    } else {
        pendingHomeFeed = null
        refreshHomeFeed(force = true, recalculateAlgo = false, immediateApply = true)
        notify("首页信息已刷新", 2000)
    }
}

fun AppViewModel.refreshHomeFeed(
    force: Boolean = false,
    recalculateAlgo: Boolean = true,
    immediateApply: Boolean = false,
) {
    if (!hostReady || !storeReady) return
    if (homeFeedRefreshing && !force) return
    homeFeedRefreshing = true
    val token = ++homeFeedToken
    val seed = algoRefreshSeed
    val (tasteArtists, knownKeys) = if (recalculateAlgo) collectTasteSeed(seed) else (emptyList<String>() to emptySet())
    val previousFeed = homeFeed
    viewModelScope.launch {
        try {
            var feed = withContext(Dispatchers.IO) {
                HomeFeedApi.loadMergedHome(host, tasteArtists, knownKeys, algoSeed = if (recalculateAlgo) seed else 0)
            }
            if (!recalculateAlgo && previousFeed != null &&
                (previousFeed.similar.isNotEmpty() || previousFeed.dailySongs.isNotEmpty())
            ) {
                feed = feed.copy(
                    similar = previousFeed.similar,
                    daily = previousFeed.daily ?: feed.daily,
                    dailySongs = previousFeed.dailySongs.ifEmpty { feed.dailySongs },
                )
            }
            if (token != homeFeedToken) return@launch
            queueHomeFeed(feed, immediate = immediateApply)
        } catch (exception: Exception) {
            if (token == homeFeedToken) error = "首页读取失败：${exception.message}"
        } finally {
            if (token == homeFeedToken) homeFeedRefreshing = false
        }
    }
}

fun AppViewModel.refreshPersonalizationIfNeeded() {
    val current = homeFeed ?: return
    if (current.similar.isNotEmpty() || homeFeedRefreshing || !storeReady) return
    val (tasteArtists, knownKeys) = collectTasteSeed()
    if (tasteArtists.isEmpty()) return
    viewModelScope.launch {
        val personal = runCatching {
            HomeFeedApi.fetchPersonalizedSongs(tasteArtists, knownKeys, algoRefreshSeed)
        }.getOrDefault(emptyList())
        if (personal.isEmpty()) return@launch
        val latest = homeFeed ?: return@launch
        val dayNumber = (System.currentTimeMillis() / 86400000L) + algoRefreshSeed.toLong() * 1315423911L
        val blended = HomeFeedApi.blendPersonalizedDaily(latest.newSongs, personal, dayNumber, 30)
        val updatedDaily = FeedPlaylist(
            id = "daily-30",
            name = "每日三十首",
            cover = blended.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl
                ?: latest.daily?.cover.orEmpty(),
            count = blended.size,
            period = "personalized",
        )
        queueHomeFeed(
            latest.copy(
                similar = personal,
                daily = updatedDaily,
                dailySongs = blended,
            ),
        )
    }
}

fun AppViewModel.queueHomeFeed(feed: HomeFeed, immediate: Boolean = false) {
    // 没有旧内容（冷启动/双击刷新）时无滚动可保护，直接回填，避免多等一个延迟窗口。
    if (homeFeed == null || immediate) {
        pendingHomeFeed = null
        homeFeedApplyJob?.cancel()
        homeFeed = feed
        store.saveHomeCache("all", feed.toJson().toString())
        hydrateCoversFor(feed.similar + feed.dailySongs + feed.newSongs.take(30))
        return
    }
    // 缓存快照与网络结果通常完全一致；直接跳过整表替换，避免滚动中无意义重建。
    if (feed.signature() == homeFeed?.signature()) {
        pendingHomeFeed = null
        homeFeedApplyJob?.cancel()
        hydrateCoversFor(feed.similar + feed.dailySongs + feed.newSongs.take(30))
        return
    }
    pendingHomeFeed = feed
    schedulePendingHomeFeed()
}

private fun AppViewModel.schedulePendingHomeFeed() {
    homeFeedApplyJob?.cancel()
    homeFeedApplyJob = viewModelScope.launch {
        // 滚动结束后再换首页数据；不在滑动惯性中做 JSON 序列化/整树重建。
        while (true) {
            kotlinx.coroutines.delay(700)
            val feed = pendingHomeFeed ?: return@launch
            val scrolling = System.currentTimeMillis() - lastHomeScrollAt < 650
            val busyPage = tab != "发现" || searchOpen || feedSection.isNotEmpty() || openedPlaylist != null || showPlayer
            if (scrolling || busyPage) continue
            pendingHomeFeed = null
            homeFeed = feed
            store.saveHomeCache("all", feed.toJson().toString())
            hydrateCoversFor(feed.similar + feed.dailySongs + feed.newSongs.take(30))
            return@launch
        }
    }
}

/** 曲库右上角刷新：换一个持久化种子，立即重排，重启后保持新排列。 */
fun AppViewModel.refreshLibraryMosaic() {
    libraryMosaicSeed = (1..Int.MAX_VALUE - 1).random()
    settings["lxmine_mosaic_seed"] = libraryMosaicSeed
    save()
    notify("曲库排列已刷新", 1500)
}

// ---- 板块详情 / 歌单详情 ----

fun AppViewModel.feedSectionTitle(): String = when (feedSection) {
    "playlists" -> "推荐歌单"
    "newSongs" -> "每周新歌"
    "charts" -> "排行榜"
    "similar" -> "猜你喜欢"
    "recent" -> "最近常听"
    "library" -> "我的歌单"
    else -> homeFeed?.sections?.firstOrNull { it.id == feedSection }?.title ?: "更多"
}

fun AppViewModel.feedSectionSubtitle(): String {
    val count = when (feedSection) {
        "playlists" -> homeFeed?.playlists?.size ?: 0
        "newSongs" -> homeFeed?.newSongs?.size ?: 0
        "charts" -> homeFeed?.charts?.size ?: 0
        "similar" -> homeFeed?.similar?.size ?: 0
        "recent" -> (if (selected != null) 1 else 0) + playlists.size
        "library" -> playlists.size
        else -> 0
    }
    return if (count > 0) "全部 $count 项" else ""
}

fun AppViewModel.feedSectionPlaylists(): List<FeedPlaylist> = when (feedSection) {
    "charts" -> homeFeed?.charts.orEmpty()
    "playlists" -> homeFeed?.playlists.orEmpty()
    else -> homeFeed?.sections?.firstOrNull { it.id == feedSection }?.items.orEmpty()
}

fun AppViewModel.feedSectionSongs(): List<Song> = when (feedSection) {
    "newSongs" -> homeFeed?.newSongs.orEmpty()
    "similar" -> homeFeed?.similar.orEmpty()
    "recent" -> selected?.let { listOf(it) }.orEmpty()
    else -> emptyList()
}

fun AppViewModel.feedSectionLocal(): List<com.lxlia.player.model.MusicPlaylist> =
    if (feedSection == "recent" || feedSection == "library") playlists else emptyList()

/** 顶部板块胶囊：点击后滚动到对应板块由界面层执行，这里只维护高亮。 */
fun AppViewModel.openFeedSection(section: String) {
    feedClosing = false
    feedScrollOffset = 0
    val token = ++feedSectionToken
    feedSection = section
    feedReveal = 0f
    searchOpen = false
    openedEntity = null
    openedPlaylist = null
    downloadsOpen = false
    val spec = homeFeed?.sections?.firstOrNull { it.id == section }
    val request = spec?.request
    if (request != null) {
        feedSectionLoading = true
        val platformAtStart = homePlatform
        viewModelScope.launch {
            try {
                val items = HomeFeedApi.loadPlatformSection(
                    host,
                    request,
                    cancelled = { feedSection != section || homePlatform != platformAtStart || token != feedSectionToken },
                )
                val feed = homeFeed
                if (feed == null || feedSection != section || homePlatform != platformAtStart || token != feedSectionToken) return@launch
                val sections = feed.sections.map { entry ->
                    if (entry.id == section) entry.copy(items = items) else entry
                }
                homeFeed = feed.copy(
                    sections = sections,
                    playlists = if (section == "playlists") items else feed.playlists,
                    charts = if (section == "charts") items else feed.charts,
                )
                feedSectionLoading = false
            } catch (exception: Exception) {
                if (feedSection == section && token == feedSectionToken) {
                    message = exception.message.orEmpty()
                    feedSectionLoading = false
                }
            }
        }
    }
    if (section == "similar" && homeFeed?.similar.isNullOrEmpty()) {
        val seed = selected
        if (seed != null) {
            feedSectionLoading = true
            viewModelScope.launch {
                try {
                    val result = SearchApi.searchAll(
                        source = com.lxlia.player.lx.SearchSource.of(homePlatform),
                        keyword = seed.singer.ifEmpty { seed.name },
                        cancelled = { feedSection != "similar" || token != feedSectionToken },
                    )
                    if (feedSection != "similar" || token != feedSectionToken) return@launch
                    val feed = homeFeed ?: return@launch
                    homeFeed = feed.copy(similar = result.items.filter { it.key != seed.key })
                    if (!result.warning.isNullOrEmpty()) message = result.warning!!
                    feedSectionLoading = false
                } catch (exception: Exception) {
                    if (token == feedSectionToken) {
                        error = exception.message.orEmpty()
                        feedSectionLoading = false
                    }
                }
            }
        }
    }
}

fun AppViewModel.closeFeedSection() {
    feedClosing = true
    feedSectionToken++
    val closingSection = feedSection
    viewModelScope.launch {
        kotlinx.coroutines.delay(420)
        // 关闭窗口期间又点了别的板块：不能把新板块一起关掉。
        if (feedSection != closingSection) return@launch
        // 分类详情是临时板块：离开后从首页 sections 移除，首页底部不会多出板块。
        if (feedSection.startsWith("category-")) {
            homeFeed = homeFeed?.let { feed ->
                feed.copy(sections = feed.sections.filter { it.id != feedSection })
            }
        }
        feedSection = ""
        feedClosing = false
    }
}

fun AppViewModel.openFeedPlaylist(item: FeedPlaylist, autoplay: Boolean = false) {
    resetListTools()
    val returnTab = tab
    val returnFeed = feedSection
    if (item.id == "daily-30") {
        val songs = homeFeed?.dailySongs.orEmpty().ifEmpty { homeFeed?.newSongs.orEmpty().take(30) }
        if (songs.isEmpty()) {
            error = "每日推荐还没有内容"
            return
        }
        openedFeedLoading = false
        openedFeedSourceId = "daily-30"
        playlistReturnTab = returnTab
        playlistReturnFeed = returnFeed
        openedPlaylist = com.lxlia.player.model.MusicPlaylist(
            id = "daily-30",
            name = "每日三十首",
            kind = "lx",
            songs = songs,
            songIds = songs.map { it.key },
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
        )
        libraryRestoreOffset = 0
        feedSection = ""
        tab = "资料库"
        discoveryCompact = false
        if (autoplay) playSong(songs.first(), songs)
        return
    }
    val request = item.request
    if (request != null && item.source == null) {
        // 分类入口：注入对应板块，复用 feedSection 的加载与返回。
        val sectionId = "category-${item.id}"
        val feed = homeFeed
        if (feed != null && feed.sections.none { it.id == sectionId }) {
            homeFeed = feed.copy(
                sections = feed.sections + FeedSection(sectionId, item.name, "playlist", emptyList(), request = request),
            )
        }
        openFeedSection(sectionId)
        return
    }
    // 先跳转出歌单壳（立即响应），歌曲在后台装载；失败退回来源页并报错。
    val shell = com.lxlia.player.model.MusicPlaylist(
        id = "feed-${item.id}",
        name = item.name,
        kind = "lx",
        songs = emptyList(),
        createdAt = System.currentTimeMillis(),
        updatedAt = System.currentTimeMillis(),
    )
    openedFeedSourceId = item.id
    playlistReturnTab = returnTab
    playlistReturnFeed = returnFeed
    openedPlaylist = shell
    openedFeedLoading = true
    libraryRestoreOffset = 0
    feedSection = ""
    tab = "资料库"
    discoveryCompact = false
    viewModelScope.launch {
        try {
            var songs: List<Song> = emptyList()
            when {
                item.parts.isNotEmpty() -> songs = HomeFeedApi.loadMergedChartSongs(host, item)
                item.source != null -> {
                    val result = HomeFeedApi.platformFeedSongs(host, item)
                    if (!result.warning.isNullOrEmpty()) message = result.warning!!
                    songs = result.items
                }
                else -> songs = HomeFeedApi.loadFeedPlaylistSongs(item.id) { count ->
                    message = "$count 首歌曲的平台资料暂不可获取，已显示其余全部歌曲"
                }
            }
            if (songs.isEmpty()) {
                error = "歌单暂时没有可播放歌曲"
                openedPlaylist = null
                openedFeedSourceId = ""
                openedFeedLoading = false
                tab = returnTab
                feedSection = returnFeed
                return@launch
            }
            val next = shell.copy(songs = songs, songIds = songs.map { it.key }, updatedAt = System.currentTimeMillis())
            openedPlaylist = next
            openedFeedLoading = false
            hydrateCoversFor(songs.take(40))
            if (autoplay) playSong(songs.first(), songs)
            // 卡片上的数量与实际歌曲数对齐（跨平台去重/截断后可能少于标称之和）。
            homeFeed = homeFeed?.let { feed ->
                fun patch(list: List<FeedPlaylist>): List<FeedPlaylist> = list.map { entry ->
                    if (entry.id != item.id) entry else entry.copy(count = songs.size)
                }
                val sections = feed.sections.map { section -> section.copy(items = patch(section.items)) }
                feed.copy(
                    sections = sections,
                    playlists = sections.firstOrNull { it.id == "playlists" }?.items ?: feed.playlists,
                    charts = patch(feed.charts),
                )
            }
        } catch (exception: Exception) {
            error = "歌单加载失败：${exception.message}"
            openedPlaylist = null
            openedFeedSourceId = ""
            openedFeedLoading = false
            tab = returnTab
            feedSection = returnFeed
        }
    }
}

/** 横幅播放键：不进列表页——静默取歌后直接从第一首开播；已在播则暂停/恢复切换。 */
fun AppViewModel.playFeedFromHome(item: FeedPlaylist) {
    if (openedFeedSourceId == item.id && selected != null) {
        togglePlayback()
        return
    }
    viewModelScope.launch {
        val songs = try {
            when {
                item.id == "daily-30" -> homeFeed?.dailySongs.orEmpty().ifEmpty { homeFeed?.newSongs.orEmpty().take(30) }
                item.parts.isNotEmpty() -> HomeFeedApi.loadMergedChartSongs(host, item)
                item.source != null -> HomeFeedApi.platformFeedSongs(host, item).items
                else -> HomeFeedApi.loadFeedPlaylistSongs(item.id)
            }
        } catch (exception: Exception) {
            error = "播放失败：${exception.message}"
            return@launch
        }
        if (songs.isEmpty()) {
            error = "歌单暂时没有可播放歌曲"
            return@launch
        }
        openedFeedSourceId = item.id
        playSong(songs.first(), songs)
    }
}
