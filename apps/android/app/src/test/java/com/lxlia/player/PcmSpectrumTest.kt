@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player

import androidx.media3.common.C
import com.lxlia.player.audio.PcmSpectrum
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PcmSpectrumTest {
    private val rate = 48_000
    private val count = PcmSpectrum.FFT_SIZE
    private val bin = 43

    private fun signal(encoding: Int, channels: Int = 1): ByteBuffer {
        val bytes = when (encoding) {
            C.ENCODING_PCM_8BIT -> 1
            C.ENCODING_PCM_16BIT, C.ENCODING_PCM_16BIT_BIG_ENDIAN -> 2
            C.ENCODING_PCM_24BIT, C.ENCODING_PCM_24BIT_BIG_ENDIAN -> 3
            else -> 4
        }
        val bigEndian = encoding == C.ENCODING_PCM_16BIT_BIG_ENDIAN ||
            encoding == C.ENCODING_PCM_24BIT_BIG_ENDIAN || encoding == C.ENCODING_PCM_32BIT_BIG_ENDIAN
        val buffer = ByteBuffer.allocate(count * channels * bytes).order(ByteOrder.LITTLE_ENDIAN)
        repeat(count) { index ->
            val value = sin(2 * PI * bin * index / count) * 0.02
            repeat(channels) {
                when (encoding) {
                    C.ENCODING_PCM_8BIT -> buffer.put((128 + value * 128).roundToInt().toByte())
                    C.ENCODING_PCM_FLOAT -> buffer.putFloat(value.toFloat())
                    else -> {
                        val integer = (value * (1L shl (bytes * 8 - 1))).roundToInt()
                        repeat(bytes) { offset ->
                            val shift = (if (bigEndian) bytes - offset - 1 else offset) * 8
                            buffer.put((integer shr shift).toByte())
                        }
                    }
                }
            }
        }
        buffer.flip()
        return buffer
    }

    @Test fun disabledAnalysisDoesNotReadPcm() {
        val spectrum = PcmSpectrum()
        spectrum.configure(rate, 1, C.ENCODING_PCM_16BIT)
        val pcm = signal(C.ENCODING_PCM_16BIT)
        spectrum.consume(pcm, 0)
        assertEquals(0, pcm.position())
        assertNull(spectrum.frameAt(0))
    }

    @Test fun frequencyAndWaveformSupportAllLinearPcmFormats() {
        val formats = listOf(C.ENCODING_PCM_8BIT, C.ENCODING_PCM_16BIT, C.ENCODING_PCM_24BIT,
            C.ENCODING_PCM_32BIT, C.ENCODING_PCM_FLOAT, C.ENCODING_PCM_16BIT_BIG_ENDIAN,
            C.ENCODING_PCM_24BIT_BIG_ENDIAN, C.ENCODING_PCM_32BIT_BIG_ENDIAN)
        formats.forEach { format ->
            val spectrum = PcmSpectrum()
            spectrum.configure(rate, 2, format)
            spectrum.setEnabled(true)
            spectrum.consume(signal(format, 2), 0)
            val frame = spectrum.frameAt(22_000)!!
            val peak = frame.frequency.indices.maxBy { frame.frequency[it].toInt() and 255 }
            assertTrue("PCM format $format produced peak $peak", abs(peak - bin) <= 1)
            assertEquals(rate, frame.sampleRate)
            assertEquals(2048, frame.waveform.size)
            assertTrue(frame.waveform.any { (it.toInt() and 255) > 128 })
            assertTrue(frame.waveform.any { (it.toInt() and 255) < 128 })
        }
    }

    @Test fun spectrumIsSelectedAtAudiblePositionAndExpiresAfterSeek() {
        val spectrum = PcmSpectrum()
        spectrum.configure(rate, 1, C.ENCODING_PCM_16BIT)
        spectrum.setEnabled(true)
        spectrum.consume(signal(C.ENCODING_PCM_16BIT), 0)
        val initial = spectrum.frameAt(22_000)!!
        spectrum.consume(signal(C.ENCODING_PCM_16BIT), 42_666)
        val later = spectrum.frameAt(65_000)!!
        assertEquals(initial.sequence, spectrum.frameAt(22_000)!!.sequence)
        assertTrue(later.sequence > initial.sequence)
        assertNull(spectrum.frameAt(900_000))
        spectrum.reset()
        assertNull(spectrum.frameAt(65_000))
        spectrum.consume(signal(C.ENCODING_PCM_16BIT), 5_000_000)
        assertNotNull(spectrum.frameAt(5_022_000))
        assertNull(spectrum.frameAt(22_000))
    }

    @Test fun disablingClearsFramesAndReentryStartsWithFreshSamples() {
        val spectrum = PcmSpectrum()
        spectrum.configure(rate, 1, C.ENCODING_PCM_FLOAT)
        spectrum.setEnabled(true)
        spectrum.consume(signal(C.ENCODING_PCM_FLOAT), 0)
        assertNotNull(spectrum.frameAt(22_000))
        spectrum.setEnabled(false)
        assertNull(spectrum.frameAt(22_000))
        spectrum.setEnabled(true)
        val partial = signal(C.ENCODING_PCM_FLOAT).apply { limit(1024) }
        spectrum.consume(partial, 2_000_000)
        assertNull(spectrum.frameAt(2_010_000))
    }
}
