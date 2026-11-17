package com.lxlia.player.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lxlia.player.LxMineApp
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.core.AppData
import com.lxlia.player.lx.CoverColors
import com.lxlia.player.lx.EMPTY_COVER_COLORS
import com.lxlia.player.lx.SearchSource
import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import com.lxlia.player.model.SyncSourcePayload
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class LyricPreferences(
    val colorMode: String = "cover-gradient",
    val primary: String = "#F4D28A",
    val secondary: String = "#8FB2A6",
    val showTranslation: Boolean = true,
    val showRomaji: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("colorMode", colorMode)
        .put("primary", primary)
        .put("secondary", secondary)
        .put("showTranslation", showTranslation)
        .put("showRomaji", showRomaji)

    companion object {
        private val modes = listOf("cover-solid", "cover-gradient", "custom-solid", "custom-gradient")
        private val hex = Regex("^#[0-9a-fA-F]{6}$")

        fun fromJson(value: String?): LyricPreferences {
            if (value.isNullOrBlank()) return LyricPreferences()
            val json = runCatching { JSONObject(value) }.getOrNull() ?: return LyricPreferences()
            return LyricPreferences(
                colorMode = json.optString("colorMode").takeIf { modes.contains(it) } ?: "cover-gradient",
                primary = json.optString("primary").takeIf { hex.matches(it) } ?: "#F4D28A",
                secondary = json.optString("secondary").takeIf { hex.matches(it) } ?: "#8FB2A6",
                showTranslation = json.optBoolean("showTranslation", true),
                showRomaji = json.optBoolean("showRomaji", false),
            )
        }
    }
}

fun lyricPrimary(value: LyricPreferences, cover: CoverColors): String =
    if (value.colorMode.startsWith("custom")) value.primary else cover.first

fun lyricSecondary(value: LyricPreferences, cover: CoverColors): String = when {
    !value.colorMode.endsWith("gradient") -> lyricPrimary(value, cover)
    value.colorMode.startsWith("custom") -> value.secondary
    else -> cover.last
}

fun parseLyricOffset(text: String): Long? {
    val value = text.trim().toDoubleOrNull() ?: return null
    if (!value.isFinite()) return null
    return Math.round(value).coerceIn(-10000L, 10000L)
}

/** 列表输入项：歌曲列表页统一用这个结构渲染（与鸿蒙 SongListInput 同构）。 */
data class SongListInput(val songs: List<Song>, val kind: String)

/**
 * 应用状态与动作，逐项对应鸿蒙 Index.ets。
 * 播放器状态以 PlaybackController 为准，这里只镜像成 Compose 状态。
 */
class AppViewModel(internal val app: LxMineApp) : ViewModel() {
    internal val appDataMutex = Mutex()
    val tabs = listOf("发现", "资料库", "设置")
    val platforms = SearchSource.entries.toList()
    val searchKinds = listOf("歌曲", "歌单", "歌手", "专辑", "歌词", "播客")
    val searchKindIds = listOf("music", "songlist", "artist", "album", "lyric", "podcast")
    val searchSuggestions = listOf("华语流行", "周杰伦", "林俊杰", "邓紫棋", "陈奕迅", "薛之谦", "经典老歌", "纯音乐", "粤语", "轻音乐")

    // ---- 布局 ----
    var tab by mutableStateOf("发现")
    internal var pendingPlaylistImport: String? = null
    var wide by mutableStateOf(false)
    var statusInset by mutableStateOf(0f)
    var bottomInset by mutableStateOf(0f)
    var viewportWidth by mutableStateOf(400)
    var viewportHeight by mutableStateOf(800)
    var landscape by mutableStateOf(false)
    var discoveryCompact by mutableStateOf(false)
    var dockCollapsed by mutableStateOf(false)

    // ---- 搜索 ----
    var searchOpen by mutableStateOf(false)
    var searchMorph by mutableStateOf(0f)
    var keyword by mutableStateOf("")
    var submitted by mutableStateOf("")
    var platform by mutableStateOf(SearchSource.ALL)
    var searchKind by mutableStateOf("music")
    var results by mutableStateOf<List<Song>>(emptyList())
    var entities by mutableStateOf<List<com.lxlia.player.lx.CatalogueEntity>>(emptyList())
    var openedEntity by mutableStateOf<com.lxlia.player.lx.CatalogueEntity?>(null)
    var entitySongs by mutableStateOf<List<Song>>(emptyList())
    var loading by mutableStateOf(false)
    var hasMore by mutableStateOf(false)
    var searchHistory by mutableStateOf<List<String>>(emptyList())
    var searchWasCompact = false
    internal var searchToken by mutableStateOf(0)
    internal var searchProgressAt = 0L

