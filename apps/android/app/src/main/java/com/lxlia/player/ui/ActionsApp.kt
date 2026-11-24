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
    lanDiscoveryRestart()
}

fun AppViewModel.onBackground() {
    foreground = false
    savePlayback(true)
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
    if (pendingClearRecent) {
        pendingClearRecent = false
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
                    val lists = parsePlaylists(json)
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

// ---- 局域网同步 ----

private fun AppViewModel.buildSyncBundle(): JSONObject = JSONObject()
    .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
    .put("version", 1)
    .put("createdAt", System.currentTimeMillis())
    .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
    .put("settings", JSONObject(settings))
    .put("playlists", JSONArray().apply { playlists.forEach { put(it.toJson()) } })
    .put("sources", JSONArray().apply { sources.forEach { put(it.toJson()) } })
    .put("activeSourceId", activeId)

fun AppViewModel.setLanAutoSync(value: Boolean) {
    lanAutoSync = value
    save()
    viewModelScope.launch(Dispatchers.IO) {
        runCatching { lanDiscovery?.announceNow() }
    }
    if (value) scheduleAutoPlaylistSync()
}

fun AppViewModel.scheduleAutoPlaylistSync() {
    if (!lanAutoSync || !storeReady) return
    autoSyncJob?.cancel()
    autoSyncJob = viewModelScope.launch {
        delay(1200)
        if (!lanAutoSync) return@launch
        val peers = devices.filter { it.autoSyncPlaylists && it.port > 0 }
        if (peers.isEmpty()) return@launch
        runCatching {
            persist()
            val bundle = JSONObject()
                .put("protocol", com.lxlia.player.lx.SYNC_PROTOCOL)
                .put("version", 1)
                .put("createdAt", System.currentTimeMillis())
                .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
                .put("playlists", JSONArray().apply { playlists.forEach { put(it.toJson()) } })
            val syncedCount = withContext(Dispatchers.IO) {
                peers.count { peer -> LanSyncClient.pushAutoPlaylists(peer, bundle) }
            }
            if (syncedCount > 0) {
                message = "已自动同步歌单至 $syncedCount 台局域网设备"
            }
        }
    }
}

internal fun AppViewModel.applyIncomingAutoPlaylists(
    peerName: String,
    incomingPlaylists: List<MusicPlaylist>,
): Boolean {
    if (!lanAutoSync || !storeReady) return false
    return runBlocking {
        val (changed, mergedCount) = withContext(Dispatchers.Main) {
            val current = playlists.toList()
            val merged = mergeSyncedPlaylists(current, incomingPlaylists)
            val isChanged = MusicPlaylist.listToJson(merged) != MusicPlaylist.listToJson(current)
            if (isChanged) {
                playlists = merged
                openedPlaylist?.let { opened ->
                    val match = if (opened.isFavorite) merged.firstOrNull { it.isFavorite }
                    else merged.firstOrNull { it.id == opened.id }
                    if (match != null) openedPlaylist = match
                }
                message = "已自动合并「$peerName」的歌单更新"
            }
            isChanged to merged.size
        }
        if (changed) {
            persist()
        }
        mergedCount >= 0
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
    busy = true
    message = "正在连接 $host:$port 并等待对方确认接收…"
    viewModelScope.launch {
        try {
            persist()
            val bundle = buildSyncBundle()
            val (accepted, peerLabel) = withContext(Dispatchers.IO) {
                val pingInfo = LanSyncClient.ping(host, port)
                val peerId = pingInfo?.optString("id").orEmpty()
                if (peerId.isNotEmpty() && peerId == deviceId) {
                    throw IllegalStateException("不能向本机自身发送同步")
                }
                val peerName = pingInfo?.optString("name")?.takeIf { it.isNotEmpty() } ?: "$host:$port"
                val peerPlatform = pingInfo?.optString("platform")?.takeIf { it.isNotEmpty() } ?: "direct"
                val target = LanDevice(
                    id = peerId.ifEmpty { "manual-$host-$port" },
                    name = peerName,
                    platform = peerPlatform,
                    address = host,
                    port = port,
                    lastSeen = System.currentTimeMillis(),
                    receiveMode = "direct",
                )
                LanSyncClient.push(target, bundle) to peerName
            }
            message = if (accepted) "已同步到「$peerLabel」" else "对方未接受同步"
            notify(message)
        } catch (exception: Exception) {
            message = "直连发送失败：${exception.message}"
            notify(message, 3000)
        } finally {
            busy = false
        }
    }
}

fun AppViewModel.send(device: LanDevice) {
    if (busy) return
    busy = true
    message = "等待「${device.name}」确认接收…"
    viewModelScope.launch {
        try {
            persist()
            val bundle = buildSyncBundle()
            val accepted = withContext(Dispatchers.IO) {
                if (device.receiveMode == "pull") {
                    checkNotNull(lanSyncServer).offerPush(device.id, bundle) { lanDiscovery?.announceNow() }
                } else LanSyncClient.push(device, bundle)
            }
            message = if (accepted) "已同步到「${device.name}」" else "对方未接受同步"
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
        notify("同步请求已过期，请重新发送")
        return
    }
    applying = true
    viewModelScope.launch {
        try {
            if (accepted) {
                appDataMutex.withLock {
                    val bundle = JSONObject(request.bundleJson)
                    val incomingPlaylists = mutableListOf<MusicPlaylist>()
                    bundle.optJSONArray("playlists")?.let { array ->
                        for (index in 0 until array.length()) {
                            array.optJSONObject(index)?.let { incomingPlaylists.add(MusicPlaylist.fromJson(it)) }
                        }
                    }
                    if (incomingPlaylists.none { it.isFavorite || it.name == "我喜欢的" || it.name == "我的收藏" }) {
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
                    // 先落盘再回执：接收端确认后应用设置/歌单/音源，失败保留原数据。
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
