package com.lxlia.player.core

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.io.File

/** 整份快照保存应用数据；同步确认只在落盘完成后返回成功。 */
data class AppData(
    val sourceScript: String = "",
    val sourcesJson: String = "[]",
    val activeSourceId: String = "",
    val settingsJson: String = "{}",
    val playlistsJson: String = "[]",
) {
    fun toJson(): String = JSONObject()
        .put("sourceScript", sourceScript)
        .put("sourcesJson", sourcesJson)
        .put("activeSourceId", activeSourceId)
        .put("settingsJson", settingsJson)
        .put("playlistsJson", playlistsJson)
        .toString()

    companion object {
        fun fromJson(value: String): AppData = try {
            val json = JSONObject(value)
            AppData(
                sourceScript = json.optString("sourceScript"),
                sourcesJson = json.optString("sourcesJson").ifEmpty { "[]" },
                activeSourceId = json.optString("activeSourceId"),
                settingsJson = json.optString("settingsJson").ifEmpty { "{}" },
                playlistsJson = json.optString("playlistsJson").ifEmpty { "[]" },
            )
        } catch (_: Exception) {
            AppData()
        }
    }
}

/**
 * 与鸿蒙 preferences 同名的键与语义：
 * appData 整份快照、deviceId、playbackSnapshot、homeFeed:<platform>、recentSongs、uiDiagnostics。
 * 应用数据在 IO 线程 commit() 后回执，缓存与播放快照通过 apply() 异步落盘。
 */
class Store(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("lxlia", Context.MODE_PRIVATE)
    private val runtimePrefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("lxmine-runtime", Context.MODE_PRIVATE)

    fun raw(key: String, fallback: String = ""): String = prefs.getString(key, fallback) ?: fallback

    fun put(key: String, value: String): Boolean = prefs.edit().putString(key, value).commit()

    fun loadAppData(): AppData {
        val snapshot = raw("appData")
        if (snapshot.isNotEmpty()) return AppData.fromJson(snapshot)
        return AppData(
            sourceScript = raw("sourceScript"),
            sourcesJson = raw("sourcesJson", "[]"),
            activeSourceId = raw("activeSourceId"),
            settingsJson = raw("settingsJson", "{}"),
            playlistsJson = raw("playlistsJson", "[]"),
        )
    }

    @Throws(Exception::class)
    fun saveAppData(data: AppData) {
        val previous = raw("appData")
        val ok = put("appData", data.toJson())
        if (!ok) {
            if (previous.isNotEmpty()) put("appData", previous) else prefs.edit().remove("appData").commit()
            throw IllegalStateException("保存失败")
        }
    }

    fun loadDeviceId(): String {
        var id = raw("deviceId")
        if (id.isEmpty()) {
            id = "android-${System.currentTimeMillis().toString(36)}-${(0..100000).random().toString(36)}"
            put("deviceId", id)
        }
        return id
    }

    /** 局域网设备信任圈：独立于 appData 存储，接收同步覆盖设置/歌单时绝不会被清空。 */
    fun loadTrustedDevices(): String = raw("trustedDevices", "[]")
    fun saveTrustedDevices(value: String): Boolean = put("trustedDevices", value)
    fun loadTrustCircleTransitive(): Boolean = prefs.getBoolean("trustCircleTransitive", true)
    fun saveTrustCircleTransitive(value: Boolean): Boolean = prefs.edit().putBoolean("trustCircleTransitive", value).commit()
    fun loadPendingVouches(): String = raw("trustedPendingVouches", "[]")
    fun savePendingVouches(value: String): Boolean = put("trustedPendingVouches", value)

    fun saveUiDiagnostics(value: String) = runtimePrefs.edit().putString("uiDiagnostics", value).apply()
    fun saveStageDiagnostics(value: String) = runtimePrefs.edit().putString("stageDiagnostics", value).apply()

    fun loadPlaybackSnapshot(): String {
        val current = runtimePrefs.getString("playbackSnapshot", "").orEmpty()
        if (current.isNotEmpty()) return current
        val previous = raw("playbackSnapshot")
        if (previous.isNotEmpty()) savePlaybackSnapshot(previous)
        return previous
    }
    fun savePlaybackSnapshot(value: String) {
        runtimePrefs.edit().putString("playbackSnapshot", value).apply()
    }

    fun loadHomeCache(platform: String): String = raw("homeFeed:$platform")
    fun saveHomeCache(platform: String, value: String) {
        prefs.edit().putString("homeFeed:$platform", value).apply()
    }

    fun loadRecentSongs(): String = raw("recentSongs", "[]")
    fun saveRecentSongs(value: String) {
        prefs.edit().putString("recentSongs", value).apply()
    }

    /** 本地音乐目录：与鸿蒙 filesDir/LocalMusic 相同结构，便于整体迁移。 */
    fun localMusicDir(context: Context): File = File(context.filesDir, "LocalMusic").apply { if (!exists()) mkdirs() }
    fun downloadsDir(context: Context): File = File(context.filesDir, "Downloads").apply { if (!exists()) mkdirs() }
}
