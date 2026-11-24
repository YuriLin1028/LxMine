package com.lxlia.player.ui

import android.net.Uri
import androidx.lifecycle.viewModelScope
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ---- 曲库、本地音乐、下载、列表工具：对应鸿蒙 Index.ets 同名动作 ----

fun AppViewModel.resetListTools() {
    listSearchOpen = false
    listQuery = ""
    listSortMode = "added"
    manualOrder = emptyList()
    orderOpen = false
    orderSongs = emptyList()
}

fun AppViewModel.listBaseSongs(): List<Song> =
    if (openedPlaylist?.kind == "local") localTracks else openedPlaylist?.songs.orEmpty()

/** 列表内搜索 + 排序（添加顺序/歌名/歌手/专辑/手动）。只在展示层重排，不改原歌单。 */
fun AppViewModel.arrangedSongs(songs: List<Song>, applyQuery: Boolean = true): List<Song> =
    orderSongList(songs, listSortMode, manualOrder, if (applyQuery) listQuery else "")

fun AppViewModel.openManualOrder() {
    openManualOrderFor(arrangedSongs(listBaseSongs()))
}

fun AppViewModel.openManualOrderFor(songs: List<Song>) {
    orderSongs = songs
    orderOpen = true
}

fun AppViewModel.applyManualOrder(keys: List<String>) {
    val opened = openedPlaylist
    if (opened != null && opened.kind == "lx" && playlists.any { it.id == opened.id }) {
        val reordered = orderSongList(opened.songs, "manual", keys)
        val updated = opened.copy(
            songs = reordered,
            songIds = reordered.map { it.key },
            updatedAt = System.currentTimeMillis(),
        )
        playlists = playlists.map { if (it.id == updated.id) updated else it }
        openedPlaylist = updated
        manualOrder = emptyList()
        listSortMode = "added"
        orderOpen = false
        save()
        scheduleAutoPlaylistSync()
        notify("已保存歌单排列顺序", 1500)
        return
    }
    manualOrder = keys
    listSortMode = "manual"
    orderOpen = false
    notify("已按手动排列显示", 1500)
}

fun AppViewModel.setListSort(mode: String) {
    listSortMode = mode
}

/** 打开曲库里的歌单：记录返回位置，切到资料库标签。 */
fun AppViewModel.openPlaylist(list: MusicPlaylist) {
    resetListTools()
    playlistReturnTab = "资料库"
    playlistReturnFeed = ""
    playlistReturnSearch = false
    openedPlaylist = list
    tab = "资料库"
    discoveryCompact = false
    hydrateCoversFor(list.songs.take(48))
}

fun AppViewModel.openLocalPlaylist() {
    resetListTools()
    playlistReturnTab = "资料库"
    playlistReturnFeed = ""
    playlistReturnSearch = false
    openedPlaylist = MusicPlaylist(
        id = "local-android",
        name = "本地音乐",
        kind = "local",
        songs = localTracks,
        songIds = localTracks.map { it.key },
        createdAt = 0,
        updatedAt = System.currentTimeMillis(),
    )
    tab = "资料库"
    discoveryCompact = false
}

/** 从首页/板块打开一个曲库歌单，并记录返回来源页。 */
fun AppViewModel.openLibraryPlaylist(list: MusicPlaylist, returnTab: String, returnFeed: String) {
    resetListTools()
    playlistReturnTab = returnTab
    playlistReturnFeed = returnFeed
    playlistReturnSearch = searchOpen
    playlistReturnFeedOffset = 0
    playlistReturnHomeOffset = 0
    openedPlaylist = list
    tab = "资料库"
    feedSection = ""
    discoveryCompact = false
    hydrateCoversFor(list.songs.take(48))
}

fun AppViewModel.closeOpenedPlaylist() {
    val returnTab = playlistReturnTab
    val returnFeed = playlistReturnFeed
    val returnSearch = playlistReturnSearch
    val returnToPlayer = playlistReturnToPlayer
    openedPlaylist = null
    openedFeedSourceId = ""
    playlistReturnFeed = ""
    playlistReturnSearch = false
    playlistReturnToPlayer = false
    when {
        returnSearch -> {
            tab = "发现"
            searchOpen = true
            discoveryCompact = false
        }
        returnFeed.isNotEmpty() -> {
            tab = returnTab.ifEmpty { "发现" }
            feedSection = returnFeed
            feedClosing = false
            feedReveal = 1f
            discoveryCompact = false
        }
        returnTab.isNotEmpty() -> {
            tab = returnTab
        }
    }
    if (returnToPlayer && selected != null) {
        showPlayer = true
    }
}