    // ---- 首页 ----
    var homeFeed by mutableStateOf<HomeFeed?>(null)
    var homePlatform by mutableStateOf("wy")
    var homeChipAnchor by mutableStateOf("banner")
    var feedSection by mutableStateOf("")
    var feedSectionLoading by mutableStateOf(false)
    var feedSectionToken = 0
    var feedScrollOffset = 0
    var feedReveal by mutableStateOf(0f)
    var feedClosing by mutableStateOf(false)
    var openedFeedSourceId by mutableStateOf("")
    var openedFeedLoading by mutableStateOf(false)
    var homeAtBottom = false
    internal var homeFeedRefreshing = false
    internal var homeFeedToken = 0
    internal var pendingHomeFeed: HomeFeed? = null
    internal var homeFeedApplyJob: Job? = null
    var lastHomeScrollAt = 0L

    // ---- 歌单库 / 本地音乐 / 下载 ----
    var playlists by mutableStateOf<List<MusicPlaylist>>(emptyList())
    var openedPlaylist by mutableStateOf<MusicPlaylist?>(null)
    var recentSongs by mutableStateOf<List<Song>>(emptyList())
    var localTracks by mutableStateOf<List<Song>>(emptyList())
    var localMusicBusy by mutableStateOf(false)
    var scanOpen by mutableStateOf(false)
    var scanItems by mutableStateOf<List<Pair<String, String>>>(emptyList())
    var downloadsOpen by mutableStateOf(false)
    var downloadItems by mutableStateOf<List<com.lxlia.player.lx.MusicDownload>>(emptyList())
    private var adoptedDownloads: List<String> = emptyList()
    var downloadExportRequest by mutableStateOf(0L)
    var pendingDownloadExportId: String? = null
    var libraryMosaicSeed by mutableStateOf(0)
    var libraryRestoreOffset by mutableStateOf(0)
    var playlistReturnTab = "资料库"
    var playlistReturnFeed = ""
    var playlistReturnFeedOffset = 0
    var playlistReturnHomeOffset = 0

    // ---- 列表工具 ----
    var listSearchOpen by mutableStateOf(false)
    var listQuery by mutableStateOf("")
    var listSortMode by mutableStateOf("added")
    var manualOrder by mutableStateOf<List<String>>(emptyList())
    var orderOpen by mutableStateOf(false)
    var orderSongs by mutableStateOf<List<Song>>(emptyList())

    // ---- 播放 ----
    var selected by mutableStateOf<Song?>(null)
    var queue by mutableStateOf<List<Song>>(emptyList())
    var playing by mutableStateOf(false)
    var foreground by mutableStateOf(true)
    var positionMs by mutableStateOf(0L)
    var duration by mutableStateOf(0L)
    var lyrics by mutableStateOf<List<LyricLine>>(emptyList())
    var translatedLyrics: List<LyricLine> = emptyList()
    var romajiLyrics: List<LyricLine> = emptyList()
    var stageTranslations by mutableStateOf<List<LyricLine>>(emptyList())
    var coverColors by mutableStateOf(EMPTY_COVER_COLORS)
    var resolving by mutableStateOf(false)
    var playbackUrl by mutableStateOf("")
    private var playerShown by mutableStateOf(false)
    var showPlayer: Boolean
        get() = playerShown
        set(value) {
            if (playerShown == value) return
            // Every entry/exit starts a new chrome session. Home must never
            // inherit a hidden dock from the previous immersive player.
            stageControlsVisible = true
            playerShown = value
        }
    var playerReveal by mutableStateOf(0f)
    var stageControlsVisible by mutableStateOf(true)
    var commentsOpen by mutableStateOf(false)
    var lyricOffset by mutableStateOf(0L)
    var lyricPrefs by mutableStateOf(LyricPreferences())
    internal var playToken = 0
    private var lastPositionUiAt = 0L
    var livePositionMs = 0L
    private var lastPlaybackSave = 0L
    private var lastPlaybackDiskSave = 0L
    private var snapshotSong: Song? = null
    private var snapshotQueue: List<Song>? = null
    private var snapshotSongJson = ""
    private var snapshotQueueJson = ""
    var pendingPlayback: PlaybackSnapshot? = null
    var intro by mutableStateOf(true)
    var introFinished = false
    var addToPlaylistSong by mutableStateOf<Song?>(null)
    var pendingFilePickForSource = true
    var filePickRequest by mutableStateOf(0L)
    var audioPickRequest by mutableStateOf(0L)
    var scanRequest by mutableStateOf(0)
    var addToPlaylistChoices by mutableStateOf<List<MusicPlaylist>>(emptyList())
    var lastDiskSaveAt = 0L

