package com.lxlia.player.ui

import android.content.Context
import android.content.Intent
import android.media.MediaRouter2
import android.os.Build
import com.lxlia.player.model.Song

/** 分享当前歌曲：把歌曲编码成 lxmine:// 深链，本应用或已安装 LxMine 的设备可直接唤起播放。 */
object ShareService {
    fun songUri(song: Song): String {
        val query = listOf(
            "source=${encode(song.source)}",
            "id=${encode(song.id)}",
            "name=${encode(song.name)}",
            "singer=${encode(song.singer)}",
            "album=${encode(song.albumName)}",
            "cover=${encode(song.coverUrl)}",
            "duration=${encode(song.durationMs.toString())}",
        ).joinToString("&")
        return "lxmine://play?$query"
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    fun share(context: Context, song: Song) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "${song.name} - ${song.singer}")
            putExtra(Intent.EXTRA_TEXT, "${song.name} - ${song.singer}\n${songUri(song)}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
        }
        val chooser = Intent.createChooser(intent, "分享歌曲").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}

/** 系统音频路由（蓝牙/耳机/车机）。Android 10 以下没有 MediaRouter2，返回空列表。 */
object AudioRoutes {
    fun available(context: Context): List<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()
        return runCatching {
            MediaRouter2.getInstance(context).routes.map { it.name.toString() }.distinct()
        }.getOrDefault(emptyList())
    }

    fun select(context: Context, name: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        return runCatching {
            val router = MediaRouter2.getInstance(context)
            val route = router.routes.firstOrNull { it.name.toString() == name } ?: return false
            router.transferTo(route)
            true
        }.getOrDefault(false)
    }
}

fun AppViewModel.shareCurrent() {
    val song = selected
    if (song == null) {
        message = "当前没有正在播放的歌曲"
        return
    }
    runCatching { ShareService.share(app, song) }.onFailure {
        message = "分享失败：${it.message}"
    }
}
