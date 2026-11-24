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
    internal val fxProcessor = SoftwareAudioFxProcessor()
    internal val secondaryFxProcessor = SoftwareAudioFxProcessor()
    private val primaryFx = AudioFxEngine()
    private val secondaryFx = AudioFxEngine()
    private var audioFxConfig: AudioFxConfig = AudioFxConfig()
    private val bluetoothMonitor = BluetoothAudioMonitor()
    private var audioManagerRef: android.media.AudioManager? = null
    private var playbackConfigCallback: android.media.AudioManager.AudioPlaybackCallback? = null
    private var modeChangedListener: Any? = null
    @Volatile private var interruptedByCall: Boolean = false
    @Volatile private var callSceneCurrentlyActive: Boolean = false
    @Volatile private var lastCallSceneExitAt: Long = 0L
    @Volatile private var lastInterruptResumeAt: Long = 0L
    private var callResumeJob: Job? = null

    private fun queryCallSceneActive(): Boolean {
        val am = audioManagerRef ?: return false
        val mode = runCatching { am.mode }.getOrDefault(android.media.AudioManager.MODE_NORMAL)
        if (mode == android.media.AudioManager.MODE_RINGTONE ||
            mode == android.media.AudioManager.MODE_IN_CALL ||
            mode == android.media.AudioManager.MODE_IN_COMMUNICATION ||
            (android.os.Build.VERSION.SDK_INT >= 30 && mode == android.media.AudioManager.MODE_CALL_SCREENING)
        ) {
            return true
        }
        val configs = runCatching { am.activePlaybackConfigurations }.getOrNull().orEmpty()
        return configs.any { cfg ->
            val usage = runCatching { cfg.audioAttributes.usage }.getOrDefault(0)
            usage == android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION ||
                usage == android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING ||
                usage == android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE
        }
    }

    private fun evaluateCallSceneTransition() {
        val activeNow = queryCallSceneActive()
        val wasActive = callSceneCurrentlyActive
        callSceneCurrentlyActive = activeNow
        if (activeNow && !wasActive) {
            callResumeJob?.cancel()
            callResumeJob = null
            val exo = player
            val intendedPlaying = playing || (autoPlay && ppFadeDirection != "out") || (exo?.isPlaying == true)
            if (intendedPlaying) {
                interruptedByCall = true
                if (mixWithOthers && exo != null && exo.isPlaying) {
                    cancelActiveCrossfade()
                    cancelFade()
                    cancelPlayPauseFade(true)
                    exo.pause()
                }
            }
        } else if (!activeNow && wasActive) {
            lastCallSceneExitAt = System.currentTimeMillis()
            if (interruptedByCall) {
                scheduleCallResume()
            }
        }
    }

    private fun scheduleCallResume(delayMs: Long = 450L) {
        callResumeJob?.cancel()
        callResumeJob = scope.launch {
            delay(delayMs)
            if (queryCallSceneActive()) {
                callSceneCurrentlyActive = true
                return@launch
            }
            callSceneCurrentlyActive = false
            if (!interruptedByCall) return@launch
            val song = current ?: run {
                interruptedByCall = false
                return@launch
            }
            interruptedByCall = false
            lastInterruptResumeAt = System.currentTimeMillis()
            val exo = player ?: return@launch
            if (exo.isPlaying && exo.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE && ppFadeDirection != "out") {
                exo.volume = 1f
                return@launch
            }
            exo.setAudioAttributes(musicAudioAttributes(), /* handleAudioFocus = */ !mixWithOthers)
            if (currentUrl.isEmpty() || exo.playbackState == Player.STATE_IDLE || exo.playerError != null) {
                internalPlay(song, positionMs.coerceAtLeast(0L), autoPlay = true)
                return@launch
            }
            resume()
        }
    }

    fun startCallAudioMonitor(context: android.content.Context) {
        stopCallAudioMonitor()
        val am = context.applicationContext.getSystemService(android.content.Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return
        audioManagerRef = am
        callSceneCurrentlyActive = queryCallSceneActive()
        val cb = object : android.media.AudioManager.AudioPlaybackCallback() {
            override fun onPlaybackConfigChanged(configs: MutableList<android.media.AudioPlaybackConfiguration>?) {
                main.post { evaluateCallSceneTransition() }
            }
        }
        playbackConfigCallback = cb
        runCatching { am.registerAudioPlaybackCallback(cb, main) }
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            val listener = android.media.AudioManager.OnModeChangedListener {
                main.post { evaluateCallSceneTransition() }
            }
            modeChangedListener = listener
            runCatching { am.addOnModeChangedListener(context.applicationContext.mainExecutor, listener) }
        }
    }

    fun stopCallAudioMonitor() {
        val am = audioManagerRef
        playbackConfigCallback?.let { cb -> runCatching { am?.unregisterAudioPlaybackCallback(cb) } }
        playbackConfigCallback = null
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            (modeChangedListener as? android.media.AudioManager.OnModeChangedListener)?.let { l ->
                runCatching { am?.removeOnModeChangedListener(l) }
            }
        }
        modeChangedListener = null
        audioManagerRef = null
        callResumeJob?.cancel()
        callResumeJob = null
    }

    @Volatile var bluetoothCarLyricsEnabled: Boolean = false
        private set
    @Volatile var bluetoothCarLyricsMode: String = BluetoothCarLyrics.MODE_TITLE
        private set
    @Volatile var bluetoothAudioConnected: Boolean = false
        private set
    var onBluetoothAudioChanged: ((Boolean) -> Unit)? = null
    private var lastCarLyricKey: String = ""
    private var lastCarLyricText: String = ""
    private var lastCarLyricSentAt: Long = 0L
    @Volatile var carLyricActiveOverride: Boolean = false
        private set
    @Volatile var currentCarLyricText: String = ""
        private set

    fun startBluetoothMonitor(context: android.content.Context) {
        bluetoothMonitor.start(context) { connected ->
            bluetoothAudioConnected = connected
            main.post {
                onBluetoothAudioChanged?.invoke(connected)
                syncBluetoothCarLyric(force = true)
            }
        }
    }

    fun stopBluetoothMonitor() {
        bluetoothMonitor.stop()
    }

    fun setBluetoothCarLyrics(enabled: Boolean, mode: String = bluetoothCarLyricsMode) {
        bluetoothCarLyricsEnabled = enabled
        bluetoothCarLyricsMode = BluetoothCarLyrics.normalizeMode(mode)
        main.post { syncBluetoothCarLyric(force = true) }
    }

    var secondaryPlayerFactory: (() -> ExoPlayer)? = null
    var onBeforeCompleted: (() -> Boolean)? = null
    var onAutoMixCommit: ((Song, String) -> Unit)? = null
    var onFadeOutChanged: ((Boolean) -> Unit)? = null

    private var secondaryPlayer: ExoPlayer? = null
    private var preloadedSong: Song? = null
    private var preloadedUrl: String = ""
    private var preloadedReady: Boolean = false
    private var mixJob: Job? = null
    private var fadeJob: Job? = null
    @Volatile var playPauseFadeEnabled: Boolean = true
    private var ppFadeJob: Job? = null
    private var ppFadeDirection: String = ""
    private var ppFadeVolume: Float = 1f

    private fun cancelPlayPauseFade(restoreVolume: Boolean = false) {
        val wasFadingOut = ppFadeDirection == "out"
        ppFadeJob?.cancel()
        ppFadeJob = null
        ppFadeDirection = ""
        if (wasFadingOut) main.post { onFadeOutChanged?.invoke(false) }
        if (restoreVolume && !autoMixActive) {
            ppFadeVolume = 1f
            main.post { player?.volume = 1f }
        }
    }

    private fun startFadeIn(exoPlayer: ExoPlayer, durationMs: Long = 680L, fromVolume: Float = 0.01f) {
        cancelPlayPauseFade(false)
        val startVol = fromVolume.coerceIn(0f, 1f)
        ppFadeDirection = "in"
        ppFadeVolume = startVol
        exoPlayer.volume = startVol
        ppFadeJob = scope.launch {
            val dur = durationMs.coerceAtLeast(120L)
            val startAt = System.currentTimeMillis()
            while (true) {
                if (player !== exoPlayer || autoMixActive || ppFadeDirection != "in") break
                val t = ((System.currentTimeMillis() - startAt).toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                val eased = Math.pow(t.toDouble(), 1.65).toFloat()
                val nextVol = (startVol + (1f - startVol) * eased).coerceIn(0f, 1f)
                ppFadeVolume = nextVol
                exoPlayer.volume = nextVol
                if (t >= 1f) break
                delay(16)
            }
            if (ppFadeDirection == "in") {
                ppFadeDirection = ""
                ppFadeVolume = 1f
                if (!autoMixActive) exoPlayer.volume = 1f
            }
        }
    }

    fun replaceQueueKeepPlaying(nextQueue: List<Song>) {
        if (nextQueue.isEmpty()) return
        queue = nextQueue.toList()
        nextShuffleSongKey = ""
        cancelAutoMix()
        val curKey = current?.key
        currentIndex = if (curKey != null) queue.indexOfFirst { it.key == curKey }.coerceAtLeast(0) else 0
        onSessionStateRefresh?.invoke()
    }
    var autoMixActive: Boolean = false
        private set
    @Volatile private var seekGuardTarget: Long = -1L
    @Volatile private var seekGuardUntil: Long = 0L
    private var nextShuffleSongKey: String = ""

    fun setAudioFx(config: AudioFxConfig) {
        val spatialChanged = audioFxConfig.spatialMode != config.spatialMode
        audioFxConfig = config
        fxProcessor.updateConfig(config)
        secondaryFxProcessor.updateConfig(config)
        main.post {
            if (spatialChanged) {
                player?.setAudioAttributes(musicAudioAttributes(), /* handleAudioFocus = */ !mixWithOthers)
            }
            player?.audioSessionId?.takeIf { it > 0 }?.let { primaryFx.attach(it, config) }
            secondaryPlayer?.audioSessionId?.takeIf { it > 0 }?.let { secondaryFx.attach(it, config) }
        }
    }

    fun setMusicMonitorGain(gain: Float) {
        fxProcessor.setMonitorGain(gain)
        secondaryFxProcessor.setMonitorGain(gain)
    }

    fun startSpatialMonitor(context: android.content.Context, listener: (SpatialHardwareStatus) -> Unit) {
        primaryFx.startSpatialMonitor(context, listener)
    }

    fun querySpatialStatus(context: android.content.Context): SpatialHardwareStatus =
        primaryFx.querySpatialStatus(context)

    fun setSpectrumEnabled(enabled: Boolean) = spectrum.setEnabled(enabled)

    @Volatile
    var mixWithOthers: Boolean = false
        private set

    internal fun musicAudioAttributes(): AudioAttributes = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .setSpatializationBehavior(
            if (audioFxConfig.spatialMode == "off") C.SPATIALIZATION_BEHAVIOR_NEVER
            else C.SPATIALIZATION_BEHAVIOR_AUTO
        )
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
    /** 运行时检测到 30s/60s VIP 试听或时长不符串歌时的无感全源/跨平台重解析器。 */
    var previewFallbackResolver: (suspend (song: Song, attempt: Int, excludeSourceIds: List<String>, excludeUrls: List<String>) -> String)? = null
    var currentResolvedSourceIdProvider: (() -> String)? = null
    var hasOtherSourceChecker: ((excludeSourceIds: List<String>) -> Boolean)? = null
    /** 本地/离线文件路径解析：命中则跳过在线解析。 */
    var localResolver: ((Song) -> String?)? = null
    var onPreviewRecovered: ((String) -> Unit)? = null
    private var previewRetryKey: String = ""
    private var previewRetryCount: Int = 0
    private val previewBadUrls = mutableListOf<String>()
    private val previewBadSourceIds = mutableListOf<String>()
    @Volatile
    private var previewRecovering: Boolean = false
    @Volatile
    private var pendingDurationGatePlay: Boolean = false

    var onSongChanged: ((Song) -> Unit)? = null
    var onSessionStateRefresh: (() -> Unit)? = null
    var onSourceReady: ((Song, String) -> Unit)? = null
    var onState: ((String) -> Unit)? = null
    var onTime: ((Long) -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var fallbackUrlResolver: (suspend (Song) -> String)? = null

    private var playToken = 0
    private var retriedSongKey = ""
    private var consecutiveAutoSkipCount = 0
    @Volatile
    private var isResolvingTrack = false

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

    /** 从播放队列移除歌曲；若删的是当前曲目则无缝切到下一首，删掉最后一首则暂停。 */
    fun removeFromQueue(targetKey: String): List<Song> {
        if (queue.isEmpty()) return queue
        val idx = queue.indexOfFirst { it.key == targetKey }
        if (idx < 0) return queue
        val wasCurrent = current?.key == targetKey
        val nextList = queue.filterIndexed { i, _ -> i != idx }
        queue = nextList
        nextShuffleSongKey = ""
        cancelAutoMix()
        if (nextList.isEmpty()) {
            pause()
            currentIndex = -1
            current = null
            currentUrl = ""
            return nextList
        }
        if (wasCurrent) {
            val nextIdx = idx.coerceAtMost(nextList.lastIndex)
            currentIndex = nextIdx
            internalPlay(nextList[nextIdx], 0L, playing || autoPlay)
        } else {
            val curKey = current?.key
            currentIndex = if (curKey != null) nextList.indexOfFirst { it.key == curKey }.coerceAtLeast(0) else 0
        }
        return nextList
    }

    /** 按用户手动拖动的新顺序重排播放队列，不中断当前播放曲目。 */
    fun reorderQueue(orderedKeys: List<String>): List<Song> {
        if (queue.size <= 1 || orderedKeys.isEmpty()) return queue
        val rank = HashMap<String, Int>(orderedKeys.size)
        orderedKeys.forEachIndexed { idx, key -> if (!rank.containsKey(key)) rank[key] = idx }
        val sorted = queue.sortedBy { rank[it.key] ?: Int.MAX_VALUE }
        queue = sorted
        nextShuffleSongKey = ""
        cancelAutoMix()
        val curKey = current?.key
        if (curKey != null) {
            currentIndex = sorted.indexOfFirst { it.key == curKey }.coerceAtLeast(0)
        }
        return sorted
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
        exoPlayer.audioSessionId.takeIf { it > 0 }?.let { primaryFx.attach(it, audioFxConfig) }
        exoPlayer.addListener(object : Player.Listener {
            override fun onAudioSessionIdChanged(audioSessionId: Int) {
                if (audioSessionId > 0) primaryFx.attach(audioSessionId, audioFxConfig)
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (isResolvingTrack) return
                when (playbackState) {
                    Player.STATE_READY -> {
                        val activeSong = current
                        val realDur = exoPlayer.duration
                        val mismatch = classifyStreamDurationMismatch(activeSong, realDur)
                        if (activeSong != null && mismatch != "ok") {
                            pendingDurationGatePlay = false
                            exoPlayer.playWhenReady = false
                            exoPlayer.pause()
                            val stopExhausted: () -> Unit = {
                                main.post {
                                    player?.playWhenReady = false
                                    player?.pause()
                                    playing = false
                                    emitState("paused")
                                    onPreviewRecovered?.invoke(
                                        if (mismatch == "wrong") "检测到音源返回曲目与原曲不符，已拦截，请切换音源或平台"
                                        else "检测到试听片段且暂无可用完整音源，已停止"
                                    )
                                }
                            }
                            val started = triggerVipPreviewRecovery(activeSong, 0L, mismatch, stopExhausted)
                            if (!started && !previewRecovering) {
                                stopExhausted()
                            }
                            return
                        }
                        resolvedDuration()
                        if (pendingDurationGatePlay) {
                            pendingDurationGatePlay = false
                            if (autoPlay && playPauseFadeEnabled) startFadeIn(exoPlayer, 680L, 0.01f) else exoPlayer.volume = 1f
                            exoPlayer.playWhenReady = autoPlay
                        }
                        if (startPosition > 200L) {
                            val safeDur = maxOf(
                                exoPlayer.duration.takeIf { it > 0L } ?: 0L,
                                durationMs,
                                activeSong?.durationMs ?: 0L,
                            )
                            val target = if (safeDur > 500L) {
                                startPosition.coerceAtMost((safeDur - 250L).coerceAtLeast(0L))
                            } else {
                                startPosition
                            }
                            startPosition = 0L
                            if (kotlin.math.abs(exoPlayer.currentPosition - target) > 1200L) {
                                seekGuardTarget = target
                                seekGuardUntil = System.currentTimeMillis() + 3500L
                                exoPlayer.seekTo(target)
                            }
                        } else {
                            startPosition = 0L
                        }
                        val readyPos = exoPlayer.currentPosition
                        val now = System.currentTimeMillis()
                        if (seekGuardUntil > 0L && now < seekGuardUntil && kotlin.math.abs(readyPos - seekGuardTarget) > 2500L) {
                            // 跳转尚未落稳，忽略跳转前旧时间戳，避免进度条来回抖动。
                        } else {
                            if (seekGuardUntil > 0L) {
                                seekGuardUntil = 0L
                                seekGuardTarget = -1L
                            }
                            emitTime(readyPos)
                        }
                    }
                    Player.STATE_ENDED -> handleCompleted()
                    Player.STATE_IDLE -> Unit
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isResolvingTrack) return
                playing = isPlaying
                if (isPlaying) consecutiveAutoSkipCount = 0
                emitState(if (isPlaying) "playing" else "paused")
                if (isPlaying) startTicker() else stopTicker()
                syncBluetoothCarLyric(force = true)
            }

            override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
                if (isResolvingTrack) return
                if (playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_TRANSIENT_AUDIO_FOCUS_LOSS) {
                    if (autoPlay && ppFadeDirection != "out" && queryCallSceneActive()) {
                        callSceneCurrentlyActive = true
                        interruptedByCall = true
                    }
                } else if (playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE && exoPlayer.playWhenReady) {
                    interruptedByCall = false
                }
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (isResolvingTrack || playWhenReady) return
                when (reason) {
                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS -> {
                        val inCall = queryCallSceneActive() || callSceneCurrentlyActive
                        if (inCall && autoPlay) {
                            callSceneCurrentlyActive = true
                            interruptedByCall = true
                        } else {
                            interruptedByCall = false
                            autoPlay = false
                        }
                    }
                    Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY -> {
                        val nearCallHangup = interruptedByCall ||
                            queryCallSceneActive() ||
                            (System.currentTimeMillis() - lastCallSceneExitAt in 0..2800L)
                        if (nearCallHangup) {
                            interruptedByCall = true
                            scheduleCallResume(520L)
                        } else {
                            autoPlay = false
                        }
                    }
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                if (isResolvingTrack) return
                val failedSong = current
                if (failedSong != null && System.currentTimeMillis() - lastInterruptResumeAt < 6500L) {
                    lastInterruptResumeAt = 0L
                    internalPlay(failedSong, positionMs.coerceAtLeast(0L), autoPlay = true)
                    return
                }
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
                        } catch (_: Throwable) {
                            if (token != playToken) return@launch
                            playing = false
                            emitState("paused")
                        }
                    }
                    return
                }
                playing = false
                emitState("paused")
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
        interruptedByCall = false
        lastInterruptResumeAt = 0L
        callResumeJob?.cancel()
        callResumeJob = null
        cancelAutoMix()
        cancelFade()
        cancelPlayPauseFade(false)
        seekGuardTarget = -1L
        seekGuardUntil = 0L
        nextShuffleSongKey = ""
        previewRetryKey = ""
        previewRetryCount = 0
        previewBadUrls.clear()
        previewBadSourceIds.clear()
        previewRecovering = false
        pendingDurationGatePlay = false
        primaryFx.release()
        secondaryFx.release()
        secondaryPlayerFactory = null
        spectrum.setEnabled(false)
        playToken++
        resolveJob?.cancel()
        startPosition = (player?.currentPosition ?: positionMs).coerceAtLeast(0)
        positionMs = startPosition
        playing = false
        player = null
        stopTicker()
    }

    fun peekNextSong(): Song? {
        val cur = current ?: return null
        if (queue.size <= 1 || mode == "单曲循环") return null
        val idx = queue.indexOfFirst { it.key == cur.key }
        if (idx < 0) return null
        if (mode == "顺序播放" && idx >= queue.lastIndex) return null
        if (mode == "随机播放") {
            val cached = queue.firstOrNull { it.key == nextShuffleSongKey && it.key != cur.key }
            if (cached != null) return cached
            val nextIdx = (idx + 1 + (0 until queue.size - 1).random()) % queue.size
            val picked = queue.getOrNull(nextIdx)?.takeIf { it.key != cur.key }
            nextShuffleSongKey = picked?.key.orEmpty()
            return picked
        }
        nextShuffleSongKey = ""
        val nextIdx = (idx + 1) % queue.size
        return queue.getOrNull(nextIdx)?.takeIf { it.key != cur.key }
    }

    fun isPreloadedFor(song: Song): Boolean = preloadedReady && preloadedSong?.key == song.key

    fun preloadNext(song: Song, urlOrPath: String, isLocal: Boolean, startMs: Long) {
        main.post {
            disposeSecondary()
            val factory = secondaryPlayerFactory ?: return@post
            val deck = runCatching { factory() }.getOrNull() ?: return@post
            secondaryPlayer = deck
            preloadedSong = song
            val cleanLocal = if (isLocal) urlOrPath.removePrefix("file://") else urlOrPath
            preloadedUrl = if (isLocal) "file://$cleanLocal" else urlOrPath
            preloadedReady = false
            deck.volume = 0.001f
            deck.audioSessionId.takeIf { it > 0 }?.let { secondaryFx.attach(it, audioFxConfig) }
            deck.addListener(object : Player.Listener {
                override fun onAudioSessionIdChanged(audioSessionId: Int) {
                    if (audioSessionId > 0 && secondaryPlayer === deck) secondaryFx.attach(audioSessionId, audioFxConfig)
                }
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (secondaryPlayer !== deck) return
                    if (playbackState == Player.STATE_READY) {
                        val deckDur = deck.duration
                        val metaDur = song.durationMs
                        if (!isLocal && metaDur >= 45_000L && deckDur > 3_000L) {
                            val isWrong = kotlin.math.abs(deckDur - metaDur) > 8_000L
                            val isShort = deckDur <= 72_000L && deckDur < (metaDur * 0.58).toLong()
                            if (isWrong || isShort) {
                                disposeSecondary()
                                return
                            }
                        }
                        preloadedReady = true
                    }
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    if (secondaryPlayer !== deck) return
                    disposeSecondary()
                }
            })
            val uri = if (isLocal) Uri.fromFile(java.io.File(cleanLocal)) else Uri.parse(urlOrPath)
            val safeStart = if (startMs > 200L) {
                val cap = if (song.durationMs > 3000L) song.durationMs - 2000L else startMs
                startMs.coerceIn(0L, cap.coerceAtLeast(0L))
            } else 0L
            val item = MediaItem.Builder().setUri(uri).setMediaId(song.key).build()
            if (safeStart > 200L) deck.setMediaItem(item, safeStart) else deck.setMediaItem(item)
            deck.playWhenReady = false
            deck.prepare()
        }
    }

    fun startAutoMix(
        crossfadeMs: Long,
        strategy: String,
        tempoMatch: Boolean = false,
        rateA: Float = 1f,
        rateB: Float = 1f,
    ) {
        val mainPlayer = player ?: return
        val deck = secondaryPlayer ?: return
        val nextSong = preloadedSong ?: return
        val nextUrl = preloadedUrl
        if (!preloadedReady || autoMixActive) return
        autoMixActive = true
        val dur = crossfadeMs.coerceIn(1800L, 11000L)
        val useTempo = tempoMatch && (rateA != 1f || rateB != 1f)
        val targetRateA = rateA.coerceIn(0.965f, 1.035f)
        val targetRateB = rateB.coerceIn(0.965f, 1.035f)
        mixJob?.cancel()
        mixJob = scope.launch {
            try {
                val basePos = deck.currentPosition.coerceAtLeast(0L)
                // 零突兀弹入：副轨以极低音量起步，完全由包络曲线自然浮现
                deck.volume = 0.004f
                if (useTempo) {
                    runCatching { deck.setPlaybackParameters(androidx.media3.common.PlaybackParameters(targetRateB, 1f)) }
                }
                deck.playWhenReady = true
                deck.play()
                // 等待副轨真正进入播放并推进时间轴（最多 3500ms），避免在线流首包缓冲稍慢时误判取消混音。
                val waitStart = System.currentTimeMillis()
                val waitDeadline = waitStart + 3500L
                var deckAudible = false
                while (autoMixActive && secondaryPlayer === deck && System.currentTimeMillis() < waitDeadline) {
                    val state = deck.playbackState
                    if (state == Player.STATE_ENDED || state == Player.STATE_IDLE) break
                    val waited = System.currentTimeMillis() - waitStart
                    if (deck.isPlaying && (deck.currentPosition >= basePos + 20L || waited >= 350L)) {
                        deckAudible = true
                        break
                    }
                    delay(35)
                }
                if (!autoMixActive || secondaryPlayer !== deck || !deckAudible) {
                    mainPlayer.volume = 1f
                    runCatching { mainPlayer.setPlaybackParameters(androidx.media3.common.PlaybackParameters(1f, 1f)) }
                    disposeSecondary()
                    autoMixActive = false
                    return@launch
                }
                val startedAt = System.currentTimeMillis()
                while (autoMixActive && secondaryPlayer === deck) {
                    val mainEnded = mainPlayer.playbackState == Player.STATE_ENDED || mainPlayer.playbackState == Player.STATE_IDLE
                    val t = if (mainEnded) 1f else ((System.currentTimeMillis() - startedAt).toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                    val gains = AutoMixPlanner.equalPowerGains(t, strategy)
                    mainPlayer.volume = gains.outGain.coerceIn(0f, 1f)
                    deck.volume = gains.inGain.coerceIn(0f, 1f)
                    if (useTempo) {
                        val rA = 1f + (targetRateA - 1f) * (t / 0.65f).coerceIn(0f, 1f)
                        val rB = if (t <= 0.45f) targetRateB else (targetRateB + (1f - targetRateB) * ((t - 0.45f) / 0.55f).coerceIn(0f, 1f))
                        runCatching {
                            mainPlayer.setPlaybackParameters(androidx.media3.common.PlaybackParameters(rA, 1f))
                            deck.setPlaybackParameters(androidx.media3.common.PlaybackParameters(rB, 1f))
                        }
                    }
                    if (t >= 1f) break
                    delay(35)
                }
                if (!autoMixActive || secondaryPlayer !== deck) return@launch
                runCatching { mainPlayer.setPlaybackParameters(androidx.media3.common.PlaybackParameters(1f, 1f)) }
                val resumePos = deck.currentPosition.coerceAtLeast(0L)
                val nextDur = deck.duration.takeIf { it > 0L } ?: nextSong.durationMs
                val idx = queue.indexOfFirst { it.key == nextSong.key }
                if (idx >= 0) currentIndex = idx
                current = nextSong
                currentUrl = nextUrl
                nextShuffleSongKey = ""
                previewRetryKey = ""
                previewRetryCount = 0
                previewBadUrls.clear()
                previewBadSourceIds.clear()
                previewRecovering = false
                pendingDurationGatePlay = false
                localPath = if (nextUrl.startsWith("file://")) nextUrl.removePrefix("file://") else null
                val metadata = MediaMetadata.Builder()
                    .setTitle(nextSong.name)
                    .setArtist(nextSong.singer)
                    .setAlbumTitle(nextSong.albumName)
                    .setArtworkUri(nextSong.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
                    .setIsBrowsable(false).setIsPlayable(true).build()
                val uri = if (nextUrl.startsWith("file://")) Uri.fromFile(java.io.File(nextUrl.removePrefix("file://"))) else Uri.parse(nextUrl)
                val targetItem = MediaItem.Builder().setUri(uri).setMediaId(nextSong.key).setMediaMetadata(metadata).build()
                mainPlayer.setMediaItem(targetItem, resumePos)
                mainPlayer.volume = 0f
                mainPlayer.playWhenReady = true
                mainPlayer.prepare()
                var waited = 0L
                while (waited < 1800L && mainPlayer.playbackState != Player.STATE_READY) {
                    delay(35)
                    waited += 35L
                }
                val livePos = deck.currentPosition.coerceAtLeast(resumePos)
                if (kotlin.math.abs(livePos - mainPlayer.currentPosition) > 180L) {
                    runCatching { mainPlayer.seekTo(livePos) }
                }
                mainPlayer.volume = 1f
                val committedPos = mainPlayer.currentPosition.takeIf { it > 0L } ?: livePos
                durationMs = maxOf(mainPlayer.duration.takeIf { it > 0L } ?: 0L, nextDur)
                disposeSecondary()
                autoMixActive = false
                emitTime(committedPos)
                onAutoMixCommit?.invoke(nextSong, nextUrl)
            } catch (_: Throwable) {
                mainPlayer.volume = 1f
                runCatching { mainPlayer.setPlaybackParameters(androidx.media3.common.PlaybackParameters(1f, 1f)) }
                disposeSecondary()
                autoMixActive = false
            }
        }
    }

    /** 仅中止正在进行的过渡混音，保留已预加载的下一首轨道，避免暂停/拖动进度后过渡永久失效。 */
    fun cancelActiveCrossfade() {
        if (!autoMixActive && mixJob == null) return
        mixJob?.cancel()
        mixJob = null
        if (autoMixActive) {
            autoMixActive = false
            main.post {
                player?.volume = 1f
                runCatching { player?.setPlaybackParameters(androidx.media3.common.PlaybackParameters(1f, 1f)) }
                disposeSecondary()
            }
        }
    }

    fun cancelAutoMix() {
        mixJob?.cancel()
        mixJob = null
        if (autoMixActive) {
            autoMixActive = false
            main.post {
                player?.volume = 1f
                runCatching { player?.setPlaybackParameters(androidx.media3.common.PlaybackParameters(1f, 1f)) }
            }
        }
        main.post { disposeSecondary() }
    }

    private fun disposeSecondary() {
        preloadedReady = false
        preloadedSong = null
        preloadedUrl = ""
        secondaryFx.release()
        runCatching { secondaryPlayer?.stop(); secondaryPlayer?.release() }
        secondaryPlayer = null
    }

    private fun cancelFade() {
        fadeJob?.cancel()
        fadeJob = null
    }

    fun fadeOutAndPause(durationMs: Long = 1400L) {
        cancelAutoMix()
        cancelFade()
        val active = player
        if (active == null || !active.isPlaying) { pause(); return }
        fadeJob = scope.launch {
            val dur = durationMs.coerceAtLeast(300L)
            val startAt = System.currentTimeMillis()
            while (true) {
                val t = ((System.currentTimeMillis() - startAt).toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                active.volume = (1f - t).coerceIn(0f, 1f)
                if (t >= 1f) break
                delay(55)
            }
            pause()
            active.volume = 1f
        }
    }

    fun setMode(value: String) {
        if (value == mode) return
        mode = value
        nextShuffleSongKey = ""
    }

    /** 用户从某个列表点歌：整表成为队列，当前项起播。 */
    fun playFromList(songs: List<Song>, index: Int, startMs: Long = 0, autoPlay: Boolean = true, fromAutoAdvance: Boolean = false) {
        if (songs.isEmpty()) return
        val safeIndex = index.coerceIn(0, songs.lastIndex)
        queue = songs.toList()
        currentIndex = safeIndex
        internalPlay(queue[safeIndex], startMs, autoPlay, fromAutoAdvance)
    }

    fun playSingle(song: Song, startMs: Long = 0, autoPlay: Boolean = true) {
        queue = listOf(song)
        currentIndex = 0
        internalPlay(song, startMs, autoPlay, false)
    }

    private fun internalPlay(song: Song, startMs: Long, autoPlay: Boolean, fromAutoAdvance: Boolean = false) {
        if (!fromAutoAdvance) consecutiveAutoSkipCount = 0
        interruptedByCall = false
        lastInterruptResumeAt = 0L
        callResumeJob?.cancel()
        callResumeJob = null
        cancelAutoMix()
        cancelFade()
        cancelPlayPauseFade(false)
        seekGuardTarget = -1L
        seekGuardUntil = 0L
        nextShuffleSongKey = ""
        previewRetryKey = ""
        previewRetryCount = 0
        previewBadUrls.clear()
        previewBadSourceIds.clear()
        previewRecovering = false
        pendingDurationGatePlay = false
        carLyricActiveOverride = false
        currentCarLyricText = ""
        lastCarLyricKey = ""
        lastCarLyricText = ""
        player?.volume = 1f
        val token = ++playToken
        resolveJob?.cancel()
        stopTicker()
        isResolvingTrack = true
        if (retriedSongKey != song.key) retriedSongKey = ""
        this.autoPlay = autoPlay
        startPosition = startMs.coerceAtLeast(0)
        if (startPosition > 200L) {
            seekGuardTarget = startPosition
            seekGuardUntil = System.currentTimeMillis() + 9500L
        }
        current = song
        // 切歌先停旧音频并清掉旧地址与旧时间轴：避免下一首已切换但进度条/歌词仍滞留上一首。
        currentUrl = ""
        playing = false
        positionMs = startPosition
        durationMs = song.durationMs
        player?.stop()
        player?.clearMediaItems()
        onSongChanged?.invoke(song)
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
            isResolvingTrack = false
            return
        }
        resolveJob = scope.launch {
            try {
                val url = try {
                    withContext(Dispatchers.IO) { resolver(song) }
                } catch (firstError: Throwable) {
                    if (token != playToken) return@launch
                    if (!fromAutoAdvance) {
                        delay(450L)
                        if (token != playToken) return@launch
                        withContext(Dispatchers.IO) { fallbackUrlResolver?.invoke(song) ?: resolver(song) }
                    } else {
                        throw firstError
                    }
                }
                if (token != playToken) return@launch
                prepareUrl(url, song, token)
            } catch (error: Throwable) {
                if (token != playToken) return@launch
                isResolvingTrack = false
                currentUrl = ""
                player?.pause()
                playing = false
                emitState("paused")
                // 仅在播完自动切下一首遇到失效曲目时允许有界静默跳过（最多 2 首）；
                // 用户手动点播或重启后点击播放绝不擅自连跳多首歌曲。
                if (fromAutoAdvance && autoPlay && queue.size > 1 && consecutiveAutoSkipCount < 2) {
                    consecutiveAutoSkipCount++
                    main.postDelayed({ if (token == playToken) advance(1, completed = false, fromAutoAdvance = true) }, 220L)
                }
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
                isResolvingTrack = false
            }
            return
        }
        isResolvingTrack = false
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
        if (startPosition > 200L) exoPlayer.setMediaItem(item, startPosition) else exoPlayer.setMediaItem(item)
        pendingDurationGatePlay = autoPlay
        exoPlayer.playWhenReady = false
        exoPlayer.prepare()
        onSessionStateRefresh?.invoke()
    }

    private fun prepareLocal(path: String, song: Song, token: Int, attempt: Int = 0) {
        if (token != playToken) return
        val exoPlayer = player
        if (exoPlayer == null) {
            if (attempt < 30) {
                main.postDelayed({ prepareLocal(path, song, token, attempt + 1) }, 100)
            } else {
                isResolvingTrack = false
            }
            return
        }
        isResolvingTrack = false
        currentUrl = "file://$path"
        onSourceReady?.invoke(song, currentUrl)
        val metadata = MediaMetadata.Builder()
            .setTitle(song.name)
            .setArtist(song.singer)
            .setAlbumTitle(song.albumName)
            .setArtworkUri(song.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .build()
        val item = MediaItem.Builder()
            .setUri(Uri.fromFile(java.io.File(path)))
            .setMediaId(song.key)
            .setMediaMetadata(metadata)
            .build()
        if (startPosition > 200L) exoPlayer.setMediaItem(item, startPosition) else exoPlayer.setMediaItem(item)
        pendingDurationGatePlay = autoPlay
        exoPlayer.playWhenReady = false
        exoPlayer.prepare()
        onSessionStateRefresh?.invoke()
    }

    fun pause(fromSession: Boolean = false) {
        pendingDurationGatePlay = false
        cancelActiveCrossfade()
        cancelFade()
        val callPauseFromHeadunit = fromSession && (queryCallSceneActive() || callSceneCurrentlyActive) && (playing || autoPlay)
        if (callPauseFromHeadunit) {
            callSceneCurrentlyActive = true
            interruptedByCall = true
        } else {
            interruptedByCall = false
            callResumeJob?.cancel()
            callResumeJob = null
            autoPlay = false
        }
        val active = player
        if (playPauseFadeEnabled && active != null && active.isPlaying) {
            val startVol = if (ppFadeDirection.isNotEmpty()) ppFadeVolume.coerceIn(0.02f, 1f) else 1f
            cancelPlayPauseFade(false)
            ppFadeDirection = "out"
            ppFadeVolume = startVol
            playing = false
            emitState("paused")
            onFadeOutChanged?.invoke(true)
            ppFadeJob = scope.launch {
                val dur = 620L
                val startAt = System.currentTimeMillis()
                while (true) {
                    if (player !== active || ppFadeDirection != "out") return@launch
                    val t = ((System.currentTimeMillis() - startAt).toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                    val nextVol = (startVol * Math.pow(kotlin.math.cos(t * Math.PI * 0.5), 1.8).toFloat()).coerceIn(0f, 1f)
                    ppFadeVolume = nextVol
                    active.volume = nextVol
                    if (t >= 1f) break
                    delay(16)
                }
                if (ppFadeDirection == "out") {
                    ppFadeDirection = ""
                    active.pause()
                    active.volume = 1f
                    ppFadeVolume = 1f
                    emitTime(active.currentPosition.coerceAtLeast(0L))
                    onFadeOutChanged?.invoke(false)
                }
            }
            return
        }
        cancelPlayPauseFade(true)
        active?.volume = 1f
        active?.pause()
        playing = false
        emitState("paused")
    }

    fun resume(): Boolean {
        cancelFade()
        val exoPlayer = player ?: return false
        if (current == null || currentUrl.isEmpty()) return false
        autoPlay = true
        if (ppFadeDirection == "out" && exoPlayer.isPlaying) {
            val from = ppFadeVolume.coerceIn(0.02f, 1f)
            playing = true
            emitState("playing")
            if (playPauseFadeEnabled) startFadeIn(exoPlayer, 540L, from) else cancelPlayPauseFade(true)
            return true
        }
        if (playPauseFadeEnabled) {
            startFadeIn(exoPlayer, 680L, 0.01f)
        } else {
            cancelPlayPauseFade(false)
            exoPlayer.volume = 1f
        }
        exoPlayer.play()
        return true
    }

    fun seek(timeMs: Long) {
        cancelActiveCrossfade()
        val exoPlayer = player ?: return
        val target = timeMs.coerceIn(0, durationMs.coerceAtLeast(0))
        seekGuardTarget = target
        seekGuardUntil = System.currentTimeMillis() + 1000L
        spectrum.reset()
        exoPlayer.seekTo(target)
        emitTime(target)
    }

    /** 与鸿蒙 advance 同规则：顺序播放到末尾停止，单曲循环原地重播，随机复用已预选的下一首以与过渡对齐。 */
    fun advance(step: Int, completed: Boolean = false, fromAutoAdvance: Boolean = false) {
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
            val cachedIdx = if (step > 0 && nextShuffleSongKey.isNotEmpty()) {
                queue.indexOfFirst { it.key == nextShuffleSongKey && it.key != current?.key }
            } else -1
            next = if (cachedIdx >= 0) cachedIdx else ((index + 1 + (0 until queue.size - 1).random()) % queue.size)
        }
        nextShuffleSongKey = ""
        currentIndex = next
        internalPlay(queue[next], 0, true, completed || fromAutoAdvance)
    }

    private fun expectedTrackDurationMs(song: Song?): Long {
        val metaDur = song?.durationMs ?: 0L
        if (metaDur >= 45_000L) return metaDur
        val lastLyricMs = lyricLines.lastOrNull()?.timeMs ?: 0L
        val lyricFloor = if (lastLyricMs > 0L) lastLyricMs + 8_000L else 0L
        return maxOf(metaDur, lyricFloor)
    }

    private fun classifyStreamDurationMismatch(song: Song?, realDur: Long): String {
        if (song == null || song.source == "local" || !localPath.isNullOrEmpty()) return "ok"
        if (realDur <= 3_000L) return "ok"
        val expectedDur = expectedTrackDurationMs(song)
        if (expectedDur >= 45_000L && realDur <= 72_000L && realDur < (expectedDur * 0.58).toLong()) {
            return "preview"
        }
        val metaDur = song.durationMs
        if (metaDur >= 45_000L && kotlin.math.abs(realDur - metaDur) > 8_000L) {
            return "wrong"
        }
        return "ok"
    }

    private fun triggerVipPreviewRecovery(
        song: Song,
        resumeAtMs: Long,
        reason: String = "preview",
        onExhausted: (() -> Unit)?,
    ): Boolean {
        val fallback = previewFallbackResolver ?: return false
        if (previewRecovering || previewRetryCount >= 3 || song.source == "local" || !localPath.isNullOrEmpty()) return false
        previewRecovering = true
        previewRetryKey = song.key
        if (currentUrl.isNotEmpty() && currentUrl !in previewBadUrls) previewBadUrls.add(currentUrl)
        val badSrc = currentResolvedSourceIdProvider?.invoke().orEmpty()
        if (badSrc.isNotEmpty() && badSrc !in previewBadSourceIds) previewBadSourceIds.add(badSrc)
        val token = playToken
        val safeResume = if (reason == "wrong") 0L else resumeAtMs.coerceAtLeast(0L)
        if (previewRetryCount == 0) {
            onPreviewRecovered?.invoke(
                if (reason == "wrong") "检测到曲目不符，正在自动切换匹配音源…"
                else "检测到试听片段，正在自动切换完整音源…"
            )
        }
        scope.launch {
            while (previewRetryCount < 3) {
                if (token != playToken) return@launch
                val attempt = previewRetryCount++
                val badSourcesSnapshot = previewBadSourceIds.toList()
                if (attempt == 0 && hasOtherSourceChecker?.invoke(badSourcesSnapshot) == false) continue
                val excluded = previewBadUrls.toList()
                val altUrl = runCatching {
                    withContext(Dispatchers.IO) { fallback(song, attempt, badSourcesSnapshot, excluded) }
                }.getOrNull()
                if (token != playToken) return@launch
                val exoPlayer = player
                if (exoPlayer != null && !altUrl.isNullOrEmpty() && altUrl !in previewBadUrls) {
                    currentUrl = altUrl
                    previewRecovering = false
                    onSourceReady?.invoke(song, altUrl)
                    val item = MediaItem.Builder()
                        .setMediaId(song.key)
                        .setUri(altUrl)
                        .setMediaMetadata(
                            MediaMetadata.Builder()
                                .setTitle(song.name)
                                .setArtist(song.singer)
                                .setAlbumTitle(song.albumName)
                                .setArtworkUri(song.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
                                .setIsBrowsable(false)
                                .setIsPlayable(true)
                                .build()
                        )
                        .build()
                    if (safeResume > 1000L) {
                        exoPlayer.setMediaItem(item, safeResume)
                    } else {
                        exoPlayer.setMediaItem(item)
                    }
                    pendingDurationGatePlay = true
                    exoPlayer.playWhenReady = false
                    exoPlayer.prepare()
                    return@launch
                }
            }
            if (token != playToken) return@launch
            previewRecovering = false
            onExhausted?.invoke()
        }
        return true
    }

    private fun handleCompleted() {
        if (autoMixActive || previewRecovering) return
        val activeSong = current
        val expectedDur = expectedTrackDurationMs(activeSong)
        val endedPos = maxOf(positionMs, player?.currentPosition ?: 0L)
        if (
            activeSong != null &&
            activeSong.source != "local" &&
            localPath.isNullOrEmpty() &&
            expectedDur >= 75_000L &&
            endedPos >= 2_500L &&
            endedPos < (expectedDur * 0.72).toLong() &&
            (expectedDur - endedPos) >= 22_000L &&
            previewRetryCount < 3
        ) {
            val started = triggerVipPreviewRecovery(activeSong, (endedPos - 1200L).coerceAtLeast(0L), "preview") {
                emitState("completed")
                if (onBeforeCompleted?.invoke() == true) {
                    pause()
                } else {
                    advance(1, true)
                }
            }
            if (started) return
        }
        emitState("completed")
        if (onBeforeCompleted?.invoke() == true) {
            pause()
            return
        }
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

    @Volatile
    var foregroundActive: Boolean = true

    private fun startTicker() {
        if (ticker?.isActive == true) return
        ticker = scope.launch {
            while (true) {
                delay(if (foregroundActive) 200L else 850L)
                if (isResolvingTrack) continue
                val exoPlayer = player ?: break
                if (!exoPlayer.isPlaying) continue
                val pos = exoPlayer.currentPosition
                val now = System.currentTimeMillis()
                if (seekGuardUntil > 0L) {
                    if (now < seekGuardUntil && kotlin.math.abs(pos - seekGuardTarget) > 2500L) {
                        resolvedDuration()
                        continue
                    }
                    seekGuardUntil = 0L
                    seekGuardTarget = -1L
                }
                emitTime(pos)
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
        syncBluetoothCarLyric(force = false)
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
            // 单曲 MediaItem 没有“下一首”，但应用自己维护队列：显式放开上一首/下一首/播放暂停/拖动命令。
            val commands = result.availablePlayerCommands.buildUpon()
                .add(Player.COMMAND_SEEK_TO_NEXT)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                .add(Player.COMMAND_PLAY_PAUSE)
                .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(commands)
                .build()
        }

        override fun onMediaButtonEvent(
            session: MediaSession,
            controllerInfo: MediaSession.ControllerInfo,
            intent: android.content.Intent,
        ): Boolean {
            val event = if (android.os.Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT, android.view.KeyEvent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT)
            }
            if (event != null) {
                when (event.keyCode) {
                    android.view.KeyEvent.KEYCODE_MEDIA_NEXT -> {
                        if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                            main.post { advance(1) }
                        }
                        return true
                    }
                    android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                        if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                            main.post { advance(-1) }
                        }
                        return true
                    }
                    android.view.KeyEvent.KEYCODE_MEDIA_PLAY -> {
                        if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                            main.post { resume() }
                        }
                        return true
                    }
                    android.view.KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                        if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                            main.post { pause(fromSession = true) }
                        }
                        return true
                    }
                    android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                        if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                            main.post { if (playing) pause(fromSession = true) else resume() }
                        }
                        return true
                    }
                }
            }
            return super.onMediaButtonEvent(session, controllerInfo, intent)
        }
    }

    /** 系统播控的进度条拖动。 */
    fun onSessionSeek(timeMs: Long) = seek(timeMs)

    /** 歌词同步：供舞台/详情页及 Android 蓝牙车载歌词（AVRCP MediaMetadata）实时推送使用。 */
    fun setLyrics(lines: List<LyricLine>, offset: Long) {
        lyricLines = lines
        lyricOffset = offset
        lastCarLyricText = ""
        main.post { syncBluetoothCarLyric(force = true) }
    }

    var lyricLines: List<LyricLine> = emptyList()
        private set
    var lyricOffset: Long = 0
        private set

    fun setLyricOffset(offset: Long) {
        lyricOffset = offset
        main.post { syncBluetoothCarLyric(force = true) }
    }

    private fun applySessionMetadata(song: Song, title: String, artist: String, album: String) {
        val active = player ?: return
        val item = active.currentMediaItem ?: return
        if (item.mediaId != song.key) return
        val curMeta = item.mediaMetadata
        if (curMeta.title?.toString() == title &&
            curMeta.artist?.toString() == artist &&
            curMeta.albumTitle?.toString() == album
        ) return
        val updatedMeta = curMeta.buildUpon()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setArtworkUri(song.coverUrl.takeIf { it.isNotEmpty() }?.let(Uri::parse))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .build()
        runCatching {
            active.replaceMediaItem(
                active.currentMediaItemIndex,
                item.buildUpon().setMediaMetadata(updatedMeta).build(),
            )
        }
    }

    private fun syncBluetoothCarLyric(force: Boolean) {
        val song = current ?: return
        val shouldPush = bluetoothCarLyricsEnabled && bluetoothAudioConnected && playing && lyricLines.isNotEmpty()
        if (!shouldPush) {
            if (carLyricActiveOverride) {
                carLyricActiveOverride = false
                currentCarLyricText = ""
                lastCarLyricText = ""
                applySessionMetadata(song, song.name.ifBlank { "LxMine" }, song.singer, song.albumName)
            }
            return
        }
        val line = BluetoothCarLyrics.activeLyricLine(lyricLines, positionMs, lyricOffset)
        if (line.isEmpty()) {
            if (carLyricActiveOverride) {
                carLyricActiveOverride = false
                currentCarLyricText = ""
                lastCarLyricText = ""
                applySessionMetadata(song, song.name.ifBlank { "LxMine" }, song.singer, song.albumName)
            }
            return
        }
        val now = System.currentTimeMillis()
        val sameSongAndLine = lastCarLyricKey == song.key && lastCarLyricText == line
        if (!force && (sameSongAndLine || now - lastCarLyricSentAt < 320L)) return
        lastCarLyricKey = song.key
        lastCarLyricText = line
        lastCarLyricSentAt = now
        currentCarLyricText = line
        carLyricActiveOverride = true
        val fields = BluetoothCarLyrics.formatMetadata(song, line, bluetoothCarLyricsMode)
        applySessionMetadata(song, fields.title, fields.artist, fields.album)
    }

    val hasPrevious: Boolean get() = queue.size > 1 || positionMs > 3000
    val hasNext: Boolean get() = queue.size > 1
}
