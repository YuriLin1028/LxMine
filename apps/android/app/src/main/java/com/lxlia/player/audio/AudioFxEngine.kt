package com.lxlia.player.audio

import android.content.Context
import android.media.AudioManager
import android.media.Spatializer
import android.os.Build
import java.util.concurrent.Executors

data class SpatialHardwareStatus(
    val supported: Boolean = false,
    val available: Boolean = false,
    val enabled: Boolean = false,
    val headTracking: Boolean = false,
    val label: String = "系统空间音频（兼容双耳模拟）",
)

/**
 * 安卓音效与系统空间音频探测（API 32+ Spatializer）：
 * 实际 EQ / 3D 空间环绕 / 混响 / 双耳空间音频由 SoftwareAudioFxProcessor 在 ExoPlayer PCM 管线内实时处理，
 * 避免厂商硬件 Virtualizer/Equalizer 失灵或双重叠加削波；此处负责系统空间音频硬件状态监测。
 */
class AudioFxEngine {
    private var spatializer: Spatializer? = null
    private var stateListener: Spatializer.OnSpatializerStateChangedListener? = null
    private var executor: java.util.concurrent.ExecutorService? = null
    private var onSpatialChanged: ((SpatialHardwareStatus) -> Unit)? = null

    fun attach(audioSessionId: Int, config: AudioFxConfig) {
        // SoftwareAudioFxProcessor handles PCM DSP uniformly on every device & audio route.
    }

    fun apply(config: AudioFxConfig) {
        // SoftwareAudioFxProcessor receives live config updates directly from PlaybackController.
    }

    fun startSpatialMonitor(context: Context, listener: (SpatialHardwareStatus) -> Unit) {
        onSpatialChanged = listener
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S_V2) {
            listener(SpatialHardwareStatus(supported = false, label = "当前系统低于 Android 12L，已启用软件双耳空间引擎"))
            return
        }
        runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            val sp = am.spatializer
            if (spatializer === sp && stateListener != null) {
                listener(querySpatialStatus(sp))
                return
            }
            release()
            onSpatialChanged = listener
            spatializer = sp
            val exec = executor ?: Executors.newSingleThreadExecutor().also { executor = it }
            val cb = object : Spatializer.OnSpatializerStateChangedListener {
                override fun onSpatializerEnabledChanged(s: Spatializer, enabled: Boolean) {
                    onSpatialChanged?.invoke(querySpatialStatus(s))
                }
                override fun onSpatializerAvailableChanged(s: Spatializer, available: Boolean) {
                    onSpatialChanged?.invoke(querySpatialStatus(s))
                }
            }
            stateListener = cb
            sp.addOnSpatializerStateChangedListener(exec, cb)
            listener(querySpatialStatus(sp))
        }.onFailure {
            listener(SpatialHardwareStatus(supported = false, label = "当前设备不支持原生空间音频，可切换双耳模拟"))
        }
    }

    fun querySpatialStatus(context: Context): SpatialHardwareStatus {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S_V2) {
            return SpatialHardwareStatus(supported = false, label = "当前系统低于 Android 12L，支持双耳空间模拟")
        }
        return runCatching {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            val sp = spatializer ?: am?.spatializer
            if (sp != null) querySpatialStatus(sp) else SpatialHardwareStatus()
        }.getOrDefault(SpatialHardwareStatus())
    }

    private fun querySpatialStatus(sp: Spatializer): SpatialHardwareStatus {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S_V2) return SpatialHardwareStatus()
        val level = sp.immersiveAudioLevel
        val supported = level != Spatializer.SPATIALIZER_IMMERSIVE_LEVEL_NONE
        val available = sp.isAvailable
        val enabled = sp.isEnabled
        val headTrack = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            runCatching { sp.isHeadTrackerAvailable }.getOrDefault(false)
        } else false
        val label = when {
            !supported -> "当前设备不支持系统空间音频，可切换双耳模拟"
            enabled && available && headTrack -> "已连接支持头部追踪的空间音频设备"
            enabled && available -> "系统空间音频已就绪（当前输出设备支持）"
            available -> "当前设备支持空间音频（请在系统音频设置开启）"
            else -> "当前输出设备不支持原生空间音频，可切换双耳模拟"
        }
        return SpatialHardwareStatus(
            supported = supported,
            available = available,
            enabled = enabled,
            headTracking = headTrack,
            label = label,
        )
    }

    fun release() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S_V2) {
            runCatching {
                val sp = spatializer
                val cb = stateListener
                if (sp != null && cb != null) sp.removeOnSpatializerStateChangedListener(cb)
            }
        }
        spatializer = null
        stateListener = null
    }
}
