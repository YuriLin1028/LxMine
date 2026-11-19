package com.lxlia.player.lx

import android.content.Context
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.lxlia.player.model.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

data class MusicDownload(
    val id: String,
    val song: Song,
    val quality: String,
    val state: String = "downloading",
    val received: Long = 0,
    val total: Long = 0,
    val path: String = "",
    val error: String = "",
    val publicUri: String = "",
    val exportError: String = "",
    val publicLocation: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("song", song.toJson())
        .put("quality", quality)
        .put("state", state)
        .put("received", received)
        .put("total", total)
        .put("path", path)
        .put("error", error)
        .put("publicUri", publicUri)
        .put("exportError", exportError)
        .put("publicLocation", publicLocation)

    companion object {
        fun fromJson(json: JSONObject): MusicDownload? {
            val song = Song.fromJson(json.optJSONObject("song")) ?: return null
            return MusicDownload(
                id = json.optString("id"),
                song = song,
                quality = json.optString("quality"),
                state = json.optString("state", "failed"),
                received = json.optLong("received"),
                total = json.optLong("total"),
                path = json.optString("path"),
                error = json.optString("error"),
                publicUri = json.optString("publicUri"),
                exportError = json.optString("exportError"),
                publicLocation = json.optString("publicLocation"),
            )
        }
    }
}

/**
 * 下载：系统下载器在部分音乐主机上会被拒，这里统一用流式 HTTP，
 * 校验响应与音频文件头后再落盘；取消和失败不产生成功记录。
 */
class MusicDownloads(private val context: Context, private val http: OkHttpClient) {
    private val dir = File(context.filesDir, "Downloads").apply { if (!exists()) mkdirs() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val items: MutableList<MusicDownload> = java.util.Collections.synchronizedList(mutableListOf())
    private val jobs = ConcurrentHashMap<String, Job>()
    private val persistenceLock = Any()
    private val exportLock = Mutex()

    var onChange: (List<MusicDownload>) -> Unit = {}
    var onError: (String) -> Unit = {}

    fun initialize() {
        try {
            val saved = File(dir, "index.json").takeIf { it.isFile }?.readText().orEmpty()
            if (saved.isNotEmpty()) {
                val array = JSONArray(saved)
                for (index in 0 until array.length()) {
                    val item = MusicDownload.fromJson(array.optJSONObject(index) ?: continue) ?: continue
                    // 进程被杀后残留的下载状态：标为中断，让用户重试。
                    items.add(if (item.state == "downloading") item.copy(state = "interrupted", error = "下载被中断，请重试") else item)
                }
            }
        } catch (_: Exception) {
            items.clear()
        }
        publish()
        if (Build.VERSION.SDK_INT >= 29) scope.launch {
            items().filter { it.state == "complete" }.forEach { exportPublic(it.id) }
        }
    }

    private fun publish(persist: Boolean = false) {
        if (persist) {
            runCatching { synchronized(persistenceLock) {
                val temporary = File(dir, "index.json.tmp")
                temporary.writeText(JSONArray().apply { items().forEach { put(it.toJson()) } }.toString())
                check(temporary.renameTo(File(dir, "index.json"))) { "无法更新下载记录" }
            } }.onFailure { onError("下载记录保存失败：${it.message}") }
        }
        scope.launch(Dispatchers.Main) { onChange(items()) }
    }

    fun offline(song: Song): String {
        val item = items().firstOrNull { it.song.key == song.key && it.state == "complete" } ?: return ""
        if (!item.path.startsWith(dir.absolutePath + File.separator)) return ""
        return if (File(item.path).exists()) item.path else ""
    }

    fun isDownloadedOrActive(song: Song): Boolean {
        if (offline(song).isNotEmpty()) return true
        return items().any { it.song.key == song.key && it.state == "downloading" }
    }

    fun items(): List<MusicDownload> = synchronized(items) { items.toList() }

    fun start(song: Song, quality: String, url: String) {
        if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) throw IllegalStateException("无法开始下载")
        val id = "${System.currentTimeMillis()}-${(0..1_000_000).random().toString(36)}"
        val extension = if (quality.contains("flac")) "flac" else "mp3"
        val temp = File(context.cacheDir, "lxmine-download-$id.part")
        var item = MusicDownload(
            id = id,
            song = song,
            quality = quality,
            state = "downloading",
            path = File(dir, "$id.$extension").absolutePath,
        )
        synchronized(items) {
            if (items.any { it.song.key == song.key && it.state == "downloading" }) throw IllegalStateException("这首歌曲正在下载")
            items.add(0, item)
        }
        publish(true)
        jobs[id] = scope.launch {
            try {
                download(item, temp, url) { update -> item = update; replace(update) }
                val finalItem = items().firstOrNull { it.id == id } ?: return@launch
                if (finalItem.state == "downloading") {
                    val updated = finalItem.copy(
                        state = "complete",
                        received = temp.length(),
                        total = temp.length(),
                    )
                    if (!temp.renameTo(File(finalItem.path))) throw IllegalStateException("保存文件失败")
                    replace(updated, persist = true)
                    if (Build.VERSION.SDK_INT >= 29) exportPublic(id)
                }
            } catch (error: Throwable) {
                val current = items().firstOrNull { it.id == id }
                if (current != null && current.state == "downloading") {
                    temp.delete()
                    replace(current.copy(state = "failed", error = error.message ?: "下载失败"), persist = true)
                    onError("下载失败：${error.message}")
                }
            } finally {
                jobs.remove(id)
            }
        }
    }

