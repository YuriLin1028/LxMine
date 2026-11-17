package com.lxlia.player.lx
import org.json.JSONObject

import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import com.lxlia.player.model.SyncSourcePayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
    suspend fun resolveUrl(song: Song): String = withContext(Dispatchers.IO) {
        activationMutex.withLock {
            if (!ready || !host.ready) activeSource()?.let { activateSource(it) }
        }
        val resolved = resolveIdentity(song)
        val info = songInfo(resolved)
        val primary = activeSource()
        if (primary == null || !ready) throw IllegalStateException("先在设置中启用一个支持此平台的音源")
        try {
            return@withContext host.requestMusicUrl(info)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val message = error.message ?: "音源请求失败"
            if (sources.size <= 1) throw IllegalStateException(message)
            val current = sources.indexOfFirst { it.id == activeId }.coerceAtLeast(0)
            val attempts = minOf(6, sources.size - 1)
            val tried = mutableListOf<String>()
            var lastError = ""
            for (offset in 1..attempts) {
                val fallback = sources[(current + offset) % sources.size]
                tried.add(fallback.name)
                if (!activate(fallback)) {
                    lastError = "音源加载失败"
                    continue
                }
                try {
                    val url = host.requestMusicUrl(songInfo(resolved))
                    onMessage?.invoke("当前音源失败，已切换到「${fallback.name}」")
                    return@withContext url
                } catch (fallbackError: CancellationException) {
                    throw fallbackError
                } catch (fallbackError: Throwable) {
                    lastError = fallbackError.message ?: ""
                }
            }
            throw IllegalStateException(
                "播放失败：$message（已尝试备用音源：${tried.joinToString("、").ifEmpty { "无" }}" +
                    (if (lastError.isNotEmpty()) "；$lastError" else "") + "）"
            )
        }
    }

    /** 歌词：先问音源，缺失或不完整时回落到原平台公开歌词。 */
    suspend fun lyricBundle(song: Song, needTranslation: Boolean, needRomaji: Boolean): Triple<List<LyricLine>, List<LyricLine>, List<LyricLine>> =
        withContext(Dispatchers.IO) {
            var lines: List<LyricLine> = emptyList()
            var translation: List<LyricLine> = emptyList()
            var romaji: List<LyricLine> = emptyList()
            runCatching {
                val resolved = resolveIdentity(song)
                val bundle = host.requestLyricBundle(songInfo(resolved))
                lines = LyricParser.parse(bundle.lxlyric.ifEmpty { bundle.lyric })
                translation = LyricParser.parse(bundle.tlyric)
                romaji = LyricParser.parse(bundle.romalrc.ifEmpty { bundle.rlyric })
            }
            if (lines.size <= 1 || (needTranslation && translation.isEmpty()) || (needRomaji && romaji.isEmpty())) {
                runCatching {
                    val full = songAssets(song)
                    val publicLines = LyricParser.parse(full.optString("lyric"))
                    if (publicLines.size > lines.size) lines = publicLines
                    if (translation.isEmpty()) translation = LyricParser.parse(full.optString("tlyric"))
                    if (romaji.isEmpty()) romaji = LyricParser.parse(full.optString("romalrc"))
                }
            }
            Triple(lines, translation, romaji)
        }

    suspend fun importPlaylist(input: String, source: String): String = withContext(Dispatchers.IO) {
        host.importPlaylist(input, source)
    }
    suspend fun songAssets(song: Song): JSONObject = withContext(Dispatchers.IO) {
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
