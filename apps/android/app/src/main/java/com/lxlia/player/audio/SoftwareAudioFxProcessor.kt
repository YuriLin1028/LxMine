@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tanh

/**
 * 真正跨设备生效的实时 PCM 软件 DSP 音效处理器（Media3 AudioProcessor）：
 * 1. 5 段 RBJ Cookbook 二阶 Biquad 均衡器（60Hz / 230Hz / 910Hz / 3.6kHz / 14kHz + 低频增强）
 * 2. 3D 空间环绕 & 双耳空间音频：Mid-Side 立体声展宽 + 高通非对称 Haas 交叉延迟（L→R 15ms / R→L 22ms）
 * 3. Schroeder 4-Comb + 2-Allpass 立体声混响（室内混响 small / 音乐厅 hall）
 * 4. 软限幅防削波 + 耳返伴奏人声音量增益
 * 不依赖碎片化手机厂商的硬件 Virtualizer/Equalizer，耳机、外放、蓝牙、车机全部立竿见影。
 */
class SoftwareAudioFxProcessor : BaseAudioProcessor() {

    private class Biquad {
        var b0 = 1.0; var b1 = 0.0; var b2 = 0.0; var a1 = 0.0; var a2 = 0.0
        var z1L = 0.0; var z2L = 0.0
        var z1R = 0.0; var z2R = 0.0

        fun resetState() { z1L = 0.0; z2L = 0.0; z1R = 0.0; z2R = 0.0 }

        fun setLowShelf(fs: Double, freq: Double, gainDb: Double, q: Double = 0.75) {
            if (kotlin.math.abs(gainDb) < 0.05) { setIdentity(); return }
            val a = 10.0.pow(gainDb / 40.0)
            val w0 = 2.0 * PI * freq / fs
            val cw = cos(w0); val sw = sin(w0)
            val alpha = sw / (2.0 * q)
            val twoSqrtAAlpha = 2.0 * kotlin.math.sqrt(a) * alpha
            val a0 = (a + 1.0) + (a - 1.0) * cw + twoSqrtAAlpha
            b0 = (a * ((a + 1.0) - (a - 1.0) * cw + twoSqrtAAlpha)) / a0
            b1 = (2.0 * a * ((a - 1.0) - (a + 1.0) * cw)) / a0
            b2 = (a * ((a + 1.0) - (a - 1.0) * cw - twoSqrtAAlpha)) / a0
            a1 = (-2.0 * ((a - 1.0) + (a + 1.0) * cw)) / a0
            a2 = ((a + 1.0) + (a - 1.0) * cw - twoSqrtAAlpha) / a0
        }

        fun setHighShelf(fs: Double, freq: Double, gainDb: Double, q: Double = 0.75) {
            if (kotlin.math.abs(gainDb) < 0.05) { setIdentity(); return }
            val a = 10.0.pow(gainDb / 40.0)
            val w0 = 2.0 * PI * freq.coerceAtMost(fs * 0.45) / fs
            val cw = cos(w0); val sw = sin(w0)
            val alpha = sw / (2.0 * q)
            val twoSqrtAAlpha = 2.0 * kotlin.math.sqrt(a) * alpha
            val a0 = (a + 1.0) - (a - 1.0) * cw + twoSqrtAAlpha
            b0 = (a * ((a + 1.0) + (a - 1.0) * cw + twoSqrtAAlpha)) / a0
            b1 = (-2.0 * a * ((a - 1.0) + (a + 1.0) * cw)) / a0
            b2 = (a * ((a + 1.0) + (a - 1.0) * cw - twoSqrtAAlpha)) / a0
            a1 = (2.0 * ((a - 1.0) - (a + 1.0) * cw)) / a0
            a2 = ((a + 1.0) - (a - 1.0) * cw - twoSqrtAAlpha) / a0
        }