    // ---- 音源/设置/同步 ----
    var sources by mutableStateOf<List<SyncSourcePayload>>(emptyList())
    var activeId by mutableStateOf("")
    var sourceReady by mutableStateOf(false)
    var quality by mutableStateOf("128k")
    private var styleValue by mutableStateOf("mine-0")
    var styleName: String
        get() = styleValue
        set(value) {
            dynamicStageFailed = false
            if (styleValue == "off" && value != "off") dynamicStageReady = false
            styleValue = value
            if (value != "off") dynamicStyle = value
        }
    var appearance by mutableStateOf("system")
    var stageMounted by mutableStateOf(false)
    var dynamicStageMounted by mutableStateOf(false)
    var plainStageMounted by mutableStateOf(false)
    var dynamicStageReady by mutableStateOf(false)
    var dynamicStageFailed by mutableStateOf(false)
    var dynamicStyle by mutableStateOf("mine-0")
    var mode by mutableStateOf("列表循环")
    var settingsPanel by mutableStateOf("main")
    var sourcesOpen by mutableStateOf(false)
    var sourcesReveal by mutableStateOf(1f)
    var sourcesClosing by mutableStateOf(false)
    var startupAnimation by mutableStateOf(true)
    var resumeOnStartup by mutableStateOf(false)
    var settings: MutableMap<String, Any> = mutableMapOf()
    var storeReady = false
    var hostReady = false

    // ---- 提示与弹层 ----
    var message by mutableStateOf("")
    var toastMessage by mutableStateOf("")
    var error by mutableStateOf("")
    var showSheet by mutableStateOf(false)
    var sheet by mutableStateOf("")
    var draft by mutableStateOf("")
    var sourceImportReport by mutableStateOf("")
    var busy by mutableStateOf(false)

    var deviceId = ""
    var deviceName = "Android"
    var lanSsid by mutableStateOf("")
    var devices by mutableStateOf<List<com.lxlia.player.lx.LanDevice>>(emptyList())
    var incoming by mutableStateOf<com.lxlia.player.lx.SyncIncoming?>(null)
    var applying by mutableStateOf(false)
    var pendingDeletePlaylist by mutableStateOf<MusicPlaylist?>(null)
    var pendingRemoveSource by mutableStateOf<SyncSourcePayload?>(null)
    var carAvailable = false
    var carConnected = false
    var carDetail = ""

    val localMusic get() = app.localMusic
    val downloads get() = app.downloads
    val engine get() = app.engine
    val host get() = app.host
    val store get() = app.store
    internal var lanDiscovery: com.lxlia.player.lx.LanDiscovery? = null
    internal var lanSyncServer: com.lxlia.player.lx.LanSyncServer? = null
    private var pollJob: Job? = null
    private var messageJob: Job? = null

    init {
        PlaybackController.onState = { state -> handlePlaybackState(state) }
        PlaybackController.onTime = { time -> handlePlaybackTime(time) }
        PlaybackController.onError = { detail ->
            error = detail
            resolving = false
        }
        PlaybackController.onSourceReady = { song, url ->
            if (selected?.key == song.key) {
                playbackUrl = url
                resolving = false
                loadLyricsFor(selected ?: song)
                loadCoverColors(selected ?: song)
            }
        }
        PlaybackController.onSongChanged = { song ->
            if (song.key != selected?.key) {
                selected = song
                playbackUrl = ""
                resolving = true
                coverColors = EMPTY_COLORS()
                loadCoverColors(song)
            }
            syncPlaybackState()
        }
        localMusic.onChange = { songs ->
            localTracks = songs
            val opened = openedPlaylist
            if (opened?.kind == "local") {
                openedPlaylist = opened.copy(songs = songs, songIds = songs.map { it.key }, updatedAt = System.currentTimeMillis())
            }
        }
        localMusic.onError = { error = it }
        downloads.onError = { detail ->
            error = detail
            notify(detail, 3000)
        }
        downloads.onChange = { items ->
            for (item in items) {
                val previous = downloadItems.firstOrNull { it.id == item.id }
                if (item.state == "complete" && previous != null && previous.state != "complete") {
                    notify("下载完成：${item.song.name}", 3000)
                }
            }
            downloadItems = items
            val completed = items.filter { it.state == "complete" }.map { com.lxlia.player.lx.DownloadTrack(it.song, it.path) }
            val signature = completed.map { it.path }
            if (completed.isNotEmpty() && signature != adoptedDownloads) {
                adoptedDownloads = signature
                localMusic.adoptDownloads(completed)
                localTracks = localMusic.songs()
            }
        }
        downloadItems = downloads.items()
        localTracks = localMusic.songs()
        viewModelScope.launch { initialize() }
    }

