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
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        val httpFactory = androidx.media3.datasource.DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 LxMine/1.0")
            .setAllowCrossProtocolRedirects(true)
        val dataSourceFactory = androidx.media3.datasource.DefaultDataSource.Factory(this, httpFactory)
        val renderers = object : androidx.media3.exoplayer.DefaultRenderersFactory(this) {
            override fun buildAudioSink(context: android.content.Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): androidx.media3.exoplayer.audio.AudioSink? {
                val sink = super.buildAudioSink(context, enableFloatOutput, enableAudioTrackPlaybackParams) ?: return null
                return SpectrumAudioSink(sink, PlaybackController.spectrum)
            }
        }
        val exoPlayer = ExoPlayer.Builder(this, renderers)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(dataSourceFactory))
            .build()
        exoPlayer.repeatMode = Player.REPEAT_MODE_OFF
        player = exoPlayer
        sessionActivityIntent = android.app.PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP },
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val sessionPlayer = object : ForwardingPlayer(exoPlayer) {
            override fun play() { PlaybackController.resume() }
            override fun pause() { PlaybackController.pause() }
            override fun setPlayWhenReady(playWhenReady: Boolean) {
                if (playWhenReady) PlaybackController.resume() else PlaybackController.pause()
            }
            override fun seekToNext() { PlaybackController.advance(1) }
            override fun seekToNextMediaItem() { PlaybackController.advance(1) }
            override fun seekToPrevious() { PlaybackController.advance(-1) }
            override fun seekToPreviousMediaItem() { PlaybackController.advance(-1) }
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
        val playing = exoPlayer.isPlaying
        val metadata = exoPlayer.mediaMetadata
        val notification = notifications.build(
            session = activeSession,
            sessionActivity = sessionActivityIntent,
            playing = playing,
            title = metadata.title?.toString() ?: "LxMine",
            artist = metadata.artist?.toString() ?: "",
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
        PlaybackController.onPlayerReleased()
        session?.run { player.release(); release() }
        session = null
        player = null
        super.onDestroy()
    }
}
