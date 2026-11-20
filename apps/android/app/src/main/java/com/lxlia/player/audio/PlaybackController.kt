@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 播放调度：队列、顺序、切歌与系统播控都集中在这里（对应鸿蒙 PlayerService + Index 的 advance）。
 * 播放地址由 LxEngine 按当前音源解析，失败时由引擎在其它音源间回退。
 * 该对象属于进程级单例：Activity 销毁后后台播控仍能切歌。
 */
object PlaybackController {
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var player: ExoPlayer? = null
    internal val spectrum = PcmSpectrum()

    fun setSpectrumEnabled(enabled: Boolean) = spectrum.setEnabled(enabled)

    @Volatile
    var mixWithOthers: Boolean = false
        private set

    internal fun musicAudioAttributes(): AudioAttributes = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build()

    fun setMixWithOthers(enabled: Boolean) {
        mixWithOthers = enabled
        main.post {
            player?.setAudioAttributes(musicAudioAttributes(), /* handleAudioFocus = */ !enabled)
        }
    }

    internal fun spectrumFrame(): PcmSpectrum.Frame? =
        player?.takeIf { it.isPlaying }?.let { spectrum.frameAt(it.currentPosition * 1000) }

    var queue: List<Song> = emptyList()
        private set
    var currentIndex: Int = -1
        private set
    var current: Song? = null
        private set
    var mode: String = "列表循环"
        private set
    var playing: Boolean = false
        private set
    var positionMs: Long = 0
        private set
    var durationMs: Long = 0
        private set
    /** 当前实际播放的地址（远程 URL 或 file:// 路径）。 */
    var currentUrl: String = ""
        private set

    /** 解析播放地址；由引擎注入，包含全源并行竞速与跨平台兜底。 */
    var urlResolver: (suspend (Song) -> String)? = null
    /** 运行时检测到 30s VIP 试听时的无感全源重解析器。 */
    var previewFallbackResolver: (suspend (Song) -> String)? = null
    /** 本地/离线文件路径解析：命中则跳过在线解析。 */
    var localResolver: ((Song) -> String?)? = null
    private var previewRetryKey: String = ""

    var onSongChanged: ((Song) -> Unit)? = null
    var onSourceReady: ((Song, String) -> Unit)? = null
    var onState: ((String) -> Unit)? = null
    var onTime: ((Long) -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var fallbackUrlResolver: (suspend (Song) -> String)? = null

    private var playToken = 0
    private var retriedSongKey = ""

    private fun friendlyError(raw: String?): String {
        val msg = raw?.trim().orEmpty()
        if (msg.isEmpty()) return "当前音源暂不可播放，请切换其他音源或重试"
        val isRawTech = Regex("[A-Za-z_]{4,}|CONTAINER_ERR|Unsupported|HTTP\\s*\\d|ECONN|ETIMEDOUT|IO_ERR|Exception|Source error|ERROR_CODE|MediaCodec|Socket|SSL|TLS|Unable to resolve", RegexOption.IGNORE_CASE).containsMatchIn(msg)
        return if (isRawTech) "当前音源暂不可播放，请切换其他音源或重试" else msg
    }
    private var ticker: Job? = null
    private var resolveJob: Job? = null
    private var autoPlay = true
    private var startPosition = 0L
    private var localPath: String? = null

    val isReady: Boolean get() = player != null
    fun updateArtwork(song: Song) {
        if (current?.key != song.key) return
        current = song
        queue = queue.map { if (it.key == song.key) song else it }
        val active = player ?: return
        val item = active.currentMediaItem ?: return
        if (item.mediaId != song.key) return
        val metadata = item.mediaMetadata.buildUpon().setArtworkUri(song.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse)).build()
        active.replaceMediaItem(active.currentMediaItemIndex, item.buildUpon().setMediaMetadata(metadata).build())
    }

    /** 原位替换队列中的歌曲（如切换平台或批量补全封面）。 */
    fun replaceQueueSong(index: Int, oldKey: String, newSong: Song) {
        if (queue.isEmpty()) return
        val mutable = queue.toMutableList()
        if (index in mutable.indices && mutable[index].key == oldKey) {
            mutable[index] = newSong
        } else {
            val found = mutable.indexOfFirst { it.key == oldKey }
            if (found in mutable.indices) mutable[found] = newSong
        }
        queue = mutable
    }

