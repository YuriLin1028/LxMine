package com.lxlia.player.ui

import androidx.lifecycle.viewModelScope
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.lx.EMPTY_COVER_COLORS
import com.lxlia.player.lx.LyricParser
import com.lxlia.player.model.LyricLine
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

fun AppViewModel.liked(song: Song): Boolean =
    playlists.any { list -> list.isFavorite && list.songs.any { it.key == song.key } }

fun AppViewModel.like(song: Song) {
    var favorite = playlists.firstOrNull { it.isFavorite }
    if (favorite == null) {
        favorite = createPlaylist("我喜欢的", true)
        playlists = playlists + favorite
    }
    val next = playlistWithSong(favorite, song, liked(song))
    playlists = playlists.map { if (it.id == next.id) next else it }
    if (openedPlaylist?.id == next.id) openedPlaylist = next
    save()
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

fun AppViewModel.loadCoverColors(song: Song) {
    viewModelScope.launch {
        val assets = if (song.source == "local" || !engine.ready) null else runCatching { engine.songAssets(song) }.getOrNull()
        val cover = assets?.optString("coverUrl").orEmpty().ifEmpty { song.coverUrl }
        if (selected?.key != song.key) return@launch
        val publicLines = LyricParser.parse(assets?.optString("lyric").orEmpty())
        if (publicLines.size > lyrics.size) {
            lyrics = publicLines
            if (translatedLyrics.isEmpty()) translatedLyrics = LyricParser.parse(assets?.optString("tlyric").orEmpty())
            if (romajiLyrics.isEmpty()) romajiLyrics = LyricParser.parse(assets?.optString("romalrc").orEmpty())
            updateStageTranslations()
            PlaybackController.setLyrics(lyrics, lyricOffset)
        }
        if (cover.isNotEmpty() && cover != selected?.coverUrl) {
            val updated = song.copy(coverUrl = cover)
            selected = updated
            queue = queue.map { if (it.key == song.key) updated else it }
            PlaybackController.updateArtwork(updated)
        }
        val colors = app.coverPalette.colors(cover)
        if (selected?.key == song.key) coverColors = colors
    }
}

/** 歌词：先问音源，缺失或不完整时回落到原平台公开歌词（与鸿蒙 loadLyrics 一致）。 */
fun AppViewModel.loadLyricsFor(song: Song, retry: Boolean = false) {
    val token = ++playToken
    if (song.source == "local") {
        val lines = LyricParser.parse(localMusic.lyricFor(song))
        lyrics = lines
        translatedLyrics = emptyList()
        romajiLyrics = emptyList()
        updateStageTranslations()
        PlaybackController.setLyrics(lines, lyricOffset)
        return
    }
    viewModelScope.launch {
        val (lines, translation, romaji) = runCatching {
            engine.lyricBundle(song, lyricPrefs.showTranslation, lyricPrefs.showRomaji)
        }.getOrDefault(Triple(emptyList(), emptyList(), emptyList()))
        if (token != playToken) return@launch
        if (lines.size >= lyrics.size) lyrics = lines
        if (translation.isNotEmpty()) translatedLyrics = translation
        if (romaji.isNotEmpty()) romajiLyrics = romaji
        updateStageTranslations()
        PlaybackController.setLyrics(lyrics, lyricOffset)
        if (!retry && (lyrics.isEmpty() || selected?.coverUrl.isNullOrEmpty())) {
            delay(16000)
            if (token == playToken && selected?.key == song.key) {
                loadCoverColors(selected ?: song)
                loadLyricsFor(selected ?: song, retry = true)
            }
        }
    }
}

fun AppViewModel.reloadLyricExtras() {
    selected?.let { song -> if (engine.ready) loadLyricsFor(song) }
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
