package com.lxlia.player.lx

import android.content.Context
import android.content.res.AssetManager
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * 仅本机回环的小型 HTTP 服务：
 *  - 为 MineRadio 舞台提供与 PC 同源的 http:// 页面与静态资源（WebAudio 需要同源）；
 *  - /api/cover 代理远程封面，绕开画布与 WebGL 的跨域限制；
 *  - /audio/<token> 把当前播放源（远程或本地文件）以 CORS 头转发给舞台做频谱分析。
 * 鸿蒙端用 WebResourceResponse + StageAudioProxy 实现同一套职责。
 */
class LocalServer(private val context: Context, private val http: OkHttpClient) {
    private var serverSocket: ServerSocket? = null
    private val assets: AssetManager get() = context.assets

    @Volatile
    var port: Int = 0
        private set

    @Volatile
    private var remoteUrl: String = ""

    @Volatile
    private var token: String = ""

    val requests = AtomicLong(0)
    val audioSent = AtomicLong(0)

    fun start() {
        if (serverSocket != null) return
        val socket = ServerSocket(0, 24, InetAddress.getByName("127.0.0.1"))
        serverSocket = socket
        port = socket.localPort
        thread(name = "lxmine-local-server", isDaemon = true) {
            while (!socket.isClosed) {
                val client = try {
                    socket.accept()
                } catch (_: Exception) {
                    break
                }
                thread(isDaemon = true) { handle(client) }
            }
        }
    }

    fun stop() {
        runCatching { serverSocket?.close() }
        serverSocket = null
        remoteUrl = ""
        token = ""
    }

    fun stageUrl(): String = "http://127.0.0.1:$port/harmony-stage.html"

