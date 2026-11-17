@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 播控通知的按钮入口：直接调用进程级 PlaybackController，
 * 不依赖 Media3 内部的 ActionFactory，避免不同 ROM 上通知按钮失效。
 */
class MediaActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE -> if (PlaybackController.playing) PlaybackController.pause() else PlaybackController.resume()
            ACTION_NEXT -> PlaybackController.advance(1)
            ACTION_PREVIOUS -> PlaybackController.advance(-1)
            ACTION_STOP -> {
                PlaybackController.pause()
                context.stopService(Intent(context, PlaybackService::class.java))
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE = "com.lxlia.player.media.TOGGLE"
        const val ACTION_NEXT = "com.lxlia.player.media.NEXT"
        const val ACTION_PREVIOUS = "com.lxlia.player.media.PREVIOUS"
        const val ACTION_STOP = "com.lxlia.player.media.STOP"
    }
}

/** 通知渠道与按钮 PendingIntent 的统一构建。 */
class MediaNotification(val context: Context) {
    companion object {
        const val CHANNEL_ID = "lxmine_playback"
        const val NOTIFICATION_ID = 1010
    }

    private val manager = context.getSystemService(NotificationManager::class.java)

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "播放控制", NotificationManager.IMPORTANCE_LOW).apply {
            description = "显示正在播放的歌曲与播控按钮"
            setShowBadge(false)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    private fun action(action: String): PendingIntent = PendingIntent.getBroadcast(
        context,
        action.hashCode(),
        Intent(context, MediaActionReceiver::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun build(
        session: androidx.media3.session.MediaSession,
        sessionActivity: PendingIntent?,
        playing: Boolean,
        title: String,
        artist: String,
    ): android.app.Notification {
        ensureChannel()
        val mediaStyle = androidx.media3.session.MediaStyleNotificationHelper.MediaStyle(session)
            .setShowActionsInCompactView(0, 1, 2)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.lxlia.player.R.drawable.ic_stat_music)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(sessionActivity)
            .setOngoing(playing)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(mediaStyle)
            .addAction(com.lxlia.player.R.drawable.ic_notif_previous, "上一首", action(MediaActionReceiver.ACTION_PREVIOUS))
            .addAction(
                if (playing) com.lxlia.player.R.drawable.ic_notif_pause else com.lxlia.player.R.drawable.ic_notif_play,
                if (playing) "暂停" else "播放",
                action(MediaActionReceiver.ACTION_TOGGLE),
            )
            .addAction(com.lxlia.player.R.drawable.ic_notif_next, "下一首", action(MediaActionReceiver.ACTION_NEXT))
        return builder.build()
    }
}
