@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.ForwardingPlayer
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.lxlia.player.MainActivity

/**
 * 后台播控：ExoPlayer + MediaSession。对应鸿蒙的 AVPlayer + AVSession + AUDIO_PLAYBACK 长任务。
 * 队列/顺序/切歌由 PlaybackController 统一调度，服务只负责把播放器与系统播控桥接起来。
 */
class PlaybackService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null
    private var sessionActivityIntent: android.app.PendingIntent? = null
    private val notifications: MediaNotification by lazy { MediaNotification(this) }

    override fun onCreate() {
        super.onCreate()
        val audioAttributes = PlaybackController.musicAudioAttributes()
        val httpFactory = androidx.media3.datasource.DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 LxMine/1.0")
            .setAllowCrossProtocolRedirects(true)
        val dataSourceFactory = androidx.media3.datasource.DefaultDataSource.Factory(this, httpFactory)
        val renderers = object : androidx.media3.exoplayer.DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: android.content.Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): androidx.media3.exoplayer.audio.AudioSink {
                val sink = androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)
                    .setAudioProcessors(arrayOf(PlaybackController.fxProcessor))
                    .setEnableFloatOutput(false)
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .build()
                return SpectrumAudioSink(sink, PlaybackController.spectrum)
            }
        }
        val exoPlayer = ExoPlayer.Builder(this, renderers)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ !PlaybackController.mixWithOthers)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(dataSourceFactory))
            .build()
        exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
        player = exoPlayer
        PlaybackController.secondaryPlayerFactory = {
            val secondaryRenderers = object : androidx.media3.exoplayer.DefaultRenderersFactory(this) {
                override fun buildAudioSink(
                    context: android.content.Context,
                    enableFloatOutput: Boolean,
                    enableAudioTrackPlaybackParams: Boolean,
                ): androidx.media3.exoplayer.audio.AudioSink =
                    androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)
                        .setAudioProcessors(arrayOf(PlaybackController.secondaryFxProcessor))
                        .setEnableFloatOutput(false)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .build()
            }
            ExoPlayer.Builder(this, secondaryRenderers)
                .setAudioAttributes(PlaybackController.musicAudioAttributes(), /* handleAudioFocus = */ false)
                .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(dataSourceFactory))
                .build().apply { repeatMode = Player.REPEAT_MODE_OFF }
        }
        sessionActivityIntent = android.app.PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP },
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
        fun runOnMain(block: () -> Unit) {
            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) block()
            else mainHandler.post(block)
        }
        val sessionPlayer = object : ForwardingPlayer(exoPlayer) {
            private val listenerWrappers = java.util.concurrent.ConcurrentHashMap<Player.Listener, Player.Listener>()

            private fun augmentCommands(commands: Player.Commands): Player.Commands =
                commands.buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                    .add(Player.COMMAND_PLAY_PAUSE)
                    .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                    .build()

            override fun addListener(listener: Player.Listener) {
                // Media3 ForwardingPlayer forwards raw ExoPlayer onAvailableCommandsChanged without
                // re-querying getAvailableCommands(), which strips Next/Prev whenever ExoPlayer has
                // only 1 MediaItem. Intercept it so Android 13-15 SystemUI & Bluetooth always keep
                // Previous/Next enabled.
                val wrapped = object : Player.Listener by listener {
                    override fun onAvailableCommandsChanged(availableCommands: Player.Commands) {
                        listener.onAvailableCommandsChanged(augmentCommands(availableCommands))
                    }
                }
                listenerWrappers[listener] = wrapped
                super.addListener(wrapped)
            }

            override fun removeListener(listener: Player.Listener) {
                val wrapped = listenerWrappers.remove(listener) ?: listener
                super.removeListener(wrapped)
            }

            fun notifyCommandsUpdated() {
                runOnMain {
                    val cmds = availableCommands
                    listenerWrappers.keys.forEach { l ->
                        runCatching { l.onAvailableCommandsChanged(cmds) }
                    }
                }
            }

            override fun getAvailableCommands(): Player.Commands = augmentCommands(super.getAvailableCommands())

            override fun isCommandAvailable(command: Int): Boolean {
                return when (command) {
                    Player.COMMAND_SEEK_TO_NEXT,
                    Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_TO_PREVIOUS,
                    Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                    Player.COMMAND_PLAY_PAUSE,
                    Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> true
                    else -> super.isCommandAvailable(command)
                }
            }
            override fun hasNextMediaItem(): Boolean = PlaybackController.queue.isNotEmpty() || PlaybackController.current != null
            override fun hasPreviousMediaItem(): Boolean = PlaybackController.queue.isNotEmpty() || PlaybackController.current != null
            override fun getNextMediaItemIndex(): Int = if (PlaybackController.queue.isNotEmpty()) 0 else C.INDEX_UNSET
            override fun getPreviousMediaItemIndex(): Int = if (PlaybackController.queue.isNotEmpty()) 0 else C.INDEX_UNSET
            override fun play() { runOnMain { PlaybackController.resume(fromSession = true) } }
            override fun pause() { runOnMain { PlaybackController.pause(fromSession = true) } }
            override fun setPlayWhenReady(playWhenReady: Boolean) {
                runOnMain {
                    if (playWhenReady) PlaybackController.resume(fromSession = true) else PlaybackController.pause(fromSession = true)
                }
            }
            override fun seekToNext() { runOnMain { PlaybackController.advance(1) } }
            override fun seekToNextMediaItem() { runOnMain { PlaybackController.advance(1) } }
            override fun seekToPrevious() { runOnMain { PlaybackController.advance(-1) } }
            override fun seekToPreviousMediaItem() { runOnMain { PlaybackController.advance(-1) } }
        }
        PlaybackController.onSessionStateRefresh = {
            sessionPlayer.notifyCommandsUpdated()
            runOnMain { refreshNotification() }
        }
        session = MediaSession.Builder(this, sessionPlayer)
            .setCallback(PlaybackController.sessionCallback)
            .setSessionActivity(sessionActivityIntent!!)
            .build()
        // 默认媒体通知：显式安装 provider 并在播放/元数据变化时主动刷新（部分 ROM 不会自动提升前台）。
        val provider = androidx.media3.session.DefaultMediaNotificationProvider(this)
        setMediaNotificationProvider(provider)
        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) = refreshNotification()
            override fun onMediaMetadataChanged(mediaMetadata: androidx.media3.common.MediaMetadata) = refreshNotification()
            override fun onPlaybackStateChanged(playbackState: Int) = refreshNotification()
        })
        PlaybackController.onPlayerReady(exoPlayer)
        PlaybackController.startCallAudioMonitor(this)
        PlaybackController.startBluetoothMonitor(this)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /**
     * 播放中把服务提升为前台并刷新媒体通知；暂停后保留通知以便继续播。
     * 通知由本服务自己构建（MediaStyle 仍绑定 MediaSession），不依赖 Media3 内部
     * 只有被 bind 时才会启用的通知管理器。
     */
    private fun refreshNotification() {
        val activeSession = session ?: return
        val exoPlayer = player ?: return
        if (exoPlayer.mediaItemCount == 0) return
        val playing = PlaybackController.playing && exoPlayer.isPlaying
        val metadata = exoPlayer.mediaMetadata
        val song = PlaybackController.current
        val displayTitle = song?.name?.takeIf { it.isNotBlank() } ?: metadata.title?.toString() ?: "LxMine"
        val carLyric = if (PlaybackController.carLyricActiveOverride) PlaybackController.currentCarLyricText else ""
        val displayArtist = if (carLyric.isNotBlank()) {
            carLyric
        } else {
            song?.singer?.takeIf { it.isNotBlank() } ?: metadata.artist?.toString() ?: ""
        }
        val notification = notifications.build(
            session = activeSession,
            sessionActivity = sessionActivityIntent,
            playing = playing,
            title = displayTitle,
            artist = displayArtist,
        )
        runCatching { startForeground(MediaNotification.NOTIFICATION_ID, notification) }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val exoPlayer = player ?: return
        if (!exoPlayer.playWhenReady || exoPlayer.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        DesktopLyricsOverlay.detach()
        PlaybackController.onSessionStateRefresh = null
        PlaybackController.stopCallAudioMonitor()
        PlaybackController.stopBluetoothMonitor()
        PlaybackController.onPlayerReleased()
        session?.run { player.release(); release() }
        session = null
        player = null
        super.onDestroy()
    }
}
