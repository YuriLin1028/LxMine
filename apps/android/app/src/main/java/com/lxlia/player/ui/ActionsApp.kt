package com.lxlia.player.ui

import androidx.lifecycle.viewModelScope
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.lx.LanDiscovery
import com.lxlia.player.lx.LanSyncClient
import com.lxlia.player.lx.LanDevice
import com.lxlia.player.lx.mergeSyncedPlaylists
import com.lxlia.player.model.SyncSourcePayload
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

// ---- 应用级生命周期、音源装配、深链、同步 ----

/** WebView 页面就绪（LX 运行时）：恢复当前音源并刷新首页。 */
fun AppViewModel.onHostReady() {
    viewModelScope.launch {
        if (engine.sources.isEmpty()) engine.setSources(sources, activeId)
        if (engine.sources.isNotEmpty()) runCatching { engine.restoreSource() }
        sourceReady = engine.ready
        activeId = engine.activeId
        sources = engine.sources
        consumeSharedPlaylist()
        restorePlaybackIfReady()
        hydrateLibraryPlaylistCovers()
        refreshHomeFeed()
    }
}

fun AppViewModel.handleSharedText(text: String) {
    val link = Regex("https?://[^\\s<>\"]+", RegexOption.IGNORE_CASE).find(text)?.value
    val host = runCatching { android.net.Uri.parse(link).host?.lowercase().orEmpty() }.getOrDefault("")
    val supported = listOf("music.163.com", "163cn.tv", "163cn.link", "y.qq.com", "url.cn", "kuwo.cn", "kugou.com", "qishui.com", "qishui.douyin.com", "music.douyin.com")
    if (supported.any { host == it || host.endsWith(".$it") }) {
        pendingPlaylistImport = text.trim()
        consumeSharedPlaylist()
    } else {
        keyword = text.trim()
        openSearch()
    }
}

internal fun AppViewModel.consumeSharedPlaylist() {
    if (!hostReady || busy) return
    val text = pendingPlaylistImport ?: return
    pendingPlaylistImport = null
    openSheet("导入歌单")
    draft = text
    submitSheet()
}

fun AppViewModel.onForeground() {
    foreground = true
    com.lxlia.player.audio.DesktopLyricsOverlay.updateAppVisibility(foreground = true, showPlayer = showPlayer)
    lanDiscoveryRestart()
}

fun AppViewModel.onBackground() {
    foreground = false
    com.lxlia.player.audio.DesktopLyricsOverlay.updateAppVisibility(foreground = false, showPlayer = showPlayer)
    savePlayback(true)
}

fun AppViewModel.desktopPreviewPrimary(): String =
    if (mobileDesktopLyricColorMode.startsWith("custom")) mobileDesktopLyricColor else coverColors.first

fun AppViewModel.desktopPreviewSecondary(): String = when {
    !mobileDesktopLyricColorMode.endsWith("gradient") -> desktopPreviewPrimary()
    mobileDesktopLyricColorMode.startsWith("custom") -> mobileDesktopLyricColor2
    else -> coverColors.last
}

fun AppViewModel.syncDesktopLyricsOverlay() {
    com.lxlia.player.audio.DesktopLyricsOverlay.updateAppVisibility(foreground = foreground, showPlayer = showPlayer)
    com.lxlia.player.audio.DesktopLyricsOverlay.updateConfig(
        app,
        com.lxlia.player.audio.DesktopLyricsConfig(
            enabled = mobileDesktopLyricsEnabled,
            locked = mobileDesktopLyricsLocked,
            fontScale = mobileDesktopLyricScale,
            lineCount = mobileDesktopLyricLines,
            colorMode = mobileDesktopLyricColorMode,
            primaryHex = desktopPreviewPrimary(),
            secondaryHex = desktopPreviewSecondary(),
            xFraction = mobileDesktopLyricX,
            yFraction = mobileDesktopLyricY,
            widthFraction = mobileDesktopLyricWidth,
        ),
    )
    com.lxlia.player.audio.DesktopLyricsOverlay.updatePlayback(selected, playing, PlaybackController.livePositionMs())
    com.lxlia.player.audio.DesktopLyricsOverlay.updateLyrics(lyrics, stageTranslations, lyricOffset)
}

fun AppViewModel.setMobileDesktopLyricsEnabled(enabled: Boolean) {
    if (enabled) {
        if (!com.lxlia.player.audio.DesktopLyricsOverlay.canDrawOverlays(app)) {
            pendingEnableDesktopLyrics = true
            overlayPermissionPromptOpen = true
            return
        }
        mobileDesktopLyricsEnabled = true
        save()
        syncDesktopLyricsOverlay()
        notify("桌面歌词已开启（支持全屏自由拖动、双指缩放及点按调大小）", 2400)
    } else {
        pendingEnableDesktopLyrics = false
        mobileDesktopLyricsEnabled = false
        save()
        syncDesktopLyricsOverlay()
        notify("桌面歌词已关闭", 1600)
    }
}

fun AppViewModel.onOverlayPermissionReturn() {
    if (!pendingEnableDesktopLyrics) return
    pendingEnableDesktopLyrics = false
    overlayPermissionPromptOpen = false
    if (com.lxlia.player.audio.DesktopLyricsOverlay.canDrawOverlays(app)) {
        mobileDesktopLyricsEnabled = true
        save()
        syncDesktopLyricsOverlay()
        notify("悬浮窗权限已授权，桌面歌词已开启", 2000)
    }
}