    private fun EMPTY_COLORS() = EMPTY_COVER_COLORS

    private fun handlePlaybackState(state: String) {
        playing = state == "playing"
        duration = PlaybackController.durationMs
        if (state == "playing") {
            selected?.let { song ->
                recentSongs = listOf(song) + recentSongs.filter { it.key != song.key }
                store.saveRecentSongs(Song.listToJson(recentSongs))
            }
        }
        if (state == "playing" || state == "paused") savePlayback(true)
        syncPlaybackState()
    }

    private fun handlePlaybackTime(time: Long) {
        livePositionMs = time
        val now = System.currentTimeMillis()
        if (now - lastPositionUiAt >= if (showPlayer) 200 else 1000) {
            lastPositionUiAt = now
            positionMs = time
        }
        val current = PlaybackController.durationMs
        if (current != duration) duration = current
        if (now - lastPlaybackSave > 5000) savePlayback()
    }

    internal fun syncPlaybackState() {
        queue = PlaybackController.queue
        playing = PlaybackController.playing
        mode = PlaybackController.mode
        selected = PlaybackController.current ?: selected
        playbackUrl = PlaybackController.currentUrl
        if (playbackUrl.isNotEmpty()) resolving = false
    }

    // ---- 初始化 ----

    private suspend fun initialize() {
        deviceId = store.loadDeviceId()
        deviceName = android.os.Build.MODEL ?: "Android"
        val server = com.lxlia.player.lx.LanSyncServer()
        lanSyncServer = server
        server.setIdentity(deviceId, deviceName)
        val pullReceiver = com.lxlia.player.lx.LanPullReceiver(deviceId, server)
        lanDiscovery = com.lxlia.player.lx.LanDiscovery(deviceId, deviceName)
        lanDiscovery?.pullRequests = { lanSyncServer?.pullRequests() ?: org.json.JSONArray() }
        lanDiscovery?.onDevices = { list ->
            viewModelScope.launch { devices = list }
            list.forEach { device -> device.pullRequests.forEach { requestId ->
                viewModelScope.launch(Dispatchers.IO) {
                    runCatching { pullReceiver.receive(device, requestId) }
                        .onFailure { withContext(Dispatchers.Main) { message = "同步接收失败：${it.message}" } }
                }
            } }
        }
        runCatching {
            withContext(Dispatchers.IO) {
                val port = lanSyncServer?.start() ?: 0
                lanDiscovery?.port = port
                lanDiscovery?.start(app)
            }
        }.onFailure { message = "局域网同步启动失败：${it.message}" }
        lanSsid = lanDiscovery?.ssid ?: ""
        pollJob = viewModelScope.launch {
            while (true) {
                delay(300)
                if (!applying) {
                    val request = lanSyncServer?.pollIncoming()
                    if (request?.id != incoming?.id) {
                        incoming = request
                    }
                }
            }
        }

        val data = store.loadAppData()
        settings = parseSettings(data.settingsJson)
        // 深链或接续已经设置了待播快照时，磁盘里的旧快照不能覆盖它。
        if (pendingPlayback == null) store.loadPlaybackSnapshot().takeIf { it.isNotEmpty() }?.let { json ->
            runCatching {
                val snapshot = PlaybackSnapshot.fromJson(JSONObject(json))
                if (snapshot != null) {
                    pendingPlayback = snapshot
                    selected = snapshot.song
                    queue = snapshot.queue
                    positionMs = snapshot.positionMs
                    livePositionMs = snapshot.positionMs
                    duration = snapshot.song.durationMs
                    loadCoverColors(snapshot.song)
                }
            }
        }
        restoreSettings()

        // 播放服务比 Activity 活得久：从通知/桌面重新进来时以控制器为准，
        // 否则底栏会回到旧快照，播放键还会把正在响的歌误判成暂停。
        if (PlaybackController.current != null) {
            pendingPlayback = null
            syncPlaybackState()
            positionMs = PlaybackController.positionMs
            livePositionMs = positionMs
            duration = PlaybackController.durationMs.coerceAtLeast(selected?.durationMs ?: 0)
            playing = PlaybackController.playing
        }
        // 先渲染上次的首页快照，网络刷新在后台替换，避免冷启动长时间空白。
        store.loadHomeCache("all").takeIf { it.isNotEmpty() }?.let { cached ->
            val parsed = HomeFeed.fromJson(cached)
            if (parsed != null && parsed.charts.firstOrNull()?.parts?.isNotEmpty() == true) homeFeed = parsed
        }
        playlists = parsePlaylists(data.playlistsJson).ifEmpty { listOf(createPlaylist("我喜欢的", true)) }
        sources = uniqueSyncSources(SyncSourcePayload.listFromJson(data.sourcesJson))
        recentSongs = Song.listFromJson(store.loadRecentSongs())
        if (sources.isEmpty() && data.sourceScript.isNotEmpty()) {
            sources = listOf(engine.sourceFromScript(data.sourceScript))
        }
        var restoredActiveId = data.activeSourceId
        val privateHash = com.lxlia.player.BuildConfig.PRIVATE_TEST_SOURCES_SHA256
        if (privateHash.isNotEmpty() && settings[com.lxlia.player.core.PrivateTestSources.SEEDED_SETTING] != privateHash) {
            val personal = withContext(Dispatchers.IO) { com.lxlia.player.core.PrivateTestSources.read(app) }
            if (personal != null) {
                // Add missing sources once, preserving imported sources, the active
                // selection and all playlists/settings when installing an update.
                val hadSources = sources.isNotEmpty()
                val existingIds = sources.map { it.id }.toSet()
                sources = uniqueSyncSources(sources + personal.sources.filterNot { it.id in existingIds })
                if (!hadSources && restoredActiveId.isEmpty()) restoredActiveId = personal.activeId
                settings[com.lxlia.player.core.PrivateTestSources.SEEDED_SETTING] = privateHash
            }
        }
        engine.restore(sources, restoredActiveId.ifEmpty { sources.firstOrNull()?.id.orEmpty() }, quality)
        engine.onSourcesChanged = {
            sources = engine.sources
            activeId = engine.activeId
            sourceReady = engine.ready
        }
        engine.onPersist = { save() }
        engine.onMessage = { notify(it, 2500) }
        engine.onError = { error = it }
        sourceReady = engine.ready
        activeId = engine.activeId
        storeReady = true
        save()
        restorePlaybackIfReady()
    }