    /** 封面必须走同源代理：WebGL 纹理加载跨域图片会被浏览器拒绝。 */
    fun coverProxy(url: String): String {
        if (port == 0 || url.isEmpty()) return url
        if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) return url
        return "http://127.0.0.1:$port/api/cover?url=" + java.net.URLEncoder.encode(url, "UTF-8")
    }

    /** 只对 http(s) 与下载目录下的本地文件开放；每次换源换 token，旧连接自然失效。 */
    fun audioSource(url: String, downloadsRoot: String): String {
        if (port == 0) return ""
        val local = downloadsRoot.isNotEmpty() && url.startsWith("file://") && !url.contains("/../")
        if (!url.startsWith("http://", true) && !url.startsWith("https://", true) && !local) return ""
        if (url != remoteUrl) {
            remoteUrl = url
            token = "${System.currentTimeMillis().toString(36)}-${(0..1_000_000).random().toString(36)}"
        }
        return "http://127.0.0.1:$port/audio/$token"
    }

    private fun handle(socket: Socket) {
        socket.use { client ->
            try {
                client.soTimeout = 20000
                val input = client.getInputStream()
                val head = readHead(input) ?: return
                val lines = head.split("\r\n")
                val requestLine = lines.firstOrNull() ?: return
                val parts = requestLine.split(' ')
                if (parts.size < 2) return
                val method = parts[0]
                val target = parts[1]
                val headers = mutableMapOf<String, String>()
                for (index in 1 until lines.size) {
                    val separator = lines[index].indexOf(':')
                    if (separator <= 0) continue
                    headers[lines[index].substring(0, separator).trim().lowercase()] =
                        lines[index].substring(separator + 1).trim()
                }
                requests.incrementAndGet()
                val output = client.getOutputStream()
                when {
                    target.startsWith("/audio/") -> serveAudio(output, target, headers["range"])
                    target.startsWith("/api/cover?") -> serveCover(output, target)
                    else -> serveAsset(output, target, method)
                }
                output.flush()
            } catch (_: Exception) {
                // 连接被浏览器取消（切歌/关页）属正常路径，不打断服务。
            }
        }
    }

    private fun readHead(input: InputStream): String? {
        val buffer = ByteArrayOutputStreamLite()
        val chunk = ByteArray(4096)
        while (buffer.size < 16384) {
            val read = input.read(chunk)
            if (read <= 0) return null
            buffer.write(chunk, 0, read)
            val text = buffer.toStringAscii()
            if (text.contains("\r\n\r\n")) return text.substring(0, text.indexOf("\r\n\r\n"))
        }
        return null
    }

    private class ByteArrayOutputStreamLite {
        private val stream = java.io.ByteArrayOutputStream()
        val size: Int get() = stream.size()
        fun write(data: ByteArray, offset: Int, length: Int) = stream.write(data, offset, length)
        fun bytes(): ByteArray = stream.toByteArray()
        fun toStringAscii(): String = String(bytes(), Charsets.ISO_8859_1)
    }

    private fun serveAsset(output: OutputStream, target: String, method: String) {
        val raw = target.split('?').first()
        val name = raw.trimStart('/').ifEmpty { "harmony-stage.html" }
        if (name.contains("..") || !name.matches(Regex("[A-Za-z0-9_./-]+"))) {
            writeEmpty(output, 404, "Not Found")
            return
        }
        val bytes = runCatching { assets.open("mine-stage/$name").use { it.readBytes() } }.getOrNull()
        if (bytes == null) {
            writeEmpty(output, 404, "Not Found")
            return
        }
        val mime = when {
            name.endsWith(".html") -> "text/html; charset=utf-8"
            name.endsWith(".css") -> "text/css; charset=utf-8"
            name.endsWith(".js") -> "application/javascript; charset=utf-8"
            name.endsWith(".json") -> "application/json; charset=utf-8"
            name.endsWith(".png") -> "image/png"
            name.endsWith(".jpg") || name.endsWith(".jpeg") -> "image/jpeg"
            name.endsWith(".webp") -> "image/webp"
            name.endsWith(".svg") -> "image/svg+xml"
            name.endsWith(".woff2") -> "font/woff2"
            name.endsWith(".mp3") -> "audio/mpeg"
            else -> "application/octet-stream"
        }
        val header = buildString {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: $mime\r\n")
            append("Content-Length: ${bytes.size}\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Cache-Control: no-cache\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(header.toByteArray(Charsets.ISO_8859_1))
        if (method != "HEAD") output.write(bytes)
    }

    private fun serveCover(output: OutputStream, target: String) {
        val query = target.substringAfter("/api/cover?", "")
        val encoded = query.split('&').firstOrNull { it.startsWith("url=") }?.removePrefix("url=") ?: ""
        val remote = runCatching { URLDecoder.decode(encoded, "UTF-8") }.getOrNull() ?: ""
        if (remote.startsWith("file://")) {
            val file = File(android.net.Uri.parse(remote).path.orEmpty()).canonicalFile
            if (!file.path.startsWith(context.filesDir.canonicalPath + File.separator) || !file.isFile || file.length() > 6 * 1024 * 1024) {
                writeEmpty(output, 404, "Cover unavailable")
                return
            }
            val bytes = file.readBytes()
            output.write(("HTTP/1.1 200 OK\r\nContent-Type: ${if (file.extension.equals("png", true)) "image/png" else "image/jpeg"}\r\nContent-Length: ${bytes.size}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: max-age=600\r\nConnection: close\r\n\r\n").toByteArray(Charsets.ISO_8859_1))
            output.write(bytes)
            return
        }
        if (!remote.startsWith("http://", true) && !remote.startsWith("https://", true)) {
            writeEmpty(output, 400, "Bad Request")
            return
        }
        val request = Request.Builder().url(remote).header("User-Agent", "Mozilla/5.0 LxMine/1.0").build()
        runCatching { http.newCall(request).execute() }.onSuccess { response ->
            response.use { result ->
                val body = result.body
                if (!result.isSuccessful || body == null) {
                    writeEmpty(output, 502, "Cover unavailable")
                    return@use
                }
                val bytes = body.bytes()
                if (bytes.size > 6 * 1024 * 1024) {
                    writeEmpty(output, 502, "Cover too large")
                    return@use
                }
                val mime = result.header("content-type") ?: "image/jpeg"
                val header = buildString {
                    append("HTTP/1.1 200 OK\r\n")
                    append("Content-Type: $mime\r\n")
                    append("Content-Length: ${bytes.size}\r\n")
                    append("Access-Control-Allow-Origin: *\r\n")
                    append("Cache-Control: max-age=600\r\n")
                    append("Connection: close\r\n\r\n")
                }
                output.write(header.toByteArray(Charsets.ISO_8859_1))
                output.write(bytes)
            }
        }.onFailure {
            writeEmpty(output, 502, "Cover unavailable")
        }
    }

    private fun serveAudio(output: OutputStream, target: String, range: String?) {
        val requested = target.removePrefix("/audio/")
        if (remoteUrl.isEmpty() || requested != token) {
            writeEmpty(output, 404, "Not Found")
            return
        }
        val url = remoteUrl
        if (url.startsWith("file://")) {
            val path = url.removePrefix("file://")
            serveFile(output, File(path), range)
            return
        }
        val builder = Request.Builder().url(url).header("Accept-Encoding", "identity")
        // 把开放区间的 range 收窄，避免原生网络栈一次拉满整首无损。
        val bounded = range?.let { raw ->
            val match = Regex("^bytes=(\\d+)-(\\d*)$").find(raw.trim())
            if (match == null) raw else {
                val start = match.groupValues[1].toLong()
                val end = match.groupValues[2].takeIf { it.isNotEmpty() }?.toLong() ?: (start + 1048575)
                "bytes=$start-${minOf(end, start + 1048575)}"
            }
        }
        bounded?.let { builder.header("Range", it) }
        runCatching { http.newCall(builder.build()).execute() }.onSuccess { response ->
            response.use { result ->
                val body = result.body
                if (body == null) {
                    writeEmpty(output, 502, "Bad Gateway")
                    return@use
                }
                val partial = result.header("Content-Range")
                val mime = result.header("content-type") ?: "audio/mpeg"
                val header = buildString {
                    append("HTTP/1.1 ${if (result.code == 206) "206 Partial Content" else "200 OK"}\r\n")
                    append("Content-Type: ${mime.substringBefore(';')}\r\n")
                    append("Access-Control-Allow-Origin: *\r\n")
                    append("Accept-Ranges: bytes\r\n")
                    if (partial != null) append("Content-Range: $partial\r\n")
                    if (result.code != 206) append("Content-Length: ${body.contentLength()}\r\n")
                    append("Connection: close\r\n\r\n")
                }
                output.write(header.toByteArray(Charsets.ISO_8859_1))
                body.byteStream().use { stream ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = stream.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        audioSent.addAndGet(read.toLong())
                    }
                }
            }
        }.onFailure {
            writeEmpty(output, 502, "Bad Gateway")
        }
    }

    private fun serveFile(output: OutputStream, file: File, range: String?) {
        if (!file.isFile) {
            writeEmpty(output, 404, "Not Found")
            return
        }
        val size = file.length()
        val match = Regex("^bytes=(\\d*)-(\\d*)$").find(range?.trim() ?: "")
        var start = match?.groupValues?.get(1)?.takeIf { it.isNotEmpty() }?.toLong() ?: 0
        var end = match?.groupValues?.get(2)?.takeIf { it.isNotEmpty() }?.toLong()?.coerceAtMost(size - 1) ?: (size - 1)
        if (match != null && match.groupValues[1].isEmpty() && match.groupValues[2].isNotEmpty()) {
            start = (size - match.groupValues[2].toLong()).coerceAtLeast(0)
            end = size - 1
        }
        if (start >= size || end < start) {
            val header = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$size\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            output.write(header.toByteArray(Charsets.ISO_8859_1))
            return
        }
        val mime = if (file.name.endsWith(".flac", true)) "audio/flac" else "audio/mpeg"
        val header = buildString {
            append("HTTP/1.1 ${if (match != null) "206 Partial Content" else "200 OK"}\r\n")
            append("Content-Type: $mime\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Accept-Ranges: bytes\r\n")
            if (match != null) append("Content-Range: bytes $start-$end/$size\r\n")
            append("Content-Length: ${end - start + 1}\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(header.toByteArray(Charsets.ISO_8859_1))
        java.io.RandomAccessFile(file, "r").use { access ->
            access.seek(start)
            val buffer = ByteArray(64 * 1024)
            var remaining = end - start + 1
            while (remaining > 0) {
                val read = access.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (read <= 0) break
                output.write(buffer, 0, read)
                audioSent.addAndGet(read.toLong())
                remaining -= read
            }
        }
    }

    private fun writeEmpty(output: OutputStream, code: Int, reason: String) {
        val header = "HTTP/1.1 $code $reason\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.ISO_8859_1))
    }
}