    fun applyCoverMap(covers: Map<String, String>) {
        if (covers.isEmpty() || queue.isEmpty()) return
        var changed = false
        queue = queue.map { song ->
            val url = covers[song.key]
            if (!url.isNullOrEmpty() && song.coverUrl.isEmpty()) {
                changed = true
                song.copy(coverUrl = url)
            } else song
        }
        val active = current
        if (active != null) {
            val url = covers[active.key]
            if (!url.isNullOrEmpty() && active.coverUrl.isEmpty()) {
                updateArtwork(active.copy(coverUrl = url))
            }
        }
        if (changed) onState?.invoke(if (playing) "playing" else "paused")
    }

    fun onPlayerReady(exoPlayer: ExoPlayer) {
        player = exoPlayer
        exoPlayer.setAudioAttributes(musicAudioAttributes(), /* handleAudioFocus = */ !mixWithOthers)
        exoPlayer.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_READY -> {
                        resolvedDuration()
                        val activeSong = current
                        val realDur = exoPlayer.duration
                        if (
                            activeSong != null &&
                            activeSong.source != "local" &&
                            localPath.isNullOrEmpty() &&
                            activeSong.durationMs >= 75_000L &&
                            realDur in 5_001L..45_000L &&
                            realDur < (activeSong.durationMs * 0.45).toLong() &&
                            previewRetryKey != activeSong.key
                        ) {
                            previewRetryKey = activeSong.key
                            val fallback = previewFallbackResolver
                            val token = playToken
                            if (fallback != null) {
                                scope.launch {
                                    val altUrl = runCatching { withContext(Dispatchers.IO) { fallback(activeSong) } }.getOrNull()
                                    if (token == playToken && !altUrl.isNullOrEmpty() && altUrl != currentUrl) {
                                        currentUrl = altUrl
                                        val item = MediaItem.Builder()
                                            .setMediaId(activeSong.key)
                                            .setUri(altUrl)
                                            .setMediaMetadata(
                                                MediaMetadata.Builder()
                                                    .setTitle(activeSong.name)
                                                    .setArtist(activeSong.singer)
                                                    .setAlbumTitle(activeSong.albumName)
                                                    .setArtworkUri(activeSong.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
                                                    .build()
                                            )
                                            .build()
                                        exoPlayer.setMediaItem(item)
                                        exoPlayer.prepare()
                                        exoPlayer.playWhenReady = true
                                    }
                                }
                                return
                            }
                        }
                        if (startPosition > 0) {
                            exoPlayer.seekTo(startPosition.coerceAtMost((durationMs - 250).coerceAtLeast(0)))
                            startPosition = 0
                        }
                        emitTime(exoPlayer.currentPosition)
                    }
                    Player.STATE_ENDED -> handleCompleted()
                    Player.STATE_IDLE -> Unit
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
                emitState(if (isPlaying) "playing" else "paused")
                if (isPlaying) startTicker() else stopTicker()
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                val failedSong = current
                val fallback = fallbackUrlResolver
                if (failedSong != null && localPath == null && fallback != null && retriedSongKey != failedSong.key) {
                    retriedSongKey = failedSong.key
                    val token = playToken
                    resolveJob?.cancel()
                    resolveJob = scope.launch {
                        try {
                            val nextUrl = withContext(Dispatchers.IO) { fallback(failedSong) }
                            if (token != playToken) return@launch
                            prepareUrl(nextUrl, failedSong, token)
                        } catch (fallbackErr: Throwable) {
                            if (token != playToken) return@launch
                            playing = false
                            emitState("error")
                            onError?.invoke(friendlyError(fallbackErr.message ?: error.message))
                        }
                    }
                    return
                }
                onError?.invoke(friendlyError(error.message))
                playing = false
                emitState("error")
            }
        })
        main.post {
            if (queue.isNotEmpty() && current != null) {
                // 进程被系统回收后恢复的单曲仍需重新解析地址。
                if (player?.mediaItemCount == 0) internalPlay(current!!, startPosition, autoPlay)
            }
        }
    }

    fun onPlayerReleased() {
        spectrum.setEnabled(false)
        playToken++
        resolveJob?.cancel()
        startPosition = (player?.currentPosition ?: positionMs).coerceAtLeast(0)
        positionMs = startPosition
        playing = false
        player = null
        stopTicker()
    }

    fun setMode(value: String) {
        if (value == mode) return
        mode = value
    }

    /** 用户从某个列表点歌：整表成为队列，当前项起播。 */
    fun playFromList(songs: List<Song>, index: Int, startMs: Long = 0, autoPlay: Boolean = true) {
        if (songs.isEmpty()) return
        val safeIndex = index.coerceIn(0, songs.lastIndex)
        queue = songs.toList()
        currentIndex = safeIndex
        internalPlay(queue[safeIndex], startMs, autoPlay)
    }

    fun playSingle(song: Song, startMs: Long = 0, autoPlay: Boolean = true) {
        queue = listOf(song)
        currentIndex = 0
        internalPlay(song, startMs, autoPlay)
    }

    private fun internalPlay(song: Song, startMs: Long, autoPlay: Boolean) {
        val token = ++playToken
        resolveJob?.cancel()
        if (retriedSongKey != song.key) retriedSongKey = ""
        this.autoPlay = autoPlay
        startPosition = startMs.coerceAtLeast(0)
        current = song
        // 切歌先停旧音频并清掉旧地址：解析新地址可能耗时数百毫秒，
        // 否则旧歌会继续响、舞台还会拿到上一首的 URL。
        currentUrl = ""
        playing = false
        positionMs = startPosition
        durationMs = song.durationMs
        onSongChanged?.invoke(song)
        player?.pause()
        emitTime(positionMs)
        val local = localResolver?.invoke(song)
        if (!local.isNullOrEmpty()) {
            localPath = local
            prepareLocal(local, song, token)
            return
        }
        localPath = null
        val resolver = urlResolver
        if (resolver == null) {
            onError?.invoke("先在设置中启用一个支持此平台的音源")
            return
        }
        resolveJob = scope.launch {
            try {
                val url = withContext(Dispatchers.IO) { resolver(song) }
                if (token != playToken) return@launch
                prepareUrl(url, song, token)
            } catch (error: Throwable) {
                if (token != playToken) return@launch
                currentUrl = ""
                player?.pause()
                playing = false
                emitState("error")
                onError?.invoke(friendlyError(error.message))
            }
        }
    }

    private fun prepareUrl(url: String, song: Song, token: Int, attempt: Int = 0) {
        if (token != playToken) return
        val exoPlayer = player
        if (exoPlayer == null) {
            // 服务刚被拉起时播放器可能还没创建，短等而不是直接失败。
            if (attempt < 30) {
                main.postDelayed({ prepareUrl(url, song, token, attempt + 1) }, 100)
            } else {
                onError?.invoke("播放器尚未就绪")
            }
            return
        }
        currentUrl = url
        onSourceReady?.invoke(song, currentUrl)
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.singer)
            .setAlbumTitle(song.albumName)
            .setArtworkUri((current?.takeIf { it.key == song.key } ?: song).coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .build()
        val item = MediaItem.Builder()
            .setUri(url)
            .setMediaId(song.key)
            .setMediaMetadata(metadata)
            .build()
        exoPlayer.setMediaItem(item)
        exoPlayer.playWhenReady = autoPlay
        exoPlayer.prepare()
    }

    private fun prepareLocal(path: String, song: Song, token: Int) {
        if (token != playToken) return
        val exoPlayer = player ?: return
        currentUrl = "file://$path"
        onSourceReady?.invoke(song, currentUrl)
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.singer)
            .setAlbumTitle(song.albumName)
            .setArtworkUri(song.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
            .build()
        val item = MediaItem.Builder()
            .setUri(Uri.fromFile(java.io.File(path)))
            .setMediaId(song.key)
            .setMediaMetadata(metadata)
            .build()
        exoPlayer.setMediaItem(item)
        exoPlayer.playWhenReady = autoPlay
        exoPlayer.prepare()
    }

    fun pause() {
        autoPlay = false
        player?.pause()
        playing = false
        emitState("paused")
    }

    fun resume(): Boolean {
        val exoPlayer = player ?: return false
        if (current == null) return false
        autoPlay = true
        if (currentUrl.isNotEmpty()) exoPlayer.play()
        return true
    }

    fun seek(timeMs: Long) {
        val exoPlayer = player ?: return
        val target = timeMs.coerceIn(0, durationMs.coerceAtLeast(0))
        spectrum.reset()
        exoPlayer.seekTo(target)
        positionMs = target
        emitTime(target)
    }

    /** 与鸿蒙 advance 同规则：顺序播放到末尾停止，单曲循环原地重播，随机取不同项。 */
    fun advance(step: Int, completed: Boolean = false) {
        if (queue.isEmpty() || current == null) return
        val index = queue.indexOfFirst { it.key == current?.key }.coerceAtLeast(0)
        if (completed && mode == "顺序播放" && index >= queue.lastIndex) {
            playing = false
            emitState("paused")
            return
        }
        if (completed && mode == "单曲循环") {
            autoPlay = true
            player?.seekTo(0)
            player?.play()
            return
        }
        var next = ((index + step) % queue.size + queue.size) % queue.size
        if (mode == "随机播放" && queue.size > 1) {
            next = ((index + 1 + (0 until queue.size - 1).random()) % queue.size)
        }
        currentIndex = next
        internalPlay(queue[next], 0, true)
    }

    private fun handleCompleted() {
        emitState("completed")
        advance(1, true)
    }

    /** 顺序键：与鸿蒙 mode 字段一致，供设置页与播控按钮共用。 */
    val modeValues = listOf("列表循环", "单曲循环", "随机播放", "顺序播放")

    fun cycleMode() {
        mode = modeValues[(modeValues.indexOf(mode) + 1) % modeValues.size]
    }

    /** 播放器报告的时长偶尔小于歌曲元数据（分片流 / 试听片段），取较大值保证进度条可读可拖。 */
    private fun resolvedDuration(): Long {
        val playerDuration = player?.duration ?: 0L
        val known = current?.durationMs ?: 0L
        return when {
            playerDuration > 0 && known > 0 -> maxOf(playerDuration, known)
            playerDuration > 0 -> playerDuration
            else -> known.coerceAtLeast(0)
        }.also { durationMs = it }
    }

    private fun startTicker() {
        if (ticker?.isActive == true) return
        ticker = scope.launch {
            while (true) {
                delay(250)
                val exoPlayer = player ?: break
                if (!exoPlayer.isPlaying) continue
                emitTime(exoPlayer.currentPosition)
                resolvedDuration()
            }
        }
    }

    private fun stopTicker() {
        ticker?.cancel()
        ticker = null
    }

    private fun emitTime(value: Long) {
        positionMs = value
        onTime?.invoke(value)
    }

    private fun emitState(state: String) {
        onState?.invoke(state)
    }

    val sessionCallback = object : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val result = super.onConnect(session, controller)
            // 单曲 MediaItem 没有“下一首”，但应用自己维护队列：显式放开上一首/下一首命令。
            val commands = result.availablePlayerCommands.buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(commands)
                .build()
        }

    }

    /** 系统播控的进度条拖动。 */
    fun onSessionSeek(timeMs: Long) = seek(timeMs)

    /** 歌词同步只影响舞台/详情页，系统通知不支持逐行歌词（鸿蒙单行歌词文本在 Android 无对应字段）。 */
    fun setLyrics(lines: List<LyricLine>, offset: Long) {
        lyricLines = lines
        lyricOffset = offset
    }

    var lyricLines: List<LyricLine> = emptyList()
        private set
    var lyricOffset: Long = 0
        private set

    fun setLyricOffset(offset: Long) {
        lyricOffset = offset
    }

    val hasPrevious: Boolean get() = queue.size > 1 || positionMs > 3000
    val hasNext: Boolean get() = queue.size > 1
}
