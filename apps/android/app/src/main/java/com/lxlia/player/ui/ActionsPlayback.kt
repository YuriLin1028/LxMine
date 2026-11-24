package com.lxlia.player.ui

import androidx.lifecycle.viewModelScope
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.lx.EMPTY_COVER_COLORS
import com.lxlia.player.lx.LyricParser
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

// ---- 播放、歌词、收藏：对应鸿蒙 Index.ets 中的同名动作 ----

fun AppViewModel.playSong(
    song: Song,
    list: List<Song>,
    startMs: Long = 0,
    autoPlay: Boolean = true,
    fromSearch: Boolean = false,
    playAllSearch: Boolean = false,
    preserveQueue: Boolean = false,
) {
    pendingPlayback = null
    var playList = list.ifEmpty { listOf(song) }
    var resolvedFromSearch = fromSearch
    if ((fromSearch && !playAllSearch) || preserveQueue) {
        val mappedId = if (fromSearch) searchAddedPlaylistMap[song.key] else null
        var switchedToTarget = false
        if (mappedId != null) {
            val targetList = playlists.firstOrNull { it.id == mappedId }
            if (targetList != null && targetList.songs.any { it.key == song.key }) {
                playList = targetList.songs
                resolvedFromSearch = false
                switchedToTarget = true
            }
        }
        if (!switchedToTarget) {
            if (queue.isNotEmpty()) {
                val existingIdx = queue.indexOfFirst { it.key == song.key }
                playList = if (existingIdx >= 0) {
                    queue.toList()
                } else {
                    val curKey = selected?.key
                    val curIdx = if (curKey != null) queue.indexOfFirst { it.key == curKey } else -1
                    val insertAt = if (curIdx >= 0) (curIdx + 1).coerceAtMost(queue.size) else 0
                    queue.toMutableList().apply { add(insertAt, song) }
                }
            } else {
                playList = listOf(song)
            }
        }
    }
    playingFromSearch = resolvedFromSearch
    val index = playList.indexOfFirst { it.key == song.key }.coerceAtLeast(0)
    val local = localMusic.pathFor(song).ifEmpty { downloads.offline(song) }
    // 仅在尚未导入任何音源时跳转设置；已有导入音源时直接全源并发竞速，不因单一激活源失败而阻断播放。
    if (local.isEmpty() && sources.isEmpty()) {
        tab = "设置"
        return
    }
    selected = song
    coverColors = EMPTY_COVER_COLORS
    autoMixPreloadToken++
    autoMixPreloadInFlight = false
    autoMixPreloadAttempts = 0
    autoMixPreloadKey = ""
    autoMixTriggeredKey = ""
    currentAutoMixPlan = null
    queue = playList
    positionMs = startMs.coerceAtLeast(0)
    livePositionMs = positionMs
    duration = song.durationMs
    resetLyricsForSong(song.key)
    resolving = true
    error = ""
    playbackUrl = ""
    updateSmartStage(false)
    loadCoverColors(song)
    loadLyricsFor(song)
    refreshAutoMixPlan()
    PlaybackController.playFromList(playList, index, startMs, autoPlay)
}

fun AppViewModel.togglePlayback() {
    if (resolving) return
    if (playing) {
        PlaybackController.pause()
    } else if (PlaybackController.current == null || !PlaybackController.resume()) {
        val song = selected
        if (song == null) {
            tab = "发现"
            openSearch()
            return
        }
        val rawPos = maxOf(livePositionMs, positionMs, pendingPlayback?.positionMs ?: 0L)
        val dur = maxOf(duration, song.durationMs)
        val resumePos = if (dur > 5000L && rawPos >= dur - 2500L) 0L else rawPos
        playSong(song, queue.ifEmpty { listOf(song) }, resumePos, true, playingFromSearch)
        return
    }
    duration = PlaybackController.durationMs
    syncPlaybackState()
}

fun AppViewModel.advance(step: Int) {
    PlaybackController.advance(step)
}

fun AppViewModel.removeFromQueue(song: Song) {
    val next = PlaybackController.removeFromQueue(song.key)
    queue = next
    if (next.isEmpty()) {
        selected = null
        playing = false
        positionMs = 0L
        livePositionMs = 0L
        duration = 0L
    }
    autoMixPreloadKey = ""
    autoMixPreloadRetryAt = 0L
    autoMixTriggeredKey = ""
    refreshAutoMixPlan()
    savePlayback(true)
    notify("已从播放队列移除「${song.name}」", 1600)
}

fun AppViewModel.applyQueueOrder(keys: List<String>) {
    queueOrderOpen = false
    val next = PlaybackController.reorderQueue(keys)
    queue = next
    autoMixPreloadKey = ""
    autoMixPreloadRetryAt = 0L
    autoMixTriggeredKey = ""
    refreshAutoMixPlan()
    savePlayback(true)
    notify("已更新播放队列顺序", 1600)
    maybeReturnToParentSheet()
}

fun AppViewModel.seek(timeMs: Long) {
    val target = timeMs.coerceAtLeast(0L)
    positionMs = target
    livePositionMs = target
    lastPositionUiAt = System.currentTimeMillis()
    autoMixTriggeredKey = ""
    autoMixPreloadRetryAt = 0L
    PlaybackController.seek(target)
}

fun AppViewModel.setPlayMode(value: String) {
    mode = value
    PlaybackController.setMode(value)
    refreshAutoMixPlan()
    save()
}

fun AppViewModel.setQuality(value: String) {
    val changed = quality != value
    quality = value
    engine.setQuality(value)
    save()
    val cur = selected
    if (changed && cur != null && cur.source != "local") {
        playSong(cur, queue.ifEmpty { listOf(cur) }, startMs = positionMs, autoPlay = playing)
    }
}

fun AppViewModel.cycleField(field: String) {
    when (field) {
        "style" -> {
            val modes = com.lxlia.player.model.MINE_RADIO_MODES
            val index = modes.indexOfFirst { it.id == styleName }
            styleName = modes[(index + 1) % modes.size].id
        }
        "mode" -> {
            val values = PlaybackController.modeValues
            setPlayMode(values[(values.indexOf(mode).coerceAtLeast(0) + 1) % values.size])
        }
        "quality" -> {
            val values = listOf("128k", "320k", "flac")
            setQuality(values[(values.indexOf(quality).coerceAtLeast(0) + 1) % values.size])
        }
    }
    save()
}

fun AppViewModel.liked(song: Song): Boolean = song.key in likedKeys

private fun AppViewModel.switchSearchQueueToPlaylist(song: Song, target: MusicPlaylist): Boolean {
    if (searchOpen) searchAddedPlaylistMap[song.key] = target.id
    if (playingFromSearch && selected?.key == song.key && target.songs.isNotEmpty()) {
        queue = target.songs
        PlaybackController.replaceQueueKeepPlaying(target.songs)
        playingFromSearch = false
        refreshAutoMixPlan()
        savePlayback(true)
        return true
    }
    return false
}

