package com.lxlia.player.audio

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Process
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tanh

data class EarMonitorState(
    val mode: String = "off", // "off" | "original" | "ktv" | "theater" | "concert"
    val active: Boolean = false,
    val micVolume: Float = 0.85f,
    val vocalVolume: Float = 1.0f,
    val statusText: String = "未开启耳返",
)

/**
 * 安卓低延迟实时耳返引擎（#19）：
 * AudioRecord(VOICE_PERFORMANCE/MIC) → 实时模式 DSP（原生 / KTV / 剧场 / 音乐厅）→ AudioTrack(LOW_LATENCY)。
 * 同步联动主播放器的伴奏/人声音量增益，关闭时自动恢复 100%。
 */
class EarMonitorEngine {
    companion object {
        val MODES: List<Triple<String, String, String>> = listOf(
            Triple("off", "关闭", "停止实时麦克风监听"),
            Triple("original", "原生", "低延迟纯净干声监听，清晰自然"),
            Triple("ktv", "KTV", "高亮人声激励 + 立体声回声包厢感"),
            Triple("theater", "剧场", "温暖中频共鸣 + 中型剧场反射"),
            Triple("concert", "音乐厅", "宽广厅堂混响 + 环绕空气光泽"),
        )
    }

    @Volatile private var running = false
    @Volatile private var mode: String = "off"
    @Volatile private var micVol: Float = 0.85f
    @Volatile private var vocalVol: Float = 1.0f
    private var worker: Thread? = null

    var onStateChanged: ((EarMonitorState) -> Unit)? = null

    fun currentState(): EarMonitorState = EarMonitorState(
        mode = mode,
        active = running && mode != "off",
        micVolume = micVol,
        vocalVolume = vocalVol,
        statusText = when {
            mode == "off" || !running -> "未开启耳返（建议佩戴有线耳机防啸叫）"
            else -> {
                val label = MODES.firstOrNull { it.first == mode }?.second ?: mode
                "耳返运行中 · $label 模式"
            }
        },
    )

    fun setMicVolume(value: Float) {
        micVol = value.coerceIn(0f, 1.5f)
        emitState()
    }

    fun setVocalVolume(value: Float) {
        vocalVol = value.coerceIn(0f, 1.5f)
        if (running && mode != "off") {
            PlaybackController.setMusicMonitorGain(vocalVol)
        }
        emitState()
    }

    fun setMode(nextMode: String): Boolean {
        val normalized = if (MODES.any { it.first == nextMode }) nextMode else "off"
        mode = normalized
        if (normalized == "off") {
            stop()
            return true
        }
        PlaybackController.setMusicMonitorGain(vocalVol)
        if (!running) {
            return startLoop()
        }
        emitState()
        return true
    }

    @SuppressLint("MissingPermission")
    private fun startLoop(): Boolean {
        stopInternal(resetMode = false)
        val rates = intArrayOf(48000, 44100)
        var chosenRate = 0
        var minRec = 0
        var minPlay = 0
        var recorder: AudioRecord? = null
        val sources = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) add(MediaRecorder.AudioSource.VOICE_PERFORMANCE)
            add(MediaRecorder.AudioSource.MIC)
            add(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            add(MediaRecorder.AudioSource.DEFAULT)
        }
        outer@ for (rate in rates) {
            val mr = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val mp = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
            if (mr <= 0 || mp <= 0) continue
            for (src in sources) {
                val cand = runCatching {
                    AudioRecord(src, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, (mr * 2).coerceAtLeast(2048))
                }.getOrNull()
                if (cand != null && cand.state == AudioRecord.STATE_INITIALIZED) {
                    recorder = cand
                    chosenRate = rate
                    minRec = mr
                    minPlay = mp
                    break@outer
                } else {
                    runCatching { cand?.release() }
                }
            }
        }

        if (recorder == null || chosenRate <= 0) {
            mode = "off"
            emitError("麦克风采集启动失败，请在系统权限设置中允许录音并确认耳机已连接")
            return false
        }
        val sampleRate = chosenRate

