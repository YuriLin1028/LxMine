package com.lxlia.player.ui

import android.net.Uri
import androidx.lifecycle.viewModelScope
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ---- 歌单库、本地音乐、下载、列表工具：对应鸿蒙 Index.ets 同名动作 ----

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
fun AppViewModel.arrangedSongs(songs: List<Song>): List<Song> =
    orderSongList(songs, listSortMode, manualOrder, listQuery)

fun AppViewModel.openManualOrder() {
    openManualOrderFor(arrangedSongs(listBaseSongs()))
}

fun AppViewModel.openManualOrderFor(songs: List<Song>) {
    orderSongs = songs
    orderOpen = true
}

fun AppViewModel.applyManualOrder(keys: List<String>) {
    manualOrder = keys
    listSortMode = "manual"
    orderOpen = false
    notify("已按手动排列显示", 1500)
}

fun AppViewModel.setListSort(mode: String) {
    listSortMode = mode
}

/** 打开歌单库里的歌单：记录返回位置，切到资料库标签。 */
fun AppViewModel.openPlaylist(list: MusicPlaylist) {
    resetListTools()
    playlistReturnTab = "资料库"
    playlistReturnFeed = ""
    openedPlaylist = list
    tab = "资料库"
    discoveryCompact = false
}

fun AppViewModel.openLocalPlaylist() {
    resetListTools()
    playlistReturnTab = "资料库"
    playlistReturnFeed = ""
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

/** 从首页/板块打开一个歌单库歌单，并记录返回来源页。 */
fun AppViewModel.openLibraryPlaylist(list: MusicPlaylist, returnTab: String, returnFeed: String) {
    resetListTools()
    playlistReturnTab = returnTab
    playlistReturnFeed = returnFeed
    playlistReturnFeedOffset = 0
    playlistReturnHomeOffset = 0
    openedPlaylist = list
    tab = "资料库"
    feedSection = ""
    discoveryCompact = false
}

fun AppViewModel.closeOpenedPlaylist() {
    val returnTab = playlistReturnTab
    val returnFeed = playlistReturnFeed
    openedPlaylist = null
    openedFeedSourceId = ""
    playlistReturnFeed = ""
    if (returnFeed.isNotEmpty()) {
        tab = returnTab.ifEmpty { "发现" }
        feedSection = returnFeed
        feedClosing = false
        feedReveal = 1f
        discoveryCompact = false
        return
    }
    if (returnTab.isNotEmpty()) tab = returnTab
}

/** 删除歌单只对「歌单库里真实存在的自建/导入歌单」开放。 */
fun AppViewModel.canDeleteOpenedPlaylist(): Boolean {
    val list = openedPlaylist ?: return false
    if (list.isFavorite || list.kind != "lx") return false
    return playlists.any { it.id == list.id }
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

fun AppViewModel.openDownloads() {
    settingsPanel = "main"
    tab = "资料库"
    downloadsOpen = true
    openedPlaylist = null
}

// ---- 设置项写入 ----

fun AppViewModel.setResumeOnStartup(value: Boolean) {
    resumeOnStartup = value
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