fun AppViewModel.like(song: Song) {
    val existingFav = playlists.firstOrNull { it.isFavorite || it.name == "我喜欢的" || it.name == "我的收藏" }
    val favorite = (existingFav ?: createPlaylist("我的收藏", true)).copy(
        isFavorite = true,
        name = existingFav?.name?.takeIf { it.isNotEmpty() && it != "我喜欢的" } ?: "我的收藏",
    )
    val baseLists = if (existingFav == null) playlists + favorite else playlists
    val wasLiked = song.key in likedKeys
    val next = playlistWithSong(favorite, song, wasLiked)
    playlists = baseLists.map { if (it.id == next.id) next else it }
    if (openedPlaylist?.id == next.id) openedPlaylist = next
    if (!wasLiked && switchSearchQueueToPlaylist(song, next)) {
        notify("已收藏，后续播放已切换为「我的收藏」", 2200)
    }
    save()
    scheduleAutoPlaylistSync()
    refreshPersonalizationIfNeeded()
}

fun AppViewModel.collectSongsBatch(songs: List<Song>) {
    if (songs.isEmpty()) return
    val existingFav = playlists.firstOrNull { it.isFavorite || it.name == "我喜欢的" || it.name == "我的收藏" }
    val favorite = (existingFav ?: createPlaylist("我的收藏", true)).copy(
        isFavorite = true,
        name = existingFav?.name?.takeIf { it.isNotEmpty() && it != "我喜欢的" } ?: "我的收藏",
    )
    val baseLists = if (existingFav == null) listOf(favorite) + playlists else playlists
    val existingKeys = favorite.songs.mapTo(HashSet()) { it.key }
    val toAdd = mutableListOf<Song>()
    for (song in songs) {
        if (existingKeys.add(song.key)) toAdd.add(song)
    }
    if (toAdd.isEmpty()) {
        notify("所选歌曲均已收藏", 1800)
        return
    }
    val nextSongs = toAdd + favorite.songs
    val next = favorite.copy(
        songs = nextSongs,
        songIds = nextSongs.map { it.key },
        updatedAt = System.currentTimeMillis(),
    )
    playlists = baseLists.map { if (it.id == next.id) next else it }
    if (openedPlaylist?.id == next.id) openedPlaylist = next
    save()
    scheduleAutoPlaylistSync()
    refreshPersonalizationIfNeeded()
    notify("已批量收藏 ${toAdd.size} 首歌曲", 2000)
}

/** 与鸿蒙相同，居中对话框列出全部 LX 歌单，包含「我喜欢的」。 */
fun AppViewModel.addToPlaylist(song: Song) {
    val candidates = playlists.filter { it.kind == "lx" }
    addToPlaylistSong = song
    addToPlaylistChoices = candidates
    sheet = "添加到歌单"
    showSheet = true
}

fun AppViewModel.commitAddToPlaylist(playlistId: String) {
    val song = addToPlaylistSong
    val list = playlists.firstOrNull { it.id == playlistId }
    if (song == null || list == null) {
        showSheet = false
        addToPlaylistSong = null
        return
    }
    val next = playlistWithSong(list, song)
    playlists = playlists.map { if (it.id == next.id) next else it }
    if (openedPlaylist?.id == next.id) openedPlaylist = next
    val switched = switchSearchQueueToPlaylist(song, next)
    save()
    scheduleAutoPlaylistSync()
    message = if (switched) "已添加到「${list.name}」，后续播放已切换为该歌单" else "已添加到「${list.name}」"
    if (switched) notify(message, 2200)
    showSheet = false
    addToPlaylistSong = null
}

fun AppViewModel.downloadSong(song: Song) {
    if (!engine.ready) {
        error = "先启用音源再下载"
        notify(error)
        tab = "设置"
        return
    }
    if (downloads.offline(song).isNotEmpty()) {
        notify("「${song.name}」已下载完成", 2000)
        return
    }
    notify("正在获取「${song.name}」的下载地址…", 2000)
    viewModelScope.launch {
        try {
            val info = engine.songInfo(engine.resolveIdentity(song))
            val url = engine.resolveUrl(song)
            downloads.start(song, info.type, url)
            message = "开始下载「${song.name}」"
            notify(message)
        } catch (exception: Exception) {
            error = "下载失败：${exception.message}"
            notify(error, 3000)
        }
    }
}

/** 批量下载选歌弹窗：让用户自主勾选要下载的曲目后再拉起目录选择器（#1）。 */
fun AppViewModel.openBatchDownloadPicker(songs: List<Song>, title: String = "选择要下载的歌曲") {
    val onlineSongs = songs
        .filter { it.source != "local" && localMusic.pathFor(it).isEmpty() }
        .distinctBy { it.key }
    if (onlineSongs.isEmpty()) {
        notify("当前列表没有可下载的在线歌曲", 2000)
        return
    }
    val needsNetwork = onlineSongs.any { downloads.offline(it).isEmpty() }
    if (needsNetwork && !engine.ready) {
        error = "先启用音源再批量下载"
        notify(error)
        tab = "设置"
        return
    }
    batchDownloadPickerTitle = title
    batchDownloadPickerSongs = onlineSongs
}

/** 批量下载：拉起系统目录选择器（SAF OpenDocumentTree），把所有歌曲（含已私有缓存曲目）真正写入可见目录。 */
fun AppViewModel.downloadBatch(songs: List<Song>) {
    val onlineSongs = songs
        .filter { it.source != "local" && localMusic.pathFor(it).isEmpty() }
        .distinctBy { it.key }
    if (onlineSongs.isEmpty()) {
        notify("当前列表没有可下载的在线歌曲", 2000)
        return
    }
    val needsNetwork = onlineSongs.any { downloads.offline(it).isEmpty() }
    if (needsNetwork && !engine.ready) {
        error = "先启用音源再批量下载"
        notify(error)
        tab = "设置"
        return
    }
    pendingBatchDownloadSongs = onlineSongs
    batchFolderPickRequest = System.nanoTime()
}

fun AppViewModel.executeBatchDownloadToTree(treeUri: android.net.Uri) {
    val songs = pendingBatchDownloadSongs
    pendingBatchDownloadSongs = emptyList()
    if (songs.isEmpty()) return
    runCatching {
        app.contentResolver.takePersistableUriPermission(
            treeUri,
            android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
        )
    }
    message = "开始批量下载 ${songs.size} 首歌曲到所选目录…"
    notify(message, 2500)
    batchDownloadJob?.cancel()
    batchDownloadJob = viewModelScope.launch {
        var exported = 0
        var started = 0
        var failed = 0
        songs.forEachIndexed { index, song ->
            try {
                if (downloads.offline(song).isNotEmpty()) {
                    if (downloads.exportOfflineToTree(song, treeUri)) exported++
                } else if (!downloads.isDownloadedOrActive(song)) {
                    val info = engine.songInfo(engine.resolveIdentity(song))
                    val url = engine.resolveUrl(song)
                    downloads.start(song, info.type, url, targetTreeUri = treeUri)
                    started++
                }
                message = "批量下载进度：${index + 1}/${songs.size} · ${song.name}"
                if ((index + 1) % 5 == 0 || index == 0) {
                    notify("批量下载进度：${index + 1}/${songs.size}（${song.name}）", 1800)
                }
            } catch (_: Exception) {
                failed++
            }
            delay(180)
        }
        val summary = buildString {
            append("批量处理完成：")
            if (started > 0) append("开始下载 $started 首")
            if (exported > 0) {
                if (started > 0) append("，")
                append("导出已缓存 $exported 首")
            }
            if (started == 0 && exported == 0 && failed == 0) append("全部歌曲正在下载中")
            if (failed > 0) append("，失败 $failed 首")
        }
        message = summary
        notify(summary, 3500)
    }
}