    internal var backGuardUntil = 0L

    private fun parseSettings(json: String): MutableMap<String, Any> {
        val map = mutableMapOf<String, Any>()
        runCatching {
            val objectJson = JSONObject(json)
            objectJson.keys().forEach { key -> map[key] = objectJson.get(key) }
        }
        return map
    }

    internal fun restoreSettings() {
        lyricPrefs = LyricPreferences.fromJson(settings["lxmine_lyrics"] as? String ?: runCatching {
            (settings["lxmine_lyrics"] as? JSONObject)?.toString()
        }.getOrNull())
        settings["lxmine_lyrics"] = lyricPrefs.toJson().toString()
        updateStageTranslations()
        resumeOnStartup = settings["lxmine_resume_on_startup"] == true
        appearance = (settings["lxmine_appearance"] as? String)?.takeIf { it in listOf("dark", "light", "system") } ?: "system"
        startupAnimation = settings["lxlia_startup_animation"] != false
        if (!startupAnimation) intro = false
        (settings["lxlia_search_history"] as? JSONArray)?.let { array ->
            val list = mutableListOf<String>()
            for (index in 0 until array.length()) array.optString(index).takeIf { it.isNotEmpty() }?.let(list::add)
            searchHistory = list.take(10)
        }
        (settings["lxlia_audio_quality"] as? String)?.takeIf { it in listOf("128k", "320k", "flac") }?.let { quality = it }
        (settings["lxlia_native_style"] as? String)?.takeIf { com.lxlia.player.model.MINE_RADIO_MODES.any { mode -> mode.id == it } }?.let { styleName = it }
        (settings["lxlia_play_mode"] as? String)?.takeIf { it in PlaybackController.modeValues }?.let {
            mode = it
            PlaybackController.setMode(it)
        }
        (settings["lxmine_home_platform"] as? String)?.takeIf { it in listOf("wy", "tx", "kw", "kg") }?.let { homePlatform = it }
        (settings["lxlia_lyric_offset"] as? Number)?.toLong()?.let { lyricOffset = it.coerceIn(-10000, 10000) }
        // 歌单库拼贴只随机一次：种子落设置，之后每次启动复用同一排列。
        (settings["lxmine_mosaic_seed"] as? Number)?.toLong()?.takeIf { it > 0 }?.let { libraryMosaicSeed = it.toInt() }
        if (libraryMosaicSeed == 0) {
            libraryMosaicSeed = (1..Int.MAX_VALUE - 1).random()
            settings["lxmine_mosaic_seed"] = libraryMosaicSeed
            if (storeReady) save()
        }
        PlaybackController.setLyricOffset(lyricOffset)
    }