        val trackBuilder = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                    .build()
            )
            .setBufferSizeInBytes((minPlay * 2).coerceAtLeast(4096))
            .setTransferMode(AudioTrack.MODE_STREAM)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            trackBuilder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
        }
        val track = runCatching { trackBuilder.build() }.getOrNull()
        if (track == null || track.state != AudioTrack.STATE_INITIALIZED) {
            runCatching { recorder.release() }
            runCatching { track?.release() }
            mode = "off"
            emitError("低延迟耳返输出通道初始化失败")
            return false
        }

        running = true
        PlaybackController.setMusicMonitorGain(vocalVol)
        emitState()

        worker = Thread({
            runCatching { Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO) }
            val chunkSamples = 256
            val inBuf = ShortArray(chunkSamples)
            val outBuf = ShortArray(chunkSamples * 2)

            // Delay lines & Schroeder combs for KTV / Theater / Concert
            val slapLenL = (sampleRate * 0.128).toInt()
            val slapLenR = (sampleRate * 0.178).toInt()
            val slapL = FloatArray(slapLenL)
            val slapR = FloatArray(slapLenR)
            var slapIdxL = 0; var slapIdxR = 0

            val combLensL = intArrayOf(1559, 1789, 2081, 2411)
            val combLensR = intArrayOf(1601, 1847, 2137, 2473)
            val combsL = Array(4) { FloatArray(combLensL[it]) }
            val combsR = Array(4) { FloatArray(combLensR[it]) }
            val cIdxL = IntArray(4); val cIdxR = IntArray(4)
            val cLpL = FloatArray(4); val cLpR = FloatArray(4)

            // Clean 2nd-order Butterworth 115Hz HPF + 9.2kHz LPF + 3.1kHz Peaking (no 24kHz hiss shelf)
            val hpB = buildHighPass(sampleRate.toDouble(), 115.0, 0.7071)
            val lpB = buildLowPass(sampleRate.toDouble(), 9200.0, 0.7071)
            val presenceB = buildPresencePeak(sampleRate.toDouble(), 3100.0, 3.0, 1.15)
            var hpZ1 = 0.0; var hpZ2 = 0.0
            var lpZ1 = 0.0; var lpZ2 = 0.0
            var pz1 = 0.0; var pz2 = 0.0
            var lpWarm = 0f

            // Adaptive RMS Envelope Noise Gate + Gentle Compressor (zero crackle, -34dB silence floor)
            var gateEnv = 0f
            var noiseFloor = 0.004f
            var gateGain = 0.02f
            var gateHold = 0
            val holdSamples = (sampleRate * 0.090).toInt()
            var compEnv = 0f

            val ns = runCatching {
                if (NoiseSuppressor.isAvailable()) {
                    NoiseSuppressor.create(recorder.audioSessionId)?.apply { enabled = true }
                } else null
            }.getOrNull()

            try {
                recorder.startRecording()
                track.play()
                while (running) {
                    val read = recorder.read(inBuf, 0, chunkSamples)
                    if (read <= 0) continue
                    val curMode = mode
                    val mv = micVol.coerceIn(0f, 1.5f)
                    val preamp = if (mv <= 0.001f) 0f else (mv.toDouble().pow(1.15) * 2.2).toFloat()
                    for (i in 0 until read) {
                        val raw = inBuf[i] / 32768.0
                        val hp = hpB[0] * raw + hpZ1
                        hpZ1 = hpB[1] * raw - hpB[3] * hp + hpZ2
                        hpZ2 = hpB[2] * raw - hpB[4] * hp

                        val cleanD = lpB[0] * hp + lpZ1
                        lpZ1 = lpB[1] * hp - lpB[3] * cleanD + lpZ2
                        lpZ2 = lpB[2] * hp - lpB[4] * cleanD
                        val clean = cleanD.toFloat()

                        // Smooth adaptive noise gate/expander
                        val absClean = abs(clean)
                        gateEnv = if (absClean > gateEnv) {
                            gateEnv * 0.992f + absClean * 0.008f
                        } else {
                            gateEnv * 0.9996f + absClean * 0.0004f
                        }
                        if (gateEnv < noiseFloor) {
                            noiseFloor = noiseFloor * 0.996f + gateEnv * 0.004f
                        } else if (gateEnv < noiseFloor * 2.0f) {
                            noiseFloor = (noiseFloor * 0.99995f + gateEnv * 0.00005f).coerceAtMost(0.024f)
                        }
                        val openThresh = maxOf(0.0065f, noiseFloor * 2.7f)
                        val closeThresh = openThresh * 0.65f
                        val targetGate = when {
                            gateEnv >= openThresh -> { gateHold = holdSamples; 1.0f }
                            gateHold > 0 -> { gateHold--; 1.0f }
                            gateEnv <= closeThresh -> 0.02f
                            else -> {
                                val r = (gateEnv - closeThresh) / (openThresh - closeThresh).coerceAtLeast(1e-5f)
                                0.02f + 0.98f * r * r
                            }
                        }
                        gateGain += (targetGate - gateGain) * if (targetGate > gateGain) 0.008f else 0.00028f

                        var gated = clean * gateGain * preamp
                        val absGated = abs(gated)
                        compEnv = if (absGated > compEnv) {
                            compEnv * 0.995f + absGated * 0.005f
                        } else {
                            compEnv * 0.9997f + absGated * 0.0003f
                        }
                        if (compEnv > 0.36f) {
                            gated *= (compEnv / 0.36f).toDouble().pow(-0.62).toFloat()
                        }

                        // Presence peaking biquad for vocal clarity without amplifying >9.2kHz hiss
                        val pres = (presenceB[0] * gated + pz1).also { y ->
                            pz1 = presenceB[1] * gated - presenceB[3] * y + pz2
                            pz2 = presenceB[2] * gated - presenceB[4] * y
                        }.toFloat()

                        var outL: Float
                        var outR: Float
                        when (curMode) {
                            "ktv" -> {
                                val bright = pres * 1.08f
                                val dL = slapL[slapIdxL]
                                val dR = slapR[slapIdxR]
                                slapL[slapIdxL] = bright + dR * 0.38f
                                slapR[slapIdxR] = bright + dL * 0.34f
                                if (++slapIdxL >= slapLenL) slapIdxL = 0
                                if (++slapIdxR >= slapLenR) slapIdxR = 0
                                val rev = stepCombs(bright, combsL, combsR, cIdxL, cIdxR, cLpL, cLpR, 0.76f, 0.36f)
                                outL = bright * 0.84f + dL * 0.46f + rev.first * 0.42f
                                outR = bright * 0.84f + dR * 0.46f + rev.second * 0.42f
                            }
                            "theater" -> {
                                lpWarm = lpWarm * 0.80f + gated * 0.20f
                                val warm = gated * 0.66f + lpWarm * 0.56f
                                val rev = stepCombs(warm, combsL, combsR, cIdxL, cIdxR, cLpL, cLpR, 0.82f, 0.56f)
                                outL = warm * 0.72f + rev.first * 0.58f
                                outR = warm * 0.72f + rev.second * 0.58f
                            }
                            "concert" -> {
                                val dL = slapL[slapIdxL]
                                val dR = slapR[slapIdxR]
                                slapL[slapIdxL] = pres + dR * 0.25f
                                slapR[slapIdxR] = pres + dL * 0.23f
                                if (++slapIdxL >= slapLenL) slapIdxL = 0
                                if (++slapIdxR >= slapLenR) slapIdxR = 0
                                val rev = stepCombs(pres, combsL, combsR, cIdxL, cIdxR, cLpL, cLpR, 0.88f, 0.28f)
                                outL = pres * 0.60f + dL * 0.20f + rev.first * 0.78f
                                outR = pres * 0.60f + dR * 0.20f + rev.second * 0.78f
                            }
                            else -> {
                                outL = gated * 0.80f + pres * 0.20f
                                outR = outL
                            }
                        }

                        if (mv <= 0.001f) { outL = 0f; outR = 0f }
                        outL = softClip(outL)
                        outR = softClip(outR)

                        outBuf[i * 2] = (outL * 32767f).toInt().coerceIn(-32768, 32767).toShort()
                        outBuf[i * 2 + 1] = (outR * 32767f).toInt().coerceIn(-32768, 32767).toShort()
                    }
                    track.write(outBuf, 0, read * 2, AudioTrack.WRITE_BLOCKING)
                }
            } catch (_: Throwable) {
            } finally {
                runCatching { ns?.release() }
                runCatching { recorder.stop() }
                runCatching { recorder.release() }
                runCatching { track.stop() }
                runCatching { track.release() }
            }
        }, "LxMine-EarMonitor").apply { start() }
        return true
    }

    private fun stepCombs(
        input: Float,
        combsL: Array<FloatArray>,
        combsR: Array<FloatArray>,
        idxL: IntArray,
        idxR: IntArray,
        lpL: FloatArray,
        lpR: FloatArray,
        fb: Float,
        damp: Float,
    ): Pair<Float, Float> {
        var accL = 0f; var accR = 0f
        for (c in 0 until 4) {
            val bL = combsL[c]; val iL = idxL[c]
            val oL = bL[iL]
            lpL[c] = oL * (1f - damp) + lpL[c] * damp
            bL[iL] = input + lpL[c] * fb
            idxL[c] = if (iL + 1 >= bL.size) 0 else iL + 1
            accL += oL

            val bR = combsR[c]; val iR = idxR[c]
            val oR = bR[iR]
            lpR[c] = oR * (1f - damp) + lpR[c] * damp
            bR[iR] = input + lpR[c] * fb
            idxR[c] = if (iR + 1 >= bR.size) 0 else iR + 1
            accR += oR
        }
        return (accL * 0.25f) to (accR * 0.25f)
    }

    private fun softClip(x: Float, knee: Float = 0.72f, ceiling: Float = 0.94f): Float {
        val ax = abs(x)
        if (ax <= knee) return x
        val span = ceiling - knee
        val y = knee + span * tanh(((ax - knee) / span).toDouble()).toFloat()
        return if (x < 0f) -y else y
    }

    private fun buildHighPass(fs: Double, freq: Double, q: Double): DoubleArray {
        val w0 = 2.0 * PI * freq / fs
        val cw = cos(w0); val sw = sin(w0)
        val alpha = sw / (2.0 * q)
        val a0 = 1.0 + alpha
        return doubleArrayOf(
            ((1.0 + cw) / 2.0) / a0,
            -(1.0 + cw) / a0,
            ((1.0 + cw) / 2.0) / a0,
            (-2.0 * cw) / a0,
            (1.0 - alpha) / a0,
        )
    }

    private fun buildLowPass(fs: Double, freq: Double, q: Double): DoubleArray {
        val w0 = 2.0 * PI * freq.coerceAtMost(fs * 0.45) / fs
        val cw = cos(w0); val sw = sin(w0)
        val alpha = sw / (2.0 * q)
        val a0 = 1.0 + alpha
        return doubleArrayOf(
            ((1.0 - cw) / 2.0) / a0,
            (1.0 - cw) / a0,
            ((1.0 - cw) / 2.0) / a0,
            (-2.0 * cw) / a0,
            (1.0 - alpha) / a0,
        )
    }

    private fun buildPresencePeak(fs: Double, freq: Double, gainDb: Double, q: Double): DoubleArray {
        val a = 10.0.pow(gainDb / 40.0)
        val w0 = 2.0 * PI * freq.coerceAtMost(fs * 0.45) / fs
        val cw = cos(w0); val sw = sin(w0)
        val alpha = sw / (2.0 * q)
        val a0 = 1.0 + alpha / a
        return doubleArrayOf(
            (1.0 + alpha * a) / a0,
            (-2.0 * cw) / a0,
            (1.0 - alpha * a) / a0,
            (-2.0 * cw) / a0,
            (1.0 - alpha / a) / a0,
        )
    }

    fun stop() {
        stopInternal(resetMode = true)
    }

    private fun stopInternal(resetMode: Boolean) {
        running = false
        val t = worker
        worker = null
        if (t != null && t !== Thread.currentThread()) {
            runCatching { t.join(350) }
        }
        if (resetMode) {
            mode = "off"
            PlaybackController.setMusicMonitorGain(1f)
            emitState()
        }
    }

    private fun emitState() {
        onStateChanged?.invoke(currentState())
    }

    private fun emitError(msg: String) {
        onStateChanged?.invoke(
            EarMonitorState(
                mode = "off",
                active = false,
                micVolume = micVol,
                vocalVolume = vocalVol,
                statusText = msg,
            )
        )
    }
}