fun AppViewModel.cancelDownload(id: String) {
    downloads.cancel(id)
}

fun AppViewModel.requestDownloadExport(id: String) {
    pendingDownloadExportId = id
    downloadExportRequest = System.nanoTime()
}

fun AppViewModel.requestBatchDownloadExport(ids: List<String>) {
    val valid = ids.filter { id -> downloadItems.any { it.id == id && it.state == "complete" } }
    if (valid.isEmpty()) return
    if (valid.size == 1) {
        requestDownloadExport(valid[0])
        return
    }
    pendingBatchExportDownloadIds = valid
    batchExportFolderPickRequest = System.nanoTime()
}

fun AppViewModel.exportDownloadsBatchToTree(treeUri: android.net.Uri) {
    val ids = pendingBatchExportDownloadIds
    pendingBatchExportDownloadIds = emptyList()
    if (ids.isEmpty()) return
    viewModelScope.launch {
        runCatching {
            app.contentResolver.takePersistableUriPermission(
                treeUri,
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        }
        var okCount = 0
        for (id in ids) {
            try {
                downloads.exportToTree(id, treeUri)
                okCount += 1
            } catch (_: Exception) {}
        }
        notify(if (okCount > 0) "已批量另存 $okCount 首歌曲到所选目录" else "批量另存失败")
    }
}

fun AppViewModel.exportDownload(uri: android.net.Uri) {
    val id = pendingDownloadExportId ?: return
    pendingDownloadExportId = null
    viewModelScope.launch {
        try {
            downloads.exportTo(id, uri)
            runCatching { app.contentResolver.takePersistableUriPermission(uri,
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            notify("已保存到系统所选位置")
        } catch (exception: Exception) {
            error = "保存失败：${exception.message}"
            notify(error)
        }
    }
}

/** 将补齐的封面同步写回当前选中曲目、播放队列、搜索结果、最近播放、首页与曲库歌单。 */
fun AppViewModel.applyHydratedCovers(covers: Map<String, String>) {
    if (covers.isEmpty()) return
    fun patchSongs(list: List<Song>): Pair<List<Song>, Boolean> {
        var changed = false
        val next = list.map { item ->
            val url = covers[item.key]
            if (!url.isNullOrEmpty() && item.coverUrl.isEmpty()) {
                changed = true
                item.copy(coverUrl = url)
            } else item
        }
        return next to changed
    }

    selected?.let { cur ->
        val url = covers[cur.key]
        if (!url.isNullOrEmpty() && cur.coverUrl.isEmpty()) {
            selected = cur.copy(coverUrl = url)
        }
    }
    PlaybackController.applyCoverMap(covers)
    downloads.updateCovers(covers)

    val (nextQueue, queueChanged) = patchSongs(queue)
    if (queueChanged) queue = nextQueue

    val (nextResults, resultsChanged) = patchSongs(results)
    if (resultsChanged) results = nextResults

    val (nextEntitySongs, entityChanged) = patchSongs(entitySongs)
    if (entityChanged) entitySongs = nextEntitySongs

    val (nextRecent, recentChanged) = patchSongs(recentSongs)
    if (recentChanged) {
        recentSongs = nextRecent
        store.saveRecentSongs(Song.listToJson(nextRecent))
        if (openedPlaylist?.kind == "recent") {
            openedPlaylist = openedPlaylist?.copy(songs = nextRecent)
        }
    }

    homeFeed?.let { feed ->
        val (nextForYou, fyChanged) = patchSongs(feed.forYou)
        val (nextSimilar, simChanged) = patchSongs(feed.similar)
        val (nextDaily, dailyChanged) = patchSongs(feed.dailySongs)
        val (nextNew, newChanged) = patchSongs(feed.newSongs)
        val dailyCover = feed.daily?.cover.orEmpty().ifEmpty {
            nextDaily.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty()
        }
        val dailyObjChanged = feed.daily != null && dailyCover.isNotEmpty() && dailyCover != feed.daily.cover
        if (fyChanged || simChanged || dailyChanged || newChanged || dailyObjChanged) {
            val updatedFeed = feed.copy(
                forYou = if (fyChanged) nextForYou else feed.forYou,
                similar = if (simChanged) nextSimilar else feed.similar,
                dailySongs = if (dailyChanged) nextDaily else feed.dailySongs,
                newSongs = if (newChanged) nextNew else feed.newSongs,
                daily = if (dailyObjChanged) feed.daily?.copy(cover = dailyCover) else feed.daily,
            )
            homeFeed = updatedFeed
            store.saveHomeCache("all", updatedFeed.toJson().toString())
        }
    }

    openedPlaylist?.let { opened ->
        val (nextOpenedSongs, openedChanged) = patchSongs(opened.songs)
        if (openedChanged) {
            openedPlaylist = opened.copy(songs = nextOpenedSongs)
        }
    }

    var playlistsMutated = false
    val nextPlaylists = playlists.map { pl ->
        val (patched, plChanged) = patchSongs(pl.songs)
        if (plChanged) {
            playlistsMutated = true
            pl.copy(songs = patched)
        } else pl
    }
    if (playlistsMutated) {
        playlists = nextPlaylists
        save()
    }
}

/** 异步批量补齐列表中缺失的歌曲封面（自带 30s 请求去重）。 */
fun AppViewModel.hydrateCoversFor(songs: List<Song>) {
    val now = System.currentTimeMillis()
    val candidates = songs
        .filter { it.coverUrl.isEmpty() && it.source != "local" && it.id.isNotEmpty() }
        .distinctBy { it.key }
        .filter { song ->
            val prev = coverAttemptAt[song.key] ?: 0L
            if (now - prev < 30_000L) false else {
                coverAttemptAt[song.key] = now
                true
            }
        }
    if (candidates.isEmpty()) return
    viewModelScope.launch {
        val covers = runCatching { engine.fetchSongCovers(candidates) }.getOrDefault(emptyMap())
        if (covers.isNotEmpty()) {
            applyHydratedCovers(covers)
        }
    }
}

/** 检查曲库中暂无任何封面的歌单，主动补齐前几首歌曲封面并持久化，杜绝无封面歌单卡。 */
fun AppViewModel.hydrateLibraryPlaylistCovers() {
    val seeds = mutableListOf<Song>()
    for (pl in playlists) {
        if (pl.kind == "lx" && pl.songs.isNotEmpty() && pl.songs.none { it.coverUrl.isNotEmpty() }) {
            seeds.addAll(pl.songs.take(3))
        }
    }
    if (recentSongs.isNotEmpty() && recentSongs.first().coverUrl.isEmpty()) {
        seeds.addAll(recentSongs.take(3))
    }
    if (seeds.isNotEmpty()) {
        hydrateCoversFor(seeds)
    }
}

fun AppViewModel.openSwitchPlatformFromQueue(queueIndex: Int, song: Song) {
    if (song.source == "local") return
    openSubSheetFromSheet("播放队列") {
        switchPlatformTarget = SwitchPlatformTarget(
            song = song,
            fromQueue = true,
            queueIndex = queueIndex,
        )
    }
}

/** 从播控栏「更多」独立触发切换当前歌曲平台（#12）。 */
fun AppViewModel.openSwitchPlatformFromPlayer(song: Song) {
    if (song.source == "local") {
        notify("本地音频无需切换平台", 1600)
        return
    }
    val qIdx = queue.indexOfFirst { it.key == song.key }
    closeSheet()
    switchPlatformTarget = SwitchPlatformTarget(
        song = song,
        fromQueue = true,
        queueIndex = qIdx,
    )
}

/** 当前曲目就绪后在后台静默预解析下一首的音源 URL，切歌秒开（#9）。 */
fun AppViewModel.preResolveNextTrack() {
    val next = peekNextQueueSong() ?: return
    if (next.source == "local" || localMusic.pathFor(next).isNotEmpty() || downloads.offline(next).isNotEmpty()) return
    if (!engine.ready) return
    preResolveJob?.cancel()
    preResolveJob = viewModelScope.launch {
        delay(1200)
        runCatching { engine.preResolveUrl(next) }
    }
}

fun AppViewModel.openSwitchPlatformFromPlaylist(playlist: MusicPlaylist, song: Song) {
    if (song.source == "local") return
    switchPlatformTarget = SwitchPlatformTarget(
        song = song,
        fromQueue = false,
        playlistId = playlist.id,
        playlistKind = playlist.kind,
    )
}

fun AppViewModel.confirmSwitchPlatform(candidate: Song) {
    val target = switchPlatformTarget ?: return
    switchPlatformTarget = null
    val oldSong = target.song
    if (candidate.key == oldSong.key && candidate.coverUrl == oldSong.coverUrl) {
        notify("已是当前所选平台版本", 1500)
        maybeReturnToParentSheet()
        return
    }
    val mergedCandidate = if (candidate.coverUrl.isEmpty() && oldSong.coverUrl.isNotEmpty()) {
        candidate.copy(coverUrl = oldSong.coverUrl)
    } else candidate

    if (target.fromQueue) {
        val nextQueue = queue.toMutableList()
        val idx = if (target.queueIndex in nextQueue.indices && nextQueue[target.queueIndex].key == oldSong.key) {
            target.queueIndex
        } else {
            nextQueue.indexOfFirst { it.key == oldSong.key }
        }
        if (idx in nextQueue.indices) {
            nextQueue[idx] = mergedCandidate
            queue = nextQueue
            PlaybackController.replaceQueueSong(idx, oldSong.key, mergedCandidate)
        }
        if (selected?.key == oldSong.key) {
            playSong(mergedCandidate, queue, startMs = 0, autoPlay = true)
        } else {
            savePlayback(true)
        }
        if (mergedCandidate.coverUrl.isEmpty()) hydrateCoversFor(listOf(mergedCandidate))
        notify("已切换为${platformName(mergedCandidate.source)}版本", 1800)
        maybeReturnToParentSheet()
        return
    }

    // 来自曲库歌单（自建/导入歌单、我喜欢的、最近播放）
    if (target.playlistKind == "recent") {
        val nextRecent = recentSongs.map { if (it.key == oldSong.key) mergedCandidate else it }.distinctBy { it.key }
        recentSongs = nextRecent
        store.saveRecentSongs(Song.listToJson(nextRecent))
        if (openedPlaylist?.kind == "recent") {
            openedPlaylist = openedPlaylist?.copy(
                songs = nextRecent,
                songIds = nextRecent.map { it.key },
                updatedAt = System.currentTimeMillis(),
            )
        }
    } else {
        val currentList = playlists.firstOrNull { it.id == target.playlistId }
        if (currentList != null) {
            val replaced = mutableListOf<Song>()
            val seen = mutableSetOf<String>()
            for (item in currentList.songs) {
                val nextItem = if (item.key == oldSong.key) mergedCandidate else item
                if (seen.add(nextItem.key)) replaced.add(nextItem)
            }
            val updatedList = currentList.copy(
                songs = replaced,
                songIds = replaced.map { it.key },
                updatedAt = System.currentTimeMillis(),
            )
            playlists = playlists.map { if (it.id == updatedList.id) updatedList else it }
            if (openedPlaylist?.id == updatedList.id) openedPlaylist = updatedList
            save()
            scheduleAutoPlaylistSync()
        }
    }

    // 若该曲同时存在于播放队列或正在播放，一并同步更新
    val queueIdx = queue.indexOfFirst { it.key == oldSong.key }
    if (queueIdx >= 0) {
        val nextQueue = queue.toMutableList()
        nextQueue[queueIdx] = mergedCandidate
        queue = nextQueue
        PlaybackController.replaceQueueSong(queueIdx, oldSong.key, mergedCandidate)
    }
    if (selected?.key == oldSong.key) {
        playSong(mergedCandidate, queue.ifEmpty { listOf(mergedCandidate) }, startMs = 0, autoPlay = true)
    } else if (queueIdx >= 0) {
        savePlayback(true)
    }
    if (mergedCandidate.coverUrl.isEmpty()) hydrateCoversFor(listOf(mergedCandidate))
    notify("已切换为${platformName(mergedCandidate.source)}版本", 1800)
}

fun AppViewModel.loadCoverColors(song: Song) {
    viewModelScope.launch {
        if (song.coverUrl.isNotEmpty()) {
            val initialColors = app.coverPalette.colors(song.coverUrl)
            if (selected?.key == song.key) {
                coverColors = initialColors
                updateSmartStage(false)
            }
        }
        val assets = if (song.source == "local" && song.coverUrl.isNotEmpty()) null
            else runCatching { engine.songAssets(song) }.getOrNull()
        val cover = assets?.optString("coverUrl").orEmpty().ifEmpty { song.coverUrl }
        if (cover.isNotEmpty() && cover != song.coverUrl) {
            applyHydratedCovers(mapOf(song.key to cover))
        }
        if (selected?.key != song.key) return@launch
        val publicLines = LyricParser.parse(assets?.optString("lyric").orEmpty())
        val publicExact = assets?.optBoolean("exactIdMatch", false) == true && publicLines.isNotEmpty()
        val sameSongLyrics = lyricsSongKey == song.key
        if (publicLines.isNotEmpty() && (!sameSongLyrics || publicExact || (!lyricsExactMatched && publicLines.size > lyrics.size) || lyrics.isEmpty())) {
            lyricsSongKey = song.key
            if (publicExact) lyricsExactMatched = true
            lyrics = publicLines
            if (!sameSongLyrics || publicExact || translatedLyrics.isEmpty()) translatedLyrics = LyricParser.parse(assets?.optString("tlyric").orEmpty())
            if (!sameSongLyrics || publicExact || romajiLyrics.isEmpty()) romajiLyrics = LyricParser.parse(assets?.optString("romalrc").orEmpty())
            updateStageTranslations()
            PlaybackController.setLyrics(lyrics, lyricOffset)
            refreshAutoMixPlan()
        }
        if (cover.isNotEmpty()) {
            val colors = app.coverPalette.colors(cover)
            if (selected?.key == song.key) {
                coverColors = colors
                updateSmartStage(false)
            }
        }
    }
}

/** 歌词 100% 级联兜底：无论自定义源返回结果如何，缺词或缺封面均合并 song-assets 并回写全局状态。 */
fun AppViewModel.loadLyricsFor(song: Song, retryCount: Int = 0) {
    val token = ++lyricLoadToken
    if (song.source == "local") {
        val localLines = LyricParser.parse(localMusic.lyricFor(song))
        if (localLines.isNotEmpty() && selected?.key == song.key) {
            lyricsSongKey = song.key
            lyrics = localLines
            translatedLyrics = emptyList()
            romajiLyrics = emptyList()
            updateStageTranslations()
            PlaybackController.setLyrics(localLines, lyricOffset)
            return
        }
    }
    viewModelScope.launch {
        val media = runCatching {
            engine.lyricAndCoverBundle(song, lyricPrefs.showTranslation, lyricPrefs.showRomaji)
        }.getOrNull()
        if (token != lyricLoadToken || selected?.key != song.key) return@launch
        if (media != null) {
            val sameSongLyrics = lyricsSongKey == song.key
            if (media.lines.isNotEmpty() && (!sameSongLyrics || media.exactIdMatch || (!lyricsExactMatched && media.lines.size >= lyrics.size) || lyrics.isEmpty())) {
                lyricsSongKey = song.key
                if (media.exactIdMatch) lyricsExactMatched = true
                lyrics = media.lines
            }
            if (media.translation.isNotEmpty()) {
                lyricsSongKey = song.key
                translatedLyrics = media.translation
            } else if (!sameSongLyrics) {
                translatedLyrics = emptyList()
            }
            if (media.romaji.isNotEmpty()) {
                lyricsSongKey = song.key
                romajiLyrics = media.romaji
            } else if (!sameSongLyrics) {
                romajiLyrics = emptyList()
            }
            updateStageTranslations()
            PlaybackController.setLyrics(if (lyricsSongKey == song.key) lyrics else emptyList(), lyricOffset)
            if (media.coverUrl.isNotEmpty() && media.coverUrl != song.coverUrl) {
                applyHydratedCovers(mapOf(song.key to media.coverUrl))
                val colors = app.coverPalette.colors(media.coverUrl)
                if (selected?.key == song.key) coverColors = colors
            }
            updateSmartStage(true)
            refreshAutoMixPlan()
        }
        val currentSongHasLyrics = lyricsSongKey == song.key && lyrics.isNotEmpty()
        if (retryCount < 2 && (!currentSongHasLyrics || selected?.coverUrl.isNullOrEmpty())) {
            delay(if (retryCount == 0) 1200 else 3200)
            if (token == lyricLoadToken && selected?.key == song.key) {
                loadCoverColors(selected ?: song)
                loadLyricsFor(selected ?: song, retryCount = retryCount + 1)
            }
        }
    }
}

fun AppViewModel.reloadLyricExtras() {
    selected?.let { song -> loadLyricsFor(song) }
}

/** 翻译与罗马音按 ±650ms 就近对齐主歌词时间戳后合并为舞台副歌词。 */
fun AppViewModel.updateStageTranslations() {
    val grouped = linkedMapOf<Long, MutableList<String>>()
    val merged = buildList {
        if (lyricPrefs.showTranslation) addAll(LyricParser.alignAuxToMain(lyrics, translatedLyrics))
        if (lyricPrefs.showRomaji) addAll(LyricParser.alignAuxToMain(lyrics, romajiLyrics))
    }
    val placeholderRe = Regex("^[\\\\/\\-—–_~·•\\s]+$")
    for (line in merged) {
        val clean = line.text.trim()
        if (clean.isEmpty() || placeholderRe.matches(clean)) continue
        val values = grouped.getOrPut(line.timeMs) { mutableListOf() }
        if (!values.contains(clean)) values.add(clean)
    }
    stageTranslations = grouped.entries.sortedBy { it.key }.map { (time, values) ->
        LyricLine(time, values.joinToString("\n"))
    }
}

fun AppViewModel.setLyricColorMode(value: String) {
    lyricPrefs = lyricPrefs.copy(colorMode = value)
    save()
}

fun AppViewModel.setLyricPrimary(value: String) {
    lyricPrefs = lyricPrefs.copy(primary = value)
    save()
}

fun AppViewModel.setLyricSecondary(value: String) {
    lyricPrefs = lyricPrefs.copy(secondary = value)
    save()
}

fun AppViewModel.setShowTranslation(value: Boolean) {
    lyricPrefs = lyricPrefs.copy(showTranslation = value)
    updateStageTranslations()
    save()
    reloadLyricExtras()
}

fun AppViewModel.setShowRomaji(value: Boolean) {
    lyricPrefs = lyricPrefs.copy(showRomaji = value)
    updateStageTranslations()
    save()
    reloadLyricExtras()
}

fun AppViewModel.setLyricScale(value: Float) {
    val rounded = (Math.round(value.coerceIn(0.55f, 1.50f) * 100f) / 100f).coerceIn(0.55f, 1.50f)
    lyricPrefs = lyricPrefs.copy(lyricScale = rounded)
    scheduleSave()
}

fun AppViewModel.setLyricLineSpacing(value: Float) {
    val rounded = (Math.round(value.coerceIn(0.85f, 1.80f) * 100f) / 100f).coerceIn(0.85f, 1.80f)
    lyricPrefs = lyricPrefs.copy(lyricLineSpacing = rounded)
    scheduleSave()
}

fun AppViewModel.setLyricMaxLines(value: Int) {
    lyricPrefs = lyricPrefs.copy(lyricMaxLines = value.coerceIn(0, 10))
    save()
}

fun AppViewModel.setAudioFx(config: com.lxlia.player.audio.AudioFxConfig) {
    audioFx = config
    PlaybackController.setAudioFx(config)
    scheduleSave()
}

fun AppViewModel.setSpatialMode(mode: String) {
    val normalized = if (mode in listOf("off", "system", "binaural")) mode else "system"
    setAudioFx(audioFx.copy(spatialMode = normalized))
    spatialHardwareStatus = PlaybackController.querySpatialStatus(app)
}

fun AppViewModel.requestEarMonitorMode(nextMode: String) {
    if (nextMode == "off") {
        pendingEarMonitorMode = ""
        earMonitor.setMode("off")
        return
    }
    val granted = androidx.core.content.ContextCompat.checkSelfPermission(
        app,
        android.Manifest.permission.RECORD_AUDIO,
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    if (!granted) {
        pendingEarMonitorMode = nextMode
        earMonitorPermissionRequest = System.nanoTime()
        return
    }
    val ok = earMonitor.setMode(nextMode)
    if (!ok) {
        notify("耳返启动失败，请检查麦克风占用或权限", 2200)
    }
}

fun AppViewModel.onEarMonitorPermissionResult(granted: Boolean) {
    val target = pendingEarMonitorMode
    pendingEarMonitorMode = ""
    if (!granted) {
        notify("未获得麦克风权限，请在系统应用权限设置中开启「麦克风」", 3200)
        runCatching {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package", app.packageName, null),
            ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            app.startActivity(intent)
        }
        return
    }
    if (target.isNotEmpty()) {
        val ok = earMonitor.setMode(target)
        if (!ok) notify("耳返启动失败，请确认耳机与麦克风未被占用后重试", 2600)
    }
}

fun AppViewModel.setEarMonitorMicVolume(value: Float) {
    earMonitor.setMicVolume(value)
}

fun AppViewModel.setEarMonitorVocalVolume(value: Float) {
    earMonitor.setVocalVolume(value)
}

fun AppViewModel.setAutoMixEnabled(enabled: Boolean) {
    autoMixEnabled = enabled
    if (!enabled) {
        PlaybackController.cancelAutoMix()
        currentAutoMixPlan = null
        autoMixPreview = ""
        autoMixPreloadToken++
        autoMixPreloadInFlight = false
        autoMixPreloadAttempts = 0
        autoMixPreloadJob?.cancel()
        autoMixPreloadKey = ""
        autoMixTriggeredKey = ""
    } else {
        refreshAutoMixPlan()
    }
    save()
}

fun AppViewModel.peekNextQueueSong(): Song? {
    PlaybackController.peekNextSong()?.let { return it }
    val cur = selected ?: return null
    if (queue.size <= 1 || mode == "单曲循环") return null
    val idx = queue.indexOfFirst { it.key == cur.key }
    if (idx < 0) return null
    if (mode == "顺序播放" && idx >= queue.lastIndex) return null
    val nextIdx = (idx + 1) % queue.size
    return queue.getOrNull(nextIdx)?.takeIf { it.key != cur.key }
}

fun AppViewModel.ensureAutoMixPreload(forceRetry: Boolean = false) {
    if (!autoMixEnabled || resolving || sleepMode == "song" || sleepPendingStop || PlaybackController.autoMixActive) return
    val cur = selected ?: return
    val next = peekNextQueueSong() ?: return
    val plan = currentAutoMixPlan ?: return
    if (!plan.enabled) return
    val pairKey = "${cur.key}->${next.key}"
    val now = System.currentTimeMillis()
    if (PlaybackController.isPreloadedFor(next)) {
        autoMixPreloadKey = pairKey
        autoMixPreloadInFlight = false
        autoMixPreloadRetryAt = 0L
        return
    }
    if (!forceRetry && autoMixPreloadInFlight && autoMixPreloadKey == pairKey && (now - autoMixPreloadStartedAt) < 12_000L) {
        return
    }
    if (!forceRetry && autoMixPreloadKey == pairKey && now < autoMixPreloadRetryAt) {
        return
    }
    if (autoMixPreloadKey != pairKey) {
        autoMixPreloadAttempts = 0
    }
    if (autoMixPreloadAttempts >= 3 && !forceRetry) return
    val attempt = autoMixPreloadAttempts
    autoMixPreloadAttempts++
    val token = ++autoMixPreloadToken
    autoMixPreloadKey = pairKey
    autoMixPreloadInFlight = true
    autoMixPreloadStartedAt = now
    autoMixPreloadRetryAt = now + 12_000L
    val capturedPlan = plan
    autoMixPreloadJob?.cancel()
    autoMixPreloadJob = viewModelScope.launch {
        var usedUrl = ""
        try {
            val rawLocal = localMusic.pathFor(next).ifEmpty { downloads.offline(next) }
            val localPath = rawLocal.removePrefix("file://")
            if (localPath.isNotEmpty()) {
                PlaybackController.preloadNext(next, localPath, true, capturedPlan.nextEntryMs)
            } else if (engine.ready) {
                val badUrls = autoMixFailedUrls[next.key]?.toList().orEmpty()
                val url = engine.resolveUrl(
                    song = next,
                    raceAll = true,
                    silent = true,
                    forceResolve = attempt > 0,
                    preferCrossPlatform = attempt >= 1,
                    excludeUrls = badUrls,
                )
                if (token != autoMixPreloadToken || selected?.key != cur.key) return@launch
                usedUrl = url
                if (url.isNotEmpty()) {
                    PlaybackController.preloadNext(next, url, false, capturedPlan.nextEntryMs)
                } else {
                    throw IllegalStateException("empty preload url")
                }
            } else {
                autoMixPreloadInFlight = false
                autoMixPreloadRetryAt = System.currentTimeMillis() + 3000L
                return@launch
            }
            // 等待副轨 ExoPlayer 进入 STATE_READY（最多 10s），避免坏链静默卡死
            val deadline = System.currentTimeMillis() + 10_000L
            while (token == autoMixPreloadToken && System.currentTimeMillis() < deadline) {
                if (PlaybackController.isPreloadedFor(next)) {
                    autoMixPreloadInFlight = false
                    autoMixPreloadRetryAt = 0L
                    if (playing && !PlaybackController.autoMixActive && selected?.key == cur.key) {
                        tickAutoMix(livePositionMs.takeIf { it > 0L } ?: positionMs, duration)
                    }
                    return@launch
                }
                delay(150)
            }
            if (token != autoMixPreloadToken) return@launch
            if (usedUrl.isNotEmpty()) {
                val list = autoMixFailedUrls.getOrPut(next.key) { mutableListOf() }
                if (usedUrl !in list) list.add(usedUrl)
                while (list.size > 4) list.removeAt(0)
            }
            autoMixPreloadInFlight = false
            autoMixPreloadRetryAt = System.currentTimeMillis() + 2500L
            if (autoMixPreloadAttempts < 3 && autoMixEnabled) {
                delay(1200)
                if (token == autoMixPreloadToken && autoMixEnabled) ensureAutoMixPreload(true)
            }
        } catch (_: Throwable) {
            if (token != autoMixPreloadToken) return@launch
            if (usedUrl.isNotEmpty()) {
                val list = autoMixFailedUrls.getOrPut(next.key) { mutableListOf() }
                if (usedUrl !in list) list.add(usedUrl)
                while (list.size > 4) list.removeAt(0)
            }
            autoMixPreloadInFlight = false
            autoMixPreloadRetryAt = System.currentTimeMillis() + 2500L
            if (autoMixPreloadAttempts < 3 && autoMixEnabled) {
                delay(1200)
                if (token == autoMixPreloadToken && autoMixEnabled) ensureAutoMixPreload(true)
            }
        }
    }
}

fun AppViewModel.prefetchNextLyricsForAutoMix(next: Song) {
    val key = next.key
    if (autoMixNextLyricsCache.containsKey(key) || autoMixNextLyricsPending.contains(key)) return
    if (next.source == "local") {
        autoMixNextLyricsCache[key] = LyricParser.parse(localMusic.lyricFor(next))
        return
    }
    if (next.name.isBlank()) return
    autoMixNextLyricsPending.add(key)
    viewModelScope.launch {
        val lines = runCatching {
            engine.lyricAndCoverBundle(next, needTranslation = false, needRomaji = false).lines
        }.getOrDefault(emptyList())
        autoMixNextLyricsPending.remove(key)
        autoMixNextLyricsCache[key] = lines
        if (autoMixNextLyricsCache.size > 24) {
            val oldest = autoMixNextLyricsCache.keys.firstOrNull()
            if (oldest != null) autoMixNextLyricsCache.remove(oldest)
        }
        val curNext = peekNextQueueSong()
        if (autoMixEnabled && !PlaybackController.autoMixActive && curNext?.key == key) {
            refreshAutoMixPlan()
        }
    }
}

fun AppViewModel.refreshAutoMixPlan() {
    if (!autoMixEnabled) {
        currentAutoMixPlan = null
        autoMixPlanDurationMs = 0L
        autoMixPreview = ""
        return
    }
    val cur = selected ?: return
    val prevNextKey = autoMixNextSongKey
    val next = peekNextQueueSong()
    autoMixNextSongKey = next?.key.orEmpty()
    if (next != null) {
        val pairKey = "${cur.key}->${next.key}"
        if (autoMixTriggeredKey.isNotEmpty() && autoMixTriggeredKey != pairKey) autoMixTriggeredKey = ""
        if (prevNextKey.isNotEmpty() && prevNextKey != next.key && !PlaybackController.autoMixActive) {
            autoMixPreloadToken++
            autoMixPreloadInFlight = false
            autoMixPreloadKey = ""
            autoMixPreloadRetryAt = 0L
            autoMixPreloadAttempts = 0
            autoMixPreloadJob?.cancel()
        }
    }
    val realDur = PlaybackController.durationMs.takeIf { it > 15_000L }
        ?: duration.takeIf { it > 15_000L }
        ?: cur.durationMs
    autoMixPlanDurationMs = realDur
    val cachedNextLyrics = if (next != null) autoMixNextLyricsCache[next.key].orEmpty() else emptyList()
    if (next != null && !autoMixNextLyricsCache.containsKey(next.key)) {
        prefetchNextLyricsForAutoMix(next)
    }
    val plan = com.lxlia.player.audio.AutoMixPlanner.plan(
        currentSong = cur,
        currentDurationMs = realDur,
        currentLyrics = lyrics,
        nextSong = next,
        nextLyrics = cachedNextLyrics,
    )
    currentAutoMixPlan = if (plan.enabled) plan else null
    autoMixPreview = if (plan.enabled && next != null) "${plan.summary} → ${next.name}" else plan.summary
    // 主动式提前预载：规划就绪后立即后台预热副轨，不再等到最后 40 秒
    if (plan.enabled && next != null && playing && !resolving && !PlaybackController.autoMixActive) {
        ensureAutoMixPreload(false)
    }
}

fun AppViewModel.tickAutoMix(posMs: Long, durMs: Long) {
    if (!autoMixEnabled || !playing || sleepMode == "song" || sleepPendingStop || PlaybackController.autoMixActive) return
    val cur = selected ?: return
    val next = peekNextQueueSong() ?: return
    val effDur = PlaybackController.durationMs.takeIf { it > 15_000L }
        ?: durMs.takeIf { it > 15_000L }
        ?: cur.durationMs
    var plan = currentAutoMixPlan
    if ((plan == null || kotlin.math.abs(effDur - autoMixPlanDurationMs) > 2500L) && effDur > 22_000L) {
        refreshAutoMixPlan()
        plan = currentAutoMixPlan
    }
    if (plan == null || !plan.enabled) return
    val pairKey = "${cur.key}->${next.key}"
    // 播放满 2 秒起即主动维持副轨已预加载（换歌单/拖进度/网络抖动均自动补齐）
    if (posMs >= 2000L) {
        ensureAutoMixPreload(false)
    }
    val remainingMs = (effDur - posMs).coerceAtLeast(0L)
    if (posMs >= plan.mixStartMs && remainingMs >= 1600L && autoMixTriggeredKey != pairKey && PlaybackController.isPreloadedFor(next)) {
        autoMixTriggeredKey = pairKey
        val effCrossfade = plan.crossfadeMs.coerceAtMost((remainingMs - 250L).coerceAtLeast(1600L)).coerceAtLeast(1600L)
        PlaybackController.startAutoMix(effCrossfade, plan.strategy, plan.tempoMatch, plan.rateA, plan.rateB)
    }
}

fun AppViewModel.isSongInUserLibrary(song: Song?): Boolean {
    if (song == null) return false
    if (song.source == "local") return true
    if (song.key in likedKeys) return true
    if (localMusic.pathFor(song).isNotEmpty() || downloads.offline(song).isNotEmpty()) return true
    return playlists.any { pl -> pl.kind == "lx" && pl.songs.any { it.key == song.key } }
}

fun AppViewModel.dislikeCurrentSong() {
    val song = selected ?: return
    closeSheet()
    if (song.key !in dislikedKeys) {
        dislikedKeys = (listOf(song.key) + dislikedKeys).take(300)
        save()
    }
    homeFeed?.let { feed ->
        val disliked = dislikedKeys.toSet()
        homeFeed = feed.copy(
            forYou = feed.forYou.filterNot { it.key in disliked },
            similar = feed.similar.filterNot { it.key in disliked },
            newSongs = feed.newSongs.filterNot { it.key in disliked },
            dailySongs = feed.dailySongs.filterNot { it.key in disliked },
        )
    }
    notify("已减少此类推荐", 1800)
    if (queue.size > 1) {
        val nextQueue = queue.filterNot { it.key == song.key }
        val idx = queue.indexOfFirst { it.key == song.key }.coerceAtLeast(0)
        val nextSong = nextQueue[idx % nextQueue.size]
        playSong(nextSong, nextQueue)
    } else {
        PlaybackController.pause()
    }
}

fun AppViewModel.clearDislikedSongs() {
    dislikedKeys = emptyList()
    save()
    notify("已清空不感兴趣屏蔽列表", 1800)
}

fun AppViewModel.setPlayPauseFadeEnabled(enabled: Boolean) {
    playPauseFadeEnabled = enabled
    PlaybackController.playPauseFadeEnabled = enabled
    save()
}

fun AppViewModel.setStageResetCameraOnSong(enabled: Boolean) {
    stageResetCameraOnSong = enabled
    save()
}

fun AppViewModel.viewCurrentArtist() {
    val song = selected ?: return
    val artist = song.singer.split(Regex("[、/,，;&]+")).firstOrNull()?.trim().orEmpty()
    if (artist.isEmpty() || artist == "未知歌手") {
        notify("当前歌曲没有可用的艺人信息", 1800)
        return
    }
    val fromPlayer = showPlayer
    closeSheet()
    showPlayer = false
    tab = "发现"
    searchKind = "artist"
    keyword = artist
    openSearch()
    searchReturnToPlayer = fromPlayer
    keyword = artist
    search()
}

fun AppViewModel.viewCurrentAlbum() {
    val song = selected ?: return
    val rawAlbum = song.albumName.trim()
    val album = rawAlbum.ifEmpty { song.name.trim() }
    if (album.isEmpty()) {
        notify("当前歌曲没有可用的专辑信息", 1800)
        return
    }
    val fromPlayer = showPlayer
    closeSheet()
    showPlayer = false
    tab = "发现"
    searchKind = if (rawAlbum.isNotEmpty()) "album" else "music"
    keyword = album
    openSearch()
    searchReturnToPlayer = fromPlayer
    keyword = album
    search()
}

fun AppViewModel.openSimilarSongs() {
    val song = selected ?: return
    val fromPlayer = showPlayer
    closeSheet()
    showPlayer = false
    val returnTab = tab
    val shell = MusicPlaylist(
        id = "similar-${song.key}",
        name = "相似歌曲 · ${song.name}",
        kind = "lx",
        songs = emptyList(),
        createdAt = System.currentTimeMillis(),
        updatedAt = System.currentTimeMillis(),
        preserveQueue = true,
    )
    playlistReturnTab = returnTab
    playlistReturnFeed = feedSection
    playlistReturnSearch = searchOpen
    playlistReturnToPlayer = fromPlayer
    openedPlaylist = shell
    openedFeedLoading = true
    tab = "资料库"
    discoveryCompact = false
    viewModelScope.launch {
        try {
            val disliked = dislikedKeys.toSet()
            val found = mutableListOf<Song>()
            runCatching {
                val raw = engine.catalogue("similar-songs", song.toJson().toString())
                val arr = JSONObject(raw).optJSONArray("items")
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        Song.fromJson(arr.optJSONObject(i))?.let { cand ->
                            if (cand.key != song.key && cand.key !in disliked) found.add(cand)
                        }
                    }
                }
            }
            if (found.size < 8) {
                val artist = song.singer.split(Regex("[、/,，;&]+")).firstOrNull()?.trim().orEmpty().ifEmpty { song.name }
                val searchRes = runCatching {
                    com.lxlia.player.lx.SearchApi.search(com.lxlia.player.lx.SearchSource.ALL, artist, page = 1, limit = 24).items
                }.getOrDefault(emptyList())
                val seen = found.map { it.key }.toMutableSet()
                seen.add(song.key)
                searchRes.forEach { cand ->
                    if (cand.key !in disliked && seen.add(cand.key)) found.add(cand)
                }
            }
            openedFeedLoading = false
            if (found.isEmpty()) {
                notify("暂时没有找到相似歌曲", 2000)
                openedPlaylist = null
                tab = returnTab
                return@launch
            }
            openedPlaylist = shell.copy(songs = found, songIds = found.map { it.key })
            hydrateCoversFor(found.take(36))
        } catch (_: Throwable) {
            openedFeedLoading = false
            openedPlaylist = null
            tab = returnTab
            notify("获取相似歌曲失败", 2000)
        }
    }
}

fun AppViewModel.setSleepTimer(modeId: String, minutes: Int) {
    sleepTimerJob?.cancel()
    sleepTimerJob = null
    sleepPendingStop = false
    if (modeId == "off") {
        clearSleepTimer()
        return
    }
    if (modeId == "song" || minutes < 0) {
        sleepMode = "song"
        sleepEndAt = 0L
        sleepRemainingText = "播完本首"
        notify("定时关闭：播完本首后暂停", 2000)
        return
    }
    val mins = minutes.coerceIn(1, 480)
    sleepMode = modeId
    sleepEndAt = System.currentTimeMillis() + mins * 60_000L
    updateSleepRemainingText()
    notify("定时关闭：${mins} 分钟后停止播放", 2000)
    sleepTimerJob = viewModelScope.launch {
        while (sleepMode != "off" && sleepMode != "song") {
            val left = sleepEndAt - System.currentTimeMillis()
            if (left <= 0L) {
                if (sleepFinishSong && playing) {
                    sleepPendingStop = true
                    sleepRemainingText = "播完本首后暂停"
                    notify("倒计时结束，将播完当前歌曲后暂停", 2400)
                } else {
                    clearSleepTimer(silent = true)
                    PlaybackController.fadeOutAndPause(1400L)
                    notify("定时关闭已到，已暂停播放", 2400)
                }
                break
            }
            updateSleepRemainingText()
            delay(1000)
        }
    }
}

private fun AppViewModel.updateSleepRemainingText() {
    val leftSec = ((sleepEndAt - System.currentTimeMillis()) / 1000L).coerceAtLeast(0L)
    val mins = leftSec / 60L
    val secs = leftSec % 60L
    sleepRemainingText = String.format(java.util.Locale.US, "%02d:%02d", mins, secs)
}

fun AppViewModel.clearSleepTimer(silent: Boolean = false) {
    sleepTimerJob?.cancel()
    sleepTimerJob = null
    sleepMode = "off"
    sleepEndAt = 0L
    sleepPendingStop = false
    sleepRemainingText = ""
    if (!silent) notify("已关闭定时关闭", 1600)
}

fun AppViewModel.setSleepFinishSong(enabled: Boolean) {
    sleepFinishSong = enabled
    save()
}

fun AppViewModel.confirmClearRecentSongs() {
    pendingClearRecent = false
    recentSongs = emptyList()
    store.saveRecentSongs("[]")
    if (openedPlaylist?.kind == "recent") {
        openedPlaylist = openedPlaylist?.copy(songs = emptyList(), songIds = emptyList(), updatedAt = System.currentTimeMillis())
    }
    notify("已清空最近播放记录", 1800)
}

fun AppViewModel.setLyricOffset(value: Long) {
    lyricOffset = value.coerceIn(-10000, 10000)
    PlaybackController.setLyricOffset(lyricOffset)
    scheduleSave()
}

fun AppViewModel.setBluetoothCarLyricsEnabled(enabled: Boolean) {
    bluetoothCarLyricsEnabled = enabled
    PlaybackController.setBluetoothCarLyrics(enabled, bluetoothCarLyricsMode)
    save()
    notify(
        if (enabled) {
            if (bluetoothAudioConnected) "蓝牙车载歌词已开启（已检测到蓝牙音频，播放时自动同步）"
            else "蓝牙车载歌词已开启（连接车载蓝牙后自动同步）"
        } else {
            "蓝牙车载歌词已关闭"
        },
        2400,
    )
}

fun AppViewModel.setBluetoothCarLyricsMode(mode: String) {
    bluetoothCarLyricsMode = com.lxlia.player.audio.BluetoothCarLyrics.normalizeMode(mode)
    PlaybackController.setBluetoothCarLyrics(bluetoothCarLyricsEnabled, bluetoothCarLyricsMode)
    save()
}

fun AppViewModel.previewPrimary(): String = lyricPrimary(lyricPrefs, coverColors)
fun AppViewModel.previewSecondary(): String = lyricSecondary(lyricPrefs, coverColors)

/** 播放快照：进度刷新时只写最后一次位置，整条队列只在需要落盘时序列化。 */
fun AppViewModel.savePlayback(persist: Boolean = false) {
    val song = selected ?: return
    if (!storeReady || pendingPlayback != null) return
    val now = System.currentTimeMillis()
    if (!persist && now - lastDiskSaveAt < 15000) return
    lastDiskSaveAt = now
    val position = if (persist) PlaybackController.positionMs else livePositionMs
    val json = JSONObject()
        .put("song", song.toJson())
        .put("queue", JSONArray().apply { queue.forEach { put(it.toJson()) } })
        .put("positionMs", position)
        .put("playing", playing)
        .put("explicit", false)
    store.savePlaybackSnapshot(json.toString())
}

fun AppViewModel.restorePlaybackIfReady() {
    if (intro || !storeReady) return
    val saved = pendingPlayback ?: return
    if (!resumeOnStartup && !saved.explicit) {
        if (saved.song.source != "local" && !engine.ready) return
        pendingPlayback = null
        playing = false
        loadCoverColors(saved.song)
        loadLyricsFor(saved.song)
        return
    }
    if (!engine.ready && localMusic.pathFor(saved.song).isEmpty() && downloads.offline(saved.song).isEmpty()) return
    pendingPlayback = null
    playSong(
        saved.song,
        saved.queue.ifEmpty { listOf(saved.song) },
        saved.positionMs.coerceAtLeast(0),
        saved.explicit || (resumeOnStartup && saved.playing),
    )
}

fun AppViewModel.finishIntro() {
    intro = false
    introFinished = true
    restorePlaybackIfReady()
}