        fun setPeaking(fs: Double, freq: Double, gainDb: Double, q: Double = 1.1) {
            if (kotlin.math.abs(gainDb) < 0.05) { setIdentity(); return }
            val a = 10.0.pow(gainDb / 40.0)
            val w0 = 2.0 * PI * freq.coerceAtMost(fs * 0.45) / fs
            val cw = cos(w0); val sw = sin(w0)
            val alpha = sw / (2.0 * q)
            val a0 = 1.0 + alpha / a
            b0 = (1.0 + alpha * a) / a0
            b1 = (-2.0 * cw) / a0
            b2 = (1.0 - alpha * a) / a0
            a1 = (-2.0 * cw) / a0
            a2 = (1.0 - alpha / a) / a0
        }

        fun setLowPass(fs: Double, freq: Double, q: Double = 0.7071) {
            val w0 = 2.0 * PI * freq.coerceAtMost(fs * 0.45) / fs
            val cw = cos(w0); val sw = sin(w0)
            val alpha = sw / (2.0 * q)
            val a0 = 1.0 + alpha
            b0 = ((1.0 - cw) / 2.0) / a0
            b1 = (1.0 - cw) / a0
            b2 = ((1.0 - cw) / 2.0) / a0
            a1 = (-2.0 * cw) / a0
            a2 = (1.0 - alpha) / a0
        }

        fun setIdentity() { b0 = 1.0; b1 = 0.0; b2 = 0.0; a1 = 0.0; a2 = 0.0 }

        fun processL(x: Double): Double {
            val y = b0 * x + z1L
            z1L = b1 * x - a1 * y + z2L
            z2L = b2 * x - a2 * y
            return y
        }

        fun processR(x: Double): Double {
            val y = b0 * x + z1R
            z1R = b1 * x - a1 * y + z2R
            z2R = b2 * x - a2 * y
            return y
        }
    }

    private class CombFilter(size: Int) {
        private val buf = FloatArray(size.coerceAtLeast(16))
        private var idx = 0
        private var lp = 0f

        fun reset() { buf.fill(0f); idx = 0; lp = 0f }

        fun process(input: Float, feedback: Float, damp: Float): Float {
            val out = buf[idx]
            lp = out * (1f - damp) + lp * damp
            buf[idx] = input + lp * feedback
            if (++idx >= buf.size) idx = 0
            return out
        }
    }

    private class AllpassFilter(size: Int) {
        private val buf = FloatArray(size.coerceAtLeast(8))
        private var idx = 0

        fun reset() { buf.fill(0f); idx = 0 }

        fun process(input: Float): Float {
            val buffered = buf[idx]
            val out = -input + buffered
            buf[idx] = input + buffered * 0.5f
            if (++idx >= buf.size) idx = 0
            return out
        }
    }

    @Volatile private var config: AudioFxConfig = AudioFxConfig()
    @Volatile private var configVersion: Int = 0
    @Volatile private var monitorGain: Float = 1f

    private var appliedVersion: Int = -1
    private var sampleRate: Int = 44100
    private var channels: Int = 2

    private val eqBands = Array(5) { Biquad() }
    private var eqActive = false
    private var stereoWidth = 1.0f
    private var haasWet = 0.0f
    private var reverbWet = 0.0f
    private var reverbFeedback = 0.72f
    private var reverbDamp = 0.35f

    // Haas non-symmetric delay lines (high-passed side crossfeed)
    private var haasDelayL = FloatArray(1024)
    private var haasDelayR = FloatArray(1024)
    private var haasLenL = 660
    private var haasLenR = 970
    private var haasIdxL = 0
    private var haasIdxR = 0
    private var hpPrevInL = 0f; private var hpPrevOutL = 0f
    private var hpPrevInR = 0f; private var hpPrevOutR = 0f
    private var hpAlpha = 0.96f

    // 4th-Order Sub-Bass (105Hz, 24dB/oct) + Mid-Side Vocal Suppressor / Zero-Clip Vocal Booster
    private val vcLowLp1 = Biquad()
    private val vcLowLp2 = Biquad()
    private val vcMidBoostEq = Biquad()
    private val vcSideNotchEq = Biquad()
    private var vcSyncedGain = -1f

    private fun softClip(x: Float, knee: Float = 0.72f, ceiling: Float = 0.94f): Float {
        val ax = kotlin.math.abs(x)
        if (ax <= knee) return x
        val span = ceiling - knee
        val y = knee + span * tanh(((ax - knee) / span).toDouble()).toFloat()
        return if (x < 0f) -y else y
    }

