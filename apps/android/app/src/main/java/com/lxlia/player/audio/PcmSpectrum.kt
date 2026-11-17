@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import androidx.media3.common.C
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.roundToInt
import kotlin.math.sin

/** Reads the player's decoded PCM without changing its buffers or opening another audio stream. */
internal class PcmSpectrum {
    data class Frame(
        val sequence: Long,
        val positionUs: Long,
        val sampleRate: Int,
        val frequency: ByteArray,
        val waveform: ByteArray,
    )

    @Volatile var enabled = false
        private set
    @Volatile private var generation = 0
    private var consumedGeneration = -1
    private val history = ArrayDeque<Frame>()
    private var sequence = 0L
    private var sampleRate = 0
    private var channels = 0
    private var encoding = C.ENCODING_INVALID
    private var sampleBytes = 0
    private var writeIndex = 0
    private var sampleCount = 0
    private var sinceTransform = 0
    private var expectedPositionUs = Long.MIN_VALUE
    private val samples = DoubleArray(FFT_SIZE)
    private val real = DoubleArray(FFT_SIZE)
    private val imaginary = DoubleArray(FFT_SIZE)
    private val window = DoubleArray(FFT_SIZE) { index ->
        0.42 - 0.5 * cos(2 * PI * index / FFT_SIZE) + 0.08 * cos(4 * PI * index / FFT_SIZE)
    }
    private val bitReversed = IntArray(FFT_SIZE) { Integer.reverse(it) ushr (32 - 11) }
    private val cosine = DoubleArray(FFT_SIZE / 2) { cos(2 * PI * it / FFT_SIZE) }
    private val sine = DoubleArray(FFT_SIZE / 2) { -sin(2 * PI * it / FFT_SIZE) }

    fun setEnabled(value: Boolean) {
        synchronized(history) {
            if (enabled == value) return
            enabled = value
            generation++
            history.clear()
        }
    }

    fun reset() {
        synchronized(history) {
            generation++
            history.clear()
        }
    }

    fun configure(rate: Int, channelCount: Int, pcmEncoding: Int) {
        sampleRate = rate
        channels = channelCount
        encoding = pcmEncoding
        sampleBytes = when (encoding) {
            C.ENCODING_PCM_8BIT -> 1
            C.ENCODING_PCM_16BIT, C.ENCODING_PCM_16BIT_BIG_ENDIAN -> 2
            C.ENCODING_PCM_24BIT, C.ENCODING_PCM_24BIT_BIG_ENDIAN -> 3
            C.ENCODING_PCM_32BIT, C.ENCODING_PCM_32BIT_BIG_ENDIAN, C.ENCODING_PCM_FLOAT -> 4
            else -> 0
        }
        reset()
    }

    /** Decoders can run ahead. Select the analysis window nearest the audible native position. */
    fun frameAt(positionUs: Long): Frame? = synchronized(history) {
        if (!enabled) return@synchronized null
        history.minByOrNull { abs(it.positionUs - positionUs) }
            ?.takeIf { abs(it.positionUs - positionUs) <= 300_000 }
    }

    fun consume(buffer: ByteBuffer, positionUs: Long) {
        if (!enabled || sampleBytes == 0 || channels <= 0 || sampleRate <= 0) return
        val currentGeneration = generation
        if (consumedGeneration != currentGeneration ||
            (expectedPositionUs != Long.MIN_VALUE && abs(positionUs - expectedPositionUs) > 100_000)
        ) {
            writeIndex = 0
            sampleCount = 0
            sinceTransform = 0
            consumedGeneration = currentGeneration
        }
        val frameBytes = sampleBytes * channels
        val frameCount = buffer.remaining() / frameBytes
        val transformInterval = (sampleRate / 25).coerceAtLeast(1)
        for (frameIndex in 0 until frameCount) {
            var mono = 0.0
            repeat(channels) { mono += readSample(buffer) }
            samples[writeIndex] = (mono / channels).coerceIn(-1.0, 1.0)
            writeIndex = (writeIndex + 1) and (FFT_SIZE - 1)
            sampleCount = (sampleCount + 1).coerceAtMost(FFT_SIZE)
            sinceTransform++
            if (sampleCount >= FFT_SIZE && sinceTransform >= transformInterval) {
                sinceTransform = 0
                val centerUs = positionUs + (frameIndex + 1L - FFT_SIZE / 2) * 1_000_000 / sampleRate
                publish(centerUs, currentGeneration)
            }
        }
        expectedPositionUs = positionUs + frameCount.toLong() * 1_000_000 / sampleRate
    }

    private fun readSample(buffer: ByteBuffer): Double {
        if (encoding == C.ENCODING_PCM_8BIT) return ((buffer.get().toInt() and 255) - 128) / 128.0
        val bigEndian = encoding == C.ENCODING_PCM_16BIT_BIG_ENDIAN ||
            encoding == C.ENCODING_PCM_24BIT_BIG_ENDIAN || encoding == C.ENCODING_PCM_32BIT_BIG_ENDIAN
        var raw = 0
        repeat(sampleBytes) { index ->
            val shift = (if (bigEndian) sampleBytes - 1 - index else index) * 8
            raw = raw or ((buffer.get().toInt() and 255) shl shift)
        }
        if (encoding == C.ENCODING_PCM_FLOAT) {
            val value = Float.fromBits(raw).toDouble()
            return if (value.isFinite()) value else 0.0
        }
        val signed = (raw shl (32 - sampleBytes * 8)) shr (32 - sampleBytes * 8)
        return signed / (1L shl (sampleBytes * 8 - 1)).toDouble()
    }

    private fun publish(positionUs: Long, currentGeneration: Int) {
        val waveform = ByteArray(FFT_SIZE)
        for (index in 0 until FFT_SIZE) {
            val value = samples[(writeIndex + index) and (FFT_SIZE - 1)]
            waveform[index] = ((value + 1) * 128).roundToInt().coerceIn(0, 255).toByte()
            real[bitReversed[index]] = value * window[index]
        }
        imaginary.fill(0.0)
        var size = 2
        while (size <= FFT_SIZE) {
            val half = size / 2
            val stride = FFT_SIZE / size
            for (start in 0 until FFT_SIZE step size) {
                for (offset in 0 until half) {
                    val even = start + offset
                    val odd = even + half
                    val twiddle = offset * stride
                    val r = real[odd] * cosine[twiddle] - imaginary[odd] * sine[twiddle]
                    val i = real[odd] * sine[twiddle] + imaginary[odd] * cosine[twiddle]
                    real[odd] = real[even] - r
                    imaginary[odd] = imaginary[even] - i
                    real[even] += r
                    imaginary[even] += i
                }
            }
            size *= 2
        }
        val frequency = ByteArray(FFT_SIZE / 2) { index ->
            val magnitude = hypot(real[index], imaginary[index]) / FFT_SIZE
            val decibels = 20 * log10(magnitude.coerceAtLeast(1e-8))
            ((decibels + 100) * 255 / 70).roundToInt().coerceIn(0, 255).toByte()
        }
        synchronized(history) {
            if (!enabled || generation != currentGeneration) return
            history.addLast(Frame(++sequence, positionUs, sampleRate, frequency, waveform))
            while (history.size > 32) history.removeFirst()
        }
    }

    companion object {
        const val FFT_SIZE = 2048
    }
}
