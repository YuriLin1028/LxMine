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

fun AppViewModel.playSong(song: Song, list: List<Song>, startMs: Long = 0, autoPlay: Boolean = true) {
    pendingPlayback = null
    val playList = list.ifEmpty { listOf(song) }
    val index = playList.indexOfFirst { it.key == song.key }.coerceAtLeast(0)
    val local = localMusic.pathFor(song).ifEmpty { downloads.offline(song) }
    // 音源没就绪时不要先把界面切到新歌：否则底栏显示一首根本播不了的歌，
    // 播放器里还是上一首。保持原状，只提示并跳到设置。
    if (local.isEmpty() && !engine.ready) {
        error = "先在设置中启用一个支持此平台的音源"
        tab = "设置"
        return
    }
    selected = song
    coverColors = EMPTY_COVER_COLORS
    loadCoverColors(song)
    queue = playList
    positionMs = startMs.coerceAtLeast(0)
    livePositionMs = positionMs
    duration = song.durationMs
    lyrics = emptyList()
    translatedLyrics = emptyList()
    romajiLyrics = emptyList()
    stageTranslations = emptyList()
    resolving = true
    error = ""
    playbackUrl = ""
    PlaybackController.setLyrics(emptyList(), lyricOffset)
    loadLyricsFor(song)
    PlaybackController.playFromList(playList, index, startMs, autoPlay)
}

fun AppViewModel.togglePlayback() {
    if (resolving) return
    if (playing) {
        PlaybackController.pause()
    } else if (PlaybackController.current == null) {
        // 冷启动只恢复了上次歌曲、播放器还没装载：按当前进度重新解析播放。
        val song = selected
        if (song == null) {
            tab = "发现"
            openSearch()
            return
        }
        playSong(song, queue.ifEmpty { listOf(song) }, positionMs)
        return
    } else {
        PlaybackController.resume()
    }
    duration = PlaybackController.durationMs
    syncPlaybackState()
}

fun AppViewModel.advance(step: Int) {
    PlaybackController.advance(step)
}

fun AppViewModel.seek(timeMs: Long) {
    PlaybackController.seek(timeMs)
    positionMs = timeMs.coerceAtLeast(0)
}

fun AppViewModel.setPlayMode(value: String) {
    mode = value
    PlaybackController.setMode(value)
    save()
}