fun AppViewModel.isCollectionSavedToLibrary(name: String, songs: List<Song>): Boolean {
    val clean = name.trim()
    if (clean.isEmpty()) return false
    return playlists.any { !it.isFavorite && it.kind == "lx" && it.name.trim() == clean && it.songs.size == songs.size }
}

fun AppViewModel.canCollectOpenedPlaylist(playlist: MusicPlaylist? = openedPlaylist): Boolean {
    val list = playlist ?: return false
    if (list.songs.isEmpty() || list.kind == "local" || list.kind == "recent") return false
    return playlists.none { it.id == list.id }
}

fun AppViewModel.collectToLibrary(name: String, songs: List<Song>, cover: String = "") {
    val valid = songs.filter { it.id.isNotEmpty() }
    if (valid.isEmpty()) {
        notify("当前列表暂无可收藏的歌曲", 1800)
        return
    }
    val cleanName = name.trim().ifEmpty { "收藏歌单" }
    if (isCollectionSavedToLibrary(cleanName, valid)) {
        notify("「$cleanName」已在你的曲库中", 1800)
        return
    }
    val firstCover = cover.trim().ifEmpty { valid.firstOrNull { it.coverUrl.isNotBlank() }?.coverUrl.orEmpty() }
    val created = createPlaylist(cleanName, false).copy(
        songs = valid.toList(),
        songIds = valid.map { it.key },
        customCover = firstCover,
        updatedAt = System.currentTimeMillis(),
    )
    playlists = playlists + created
    save()
    scheduleAutoPlaylistSync()
    notify("已收藏「$cleanName」（${valid.size} 首）到曲库", 2200)
}

/** 单曲移除对曲库中持久化的所有 LX 歌单（含「我喜欢的」与自建/导入歌单）开放。 */
fun AppViewModel.canEditPlaylistSongs(playlist: MusicPlaylist? = openedPlaylist): Boolean {
    val list = playlist ?: return false
    return list.kind == "lx" && playlists.any { it.id == list.id }
}

/** 重命名 / 编辑歌单 / 删除歌单只对「曲库里真实存在的自建/导入歌单」开放。 */
fun AppViewModel.canManageOpenedPlaylist(): Boolean {
    val list = openedPlaylist ?: return false
    if (list.isFavorite || list.kind != "lx") return false
    return playlists.any { it.id == list.id }
}

fun AppViewModel.canDeleteOpenedPlaylist(): Boolean = canManageOpenedPlaylist()

fun AppViewModel.removeSongFromPlaylist(playlistId: String, song: Song) {
    if (playlistId == "recent-local") {
        val next = recentSongs.filterNot { it.key == song.key }
        recentSongs = next
        store.saveRecentSongs(Song.listToJson(next))
        if (openedPlaylist?.kind == "recent") {
            openedPlaylist = openedPlaylist?.copy(
                songs = next,
                songIds = next.map { it.key },
                updatedAt = System.currentTimeMillis(),
            )
        }
        notify("已从「最近播放」移除", 1500)
        return
    }
    val current = playlists.firstOrNull { it.id == playlistId && it.kind == "lx" } ?: return
    val updated = playlistWithSong(current, song, remove = true)
    playlists = playlists.map { if (it.id == updated.id) updated else it }
    if (openedPlaylist?.id == updated.id) openedPlaylist = updated
    save()
    scheduleAutoPlaylistSync()
    notify("已从「${current.name}」移除", 1500)
}

fun AppViewModel.openRenamePlaylist(playlist: MusicPlaylist? = openedPlaylist) {
    val target = playlist ?: return
    if (target.isFavorite || target.kind != "lx" || playlists.none { it.id == target.id }) return
    renamingPlaylistId = target.id
    draft = target.name
    sheet = "重命名歌单"
    error = ""
    addToPlaylistSong = null
    showSheet = true
}

fun AppViewModel.openEditPlaylist(playlist: MusicPlaylist? = openedPlaylist) {
    val target = playlist ?: return
    if (target.isFavorite || target.kind != "lx" || playlists.none { it.id == target.id }) return
    editPlaylistTarget = playlists.firstOrNull { it.id == target.id } ?: target
}

/** 打开自定义歌单封面选择器（支持自建/导入歌单及「我喜欢的」，#15）。 */
fun AppViewModel.openPlaylistCoverPicker(playlist: MusicPlaylist? = openedPlaylist) {
    val target = playlist ?: return
    if (target.kind != "lx" || playlists.none { it.id == target.id }) return
    coverPickerPlaylist = playlists.firstOrNull { it.id == target.id } ?: target
}

