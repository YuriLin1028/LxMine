package com.lxlia.player.lx

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.zip.GZIPInputStream

const val MAX_PLAYLIST_BYTES = 32 * 1024 * 1024

fun readImportFile(input: InputStream, sourceScript: Boolean): String {
    val limit = if (sourceScript) 8 * 1024 * 1024 else MAX_PLAYLIST_BYTES
    val bytes = readImportBytes(input, limit)
    val text = if (!sourceScript && bytes.size >= 2 && bytes[0] == 0x1f.toByte() && bytes[1] == 0x8b.toByte()) {
        GZIPInputStream(ByteArrayInputStream(bytes)).use { readImportBytes(it, limit) }
    } else bytes
    return text.toString(Charsets.UTF_8).removePrefix("\uFEFF")
}

private fun readImportBytes(input: InputStream, limit: Int): ByteArray {
    val output = ByteArrayOutputStream()
    val chunk = ByteArray(32 * 1024)
    while (true) {
        val count = input.read(chunk)
        if (count < 0) break
        if (output.size() + count > limit) throw IllegalStateException("文件内容超过 ${limit / 1024 / 1024} MB")
        output.write(chunk, 0, count)
    }
    return output.toByteArray()
}
