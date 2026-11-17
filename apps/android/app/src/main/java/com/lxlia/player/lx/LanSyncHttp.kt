package com.lxlia.player.lx

import okio.Buffer
import okio.buffer
import okio.source
import java.io.InputStream
import java.net.ProtocolException

internal data class LanSyncHttpRequest(val method: String, val path: String, val body: String)

/** Read one bounded HTTP request, including the transfer framing used by LAN peers. */
internal fun readLanSyncHttpRequest(
    input: InputStream,
    maxBody: Int,
    onContinue: () -> Unit,
): LanSyncHttpRequest {
    val source = input.source().buffer()
    var headerBudget = 16384L
    fun headerLine(): String {
        val line = source.readUtf8LineStrict(headerBudget)
        headerBudget -= line.toByteArray(Charsets.UTF_8).size + 2L
        if (headerBudget < 0) throw ProtocolException("header too large")
        return line
    }

    val requestLine = headerLine().split(' ', limit = 3)
    if (requestLine.size != 3 || !requestLine[2].startsWith("HTTP/1.")) {
        throw ProtocolException("invalid request line")
    }
    var contentLength: Long? = null
    val transferCodings = mutableListOf<String>()
    var expectContinue = false
    while (true) {
        val line = headerLine()
        if (line.isEmpty()) break
        val separator = line.indexOf(':')
        if (separator <= 0) throw ProtocolException("invalid header")
        val value = line.substring(separator + 1).trim()
        when (line.substring(0, separator).trim().lowercase()) {
            "content-length" -> {
                val length = value.toLongOrNull()
                if (value.isEmpty() || value.any { it !in '0'..'9' } || length == null ||
                    length > maxBody || (contentLength != null && contentLength != length)
                ) throw ProtocolException("invalid content length")
                contentLength = length
            }
            "transfer-encoding" -> transferCodings.addAll(value.lowercase().split(',').map(String::trim))
            "expect" -> expectContinue = value.equals("100-continue", ignoreCase = true)
        }
    }
    if (transferCodings.isNotEmpty() && transferCodings != listOf("chunked")) {
        throw ProtocolException("unsupported transfer encoding")
    }
    val chunked = transferCodings.isNotEmpty()
    if (chunked && contentLength != null) throw ProtocolException("ambiguous body length")
    if (expectContinue && (chunked || (contentLength ?: 0) > 0)) onContinue()

    val body = if (chunked) {
        val decoded = Buffer()
        while (true) {
            val sizeText = source.readUtf8LineStrict(8192).substringBefore(';').trim()
            val size = sizeText.toLongOrNull(16)
            if (sizeText.isEmpty() || sizeText.any { it !in '0'..'9' && it.lowercaseChar() !in 'a'..'f' } ||
                size == null || size > maxBody - decoded.size
            ) throw ProtocolException("invalid chunk size")
            if (size == 0L) {
                headerBudget = 16384
                while (headerLine().isNotEmpty()) { /* Consume trailers before presenting the request. */ }
                break
            }
            decoded.write(source.readByteArray(size))
            if (source.readByte() != 13.toByte() || source.readByte() != 10.toByte()) {
                throw ProtocolException("invalid chunk terminator")
            }
        }
        decoded.readUtf8()
    } else {
        source.readUtf8(contentLength ?: 0)
    }
    return LanSyncHttpRequest(requestLine[0], requestLine[1].substringBefore('?'), body)
}