fun AppViewModel.applyPlaylistCover(playlistId: String, coverUrl: String) {
    val current = playlists.firstOrNull { it.id == playlistId && it.kind == "lx" } ?: return
    val updated = current.copy(customCover = coverUrl, updatedAt = System.currentTimeMillis())
    playlists = playlists.map { if (it.id == playlistId) updated else it }
    if (openedPlaylist?.id == playlistId) openedPlaylist = updated
    coverPickerPlaylist = null
    save()
    notify(if (coverUrl.isEmpty()) "已恢复默认歌单封面" else "已更新歌单封面", 1800)
}

fun AppViewModel.requestPickLocalPlaylistCover(playlistId: String) {
    pendingCoverPickPlaylistId = playlistId
    playlistCoverPickRequest = System.nanoTime()
}

fun AppViewModel.importPlaylistCoverImage(uri: Uri) {
    val targetId = pendingCoverPickPlaylistId
    pendingCoverPickPlaylistId = ""
    if (targetId.isEmpty()) return
    viewModelScope.launch(Dispatchers.IO) {
        try {
            val raw = app.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@launch
            val decoded = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size) ?: return@launch
            val maxDim = 1024
            val scale = minOf(1f, maxDim.toFloat() / maxOf(decoded.width, decoded.height).coerceAtLeast(1))
            val bmp = if (scale < 0.99f) {
                android.graphics.Bitmap.createScaledBitmap(
                    decoded,
                    (decoded.width * scale).toInt().coerceAtLeast(1),
                    (decoded.height * scale).toInt().coerceAtLeast(1),
                    true,
                )
            } else decoded
            val out = java.io.ByteArrayOutputStream()
            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, out)
            if (bmp !== decoded) bmp.recycle()
            decoded.recycle()
            val safeId = targetId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
            val file = java.io.File(app.filesDir, "playlist_cover_$safeId.jpg")
            file.writeBytes(out.toByteArray())
            val stampedPath = "${file.absolutePath}?t=${System.currentTimeMillis()}"
            withContext(Dispatchers.Main) {
                applyPlaylistCover(targetId, stampedPath)
            }
        } catch (_: Throwable) {
            withContext(Dispatchers.Main) { notify("封面图片读取失败", 2000) }
        }
    }
}

fun AppViewModel.saveEditedPlaylist(playlistId: String, newName: String, newSongs: List<Song>) {
    val trimmed = newName.trim()
    if (trimmed.isEmpty()) return
    val current = playlists.firstOrNull { it.id == playlistId && !it.isFavorite && it.kind == "lx" } ?: return
    val updated = current.copy(
        name = trimmed,
        songs = newSongs,
        songIds = newSongs.map { it.key },
        updatedAt = System.currentTimeMillis(),
    )
    playlists = playlists.map { if (it.id == playlistId) updated else it }
    if (openedPlaylist?.id == playlistId) openedPlaylist = updated
    manualOrder = emptyList()
    listSortMode = "added"
    editPlaylistTarget = null
    save()
    scheduleAutoPlaylistSync()
    notify("已保存歌单「$trimmed」", 1800)
}

fun AppViewModel.deleteOpenedPlaylist() {
    val list = openedPlaylist ?: return
    if (!canDeleteOpenedPlaylist()) return
    pendingDeletePlaylist = list
}

fun AppViewModel.confirmDeletePlaylist() {
    val list = pendingDeletePlaylist ?: return
    pendingDeletePlaylist = null
    playlists = playlists.filter { it.id != list.id }
    if (openedPlaylist?.id == list.id) closeOpenedPlaylist()
    save()
    scheduleAutoPlaylistSync()
}

// ---- 本地音乐 ----

/** 智能识别入口：先让界面去申请 READ_MEDIA_AUDIO，授权后再真正扫描。 */
fun AppViewModel.scanLocalMusic() {
    if (localMusicBusy) return
    scanRequest++
}

fun AppViewModel.startScan() {
    if (localMusicBusy) return
    localMusicBusy = true
    viewModelScope.launch {
        try {
            val uris = withContext(Dispatchers.IO) { localMusic.scanMediaStore() }
            if (uris.isEmpty()) {
                notify("没有在媒体库里找到音频")
                return@launch
            }
            scanItems = uris.mapIndexed { index, uri -> uri.toString() to localMusic.displayName(uri).ifEmpty { "音频 ${index + 1}" } }
            scanOpen = true
        } catch (exception: Exception) {
            error = "识别本地音频失败：${exception.message}"
        } finally {
            localMusicBusy = false
        }
    }
}

/** 拉系统音频选择器（对应鸿蒙 AudioViewPicker）；由 AppScreen 观察标记后启动。 */
fun AppViewModel.pickLocalAudio() {
    if (localMusicBusy) return
    audioPickRequest = System.currentTimeMillis()
}

