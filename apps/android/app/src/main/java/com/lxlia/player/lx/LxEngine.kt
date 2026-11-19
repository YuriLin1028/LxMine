package com.lxlia.player.lx
import org.json.JSONArray
import org.json.JSONObject

import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import com.lxlia.player.model.SyncSourcePayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ResolvedSongMedia(
    val lines: List<LyricLine> = emptyList(),
    val translation: List<LyricLine> = emptyList(),
    val romaji: List<LyricLine> = emptyList(),
    val coverUrl: String = "",
)

/**
 * 音源装配：声明、启用、播放地址解析与歌词获取。
 * 放在应用级，使后台播控切歌也能解析地址；界面只观察它的变化。
 */
class LxEngine(private val host: LxHost) {
    private val activationMutex = Mutex()
    var sources: List<SyncSourcePayload> = emptyList()
        private set
    var activeId: String = ""
        private set
    var quality: String = "128k"
        private set
    var ready: Boolean = false
        private set

    var onSourcesChanged: (() -> Unit)? = null
    var onMessage: ((String) -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var onPersist: (() -> Unit)? = null

    fun restore(sources: List<SyncSourcePayload>, activeId: String, quality: String) {
        this.sources = sources
        this.activeId = activeId
        this.quality = quality
    }

    fun setQuality(value: String) {
        quality = value
        onPersist?.invoke()
    }

    fun setSources(list: List<SyncSourcePayload>, activeId: String = this.activeId) {
        sources = list
        this.activeId = activeId
        onSourcesChanged?.invoke()
        onPersist?.invoke()
    }

    fun sourceFromScript(script: String): SyncSourcePayload {
        val name = Regex("@name\\s+([^\\r\\n*]+)").find(script)?.groupValues?.get(1)?.trim().orEmpty()
        return SyncSourcePayload(
            id = "android-source-${System.currentTimeMillis()}-${(0..1_000_000).random().toString(36)}",
            name = name.ifEmpty { "自定义音源" },
            script = script,
            importedAt = System.currentTimeMillis(),
        )
    }

    /** 启用一个音源脚本；失败抛出，由调用方提示。 */
    suspend fun activate(source: SyncSourcePayload): Boolean = activationMutex.withLock { activateSource(source) }

    private suspend fun activateSource(source: SyncSourcePayload): Boolean {
        ready = false
        return try {
            host.loadSource(
                source.script,
                LxSourceInfo(
                    name = source.name,
                    description = source.description,
                    version = source.version,
                    author = source.author,
                    homepage = source.homepage,
                ),
            )
            activeId = source.id
            ready = true
            onSourcesChanged?.invoke()
            onPersist?.invoke()
            onMessage?.invoke("已启用「${source.name}」")
            true
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            onError?.invoke("音源加载失败：${error.message}")
            false
        }
    }

    fun activeSource(): SyncSourcePayload? = sources.firstOrNull { it.id == activeId }

    /** 重新绑定当前音源（WebView 重建、启动恢复后调用）。 */
    suspend fun restoreSource() {
        // host.ready 在 WebView 重新 attach 时会归零；只看 engine.ready 会误以为音源还装着。
        if (ready && host.ready) return
        val active = activeSource() ?: return
        activate(active)
    }

    fun songInfo(song: Song, qualityOverride: String? = null): LxSongInfo {
        val source = song.source.ifEmpty { "kw" }
        return LxSongInfo(
            source = source,
            songmid = song.id,
            name = song.name,
            singer = song.singer,
            albumName = song.albumName,
            albumId = song.albumId,
            interval = (song.durationMs / 1000).coerceAtLeast(0),
            type = host.quality(source, qualityOverride ?: quality),
            hash = song.hash,
            hashes = song.hashes,
            strMediaMid = song.strMediaMid,
            songId = song.songId,
        )
    }

    /**
     * 取播放地址。与鸿蒙 playSong 一致：当前音源失败时依次尝试其余音源（最多 6 个），
     * 成功即切换为当前音源；全部失败抛出聚合错误。
     */
    private fun friendlyError(raw: String?): String {
        val msg = raw?.trim().orEmpty()
        if (msg.isEmpty()) return "暂未找到可用完整音源，请稍后重试"
        val looksEnglishTech = msg.all { it.code < 128 } ||
            Regex("ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket|HTTP \\d{3}|timeout|status code|UnknownHost", RegexOption.IGNORE_CASE).containsMatchIn(msg)
        return if (looksEnglishTech) "当前歌曲暂无法获取完整音源，请检查网络或导入更多音源" else msg
    }

    suspend fun resolveUrl(
        song: Song,
        excludeSourceIds: List<String> = emptyList(),
        raceAll: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        if (sources.isEmpty()) throw IllegalStateException("先在设置中启用一个支持此平台的音源")
        val resolved = resolveIdentity(song)
        val payload = JSONObject()
            .put("sources", org.json.JSONArray().apply {
                for (src in sources) {
                    put(
                        JSONObject()
                            .put("id", src.id)
                            .put("name", src.name)
                            .put("version", src.version)
                            .put("script", src.script)
                    )
                }
            })
            .put("activeId", activeId)
            .put("song", resolved.toJson())
            .put("quality", quality)
            .put("excludeSourceIds", org.json.JSONArray(excludeSourceIds))
            .put("raceAll", raceAll)
        try {
            val raw = host.catalogue("race-music-url", payload.toString())
            val obj = JSONObject(raw)
            val url = obj.optString("url", "")
            if (url.startsWith("http://") || url.startsWith("https://")) {
                val winnerId = obj.optString("sourceId", "")
                val winnerName = obj.optString("sourceName", "")
                val switched = obj.optBoolean("switched", false)
                if (winnerId.isNotEmpty() && winnerId != activeId) {
                    activeId = winnerId
                    onSourcesChanged?.invoke()
                    onPersist?.invoke()
                }
                if (switched && winnerName.isNotEmpty()) {
                    onMessage?.invoke("已自动切换至「$winnerName」")
                }
                return@withContext url
            }
            throw IllegalStateException("暂未找到可用完整音源，请检查网络或导入更多音源")
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw IllegalStateException(friendlyError(error.message))
        }
    }

    private suspend fun awaitHostReady(maxWaitMs: Long = 3500L): Boolean {
        var waited = 0L
        while (!host.ready && waited < maxWaitMs) {
            delay(120)
            waited += 120
        }
        return host.ready
    }

    /**
     * 歌词 + 封面 100% 级联兜底：无论自定义音源成功、返回空还是抛错，
     * 只要缺少时间轴歌词或缺少封面，必定等待并合并 host.catalogue("song-assets") 的多平台级联结果。
     */
    suspend fun lyricAndCoverBundle(
        song: Song,
        needTranslation: Boolean,
        needRomaji: Boolean,
    ): ResolvedSongMedia = withContext(Dispatchers.IO) {
        var lines: List<LyricLine> = emptyList()
        var translation: List<LyricLine> = emptyList()
        var romaji: List<LyricLine> = emptyList()
        var coverUrl: String = song.coverUrl
        if (ready && song.source != "local") {
            runCatching {
                val resolved = resolveIdentity(song)
                val bundle = host.requestLyricBundle(songInfo(resolved))
                lines = LyricParser.parse(bundle.lxlyric.ifEmpty { bundle.lyric })
                translation = LyricParser.parse(bundle.tlyric)
                romaji = LyricParser.parse(bundle.romalrc.ifEmpty { bundle.rlyric })
            }
        }
        val hasTimelineLyrics = lines.size > 1 || (lines.size == 1 && lines[0].text.contains("纯音乐"))
        val needsAssets = !hasTimelineLyrics ||
            coverUrl.isEmpty() ||
            (needTranslation && translation.isEmpty()) ||
            (needRomaji && romaji.isEmpty())
        if (needsAssets && awaitHostReady()) {
            runCatching {
                val full = songAssets(song)
                val publicLines = LyricParser.parse(full.optString("lyric"))
                if (publicLines.size > lines.size || !hasTimelineLyrics) {
                    if (publicLines.isNotEmpty()) lines = publicLines
                }
                if (translation.isEmpty()) translation = LyricParser.parse(full.optString("tlyric"))
                if (romaji.isEmpty()) romaji = LyricParser.parse(full.optString("romalrc"))
                val foundCover = full.optString("coverUrl")
                if (coverUrl.isEmpty() && foundCover.isNotEmpty()) {
                    coverUrl = foundCover
                }
            }
        }
        ResolvedSongMedia(lines, translation, romaji, coverUrl)
    }

    /** 保留旧签名供兼容调用。 */
    suspend fun lyricBundle(song: Song, needTranslation: Boolean, needRomaji: Boolean): Triple<List<LyricLine>, List<LyricLine>, List<LyricLine>> {
        val media = lyricAndCoverBundle(song, needTranslation, needRomaji)
        return Triple(media.lines, media.translation, media.romaji)
    }

    /** 批量水合缺失封面：通过共享运行时 song-covers 多平台并发补齐。 */
    suspend fun fetchSongCovers(songs: List<Song>): Map<String, String> = withContext(Dispatchers.IO) {
        val missing = songs
            .filter { it.coverUrl.isEmpty() && it.source != "local" && it.id.isNotEmpty() }
            .distinctBy { it.key }
        if (missing.isEmpty() || !awaitHostReady()) return@withContext emptyMap()
        val out = linkedMapOf<String, String>()
        for (chunk in missing.chunked(24)) {
            runCatching {
                val params = JSONObject().put(
                    "songs",
                    JSONArray().apply { chunk.forEach { put(it.toJson()) } },
                )
                val raw = host.catalogue("song-covers", params.toString())
                val json = JSONObject(raw)
                json.keys().forEach { key ->
                    val url = json.optString(key).trim()
                    if (url.startsWith("http://", true) || url.startsWith("https://", true)) {
                        out[key] = url.replaceFirst(Regex("^http://", RegexOption.IGNORE_CASE), "https://")
                    }
                }
            }
        }
        out
    }

    /** 获取同名同歌手跨平台候选曲目列表（含封面补全）。 */
    suspend fun platformCandidates(
        song: Song,
        sources: List<String> = listOf("wy", "tx", "kg", "kw"),
    ): List<Song> = withContext(Dispatchers.IO) {
        val results = mutableListOf<Song>()
        val seen = mutableSetOf<String>()
        if (awaitHostReady(2500L)) {
            runCatching {
                val params = JSONObject()
                    .put("song", song.toJson())
                    .put("sources", JSONArray(sources))
                val raw = host.catalogue("platform-candidates", params.toString())
                Song.listFromJson(raw).forEach { cand ->
                    if (seen.add(cand.key)) results.add(cand)
                }
            }
        }
        // 单平台筛选或候选不足时使用原生 SearchApi 补充
        val query = listOf(song.name, song.singer.split(Regex("[、/,，;&]+")).firstOrNull().orEmpty())
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()
        if (query.isNotEmpty() && (sources.size == 1 || results.isEmpty())) {
            val targetSources = if (sources.size == 1) listOf(SearchSource.of(sources.first())) else listOf(SearchSource.ALL)
            for (src in targetSources) {
                runCatching {
                    SearchApi.search(src, query, page = 1, limit = 16).items.forEach { cand ->
                        if (cand.source in sources && seen.add(cand.key)) results.add(cand)
                    }
                }
            }
        }
        val missingCovers = results.filter { it.coverUrl.isEmpty() }.take(12)
        if (missingCovers.isNotEmpty()) {
            val covers = fetchSongCovers(missingCovers)
            if (covers.isNotEmpty()) {
                for (i in results.indices) {
                    val url = covers[results[i].key]
                    if (!url.isNullOrEmpty() && results[i].coverUrl.isEmpty()) {
                        results[i] = results[i].copy(coverUrl = url)
                    }
                }
            }
        }
        results
    }

    suspend fun importPlaylist(input: String, source: String): String = withContext(Dispatchers.IO) {
        host.importPlaylist(input, source)
    }
    suspend fun songAssets(song: Song): JSONObject = withContext(Dispatchers.IO) {
        if (!awaitHostReady()) return@withContext JSONObject()
        val assets = JSONObject(host.catalogue("song-assets", song.toJson().toString()))
        if (assets.optString("coverUrl").isEmpty() && ready) {
            try {
                val resolved = resolveIdentity(song)
                if (host.supports(resolved.source, "pic")) {
                    val raw = withTimeoutOrNull(6000) { host.request("pic", songInfo(resolved)) }.orEmpty().trim()
                    val url = if (raw.startsWith("{")) JSONObject(raw).optString("url") else raw
                    if (url.startsWith("https://") || url.startsWith("http://")) assets.put("coverUrl", url.replaceFirst("http://", "https://"))
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // Keep independently retrieved public lyrics when a source picture request fails.
            }
        }
        assets
    }

    suspend fun resolveIdentity(song: Song): Song {
        if (song.source != "qishui") return song
        val input = song.toJson().put("matchSources", org.json.JSONArray(host.supportedSources("musicUrl")))
        return Song.fromJson(JSONObject(host.catalogue("match-song", input.toString())))
            ?: throw IllegalStateException("汽水歌曲信息不完整")
    }

    suspend fun catalogue(operation: String, paramsJson: String): String = withContext(Dispatchers.IO) {
        host.catalogue(operation, paramsJson)
    }
}