    /** Completed files keep their offline cache while a public copy is indexed by Android. */
    suspend fun exportPublic(id: String) = withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < 29) return@withContext
        exportLock.withLock {
            val item = items().firstOrNull { it.id == id && it.state == "complete" } ?: return@withLock
            if (item.publicUri.isNotEmpty()) {
                val existing = Uri.parse(item.publicUri)
                val valid = runCatching {
                    context.contentResolver.openAssetFileDescriptor(existing, "r")?.use { it.length == File(item.path).length() } ?: false
                }.getOrDefault(false)
                if (valid) {
                    if (item.publicLocation == "Music/LxMine") {
                        context.contentResolver.update(existing, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
                    }
                    replace(item.copy(exportError = ""), true)
                    return@withLock
                }
                if (item.publicLocation == "Music/LxMine") runCatching { context.contentResolver.delete(existing, null, null) }
            }
            var uri: Uri? = null
            try {
                val file = File(item.path)
                val values = ContentValues().apply {
                    put(MediaStore.Audio.Media.DISPLAY_NAME, exportName(item))
                    put(MediaStore.Audio.Media.MIME_TYPE, audioFormat(item).second)
                    put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/LxMine")
                    put(MediaStore.Audio.Media.IS_PENDING, 1)
                    put(MediaStore.Audio.Media.TITLE, item.song.name)
                    put(MediaStore.Audio.Media.ARTIST, item.song.singer)
                    put(MediaStore.Audio.Media.ALBUM, item.song.albumName)
                    put(MediaStore.Audio.Media.DURATION, item.song.durationMs)
                }
                uri = context.contentResolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("无法创建系统音乐文件")
                replace(item.copy(publicUri = uri.toString(), publicLocation = "Music/LxMine", exportError = "正在保存到系统"), true)
                context.contentResolver.openOutputStream(uri, "w")?.use { output ->
                    file.inputStream().use { it.copyTo(output, 65536) }
                } ?: throw IllegalStateException("无法写入系统音乐文件")
                context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
                replace(item.copy(publicUri = uri.toString(), publicLocation = "Music/LxMine", exportError = ""), true)
            } catch (error: Exception) {
                uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
                replace(item.copy(exportError = error.message ?: "保存到系统失败"), true)
                onError("音乐已下载，保存到系统失败：${error.message}")
            }
        }
    }

    fun exportName(item: MusicDownload): String {
        val name = listOf(item.song.singer, item.song.name).filter { it.isNotBlank() }.joinToString(" - ")
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(160).ifBlank { "LxMine" }
        return "$name.${audioFormat(item).first}"
    }
    private fun audioFormat(item: MusicDownload): Pair<String, String> {
        val prefix = runCatching {
            File(item.path).inputStream().use { input ->
                val bytes = ByteArray(16)
                val count = input.read(bytes)
                String(bytes, 0, count.coerceAtLeast(0), Charsets.ISO_8859_1)
            }
        }.getOrDefault("")
        return when {
            prefix.startsWith("fLaC") -> "flac" to "audio/flac"
            prefix.startsWith("OggS") -> "ogg" to "audio/ogg"
            prefix.startsWith("RIFF") && prefix.substring(8).startsWith("WAVE") -> "wav" to "audio/wav"
            prefix.length >= 8 && prefix.substring(4, 8) == "ftyp" -> "m4a" to "audio/mp4"
            item.quality.contains("flac") && prefix.isEmpty() -> "flac" to "audio/flac"
            else -> "mp3" to "audio/mpeg"
        }
    }

    suspend fun exportTo(id: String, uri: Uri) = withContext(Dispatchers.IO) {
        exportLock.withLock {
            val item = items().firstOrNull { it.id == id && it.state == "complete" } ?: return@withLock
            context.contentResolver.openOutputStream(uri, "w")?.use { output ->
                File(item.path).inputStream().use { it.copyTo(output, 65536) }
            } ?: throw IllegalStateException("无法写入所选位置")
            replace(item.copy(publicUri = uri.toString(), publicLocation = "系统所选位置", exportError = ""), true)
        }
    }

    private fun replace(item: MusicDownload, persist: Boolean = false) {
        synchronized(items) {
            val index = items.indexOfFirst { it.id == item.id }
            if (index >= 0) items[index] = item
        }
        publish(persist)
    }

    private suspend fun download(
        item: MusicDownload,
        temp: File,
        url: String,
        update: (MusicDownload) -> Unit,
    ) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 LxMine/1.0")
            .header("Accept-Encoding", "identity")
            .build()
        http.newBuilder().readTimeout(120, java.util.concurrent.TimeUnit.SECONDS).build()
            .newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IllegalStateException("音源服务器返回 HTTP ${response.code}")
                val body = response.body ?: throw IllegalStateException("下载响应为空")
                val total = body.contentLength()
                var received = 0L
                var lastPublish = 0L
                temp.delete()
                temp.outputStream().use { output ->
                    body.byteStream().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            if (items.firstOrNull { it.id == item.id }?.state != "downloading") {
                                throw IllegalStateException("已取消")
                            }
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            received += read
                            val now = System.currentTimeMillis()
                            if (now - lastPublish > 200) {
                                lastPublish = now
                                update(item.copy(received = received, total = if (total > 0) total else received))
                            }
                        }
                    }
                    output.flush()
                }
                if (received <= 0) throw IllegalStateException("下载文件为空")
                if (total > 0 && received != total) throw IllegalStateException("下载文件不完整")
                // 音源返回错误页/JSON 时不能当作歌曲保存。
                val prefix = temp.inputStream().use { input ->
                    val bytes = ByteArray(minOf(64L, temp.length()).toInt())
                    val read = input.read(bytes)
                    String(bytes, 0, maxOf(read, 0), Charsets.ISO_8859_1).trim().lowercase()
                }
                if (prefix.startsWith("<!doctype") || prefix.startsWith("<html") || prefix.startsWith("{") || prefix.startsWith("[")) {
                    throw IllegalStateException("音源返回了错误页面，未保存为歌曲")
                }
                update(item.copy(received = received, total = if (total > 0) total else received))
            }
    }

    fun cancel(id: String) {
        val item = items().firstOrNull { it.id == id } ?: return
        if (item.state != "downloading") return
        replace(item.copy(state = "cancelled", error = "已取消"), persist = true)
        jobs.remove(id)?.cancel()
        File(context.cacheDir, "lxmine-download-$id.part").delete()
    }

    /** 清掉已完成/失败记录（界面只提供取消下载中的任务）。 */
    fun remove(id: String) {
        val item = items().firstOrNull { it.id == id } ?: return
        if (item.state == "downloading") cancel(id)
        synchronized(items) { items.removeAll { it.id == id } }
        publish(true)
    }
}
