package com.lxlia.player.audio

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song

/**
 * Android 蓝牙车载歌词（Bluetooth AVRCP Metadata 实时歌词同步）：
 * - 通过 AudioManager.getDevices + AudioDeviceCallback 自动检测蓝牙音频输出（A2DP / SCO / BLE Audio），
 *   无需额外申请敏感蓝牙扫描权限。
 * - 将当前实时歌词通过 MediaSession -> AVRCP 元数据同步给车机屏幕，支持「歌词替换歌名（最广兼容）」、
 *   「歌词替换歌手」、「歌词与歌名拼接」三种模式；暂停、切歌、无歌词或蓝牙断开时自动还原原始歌曲信息。
 * - 实际能否在车机屏幕逐句刷新取决于车型车机对 AVRCP 元数据实时更新的支持程度。
 */
data class CarLyricMetadataFields(
    val title: String,
    val artist: String,
    val album: String,
)

class BluetoothAudioMonitor {
    private var audioManager: AudioManager? = null
    private var callback: AudioDeviceCallback? = null
    @Volatile
    var connected: Boolean = false
        private set

    fun start(context: Context, onChange: (Boolean) -> Unit) {
        if (callback != null) {
            val now = queryConnected(context)
            connected = now
            onChange(now)
            return
        }
        val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = am
        connected = isBluetoothOutputConnected(am)
        onChange(connected)
        val cb = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                val next = isBluetoothOutputConnected(am)
                if (next != connected) {
                    connected = next
                    onChange(next)
                }
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                val next = isBluetoothOutputConnected(am)
                if (next != connected) {
                    connected = next
                    onChange(next)
                }
            }
        }
        callback = cb
        runCatching { am.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper())) }
    }

    fun stop() {
        val am = audioManager
        val cb = callback
        callback = null
        if (am != null && cb != null) {
            runCatching { am.unregisterAudioDeviceCallback(cb) }
        }
    }

    fun queryConnected(context: Context): Boolean {
        val am = audioManager ?: (context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)
            ?: return false
        return isBluetoothOutputConnected(am).also { connected = it }
    }

    private fun isBluetoothOutputConnected(am: AudioManager): Boolean {
        return runCatching {
            val outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            outputs.any { device ->
                when (device.type) {
                    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> true
                    else -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                            device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
                            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                device.type == AudioDeviceInfo.TYPE_BLE_BROADCAST)
                    } else {
                        false
                    }
                }
            }
        }.getOrDefault(false)
    }
}

object BluetoothCarLyrics {
    const val MODE_TITLE = "title"
    const val MODE_ARTIST = "artist"
    const val MODE_COMBINED = "combined"

    private val PLACEHOLDER_RE = Regex("^[\\\\/\\-—–_~·•\\s]+$")

    fun normalizeMode(raw: String?): String = when (raw) {
        MODE_ARTIST -> MODE_ARTIST
        MODE_COMBINED -> MODE_COMBINED
        else -> MODE_TITLE
    }

    /** 查找当前播放时刻（含时间偏移）对应的有效单行歌词文本。 */
    fun activeLyricLine(lines: List<LyricLine>, positionMs: Long, offsetMs: Long): String {
        if (lines.isEmpty()) return ""
        val target = (positionMs + offsetMs).coerceAtLeast(0L)
        var lo = 0
        var hi = lines.lastIndex
        var hit = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (lines[mid].timeMs <= target) {
                hit = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        if (hit < 0) return ""
        val raw = lines[hit].text.replace(Regex("\\s+"), " ").trim()
        if (raw.isEmpty() || PLACEHOLDER_RE.matches(raw)) return ""
        return if (raw.length > 96) raw.substring(0, 96) else raw
    }

    fun formatMetadata(song: Song, lyric: String, mode: String): CarLyricMetadataFields {
        val cleanTitle = song.name.ifBlank { "LxMine" }
        val cleanArtist = song.singer
        val cleanAlbum = song.albumName
        if (lyric.isBlank()) {
            return CarLyricMetadataFields(cleanTitle, cleanArtist, cleanAlbum)
        }
        return when (normalizeMode(mode)) {
            MODE_ARTIST -> CarLyricMetadataFields(
                title = cleanTitle,
                artist = lyric,
                album = cleanArtist.ifBlank { cleanAlbum },
            )
            MODE_COMBINED -> CarLyricMetadataFields(
                title = "$lyric · $cleanTitle",
                artist = cleanArtist,
                album = cleanAlbum,
            )
            else -> CarLyricMetadataFields(
                title = lyric,
                artist = if (cleanArtist.isNotBlank()) "$cleanTitle - $cleanArtist" else cleanTitle,
                album = cleanAlbum.ifBlank { cleanTitle },
            )
        }
    }
}
