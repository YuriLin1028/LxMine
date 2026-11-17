@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.lxlia.player.audio

import androidx.media3.common.Format
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import java.nio.ByteBuffer

/** Taps only PCM bytes consumed by the existing sink, including partial writes. */
internal class SpectrumAudioSink(sink: AudioSink, private val spectrum: PcmSpectrum) : ForwardingAudioSink(sink) {
    private var sampleRate = 0
    private var frameBytes = 0
    private var input: ByteBuffer? = null
    private var inputStart = 0
    private var streamOffsetUs = 0L

    override fun configure(inputFormat: Format, specifiedBufferSize: Int, outputChannels: IntArray?) {
        super.configure(inputFormat, specifiedBufferSize, outputChannels)
        sampleRate = inputFormat.sampleRate
        frameBytes = if (Util.isEncodingLinearPcm(inputFormat.pcmEncoding)) {
            Util.getPcmFrameSize(inputFormat.pcmEncoding, inputFormat.channelCount)
        } else 0
        spectrum.configure(sampleRate, inputFormat.channelCount, inputFormat.pcmEncoding)
        input = null
    }

    override fun handleBuffer(buffer: ByteBuffer, presentationTimeUs: Long, encodedAccessUnitCount: Int): Boolean {
        if (input !== buffer) {
            input = buffer
            inputStart = buffer.position()
        }
        val start = buffer.position()
        val consumed = super.handleBuffer(buffer, presentationTimeUs, encodedAccessUnitCount)
        if (spectrum.enabled && frameBytes > 0 && sampleRate > 0 && buffer.position() > start) {
            val pcm = buffer.duplicate()
            pcm.limit(buffer.position())
            pcm.position(start)
            val offsetUs = (start - inputStart).toLong() / frameBytes * 1_000_000 / sampleRate
            spectrum.consume(pcm, presentationTimeUs - streamOffsetUs + offsetUs)
        }
        if (consumed) input = null
        return consumed
    }

    override fun flush() {
        spectrum.reset()
        input = null
        super.flush()
    }

    override fun setOutputStreamOffsetUs(outputStreamOffsetUs: Long) {
        streamOffsetUs = outputStreamOffsetUs
        spectrum.reset()
        super.setOutputStreamOffsetUs(outputStreamOffsetUs)
    }

    override fun handleDiscontinuity() {
        spectrum.reset()
        super.handleDiscontinuity()
    }

    override fun reset() {
        spectrum.reset()
        input = null
        super.reset()
    }
}