    internal suspend fun persist() = appDataMutex.withLock {
        settings["lxmine_lyrics"] = lyricPrefs.toJson().toString()
        settings["lxmine_resume_on_startup"] = resumeOnStartup
        settings["lxmine_home_platform"] = homePlatform
        settings["lxlia_startup_animation"] = startupAnimation
        settings["lxlia_audio_quality"] = quality
        settings["lxlia_native_style"] = styleName
        settings["lxmine_appearance"] = appearance
        settings["lxlia_play_mode"] = mode
        settings["lxlia_lyric_offset"] = lyricOffset
        val sourcesSnapshot = sources.toList()
        val activeSnapshot = activeId
        val settingsSnapshot = settings.toMap()
        val playlistsSnapshot = playlists.toList()
        try {
            withContext(Dispatchers.IO) {
                val data = AppData(
                    sourceScript = sourcesSnapshot.firstOrNull { it.id == activeSnapshot }?.script.orEmpty(),
                    sourcesJson = SyncSourcePayload.listToJson(sourcesSnapshot),
                    activeSourceId = activeSnapshot,
                    settingsJson = JSONObject(settingsSnapshot).toString(),
                    playlistsJson = MusicPlaylist.listToJson(playlistsSnapshot),
                )
                store.saveAppData(data)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (exception: Exception) {
            error = "保存失败：${exception.message}"
        }
    }

    fun save() {
        viewModelScope.launch { persist() }
    }

    // ---- 导航 ----

    fun configureViewport(width: Int, height: Int, topInset: Float, bottomInsetValue: Float) {
        viewportWidth = width
        viewportHeight = height
        statusInset = topInset
        bottomInset = bottomInsetValue
        wide = width >= 700
        val nextLandscape = width > height
        if (nextLandscape != landscape) landscape = nextLandscape
        syncStageControls()
        if (height < 500) searchMorph = 1f else if (!discoveryCompact) searchMorph = 0f
    }

    fun headerHeight(): Float {
        val base = if (tab == "发现" && !compactHeader()) (if (searchOpen) 190f else 148f) else 82f
        return base + statusInset
    }

    fun compactHeader(): Boolean = discoveryCompact || viewportHeight < 500

    fun primaryTitle(): String = when (tab) {
        "发现" -> "LxMine"
        "资料库" -> "歌单库"
        else -> "设置"
    }

    fun headerSubtitle(): String = if (tab == "资料库") "${playlists.size} 个歌单" else ""

    fun secondaryHeader(): Boolean = openedPlaylist != null || downloadsOpen || settingsPanel != "main" || sourcesOpen || (tab == "发现" && searchOpen)

    fun secondaryTitle(): String = when {
        openedPlaylist != null -> openedPlaylist?.name.orEmpty()
        downloadsOpen -> "下载"
        sourcesOpen -> "音源"
        settingsPanel == "lyrics" -> "歌词设置"
        settingsPanel == "sync" -> "局域网同步"
        tab == "发现" && searchOpen -> openedEntity?.name ?: "搜索"
        else -> "LxMine"
    }

    fun secondarySubtitle(): String = when {
        openedPlaylist != null -> {
            val list = openedPlaylist!!
            if (openedFeedLoading && list.songs.isEmpty()) "" else "${list.songs.size} 首歌曲"
        }
        downloadsOpen -> if (downloadItems.isNotEmpty()) "${downloadItems.size} 个下载" else ""
        sourcesOpen -> "${sources.size} 个音源"
        tab == "发现" && searchOpen && openedEntity == null -> "公共音乐检索"
        else -> ""
    }

    fun secondaryBackLabel(): String = when {
        downloadsOpen -> "返回歌单库"
        sourcesOpen || settingsPanel != "main" -> "返回设置"
        tab == "发现" && searchOpen -> "返回首页"
        else -> "返回"
    }

    fun secondaryBack(): () -> Unit = when {
        downloadsOpen -> ({ downloadsOpen = false })
        sourcesOpen -> ({ closeSources() })
        settingsPanel != "main" -> ({ openSettingsPanel("main") })
        tab == "发现" && searchOpen -> ({
            if (openedEntity != null) openedEntity = null else closeSearch()
        })
        openedPlaylist != null -> ({ closeOpenedPlaylist() })
        else -> ({ })
    }

    fun secondaryDock(): Boolean = settingsPanel != "main" ||
        (feedSection.isNotEmpty() && !feedClosing) || openedPlaylist != null || downloadsOpen || (sourcesOpen && !sourcesClosing)

    fun navigateTab(target: String) {
        if (searchOpen) {
            searchToken++
            loading = false
        }
        settingsPanel = "main"
        tab = target
        openedPlaylist = null
        openedFeedSourceId = ""
        downloadsOpen = false
        sourcesOpen = false
        sourcesClosing = false
        searchOpen = false
        feedSection = ""
        error = ""
        discoveryCompact = (primaryScrollOffsets[target] ?: 0f) > 56f
        searchMorph = if (discoveryCompact || viewportHeight < 500) 1f else 0f
        lastScrollOffset = -1f
        scrollTravel = 0f
    }

    // 底部播控一栏/两栏：由滑动方向累计决定（与鸿蒙 homeScroll 一致）。
    private var lastScrollOffset = -1f
    private val primaryScrollOffsets = mutableMapOf<String, Float>()
    private var scrollTravel = 0f
    private var suppressScrollUntil = 0L
    private var maxScrollSeen = 0f

    fun homeScroll(offset: Float, canTrackDock: Boolean = true) {
        if (!searchOpen && feedSection.isEmpty() && openedPlaylist == null && !downloadsOpen &&
            !sourcesOpen && settingsPanel == "main"
        ) {
            primaryScrollOffsets[tab] = offset
        }
        if (tab == "发现" && !searchOpen && feedSection.isEmpty() && openedPlaylist == null) lastHomeScrollAt = System.currentTimeMillis()
        if (searchOpen) return
        // Header geometry follows the current scroll position even when dock
        // direction tracking is suppressed or the final frame has stopped moving.
        var headerChanged = false
        if (tab == "发现" && feedSection.isEmpty() && openedPlaylist == null) {
            val next = offset > 56f || (offset > 4f && discoveryCompact)
            headerChanged = next != discoveryCompact
            discoveryCompact = next
            searchMorph = if (next || viewportHeight < 500) 1f else 0f
        }
        if (System.currentTimeMillis() < suppressScrollUntil) {
            lastScrollOffset = offset
            return
        }
        if (offset > maxScrollSeen + 2) maxScrollSeen = offset
        if (offset < maxScrollSeen - 90) homeAtBottom = false
        if (!canTrackDock) {
            lastScrollOffset = offset
            scrollTravel = 0f
            return
        }
        val atBottom = homeAtBottom && tab == "发现"
        val previous = lastScrollOffset
        lastScrollOffset = offset
        if (previous < 0) return
        val delta = (offset - previous).coerceIn(-60f, 60f)
        if (kotlin.math.abs(delta) < 0.5f) return
        if (scrollTravel != 0f && (delta > 0) != (scrollTravel > 0)) scrollTravel = 0f
        scrollTravel += delta
        var dock = dockCollapsed
        if (offset <= 4) {
            dock = false
            scrollTravel = 0f
        } else if (scrollTravel > 44) dock = true
        else if (scrollTravel < -44 && !atBottom) dock = false
        if (atBottom) scrollTravel = minOf(scrollTravel, 0f)
        if (dock != dockCollapsed) {
            dockCollapsed = dock
            chipAnchorHoldUntil = System.currentTimeMillis() + 700
        }
        if (headerChanged) {
            suppressScrollUntil = System.currentTimeMillis() + 400
            lastScrollOffset = offset
            scrollTravel = 0f
        }
    }

    var chipAnchorHoldUntil = 0L

    fun expandDock() {
        dockCollapsed = false
        scrollTravel = 0f
        lastScrollOffset = -1f
        suppressScrollUntil = System.currentTimeMillis() + 600
    }

    fun onHomeChip(anchor: String) {
        homeChipAnchor = anchor
        chipAnchorHoldUntil = System.currentTimeMillis() + 800
    }

    /** 首页板块锚点偏移（首页列表记录）与胶囊点击后的滚动请求。 */
    internal val anchorOffsets = mutableMapOf<String, Float>()
    var scrollRequest by mutableStateOf<String?>(null)

    fun storeAnchorOffset(anchor: String, y: Float) {
        anchorOffsets[anchor] = y
    }

    fun requestScrollToAnchor(anchor: String) {
        scrollRequest = anchor
    }

    /**
     * 胶囊高亮：取最后一个滚过胶囊栏下沿的板块；页底强制“分类”
     * （与鸿蒙 300ms 几何轮询等价的实现）。
     */
    fun updateChipAnchorFromScroll(offset: Float) {
        if (System.currentTimeMillis() < chipAnchorHoldUntil) return
        val line = headerHeight() + 150f
        val ordered = listOf("banner", "newSongs", "playlists", "charts", "hot", "category")
        var active = "banner"
        for (anchor in ordered) {
            val y = anchorOffsets[anchor] ?: continue
            if (y - offset <= line) active = anchor else break
        }
        if (homeAtBottom) active = "category"
        if (active != homeChipAnchor) homeChipAnchor = active
    }

    fun openSearch() {
        if (searchOpen) return
        resetListTools()
        searchWasCompact = compactHeader()
        feedSection = ""
        keyword = ""
        submitted = ""
        results = emptyList()
        entities = emptyList()
        openedEntity = null
        loading = false
        searchOpen = true
        discoveryCompact = false
        searchMorph = 0f
    }

    fun closeSearch() {
        searchOpen = false
        // 让仍在路上的搜索请求作废，避免关掉搜索页后旧结果又把它填满。
        searchToken++
        loading = false
        discoveryCompact = searchWasCompact
        searchMorph = if (searchWasCompact || viewportHeight < 500) 1f else 0f
    }

    fun openSettingsPanel(panel: String) {
        settingsPanel = panel
    }

    fun syncStageControls() {
        if (!showPlayer && !stageControlsVisible) stageControlsVisible = true
    }

    fun toggleStageControls(show: Boolean) {
        if (!showPlayer) return
        stageControlsVisible = show
    }

    fun notify(text: String, durationMs: Int = 2500) {
        if (!foreground) return
        toastMessage = text
        messageJob?.cancel()
        messageJob = viewModelScope.launch {
            kotlinx.coroutines.delay(durationMs.toLong().coerceAtLeast(800))
            if (toastMessage == text) toastMessage = ""
        }
    }

    fun onClearedApp() {
        pollJob?.cancel()
        lanDiscovery?.stop()
        lanSyncServer?.stop()
    }

    override fun onCleared() {
        onClearedApp()
        super.onCleared()
    }

    companion object {
        fun create(app: LxMineApp): AppViewModel = AppViewModel(app)
    }
}

/** 接续/持久化的播放快照（显式接续时 explicit = true）。 */
data class PlaybackSnapshot(
    val song: Song,
    val queue: List<Song>,
    val positionMs: Long,
    val playing: Boolean,
    val explicit: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("song", song.toJson())
        .put("queue", JSONArray().apply { queue.forEach { put(it.toJson()) } })
        .put("positionMs", positionMs)
        .put("playing", playing)
        .put("explicit", explicit)

    companion object {
        fun fromJson(json: JSONObject?): PlaybackSnapshot? {
            if (json == null) return null
            val song = Song.fromJson(json.optJSONObject("song")) ?: return null
            val queue = mutableListOf<Song>()
            json.optJSONArray("queue")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(queue::add)
            }
            val position = json.optLong("positionMs")
            if (!json.has("positionMs")) return null
            return PlaybackSnapshot(song, queue, position, json.optBoolean("playing"), json.optBoolean("explicit"))
        }
    }
}

fun createPlaylist(name: String, favorite: Boolean = false): MusicPlaylist = MusicPlaylist(
    id = "lx-${System.currentTimeMillis()}-${(0..1_000_000).random().toString(36)}",
    name = name,
    kind = "lx",
    createdAt = System.currentTimeMillis(),
    updatedAt = System.currentTimeMillis(),
    isFavorite = favorite,
)

fun playlistWithSong(playlist: MusicPlaylist, song: Song, remove: Boolean = false): MusicPlaylist {
    val songs = playlist.songs.filter { it.key != song.key }.toMutableList()
    if (!remove) songs.add(song)
    return playlist.copy(
        songs = songs,
        songIds = songs.map { it.key },
        updatedAt = System.currentTimeMillis(),
    )
}

fun parsePlaylists(json: String): List<MusicPlaylist> = MusicPlaylist.listFromJson(json)

fun uniqueSyncSources(sources: List<SyncSourcePayload>): List<SyncSourcePayload> {
    val seen = mutableSetOf<String>()
    return sources.filter { source ->
        val key = "${source.name}:${source.script.hashCode()}"
        seen.add(key)
    }
}

fun songKey(song: Song): String = song.key