fun AppViewModel.setQuality(value: String) {
    quality = value
    engine.setQuality(value)
    save()
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

fun AppViewModel.like(song: Song) {
    val existingFav = playlists.firstOrNull { it.isFavorite || it.name == "我喜欢的" }
    val favorite = (existingFav ?: createPlaylist("我喜欢的", true)).copy(isFavorite = true)
    val baseLists = if (existingFav == null) playlists + favorite else playlists
    val next = playlistWithSong(favorite, song, song.key in likedKeys)
    playlists = baseLists.map { if (it.id == next.id) next else it }
    if (openedPlaylist?.id == next.id) openedPlaylist = next
    save()
    scheduleAutoPlaylistSync()
    refreshPersonalizationIfNeeded()
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
    save()
    scheduleAutoPlaylistSync()
    message = "已添加到「${list.name}」"
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

/** 批量下载：跳过本地音频与已完成/进行中的曲目，按序解析并入队下载。 */
fun AppViewModel.downloadBatch(songs: List<Song>) {
    val onlineSongs = songs
        .filter { it.source != "local" && localMusic.pathFor(it).isEmpty() }
        .distinctBy { it.key }
    if (onlineSongs.isEmpty()) {
        notify("当前列表没有可下载的在线歌曲", 2000)
        return
    }
    if (!engine.ready) {
        error = "先启用音源再批量下载"
        notify(error)
        tab = "设置"
        return
    }
    val targets = onlineSongs.filterNot { downloads.isDownloadedOrActive(it) }
    val skipped = onlineSongs.size - targets.size
    if (targets.isEmpty()) {
        notify("列表中的 ${onlineSongs.size} 首歌曲均已下载或正在下载", 2500)
        return
    }
    val skipNote = if (skipped > 0) "（跳过已下载 $skipped 首）" else ""
    message = "开始批量下载 ${targets.size} 首歌曲$skipNote…"
    notify(message, 2500)
    batchDownloadJob?.cancel()
    batchDownloadJob = viewModelScope.launch {
        var started = 0
        var failed = 0
        targets.forEachIndexed { index, song ->
            if (downloads.isDownloadedOrActive(song)) return@forEachIndexed
            try {
                val info = engine.songInfo(engine.resolveIdentity(song))
                val url = engine.resolveUrl(song)
                downloads.start(song, info.type, url)
                started++
                message = "批量下载排队中：${index + 1}/${targets.size} · ${song.name}"
                if ((index + 1) % 5 == 0 || index == 0) {
                    notify("批量下载进度：${index + 1}/${targets.size}（${song.name}）", 1800)
                }
            } catch (_: Exception) {
                failed++
            }
            delay(180)
        }
        val summary = buildString {
            append("批量下载已入队 $started 首")
            if (skipped > 0) append("，跳过 $skipped 首")
            if (failed > 0) append("，解析失败 $failed 首")
        }
        message = summary
        notify(summary, 3000)
    }
}

fun AppViewModel.cancelDownload(id: String) {
    downloads.cancel(id)
}

fun AppViewModel.requestDownloadExport(id: String) {
    pendingDownloadExportId = id
    downloadExportRequest = System.nanoTime()
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
        val (nextSimilar, simChanged) = patchSongs(feed.similar)
        val (nextDaily, dailyChanged) = patchSongs(feed.dailySongs)
        val (nextNew, newChanged) = patchSongs(feed.newSongs)
        val dailyCover = feed.daily?.cover.orEmpty().ifEmpty {
            nextDaily.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl.orEmpty()
        }
        val dailyObjChanged = feed.daily != null && dailyCover.isNotEmpty() && dailyCover != feed.daily.cover
        if (simChanged || dailyChanged || newChanged || dailyObjChanged) {
            val updatedFeed = feed.copy(
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
    switchPlatformTarget = SwitchPlatformTarget(
        song = song,
        fromQueue = true,
        queueIndex = queueIndex,
    )
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
            if (selected?.key == song.key) coverColors = initialColors
        }
        val assets = if (song.source == "local" && song.coverUrl.isNotEmpty()) null
            else runCatching { engine.songAssets(song) }.getOrNull()
        val cover = assets?.optString("coverUrl").orEmpty().ifEmpty { song.coverUrl }
        if (cover.isNotEmpty() && cover != song.coverUrl) {
            applyHydratedCovers(mapOf(song.key to cover))
        }
        if (selected?.key != song.key) return@launch
        val publicLines = LyricParser.parse(assets?.optString("lyric").orEmpty())
        if (publicLines.size > lyrics.size || (lyrics.isEmpty() && publicLines.isNotEmpty())) {
            lyrics = publicLines
            if (translatedLyrics.isEmpty()) translatedLyrics = LyricParser.parse(assets?.optString("tlyric").orEmpty())
            if (romajiLyrics.isEmpty()) romajiLyrics = LyricParser.parse(assets?.optString("romalrc").orEmpty())
            updateStageTranslations()
            PlaybackController.setLyrics(lyrics, lyricOffset)
        }
        if (cover.isNotEmpty()) {
            val colors = app.coverPalette.colors(cover)
            if (selected?.key == song.key) coverColors = colors
        }
    }
}

/** 歌词 100% 级联兜底：无论自定义源返回结果如何，缺词或缺封面均合并 song-assets 并回写全局状态。 */
fun AppViewModel.loadLyricsFor(song: Song, retry: Boolean = false) {
    val token = ++playToken
    if (song.source == "local") {
        val localLines = LyricParser.parse(localMusic.lyricFor(song))
        if (localLines.isNotEmpty()) {
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
        if (token != playToken) return@launch
        if (media != null) {
            if (media.lines.size >= lyrics.size && media.lines.isNotEmpty()) {
                lyrics = media.lines
            }
            if (media.translation.isNotEmpty()) translatedLyrics = media.translation
            if (media.romaji.isNotEmpty()) romajiLyrics = media.romaji
            updateStageTranslations()
            PlaybackController.setLyrics(lyrics, lyricOffset)
            if (media.coverUrl.isNotEmpty() && media.coverUrl != song.coverUrl) {
                applyHydratedCovers(mapOf(song.key to media.coverUrl))
                val colors = app.coverPalette.colors(media.coverUrl)
                if (selected?.key == song.key) coverColors = colors
            }
        }
        if (!retry && (lyrics.isEmpty() || selected?.coverUrl.isNullOrEmpty())) {
            delay(8000)
            if (token == playToken && selected?.key == song.key) {
                loadCoverColors(selected ?: song)
                loadLyricsFor(selected ?: song, retry = true)
            }
        }
    }
}

fun AppViewModel.reloadLyricExtras() {
    selected?.let { song -> loadLyricsFor(song) }
}

/** 翻译与罗马音按时间合并成舞台副歌词。 */
fun AppViewModel.updateStageTranslations() {
    val grouped = linkedMapOf<Long, MutableList<String>>()
    val merged = buildList {
        if (lyricPrefs.showTranslation) addAll(translatedLyrics)
        if (lyricPrefs.showRomaji) addAll(romajiLyrics)
    }
    for (line in merged) {
        val values = grouped.getOrPut(line.timeMs) { mutableListOf() }
        if (!values.contains(line.text)) values.add(line.text)
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
    val rounded = (Math.round(value.coerceIn(0.75f, 1.40f) * 100f) / 100f).coerceIn(0.75f, 1.40f)
    lyricPrefs = lyricPrefs.copy(lyricScale = rounded)
    save()
}

fun AppViewModel.setLyricOffset(value: Long) {
    lyricOffset = value.coerceIn(-10000, 10000)
    PlaybackController.setLyricOffset(lyricOffset)
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