fun AppViewModel.openOverlayPermissionSettings() {
    overlayPermissionPromptOpen = false
    val intent = android.content.Intent(
        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        android.net.Uri.parse("package:${app.packageName}"),
    ).apply {
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { app.startActivity(intent) }
        .onFailure { notify("无法打开系统悬浮窗设置，请前往系统设置手动开启", 2800) }
}

fun AppViewModel.setMobileDesktopLyricsLocked(locked: Boolean) {
    mobileDesktopLyricsLocked = locked
    save()
    syncDesktopLyricsOverlay()
    notify(if (locked) "已锁定桌面歌词（触摸穿透）" else "已解锁桌面歌词", 1600)
}

fun AppViewModel.setMobileDesktopLyricScale(value: Float) {
    mobileDesktopLyricScale = value.coerceIn(
        com.lxlia.player.audio.DesktopLyricsOverlay.MIN_FONT_SCALE,
        com.lxlia.player.audio.DesktopLyricsOverlay.MAX_FONT_SCALE,
    )
    scheduleSave()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricWidth(value: Float) {
    val cleanW = value.coerceIn(
        com.lxlia.player.audio.DesktopLyricsOverlay.MIN_WIDTH_FRACTION,
        com.lxlia.player.audio.DesktopLyricsOverlay.MAX_WIDTH_FRACTION,
    )
    mobileDesktopLyricWidth = cleanW
    val maxXFrac = (1f - cleanW + 0.08f).coerceAtLeast(0.08f)
    mobileDesktopLyricX = mobileDesktopLyricX.coerceIn(
        com.lxlia.player.audio.DesktopLyricsOverlay.MIN_X_FRACTION,
        maxXFrac,
    )
    scheduleSave()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricY(value: Float) {
    mobileDesktopLyricY = value.coerceIn(
        com.lxlia.player.audio.DesktopLyricsOverlay.MIN_Y_FRACTION,
        com.lxlia.player.audio.DesktopLyricsOverlay.MAX_Y_FRACTION,
    )
    scheduleSave()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricLines(lines: Int) {
    mobileDesktopLyricLines = if (lines >= 2) 2 else 1
    save()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricColorMode(mode: String) {
    if (mode !in setOf("cover-solid", "cover-gradient", "custom-solid", "custom-gradient")) return
    mobileDesktopLyricColorMode = mode
    save()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricColor(hex: String) {
    if (!Regex("^#[0-9a-fA-F]{6}$").matches(hex)) return
    mobileDesktopLyricColor = hex
    save()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.setMobileDesktopLyricColor2(hex: String) {
    if (!Regex("^#[0-9a-fA-F]{6}$").matches(hex)) return
    mobileDesktopLyricColor2 = hex
    save()
    syncDesktopLyricsOverlay()
}

fun AppViewModel.resetMobileDesktopLyricsGeometry() {
    mobileDesktopLyricScale = 1.0f
    mobileDesktopLyricWidth = 0.86f
    mobileDesktopLyricX = 0.07f
    mobileDesktopLyricY = 0.045f
    save()
    syncDesktopLyricsOverlay()
    notify("已重置桌面歌词位置与大小", 1600)
}

private fun AppViewModel.lanDiscoveryRestart() {
    viewModelScope.launch {
        runCatching {
            val (port, ip) = withContext(Dispatchers.IO) {
                val p = lanSyncServer?.start() ?: 0
                lanDiscovery?.port = p
                lanDiscovery?.restart(app)
                p to LanDiscovery.localIpv4()
            }
            lanPort = port
            localLanIp = ip
            lanSsid = lanDiscovery?.ssid ?: lanSsid
        }.onFailure { message = "局域网同步启动失败：${it.message}" }
    }
}

fun AppViewModel.activateSource(source: SyncSourcePayload) {
    viewModelScope.launch {
        val ok = engine.activate(source)
        sourceReady = engine.ready
        activeId = engine.activeId
        sources = engine.sources
        if (ok) {
            message = "已启用「${source.name}」"
            // 深链/上次会话在等音源时，启用后立刻补播，而不是永远停在待播。
            restorePlaybackIfReady()
        }
    }
}

fun AppViewModel.removeSource(source: SyncSourcePayload) {
    pendingRemoveSource = source
}

fun AppViewModel.confirmRemoveSource() {
    val source = pendingRemoveSource ?: return
    pendingRemoveSource = null
    val next = sources.filter { it.id != source.id }
    sources = next
    if (source.id == activeId) {
        activeId = ""
        sourceReady = false
    }
    engine.setSources(next, activeId)
    save()
}

/** 分享回跳：lxmine://play?source=&id=&name=… 与 PC / 鸿蒙同一套参数。 */
fun AppViewModel.handleDeepLink(uri: String) {
    runCatching {
        val query = uri.substringAfter('?', "")
        val params = mutableMapOf<String, String>()
        for (pair in query.split('&')) {
            val index = pair.indexOf('=')
            if (index <= 0) continue
            params[pair.substring(0, index)] = java.net.URLDecoder.decode(pair.substring(index + 1), "UTF-8")
        }
        val source = params["source"].orEmpty()
        val id = params["id"].orEmpty()
        val name = params["name"].orEmpty()
        if (source.isEmpty() || id.isEmpty() || name.isEmpty()) return
        val song = Song(
            source = source,
            id = id,
            name = name,
            singer = params["singer"].orEmpty(),
            albumName = params["album"].orEmpty(),
            albumId = "",
            durationMs = params["duration"]?.toLongOrNull() ?: 0,
            qualitys = listOf("128k", "320k", "flac"),
            coverUrl = params["cover"].orEmpty(),
        )
        selected = song
        queue = listOf(song)
        pendingPlayback = PlaybackSnapshot(song, listOf(song), 0, true, true)
        restorePlaybackIfReady()
    }.onFailure { message = "无法打开分享的歌曲：${it.message}" }
}

/** 系统返回键的优先级与鸿蒙 onBackPress 一致。 */
fun AppViewModel.onBackPress(): Boolean {
    val now = System.currentTimeMillis()
    if (now < backGuardUntil) return true
    fun consume(): Boolean {
        backGuardUntil = now + 1500
        return true
    }
    if (pendingDeletePlaylist != null) {
        pendingDeletePlaylist = null
        return consume()
    }
    if (pendingRemoveSource != null) {
        pendingRemoveSource = null
        return consume()
    }
    if (pendingRemoveTrusted != null) {
        pendingRemoveTrusted = null
        return consume()
    }
    if (pendingClearRecent) {
        pendingClearRecent = false
        return consume()
    }
    if (overlayPermissionPromptOpen) {
        overlayPermissionPromptOpen = false
        pendingEnableDesktopLyrics = false
        return consume()
    }
    if (incoming != null) return consume()
    if (earMonitorOpen) {
        earMonitorOpen = false
        return consume()
    }
    if (colorPickerTarget.isNotEmpty()) {
        colorPickerTarget = ""
        return consume()
    }
    if (batchDownloadPickerSongs != null) {
        batchDownloadPickerSongs = null
        return consume()
    }
    if (batchCollectPickerSongs != null) {
        batchCollectPickerSongs = null
        return consume()
    }
    if (coverPickerPlaylist != null) {
        coverPickerPlaylist = null
        return consume()
    }
    if (switchPlatformTarget != null) {
        switchPlatformTarget = null
        maybeReturnToParentSheet()
        return consume()
    }
    if (editPlaylistTarget != null) {
        editPlaylistTarget = null
        return consume()
    }
    if (queueOrderOpen) {
        queueOrderOpen = false
        maybeReturnToParentSheet()
        return consume()
    }
    if (orderOpen) {
        orderOpen = false
        return consume()
    }
    if (scanOpen) {
        closeScanDialog()
        return consume()
    }
    if (moreSubSheet.isNotEmpty()) {
        moreSubSheet = ""
        return consume()
    }
    if (showSheet) {
        closeSheet()
        return consume()
    }
    if (commentsOpen) {
        commentsOpen = false
        return consume()
    }
    if (showPlayer) {
        if (!stageControlsVisible) {
            stageControlsVisible = true
            return consume()
        }
        showPlayer = false
        return consume()
    }
    if (sourcesOpen) {
        closeSources()
        return consume()
    }
    if (settingsPanel != "main") {
        openSettingsPanel("main")
        return consume()
    }
    if (downloadsOpen) {
        closeDownloads()
        return consume()
    }
    if (feedSection.isNotEmpty()) {
        closeFeedSection()
        return consume()
    }
    if (openedPlaylist != null) {
        closeOpenedPlaylist()
        return consume()
    }
    if (openedEntity != null) {
        openedEntity = null
        return consume()
    }
    if (searchOpen) {
        closeSearch()
        return consume()
    }
    return false
}

// ---- 弹层：新建歌单 / 导入歌单 / 添加音源 / 播放队列 / 添加到歌单 ----

fun AppViewModel.openSheet(name: String) {
    draft = ""
    sheet = name
    moreSubSheet = ""
    returnSheetAfterSub = ""
    error = ""
    addToPlaylistSong = null
    showSheet = true
    if (name == "播放队列") {
        hydrateCoversFor(queue.take(40))
    }
}

fun AppViewModel.closeSheet() {
    showSheet = false
    moreSubSheet = ""
    returnSheetAfterSub = ""
    draft = ""
    renamingPlaylistId = ""
    busy = false
}

/** 从固定独立页（如「播放队列」「更多」）跳到二级独立页时先收起父页，子页关闭后自动返回父页（对齐鸿蒙 Index.ets）。 */
fun AppViewModel.openSubSheetFromSheet(parentSheet: String, openChild: () -> Unit) {
    returnSheetAfterSub = parentSheet
    showSheet = false
    moreSubSheet = ""
    openChild()
}

fun AppViewModel.maybeReturnToParentSheet() {
    val parent = returnSheetAfterSub
    if (parent.isEmpty()) return
    returnSheetAfterSub = ""
    openSheet(parent)
}

fun AppViewModel.submitSheet() {
    if (busy) return
    if (sheet == "播放队列" || sheet == "添加到歌单" || sheet == "更多" || sheet == "耳返监听") {
        showSheet = false
        return
    }
    if (draft.trim().isEmpty()) return
    busy = true
    error = ""
    viewModelScope.launch {
        var createdName = ""
        var renamedName = ""
        var playlistMutated = false
        try {
            when (sheet) {
                "新建歌单" -> {
                    val created = createPlaylist(draft.trim())
                    playlists = playlists + created
                    createdName = created.name
                    playlistMutated = true
                }
                "重命名歌单" -> {
                    val targetName = draft.trim()
                    val targetId = renamingPlaylistId
                    val current = playlists.firstOrNull { it.id == targetId && !it.isFavorite && it.kind == "lx" }
                        ?: throw IllegalStateException("找不到要重命名的歌单")
                    val updated = current.copy(name = targetName, updatedAt = System.currentTimeMillis())
                    playlists = playlists.map { if (it.id == targetId) updated else it }
                    if (openedPlaylist?.id == targetId) openedPlaylist = updated
                    renamingPlaylistId = ""
                    renamedName = targetName
                    playlistMutated = true
                }
                "导入歌单" -> {
                    val source = if (platform.id == "all") "wy" else platform.id
                    val json = engine.importPlaylist(draft.trim(), source)
                    val favoriteIds = playlists.filter { it.isFavorite }.mapTo(HashSet()) { it.id }
                    val lists = parsePlaylists(json, imported = true).mapIndexed { idx, item ->
                        if (item.id in favoriteIds) {
                            item.copy(
                                id = "lx-${System.currentTimeMillis()}-$idx-${(0..1_000_000).random().toString(36)}",
                                isFavorite = false,
                            )
                        } else item
                    }
                    playlists = playlists.filter { existing -> lists.none { it.id == existing.id } } + lists
                    val total = lists.sumOf { it.songs.size }
                    message = "已导入 ${lists.size} 个歌单，共 $total 首"
                    val warnings = lists.map { it.warning }.filter { it.isNotBlank() }.joinToString("\n")
                    notify(listOf(message, warnings).filter { it.isNotBlank() }.joinToString("\n"), if (warnings.isEmpty()) 3000 else 8000)
                    playlistMutated = true
                }
                "添加音源" -> {
                    val source = engine.sourceFromScript(draft)
                    val ok = engine.activate(source)
                    if (ok) {
                        sources = sources + source
                        activeId = source.id
                        sourceReady = true
                        engine.setSources(sources, activeId)
                    } else {
                        throw IllegalStateException(error.ifEmpty { "音源加载失败" })
                    }
                }
            }
            persist()
            if (playlistMutated) {
                scheduleAutoPlaylistSync()
                hydrateLibraryPlaylistCovers()
            }
            showSheet = false
            if (createdName.isNotEmpty()) notify("已创建歌单「${createdName}」")
            if (renamedName.isNotEmpty()) notify("已重命名为「${renamedName}」")
        } catch (exception: Exception) {
            error = exception.message ?: "操作失败"
        } finally {
            busy = false
            consumeSharedPlaylist()
        }
    }
}

/** 从系统文件选择器读入脚本或歌单 JSON（对应鸿蒙 DocumentViewPicker）。 */
fun AppViewModel.importFile(uri: android.net.Uri, forSource: Boolean) {
    viewModelScope.launch(Dispatchers.IO) {
        val result = runCatching {
            app.contentResolver.openInputStream(uri)?.use { input ->
                com.lxlia.player.lx.readImportFile(input, forSource)
            }
        }
        val text = result.getOrNull()
        withContext(Dispatchers.Main) {
            if (text == null) {
                error = "导入失败：${result.exceptionOrNull()?.message ?: "无法读取文件"}"
                return@withContext
            }
            if (!forSource && !hostReady) {
                pendingPlaylistImport = text
                return@withContext
            }
            openSheet(if (forSource) "添加音源" else "导入歌单")
            draft = text
            submitSheet()
        }
    }
}

fun AppViewModel.importSourceFiles(uris: List<android.net.Uri>) {
    if (busy || uris.isEmpty()) return
    busy = true
    error = ""
    viewModelScope.launch {
        try {
            val existing = sources
            val batch = withContext(Dispatchers.IO) {
                com.lxlia.player.lx.SourceImportBatch(existing).apply {
                    for (uri in uris) {
                        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "音源文件"
                        try {
                            runCatching { app.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                                if (it.moveToFirst()) name = it.getString(0) ?: name
                            } }
                            val text = app.contentResolver.openInputStream(uri)?.use {
                                com.lxlia.player.lx.readImportFile(it, true)
                            } ?: throw IllegalStateException("无法读取文件")
                            add(name, text)
                        } catch (exception: Exception) { fail(name, exception.message ?: "无法读取文件") }
                    }
                }
            }
            if (batch.imported.isNotEmpty()) {
                sources = sources + batch.imported
                if (sources.none { it.id == activeId }) activeId = batch.imported.first().id
                engine.setSources(sources, activeId)
                persist()
                if (hostReady && !engine.ready) {
                    engine.restoreSource()
                    sourceReady = engine.ready
                }
            }
            showSheet = false
            message = batch.summary()
            sourceImportReport = batch.report()
        } catch (exception: Exception) { error = "导入失败：${exception.message}" }
        finally { busy = false; consumeSharedPlaylist() }
    }
}

// ---- 局域网同步与设备信任圈 ----

internal fun AppViewModel.loadTrustedCircle() {
    val loaded = com.lxlia.player.lx.TrustedDevice.listFromJson(store.loadTrustedDevices())
    trustedMap.clear()
    loaded.forEach { trustedMap[it.id] = it }
    trustedDevices = trustedMap.values.sortedByDescending { it.trustedAt }
    trustCircleTransitive = store.loadTrustCircleTransitive()
    synchronized(pendingVouches) {
        pendingVouches.clear()
        pendingVouches.addAll(com.lxlia.player.lx.PendingVouch.listFromJson(store.loadPendingVouches()))
    }
}

fun AppViewModel.setTrustCircleTransitive(value: Boolean) {
    trustCircleTransitive = value
    store.saveTrustCircleTransitive(value)
    notify(if (value) "已开启信任圈成员互通" else "已关闭信任圈成员互通（仅拉入当前配对设备）", 2000)
}

internal fun AppViewModel.savePendingVouchesState() {
    val snapshot = synchronized(pendingVouches) { pendingVouches.toList() }
    store.savePendingVouches(com.lxlia.player.lx.PendingVouch.listToJson(snapshot))
}

internal fun AppViewModel.queuePendingVouch(targetId: String, introduced: com.lxlia.player.lx.IntroducedPeer) {
    val tid = targetId.trim()
    if (tid.isEmpty() || introduced.id.isEmpty() || tid == deviceId || introduced.id == deviceId || tid == introduced.id) return
    if (!trustedMap.containsKey(tid) || introduced.token.length < 16) return
    val now = System.currentTimeMillis()
    synchronized(pendingVouches) {
        pendingVouches.removeAll { (now - it.createdAt > com.lxlia.player.lx.PendingVouch.TTL_MS) || (it.targetId == tid && it.introduced.id == introduced.id) }
        pendingVouches.add(com.lxlia.player.lx.PendingVouch(tid, introduced, now))
        while (pendingVouches.size > 64) pendingVouches.removeAt(0)
    }
    savePendingVouchesState()
    vouchBackoff.remove("$tid|${introduced.id}")
    flushPendingVouches()
}

internal fun AppViewModel.flushPendingVouches() {
    val snapshot = synchronized(pendingVouches) { pendingVouches.toList() }
    if (snapshot.isEmpty()) return
    val onlineById = devices.associateBy { it.id }
    val now = System.currentTimeMillis()
    viewModelScope.launch(Dispatchers.IO) {
        var pruned = false
        synchronized(pendingVouches) {
            pruned = pendingVouches.removeAll { (now - it.createdAt > com.lxlia.player.lx.PendingVouch.TTL_MS) || !trustedMap.containsKey(it.targetId) }
        }
        if (pruned) savePendingVouchesState()
        for (item in snapshot) {
            val key = "${item.targetId}|${item.introduced.id}"
            if (System.currentTimeMillis() < (vouchBackoff[key] ?: 0L)) continue
            val targetOnline = onlineById[item.targetId] ?: continue
            val trustedTarget = trustedMap[item.targetId] ?: continue
            if (!vouchInFlight.add(key)) continue
            try {
                val payload = JSONObject()
                    .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
                    .put("version", 1)
                    .put("type", "vouch")
                    .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
                    .put("trustToken", trustedTarget.token)
                    .put("introduced", item.introduced.toJson())
                val res = if (targetOnline.receiveMode == "pull") {
                    runCatching {
                        checkNotNull(lanSyncServer).offerVouch(targetOnline.id, payload) { lanDiscovery?.announceNow() }
                    }.getOrDefault(com.lxlia.player.lx.LanPushResult(false, code = "TIMEOUT"))
                } else {
                    LanSyncClient.vouch(targetOnline, payload)
                }
                if (res.accepted || res.code == "TRANSITIVE_DISABLED" || res.code == "UNTRUSTED") {
                    synchronized(pendingVouches) {
                        pendingVouches.removeAll { it.targetId == item.targetId && it.introduced.id == item.introduced.id }
                    }
                    savePendingVouchesState()
                    vouchBackoff.remove(key)
                } else {
                    vouchBackoff[key] = System.currentTimeMillis() + 5000L
                }
            } finally {
                vouchInFlight.remove(key)
            }
        }
    }
}

internal fun AppViewModel.handleIncomingVouch(introduced: com.lxlia.player.lx.IntroducedPeer): com.lxlia.player.lx.LanPushResult {
    if (!trustCircleTransitive) {
        return com.lxlia.player.lx.LanPushResult(false, code = "TRANSITIVE_DISABLED", message = "对方未开启信任圈成员互通")
    }
    if (introduced.id.isEmpty() || introduced.id == deviceId || introduced.token.length < 16) {
        return com.lxlia.player.lx.LanPushResult(false, code = "INVALID")
    }
    viewModelScope.launch {
        addTrustedDevice(introduced.id, introduced.name, introduced.platform, introduced.token)
    }
    return com.lxlia.player.lx.LanPushResult(true)
}

internal fun AppViewModel.verifyTrustedPeer(peerId: String, token: String): Boolean {
    val entry = trustedMap[peerId] ?: return false
    return com.lxlia.player.lx.safeTokenEquals(entry.token, token)
}

internal fun AppViewModel.saveTrustedCircle() {
    val sorted = trustedMap.values.sortedByDescending { it.trustedAt }
    trustedDevices = sorted
    store.saveTrustedDevices(com.lxlia.player.lx.TrustedDevice.listToJson(sorted))
}

internal fun AppViewModel.addTrustedDevice(peerId: String, peerName: String, platform: String, token: String) {
    if (peerId.isEmpty() || peerId == deviceId || token.length < 16) return
    trustedMap[peerId] = com.lxlia.player.lx.TrustedDevice(
        id = peerId,
        name = peerName.ifEmpty { "LxMine" },
        platform = platform.ifEmpty { "unknown" },
        token = token,
        trustedAt = System.currentTimeMillis(),
    )
    saveTrustedCircle()
    autoSyncBackoff.remove(peerId)
    autoSyncExchanged.remove(peerId)
    if (lanAutoSync && storeReady) {
        viewModelScope.launch(Dispatchers.IO) { runCatching { lanDiscovery?.announceNow() } }
        scheduleAutoSyncReconcile(delayMs = 250L, forceLocalPush = true)
    }
}

internal fun AppViewModel.syncTrustedDisplayNames(onlineDevices: List<LanDevice>) {
    var changed = false
    for (dev in onlineDevices) {
        val existing = trustedMap[dev.id] ?: continue
        if (dev.name.isNotEmpty() && existing.name != dev.name) {
            trustedMap[dev.id] = existing.copy(name = dev.name)
            changed = true
        }
    }
    if (changed) saveTrustedCircle()
}

internal fun AppViewModel.removeTrustedLocal(peerId: String): com.lxlia.player.lx.TrustedDevice? {
    val removed = trustedMap.remove(peerId) ?: return null
    synchronized(pendingVouches) {
        pendingVouches.removeAll { it.targetId == peerId || it.introduced.id == peerId }
    }
    savePendingVouchesState()
    saveTrustedCircle()
    autoSyncBackoff.remove(peerId)
    autoSyncExchanged.remove(peerId)
    return removed
}

fun AppViewModel.requestRemoveTrustedDevice(item: com.lxlia.player.lx.TrustedDevice) {
    pendingRemoveTrusted = item
}

fun AppViewModel.confirmRemoveTrustedDevice() {
    val item = pendingRemoveTrusted ?: return
    pendingRemoveTrusted = null
    removeTrustedDevice(item.id)
}

fun AppViewModel.removeTrustedDevice(peerId: String) {
    val removed = removeTrustedLocal(peerId) ?: return
    message = "已将「${removed.name}」移出信任圈"
    notify(message, 1800)
    val online = devices.firstOrNull { it.id == removed.id }
    if (online != null && online.receiveMode != "pull" && online.port > 0) {
        val payload = JSONObject()
            .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
            .put("version", 1)
            .put("type", "unpair")
            .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
            .put("trustToken", removed.token)
        viewModelScope.launch(Dispatchers.IO) {
            LanSyncClient.unpair(online, payload)
        }
    }
}

private fun AppViewModel.buildSyncBundle(trustToken: String = ""): JSONObject = JSONObject()
    .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
    .put("version", 1)
    .put("createdAt", System.currentTimeMillis())
    .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
    .put("trustToken", trustToken)
    .put("settings", JSONObject(settings))
    .put("playlists", JSONArray().apply { playlists.forEach { put(it.toJson()) } })
    .put("sources", JSONArray().apply { sources.forEach { put(it.toJson()) } })
    .put("activeSourceId", activeId)

fun AppViewModel.setLanAutoSync(value: Boolean) {
    lanAutoSync = value
    save()
    if (value) autoSyncExchanged.clear()
    viewModelScope.launch(Dispatchers.IO) {
        runCatching { lanDiscovery?.announceNow() }
    }
    if (value) scheduleAutoSyncReconcile(delayMs = 250L, forceLocalPush = true)
}

fun AppViewModel.scheduleAutoPlaylistSync() {
    if (!lanAutoSync || !storeReady || trustedMap.isEmpty()) return
    viewModelScope.launch(Dispatchers.IO) { runCatching { lanDiscovery?.announceNow() } }
    autoSyncJob?.cancel()
    autoSyncJob = viewModelScope.launch {
        delay(650)
        reconcileAutoSyncPeers(forceLocalPush = true)
    }
}

fun AppViewModel.scheduleAutoSyncReconcile(delayMs: Long = 350L, forceLocalPush: Boolean = false) {
    if (!lanAutoSync || !storeReady || trustedMap.isEmpty()) return
    autoSyncReconcileJob?.cancel()
    autoSyncReconcileJob = viewModelScope.launch {
        delay(delayMs)
        reconcileAutoSyncPeers(forceLocalPush = forceLocalPush)
    }
}

internal suspend fun AppViewModel.reconcileAutoSyncPeers(forceLocalPush: Boolean = false) {
    if (!lanAutoSync || !storeReady || trustedMap.isEmpty()) return
    val currentLists = playlists.toList()
    val myDigest = com.lxlia.player.lx.computeSyncDigest(currentLists)
    val now = System.currentTimeMillis()
    val candidates = devices.filter { peer ->
        if (!peer.autoSyncPlaylists || peer.port <= 0) return@filter false
        if (!trustedMap.containsKey(peer.id)) return@filter false
        if (peer.id in autoSyncInFlight) return@filter false
        val backoff = autoSyncBackoff[peer.id] ?: 0L
        if (now < backoff) return@filter false
        if (peer.syncDigest.isNotEmpty() && peer.syncDigest == myDigest) {
            autoSyncBackoff.remove(peer.id)
            return@filter false
        }
        val pairKey = "$myDigest|${peer.syncDigest}"
        if (!forceLocalPush && autoSyncExchanged[peer.id] == pairKey) return@filter false
        true
    }
    if (candidates.isEmpty()) return

    runCatching { persist() }
    val playlistsJson = JSONArray().apply { currentLists.forEach { put(it.toJson()) } }

    var mergedLocally = false
    coroutineScope {
        candidates.map { peer ->
            async(Dispatchers.IO) {
                val trusted = trustedMap[peer.id] ?: return@async false
                if (!autoSyncInFlight.add(peer.id)) return@async false
                try {
                    val bundle = JSONObject()
                        .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
                        .put("version", 1)
                        .put("createdAt", System.currentTimeMillis())
                        .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
                        .put("trustToken", trusted.token)
                        .put("syncDigest", myDigest)
                        .put("playlists", playlistsJson)
                    val res = LanSyncClient.exchangeAutoPlaylists(peer, bundle)
                    if (res.code == "UNTRUSTED") {
                        autoSyncBackoff[peer.id] = System.currentTimeMillis() + 30_000L
                        return@async false
                    }
                    if (!res.accepted) {
                        autoSyncBackoff[peer.id] = System.currentTimeMillis() + 5000L
                        return@async false
                    }
                    autoSyncBackoff.remove(peer.id)
                    var localChanged = false
                    var postDigest = myDigest
                    if (res.playlists.isNotEmpty()) {
                        val applied = withContext(Dispatchers.Main) {
                            val before = playlists.toList()
                            val merged = mergeSyncedPlaylists(before, res.playlists)
                            val changed = MusicPlaylist.listToJson(merged) != MusicPlaylist.listToJson(before)
                            if (changed) {
                                playlists = merged
                                openedPlaylist?.let { opened ->
                                    val match = if (opened.isFavorite) merged.firstOrNull { it.isFavorite }
                                    else merged.firstOrNull { it.id == opened.id }
                                    if (match != null) openedPlaylist = match
                                }
                            }
                            changed to com.lxlia.player.lx.computeSyncDigest(merged)
                        }
                        localChanged = applied.first
                        postDigest = applied.second
                        if (localChanged) {
                            persist()
                        }
                    }
                    val remoteDigest = res.syncDigest.ifEmpty { peer.syncDigest }
                    autoSyncExchanged[peer.id] = "$postDigest|$remoteDigest"
                    localChanged
                } catch (_: Throwable) {
                    autoSyncBackoff[peer.id] = System.currentTimeMillis() + 5000L
                    false
                } finally {
                    autoSyncInFlight.remove(peer.id)
                }
            }
        }.awaitAll().forEach { changed -> if (changed) mergedLocally = true }
    }
    if (mergedLocally) {
        withContext(Dispatchers.IO) { runCatching { lanDiscovery?.announceNow() } }
        val toastNow = System.currentTimeMillis()
        if (toastNow - lastAutoSyncToastAt >= 2500L) {
            lastAutoSyncToastAt = toastNow
            message = "已自动合并局域网歌单与我的收藏"
            notify(message, 1800)
        }
        // Propagate merged state to any remaining trusted devices on the LAN.
        scheduleAutoSyncReconcile(delayMs = 450L, forceLocalPush = false)
    }
}

internal fun AppViewModel.applyIncomingAutoPlaylists(
    peerId: String,
    peerName: String,
    peerDigest: String,
    incomingPlaylists: List<MusicPlaylist>,
): com.lxlia.player.lx.AutoSyncExchangeResult {
    if (!lanAutoSync || !storeReady) return com.lxlia.player.lx.AutoSyncExchangeResult(false)
    return runBlocking {
        val (changed, merged) = withContext(Dispatchers.Main) {
            val current = playlists.toList()
            val next = mergeSyncedPlaylists(current, incomingPlaylists)
            val isChanged = MusicPlaylist.listToJson(next) != MusicPlaylist.listToJson(current)
            if (isChanged) {
                playlists = next
                openedPlaylist?.let { opened ->
                    val match = if (opened.isFavorite) next.firstOrNull { it.isFavorite }
                    else next.firstOrNull { it.id == opened.id }
                    if (match != null) openedPlaylist = match
                }
                val toastNow = System.currentTimeMillis()
                if (toastNow - lastAutoSyncToastAt >= 2500L) {
                    lastAutoSyncToastAt = toastNow
                    message = "已自动合并「$peerName」的歌单更新"
                    notify(message, 1800)
                }
            }
            isChanged to next
        }
        val postDigest = com.lxlia.player.lx.computeSyncDigest(merged)
        if (peerId.isNotEmpty()) {
            autoSyncExchanged[peerId] = "$postDigest|$peerDigest"
        }
        if (changed) {
            persist()
            viewModelScope.launch(Dispatchers.IO) { runCatching { lanDiscovery?.announceNow() } }
            scheduleAutoSyncReconcile(delayMs = 450L, forceLocalPush = false)
        }
        com.lxlia.player.lx.AutoSyncExchangeResult(
            accepted = true,
            changed = changed,
            syncDigest = postDigest,
            playlists = merged,
        )
    }
}

fun AppViewModel.pairDevice(device: LanDevice) {
    if (busy) return
    val code = com.lxlia.player.lx.generatePairCode()
    val token = com.lxlia.player.lx.generateTrustToken()
    val ownPeers = if (trustCircleTransitive) {
        trustedMap.values.filter { it.id != device.id }.take(32)
            .map { com.lxlia.player.lx.PeerSummary(it.id, it.name, it.platform) }
    } else emptyList()
    val preIntroduced = if (trustCircleTransitive && device.receiveMode == "pull") {
        ownPeers.map { com.lxlia.player.lx.IntroducedPeer(it.id, it.name, it.platform, com.lxlia.player.lx.generateTrustToken()) }
    } else emptyList()
    busy = true
    message = "等待「${device.name}」确认加入信任圈（核对验证码：${com.lxlia.player.lx.formatPairCode(code)}）…"
    viewModelScope.launch {
        try {
            val payload = JSONObject()
                .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
                .put("version", 1)
                .put("type", "pair")
                .put("code", code)
                .put("token", token)
                .put("transitive", trustCircleTransitive)
                .put("peers", JSONArray().apply { ownPeers.forEach { put(it.toJson()) } })
                .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
            if (preIntroduced.isNotEmpty()) {
                payload.put("introducedPeers", com.lxlia.player.lx.IntroducedPeer.listToArray(preIntroduced))
            }
            val res = withContext(Dispatchers.IO) {
                if (device.receiveMode == "pull") {
                    checkNotNull(lanSyncServer).offerPair(device.id, payload) { lanDiscovery?.announceNow() }
                } else {
                    LanSyncClient.pair(device, payload)
                }
            }
            if (res.accepted) {
                val peerId = res.peerId.ifEmpty { device.id }
                val peerName = res.peerName.ifEmpty { device.name }
                val peerPlatform = res.peerPlatform.ifEmpty { device.platform }
                addTrustedDevice(peerId, peerName, peerPlatform, token)
                var extraCount = 0
                if (trustCircleTransitive && res.transitive) {
                    if (device.receiveMode == "pull" && preIntroduced.isNotEmpty()) {
                        val accSet = res.acceptedIntroducedIds.toSet()
                        for (pre in preIntroduced) {
                            if (accSet.isEmpty() || pre.id in accSet) {
                                queuePendingVouch(pre.id, com.lxlia.player.lx.IntroducedPeer(peerId, peerName, peerPlatform, pre.token))
                            }
                        }
                    }
                    for (intro in res.introducedPeers) {
                        if (intro.id.isEmpty() || intro.id == deviceId || intro.id == peerId || trustedMap.containsKey(intro.id)) continue
                        addTrustedDevice(intro.id, intro.name, intro.platform, intro.token)
                        extraCount += 1
                    }
                    for (rv in res.reverseVouches) {
                        if (rv.id.isEmpty() || rv.id == deviceId || !trustedMap.containsKey(rv.id)) continue
                        queuePendingVouch(rv.id, com.lxlia.player.lx.IntroducedPeer(peerId, peerName, peerPlatform, rv.token))
                    }
                }
                val suffix = if (extraCount > 0) "（并同步加入对方信任圈内 $extraCount 台设备）" else ""
                message = "已将「$peerName」加入设备信任圈$suffix"
            } else {
                message = if (res.message.isNotEmpty()) "对方未接受：${res.message}" else "对方拒绝了信任请求"
            }
            notify(message, 2400)
        } catch (exception: Exception) {
            message = "加入信任圈失败：${exception.message}"
            notify(message, 3000)
        } finally {
            busy = false
        }
    }
}

fun AppViewModel.sendDirect(targetInput: String) {
    if (busy) return
    val endpoint = LanSyncClient.parseManualEndpoint(targetInput, 41300)
    if (endpoint == null) {
        message = "请输入有效的 IP 或 IP:端口（默认端口 41300）"
        notify(message)
        return
    }
    val (host, port) = endpoint
    lanManualTarget = targetInput.trim()
    save()
    val pairCode = com.lxlia.player.lx.generatePairCode()
    val pairToken = com.lxlia.player.lx.generateTrustToken()
    busy = true
    message = "正在连接 $host:$port（若未信任将请求加入信任圈，验证码：${com.lxlia.player.lx.formatPairCode(pairCode)}）…"
    viewModelScope.launch {
        try {
            persist()
            val outcome = withContext(Dispatchers.IO) {
                val pingInfo = LanSyncClient.ping(host, port)
                    ?: throw IllegalStateException("无法连接目标设备，请检查 IP、端口和 Wi-Fi")
                val peerId = pingInfo.optString("id").trim()
                if (peerId.isEmpty()) throw IllegalStateException("无法识别对端设备身份")
                if (peerId == deviceId) throw IllegalStateException("不能向本机自身发送同步")
                val peerName = pingInfo.optString("name").takeIf { it.isNotEmpty() } ?: "$host:$port"
                val peerPlatform = pingInfo.optString("platform").takeIf { it.isNotEmpty() } ?: "unknown"
                val target = LanDevice(
                    id = peerId,
                    name = peerName,
                    platform = peerPlatform,
                    address = host,
                    port = port,
                    lastSeen = System.currentTimeMillis(),
                    receiveMode = "direct",
                )
                val trusted = trustedMap[peerId]
                if (trusted == null) {
                    val ownPeers = if (trustCircleTransitive) {
                        trustedMap.values.filter { it.id != peerId }.take(32)
                            .map { com.lxlia.player.lx.PeerSummary(it.id, it.name, it.platform) }
                    } else emptyList()
                    val payload = JSONObject()
                        .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
                        .put("version", 1)
                        .put("type", "pair")
                        .put("code", pairCode)
                        .put("token", pairToken)
                        .put("transitive", trustCircleTransitive)
                        .put("peers", JSONArray().apply { ownPeers.forEach { put(it.toJson()) } })
                        .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
                    Triple("pair", target, LanSyncClient.pair(target, payload))
                } else {
                    val bundle = buildSyncBundle(trusted.token)
                    Triple("push", target, LanSyncClient.pushDetailed(target, bundle))
                }
            }
            val (mode, target, res) = outcome
            if (mode == "pair") {
                if (res.accepted) {
                    val finalId = res.peerId.ifEmpty { target.id }
                    val finalName = res.peerName.ifEmpty { target.name }
                    val finalPlatform = res.peerPlatform.ifEmpty { target.platform }
                    addTrustedDevice(finalId, finalName, finalPlatform, pairToken)
                    var extraCount = 0
                    if (trustCircleTransitive && res.transitive) {
                        for (intro in res.introducedPeers) {
                            if (intro.id.isEmpty() || intro.id == deviceId || intro.id == finalId || trustedMap.containsKey(intro.id)) continue
                            addTrustedDevice(intro.id, intro.name, intro.platform, intro.token)
                            extraCount += 1
                        }
                        for (rv in res.reverseVouches) {
                            if (rv.id.isEmpty() || rv.id == deviceId || !trustedMap.containsKey(rv.id)) continue
                            queuePendingVouch(rv.id, com.lxlia.player.lx.IntroducedPeer(finalId, finalName, finalPlatform, rv.token))
                        }
                    }
                    val extra = if (extraCount > 0) "（并同步加入对方信任圈内 $extraCount 台设备）" else ""
                    message = "已将「$finalName」加入信任圈$extra，再次点击即可发送或自动同步"
                } else {
                    message = if (res.message.isNotEmpty()) "对方未接受信任请求：${res.message}" else "对方拒绝了信任请求"
                }
            } else {
                message = when {
                    res.accepted -> "已直连同步到「${target.name}」"
                    res.code == "UNTRUSTED" -> "「${target.name}」已将本机移出信任圈，请先移除再重新加入信任圈"
                    else -> if (res.message.isNotEmpty()) "对方未接受：${res.message}" else "对方未接受同步"
                }
            }
            notify(message, 2600)
        } catch (exception: Exception) {
            message = "直连失败：${exception.message}"
            notify(message, 3000)
        } finally {
            busy = false
        }
    }
}

fun AppViewModel.send(device: LanDevice) {
    if (busy) return
    val trusted = trustedMap[device.id]
    if (trusted == null) {
        pairDevice(device)
        return
    }
    busy = true
    message = "等待「${device.name}」确认接收…"
    viewModelScope.launch {
        try {
            persist()
            val bundle = buildSyncBundle(trusted.token)
            val res = withContext(Dispatchers.IO) {
                if (device.receiveMode == "pull") {
                    checkNotNull(lanSyncServer).offerPushDetailed(device.id, bundle) { lanDiscovery?.announceNow() }
                } else LanSyncClient.pushDetailed(device, bundle)
            }
            message = when {
                res.accepted -> "已同步到「${device.name}」"
                res.code == "UNTRUSTED" -> "「${device.name}」已将本机移出信任圈，请先移除再重新加入信任圈"
                else -> if (res.message.isNotEmpty()) "对方未接受：${res.message}" else "对方未接受同步"
            }
            notify(message, 2200)
        } catch (exception: Exception) {
            message = "发送失败：${exception.message}"
        } finally {
            busy = false
        }
    }
}

/** 用户确认后校验全部数据，再持久化，最后回执；失败保留原数据。 */
fun AppViewModel.respondSync(accepted: Boolean) {
    val request = incoming ?: return
    if (applying) return
    if (accepted && lanSyncServer?.beginApply(request.id) != true) {
        incoming = null
        notify("请求已过期，请重新发送")
        return
    }
    applying = true
    viewModelScope.launch {
        try {
            if (request.kind == "pair") {
                var respTransitive = false
                val respIntroduced = mutableListOf<com.lxlia.player.lx.IntroducedPeer>()
                val respReverseVouches = mutableListOf<com.lxlia.player.lx.IntroducedPeer>()
                val acceptedIntroIds = mutableListOf<String>()
                if (accepted) {
                    val existingBefore = trustedMap.values.filter { it.id != request.peerId }.toList()
                    addTrustedDevice(request.peerId, request.peerName, request.platform, request.pairToken)
                    var extraCount = 0
                    if (trustCircleTransitive && request.transitive) {
                        respTransitive = true
                        val initiatorKnown = (request.peers.map { it.id } + request.introducedPeers.map { it.id }).toSet()
                        for (p in existingBefore) {
                            if (p.id in initiatorKnown) continue
                            val freshToken = com.lxlia.player.lx.generateTrustToken()
                            respIntroduced.add(com.lxlia.player.lx.IntroducedPeer(p.id, p.name, p.platform, freshToken))
                            queuePendingVouch(
                                p.id,
                                com.lxlia.player.lx.IntroducedPeer(request.peerId, request.peerName, request.platform, freshToken),
                            )
                        }
                        if (request.introducedPeers.isNotEmpty()) {
                            for (intro in request.introducedPeers) {
                                if (intro.id.isEmpty() || intro.id == deviceId || intro.id == request.peerId || trustedMap.containsKey(intro.id)) continue
                                addTrustedDevice(intro.id, intro.name, intro.platform, intro.token)
                                acceptedIntroIds.add(intro.id)
                                extraCount += 1
                            }
                        } else {
                            for (q in request.peers) {
                                if (q.id.isEmpty() || q.id == deviceId || q.id == request.peerId || trustedMap.containsKey(q.id)) continue
                                val revToken = com.lxlia.player.lx.generateTrustToken()
                                addTrustedDevice(q.id, q.name, q.platform, revToken)
                                respReverseVouches.add(com.lxlia.player.lx.IntroducedPeer(q.id, q.name, q.platform, revToken))
                                extraCount += 1
                            }
                        }
                    }
                    val extra = if (extraCount > 0) "（并同步加入对方信任圈内 $extraCount 台设备）" else ""
                    message = "已将「${request.peerName}」加入设备信任圈$extra"
                    notify(message, 2200)
                }
                withContext(Dispatchers.IO) {
                    lanSyncServer?.respond(
                        id = request.id,
                        accepted = accepted,
                        transitive = respTransitive,
                        introducedPeers = respIntroduced,
                        reverseVouches = respReverseVouches,
                        acceptedIntroducedIds = acceptedIntroIds,
                    )
                }
                incoming = null
                return@launch
            }
            if (accepted) {
                appDataMutex.withLock {
                    val bundle = JSONObject(request.bundleJson)
                    val rawIncomingPlaylists = mutableListOf<MusicPlaylist>()
                    bundle.optJSONArray("playlists")?.let { array ->
                        for (index in 0 until array.length()) {
                            array.optJSONObject(index)?.let { rawIncomingPlaylists.add(MusicPlaylist.fromJson(it)) }
                        }
                    }
                    val incomingPlaylists = MusicPlaylist.normalizeList(rawIncomingPlaylists).toMutableList()
                    if (incomingPlaylists.none { it.isFavorite }) {
                        incomingPlaylists.add(0, createPlaylist("我的收藏", favorite = true))
                    }
                    val incomingSources = mutableListOf<SyncSourcePayload>()
                    bundle.optJSONArray("sources")?.let { array ->
                        for (index in 0 until array.length()) {
                            val item = array.optJSONObject(index) ?: continue
                            if (item.optString("script").isEmpty() || item.optString("id").isEmpty()) throw IllegalStateException("音源格式错误")
                            incomingSources.add(SyncSourcePayload.fromJson(item))
                        }
                    }
                    val unique = com.lxlia.player.lx.uniqueSyncSources(incomingSources)
                    val nextActive = bundle.optString("activeSourceId").takeIf { id -> unique.any { it.id == id } }.orEmpty()
                    val incomingSettings = mutableMapOf<String, Any>()
                    bundle.optJSONObject("settings")?.let { objectJson ->
                        objectJson.keys().forEach { key -> incomingSettings[key] = objectJson.get(key) }
                    }
                    val data = com.lxlia.player.core.AppData(
                        sourceScript = "",
                        sourcesJson = SyncSourcePayload.listToJson(unique),
                        activeSourceId = nextActive,
                        settingsJson = JSONObject(incomingSettings).toString(),
                        playlistsJson = MusicPlaylist.listToJson(incomingPlaylists),
                    )
                    // 先落盘再回执：接收端确认后应用设置/歌单/音源，失败保留原数据（设备信任圈独立持久化，绝不被覆盖）。
                    withContext(Dispatchers.IO) { store.saveAppData(data) }
                    // 顺序很重要：engine.setSources 会触发 onPersist(save())，
                    // 若此时 settings/playlists 还是旧值，会把刚写入的新数据覆盖回磁盘。
                    settings = incomingSettings
                    restoreSettings()
                    engine.setQuality(quality)
                    playlists = incomingPlaylists
                    openedPlaylist = null
                    sources = unique
                    activeId = nextActive
                    sourceReady = false
                    engine.setSources(unique, nextActive)
                    runCatching { engine.restoreSource() }
                    sourceReady = engine.ready
                    message = "已接收「${request.peerName}」的数据"
                }
            }
            withContext(Dispatchers.IO) { lanSyncServer?.respond(request.id, accepted) }
            incoming = null
        } catch (exception: Exception) {
            error = "同步失败：${exception.message}"
            withContext(Dispatchers.IO) { lanSyncServer?.respond(request.id, false, error) }
            incoming = null
        } finally {
            applying = false
        }
    }
}