fun AppViewModel.importLocalAudio(uris: List<Uri>) {
    if (uris.isEmpty()) return
    addLocalUris(uris)
}

fun AppViewModel.closeScanDialog() {
    scanOpen = false
    scanItems = emptyList()
}

fun AppViewModel.confirmScan(uris: List<String>) {
    closeScanDialog()
    if (uris.isEmpty()) return
    addLocalUris(uris.map(Uri::parse))
}

fun AppViewModel.addLocalUris(uris: List<Uri>) {
    if (localMusicBusy || uris.isEmpty()) return
    localMusicBusy = true
    notify("正在添加 ${uris.size} 个音频…", 2500)
    viewModelScope.launch {
        try {
            val added = localMusic.addUris(uris)
            localTracks = localMusic.songs()
            val opened = openedPlaylist
            if (opened?.kind == "local") {
                openedPlaylist = opened.copy(songs = localTracks, songIds = localTracks.map { it.key }, updatedAt = System.currentTimeMillis())
            }
            notify(if (added > 0) "已添加 $added 首本地音乐" else "没有新增音频（可能已添加过）", 2500)
        } catch (exception: Exception) {
            error = "添加本地音乐失败：${exception.message}"
        } finally {
            localMusicBusy = false
        }
    }
}

// ---- 音源页 / 下载页开关 ----

fun AppViewModel.openSources() {
    sourcesReveal = 0f
    sourcesClosing = false
    sourcesOpen = true
    discoveryCompact = false
    viewModelScope.launch {
        delay(16)
        sourcesReveal = 1f
    }
}

fun AppViewModel.closeSources() {
    sourcesClosing = true
    viewModelScope.launch {
        sourcesReveal = 0f
        delay(300)
        sourcesOpen = false
        sourcesClosing = false
        sourcesReveal = 1f
    }
}

fun AppViewModel.openDownloads(fromTab: String = tab) {
    downloadsReturnTab = fromTab
    settingsPanel = "main"
    tab = "资料库"
    downloadsOpen = true
    openedPlaylist = null
    hydrateDownloadCovers()
}

private fun AppViewModel.hydrateDownloadCovers() {
    val missing = downloadItems.filter { it.song.coverUrl.isEmpty() && it.song.name.isNotBlank() }
    if (missing.isEmpty()) return
    viewModelScope.launch {
        val found = linkedMapOf<String, String>()
        val known = hashMapOf<String, String>()
        playlists.forEach { pl -> pl.songs.forEach { if (it.coverUrl.isNotEmpty()) known[it.key] = it.coverUrl } }
        recentSongs.forEach { if (it.coverUrl.isNotEmpty()) known[it.key] = it.coverUrl }
        queue.forEach { if (it.coverUrl.isNotEmpty()) known[it.key] = it.coverUrl }
        val needRemote = mutableListOf<Song>()
        for (item in missing) {
            val hit = known[item.song.key]
            if (!hit.isNullOrEmpty()) found[item.song.key] = hit
            else needRemote.add(item.song)
        }
        if (needRemote.isNotEmpty()) {
            val batch = needRemote.take(30)
            val remote = runCatching { engine.fetchSongCovers(batch) }.getOrDefault(emptyMap())
            found.putAll(remote)
        }
        if (found.isNotEmpty()) {
            downloads.updateCovers(found)
        }
    }
}

fun AppViewModel.closeDownloads() {
    downloadsOpen = false
    tab = downloadsReturnTab.ifEmpty { "资料库" }
}

// ---- 设置项写入 ----

fun AppViewModel.setResumeOnStartup(value: Boolean) {
    resumeOnStartup = value
    save()
}

fun AppViewModel.setMixWithOthers(value: Boolean) {
    mixWithOthers = value
    com.lxlia.player.audio.PlaybackController.setMixWithOthers(value)
    save()
}

fun AppViewModel.setAllowLandscapeWhenLocked(value: Boolean) {
    allowLandscapeWhenLocked = value
    save()
}

fun AppViewModel.setRefreshAlgoOnDoubleTap(value: Boolean) {
    refreshAlgoOnDoubleTap = value
    save()
}

fun AppViewModel.setStartupAnimation(value: Boolean) {
    startupAnimation = value
    if (!value) intro = false
    save()
}

fun AppViewModel.setStyleName(value: String) {
    styleName = value
    save()
}

fun AppViewModel.setHomePlatform(value: String) {
    homePlatform = value
    save()
}

fun AppViewModel.settingsText(key: String, fallback: String = ""): String =
    (settings[key] as? String) ?: fallback

fun AppViewModel.settingsFlag(key: String, fallback: Boolean = false): Boolean =
    (settings[key] as? Boolean) ?: fallback