    private fun syncVocalCancelCoeffsIfNeeded(gain: Float) {
        if (kotlin.math.abs(gain - vcSyncedGain) < 0.005f) return
        vcSyncedGain = gain
        val fs = sampleRate.toDouble()
        val suppress = (1f - gain.coerceAtMost(1f)).coerceAtLeast(0f).toDouble()
        val boost = ((gain - 1f) * 2f).coerceAtLeast(0f).toDouble()
        if (boost > 0.005) {
            vcMidBoostEq.setPeaking(fs, 1850.0, 5.2 * boost, 0.65)
            vcSideNotchEq.setPeaking(fs, 1550.0, -2.2 * boost, 0.52)
        } else if (suppress > 0.005) {
            vcMidBoostEq.setIdentity()
            vcSideNotchEq.setPeaking(fs, 1550.0, -7.5 * suppress, 0.52)
        } else {
            vcMidBoostEq.setIdentity()
            vcSideNotchEq.setIdentity()
        }
    }

    // Stereo Schroeder reverb
    private var combsL: Array<CombFilter> = emptyArray()
    private var combsR: Array<CombFilter> = emptyArray()
    private var allpassL: Array<AllpassFilter> = emptyArray()
    private var allpassR: Array<AllpassFilter> = emptyArray()

    fun updateConfig(next: AudioFxConfig) {
        config = next
        configVersion++
    }

    fun setMonitorGain(gain: Float) {
        monitorGain = gain.coerceIn(0f, 1.5f)
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT ||
            (inputAudioFormat.channelCount != 1 && inputAudioFormat.channelCount != 2)
        ) {
            return AudioProcessor.AudioFormat.NOT_SET
        }
        sampleRate = inputAudioFormat.sampleRate.coerceAtLeast(8000)
        channels = inputAudioFormat.channelCount
        allocateDelayLines(sampleRate)
        appliedVersion = -1
        return inputAudioFormat
    }

    private fun allocateDelayLines(fs: Int) {
        val scale = fs / 44100.0
        haasLenL = (fs * 0.015).toInt().coerceAtLeast(32)
        haasLenR = (fs * 0.022).toInt().coerceAtLeast(48)
        haasDelayL = FloatArray(haasLenL)
        haasDelayR = FloatArray(haasLenR)
        haasIdxL = 0; haasIdxR = 0
        hpPrevInL = 0f; hpPrevOutL = 0f; hpPrevInR = 0f; hpPrevOutR = 0f
        val rc = 1.0 / (2.0 * PI * 260.0)
        val dt = 1.0 / fs
        hpAlpha = (rc / (rc + dt)).toFloat().coerceIn(0.80f, 0.99f)

        // 4th-Order 105Hz Sub-Bass preserve (24dB/oct kills all 150-400Hz vocal body while keeping kick/bass)
        vcLowLp1.setLowPass(fs.toDouble(), 105.0, 0.7071)
        vcLowLp2.setLowPass(fs.toDouble(), 105.0, 0.7071)
        vcLowLp1.resetState()
        vcLowLp2.resetState()
        vcMidBoostEq.resetState()
        vcSideNotchEq.resetState()
        vcSyncedGain = -1f

        val baseL = intArrayOf(1116, 1188, 1277, 1356)
        val baseR = intArrayOf(1139, 1211, 1300, 1379)
        combsL = Array(4) { CombFilter((baseL[it] * scale).toInt()) }
        combsR = Array(4) { CombFilter((baseR[it] * scale).toInt()) }
        allpassL = arrayOf(AllpassFilter((556 * scale).toInt()), AllpassFilter((441 * scale).toInt()))
        allpassR = arrayOf(AllpassFilter((579 * scale).toInt()), AllpassFilter((464 * scale).toInt()))
    }

    private fun syncCoeffsIfNeeded() {
        val v = configVersion
        if (v == appliedVersion) return
        appliedVersion = v
        val cfg = config
        val fs = sampleRate.toDouble()
        val bands = AudioFxPresets.effectiveBands(cfg)
        val bassBoost = AudioFxPresets.effectiveBassBoost(cfg)
        // Amplify bass band gently from bassBoost so Bass / EDM / Hip-Hop presets punch clearly.
        val b0Gain = (bands.getOrElse(0) { 0 } + bassBoost * 0.35).coerceIn(-12.0, 13.5)
        val b1Gain = bands.getOrElse(1) { 0 }.toDouble()
        val b2Gain = bands.getOrElse(2) { 0 }.toDouble()
        val b3Gain = bands.getOrElse(3) { 0 }.toDouble()
        val b4Gain = bands.getOrElse(4) { 0 }.toDouble()

        eqActive = cfg.preset != "off" &&
            (kotlin.math.abs(b0Gain) > 0.05 || kotlin.math.abs(b1Gain) > 0.05 ||
                kotlin.math.abs(b2Gain) > 0.05 || kotlin.math.abs(b3Gain) > 0.05 ||
                kotlin.math.abs(b4Gain) > 0.05)

        eqBands[0].setLowShelf(fs, 68.0, b0Gain, 0.75)
        eqBands[1].setPeaking(fs, 230.0, b1Gain, 1.05)
        eqBands[2].setPeaking(fs, 910.0, b2Gain, 1.05)
        eqBands[3].setPeaking(fs, 3600.0, b3Gain, 1.10)
        eqBands[4].setHighShelf(fs, 12000.0, b4Gain, 0.75)

        val is3d = cfg.spatial
        val isBinaural = cfg.spatialMode == "binaural"
        stereoWidth = when {
            is3d && isBinaural -> 1.92f
            is3d -> 1.76f
            isBinaural -> 1.44f
            else -> 1.0f
        }
        haasWet = when {
            is3d && isBinaural -> 0.34f
            is3d -> 0.28f
            isBinaural -> 0.19f
            else -> 0.0f
        }
        when (cfg.reverb) {
            "hall" -> { reverbWet = 0.28f; reverbFeedback = 0.83f; reverbDamp = 0.26f }
            "small" -> { reverbWet = 0.18f; reverbFeedback = 0.68f; reverbDamp = 0.42f }
            else -> {
                if (isBinaural) {
                    // Subtle early-reflection air for headphone spatial feel
                    reverbWet = 0.08f; reverbFeedback = 0.56f; reverbDamp = 0.48f
                } else {
                    reverbWet = 0f
                }
            }
        }
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return
        syncCoeffsIfNeeded()
        val gain = monitorGain
        val passthrough = !eqActive && stereoWidth == 1.0f && haasWet == 0.0f && reverbWet == 0.0f && kotlin.math.abs(gain - 1f) < 0.002f
        val output = replaceOutputBuffer(remaining)
        if (passthrough) {
            output.put(inputBuffer)
            output.flip()
            return
        }

        val scaleIn = 1.0 / 32768.0
        val vocalActive = kotlin.math.abs(gain - 1f) > 0.002f
        if (vocalActive) syncVocalCancelCoeffsIfNeeded(gain)
        val suppress = (1f - gain.coerceAtMost(1f)).coerceAtLeast(0f)
        val boost = ((gain - 1f) * 2f).coerceAtLeast(0f)
        val midDirectGain = if (gain <= 1f) (gain * gain) else 1f
        val lowKeepGain = suppress * (1f + suppress * 0.12f)
        val sideScale = if (suppress > 0f) (1f + suppress * 0.42f) else (1f - boost * 0.34f)
        val outTrim = 1f / (1f + boost * 0.24f)

        if (channels == 2) {
            val frames = remaining / 4
            for (i in 0 until frames) {
                var l = inputBuffer.short * scaleIn
                var r = inputBuffer.short * scaleIn

                if (eqActive) {
                    for (b in eqBands) {
                        l = b.processL(l)
                        r = b.processR(r)
                    }
                }

                var lf = l.toFloat()
                var rf = r.toFloat()

                // Mid-Side stereo widening + high-passed Haas crossfeed
                if (stereoWidth > 1.01f || haasWet > 0.001f) {
                    val mid = (lf + rf) * 0.5f
                    val side = (lf - rf) * 0.5f * stereoWidth
                    var wl = mid + side
                    var wr = mid - side

                    if (haasWet > 0.001f) {
                        val hpL = hpAlpha * (hpPrevOutL + lf - hpPrevInL)
                        hpPrevInL = lf; hpPrevOutL = hpL
                        val hpR = hpAlpha * (hpPrevOutR + rf - hpPrevInR)
                        hpPrevInR = rf; hpPrevOutR = hpR

                        val delayedL = haasDelayL[haasIdxL]
                        haasDelayL[haasIdxL] = hpL
                        if (++haasIdxL >= haasLenL) haasIdxL = 0

                        val delayedR = haasDelayR[haasIdxR]
                        haasDelayR[haasIdxR] = hpR
                        if (++haasIdxR >= haasLenR) haasIdxR = 0

                        wl += delayedR * haasWet - delayedL * (haasWet * 0.25f)
                        wr += delayedL * haasWet - delayedR * (haasWet * 0.25f)
                    }
                    lf = wl * 0.90f
                    rf = wr * 0.90f
                }

                // Stereo Schroeder reverb
                if (reverbWet > 0.001f && combsL.size == 4) {
                    val monoIn = (lf + rf) * 0.32f
                    var accL = 0f; var accR = 0f
                    for (c in 0 until 4) {
                        accL += combsL[c].process(monoIn, reverbFeedback, reverbDamp)
                        accR += combsR[c].process(monoIn, reverbFeedback, reverbDamp)
                    }
                    accL = allpassL[1].process(allpassL[0].process(accL * 0.25f))
                    accR = allpassR[1].process(allpassR[0].process(accR * 0.25f))
                    val dry = 1f - reverbWet * 0.45f
                    lf = lf * dry + accL * reverbWet
                    rf = rf * dry + accR * reverbWet
                }

                // 4th-Order Sub-Bass (105Hz) + Mid-Side Vocal Suppressor / Zero-Clip Vocal Booster
                if (vocalActive) {
                    val mid = (lf + rf) * 0.5
                    val side = (lf - rf) * 0.5
                    val mLow = vcLowLp2.processL(vcLowLp1.processL(mid))
                    val mMain = vcMidBoostEq.processL(mid * midDirectGain)
                    val mOut = (mMain + mLow * lowKeepGain).toFloat()
                    val sOut = (vcSideNotchEq.processR(side) * sideScale).toFloat()
                    lf = (mOut + sOut) * outTrim
                    rf = (mOut - sOut) * outTrim
                }

                // C1-continuous soft-knee limiter (zero step discontinuity / zero clipping buzz)
                lf = softClip(lf)
                rf = softClip(rf)

                output.putShort((lf * 32767f).toInt().coerceIn(-32768, 32767).toShort())
                output.putShort((rf * 32767f).toInt().coerceIn(-32768, 32767).toShort())
            }
        } else {
            val frames = remaining / 2
            for (i in 0 until frames) {
                var s = inputBuffer.short * scaleIn
                if (eqActive) {
                    for (b in eqBands) s = b.processL(s)
                }
                var sf = s.toFloat()
                if (vocalActive) {
                    val mLow = vcLowLp2.processL(vcLowLp1.processL(sf.toDouble()))
                    val mMain = vcMidBoostEq.processL(sf.toDouble() * midDirectGain)
                    sf = ((mMain + mLow * lowKeepGain) * outTrim).toFloat()
                }
                sf = softClip(sf)
                output.putShort((sf * 32767f).toInt().coerceIn(-32768, 32767).toShort())
            }
        }
        output.flip()
    }

    override fun onFlush() {
        for (b in eqBands) b.resetState()
        haasDelayL.fill(0f); haasDelayR.fill(0f)
        haasIdxL = 0; haasIdxR = 0
        hpPrevInL = 0f; hpPrevOutL = 0f; hpPrevInR = 0f; hpPrevOutR = 0f
        vcLowLp1.resetState()
        vcLowLp2.resetState()
        vcMidBoostEq.resetState()
        vcSideNotchEq.resetState()
        for (c in combsL) c.reset()
        for (c in combsR) c.reset()
        for (a in allpassL) a.reset()
        for (a in allpassR) a.reset()
    }

    override fun onReset() {
        onFlush()
        appliedVersion = -1
    }
}
