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

data class DownloadRemoveResult(
    val removedPaths: List<String> = emptyList(),
    val removedSongKeys: List<String> = emptyList(),
    val deletedFileCount: Int = 0,
    val failedFileCount: Int = 0,
)

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
    val exportedUris: List<String> = emptyList(),
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
        .put("exportedUris", JSONArray().apply { exportedUris.forEach { put(it) } })

    companion object {
        fun fromJson(json: JSONObject): MusicDownload? {
            val song = Song.fromJson(json.optJSONObject("song")) ?: return null
            val uris = mutableListOf<String>()
            val rawArr = json.optJSONArray("exportedUris")
            if (rawArr != null) {
                for (i in 0 until rawArr.length()) {
                    val v = rawArr.optString(i).trim()
                    if (v.isNotEmpty() && v !in uris) uris.add(v)
                }
            }
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
                exportedUris = uris,
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

    fun start(song: Song, quality: String, url: String, targetTreeUri: Uri? = null) {
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
                    if (targetTreeUri != null) {
                        runCatching { exportToTree(id, targetTreeUri) }
                            .onFailure { if (Build.VERSION.SDK_INT >= 29) exportPublic(id) }
                    } else if (Build.VERSION.SDK_INT >= 29) {
                        exportPublic(id)
                    }
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

    suspend fun exportToTree(id: String, treeUri: Uri) = withContext(Dispatchers.IO) {
        exportLock.withLock {
            val item = items().firstOrNull { it.id == id && it.state == "complete" } ?: return@withLock
            val treeDocId = android.provider.DocumentsContract.getTreeDocumentId(treeUri)
            val parentDocUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocId)
            val (ext, mime) = audioFormat(item)
            val displayName = exportName(item).let { if (it.endsWith(".$ext", true)) it else "$it.$ext" }
            val createdUri = android.provider.DocumentsContract.createDocument(
                context.contentResolver,
                parentDocUri,
                mime,
                displayName,
            ) ?: throw IllegalStateException("无法在所选目录创建文件")
            context.contentResolver.openOutputStream(createdUri, "w")?.use { output ->
                File(item.path).inputStream().use { it.copyTo(output, 65536) }
            } ?: throw IllegalStateException("无法写入所选目录")
            val nextUris = (item.exportedUris + createdUri.toString()).distinct()
            replace(item.copy(publicUri = createdUri.toString(), publicLocation = "系统所选目录", exportError = "", exportedUris = nextUris), true)
        }
    }

    suspend fun exportOfflineToTree(song: Song, treeUri: Uri): Boolean {
        val item = items().firstOrNull { it.song.key == song.key && it.state == "complete" } ?: return false
        if (!File(item.path).exists()) return false
        exportToTree(item.id, treeUri)
        return true
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
                val nextUris = (item.exportedUris + uri.toString()).distinct()
                replace(item.copy(publicUri = uri.toString(), publicLocation = "Music/LxMine", exportError = "", exportedUris = nextUris), true)
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
            val nextUris = (item.exportedUris + uri.toString()).distinct()
            replace(item.copy(publicUri = uri.toString(), publicLocation = "系统所选位置", exportError = "", exportedUris = nextUris), true)
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
                            if (now - lastPublish > 450) {
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

    fun updateCovers(covers: Map<String, String>) {
        if (covers.isEmpty()) return
        var changed = false
        synchronized(items) {
            for (i in items.indices) {
                val cur = items[i]
                if (cur.song.coverUrl.isNotEmpty()) continue
                val found = covers[cur.song.key].orEmpty().trim()
                if (found.isNotEmpty()) {
                    items[i] = cur.copy(song = cur.song.copy(coverUrl = found))
                    changed = true
                }
            }
        }
        if (changed) publish(true)
    }

    private fun isUriAccessible(uri: Uri): Boolean {
        if (uri.scheme == "file") {
            val path = uri.path ?: return false
            return File(path).exists()
        }
        return runCatching {
            context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
        }.getOrDefault(false)
    }

    /** 返回 1 表示已删除，0 表示原本已不存在，-1 表示仍存在且删除失败。 */
    private fun deletePublicCopy(publicUriText: String): Int {
        if (publicUriText.isBlank()) return 0
        val uri = runCatching { Uri.parse(publicUriText) }.getOrNull() ?: return 0
        if (uri.scheme == "file") {
            val f = uri.path?.let { File(it) } ?: return 0
            if (!f.exists()) return 0
            runCatching { f.delete() }
            return if (!f.exists()) 1 else -1
        }
        val existedBefore = isUriAccessible(uri)
        val deletedByDoc = runCatching {
            android.provider.DocumentsContract.deleteDocument(context.contentResolver, uri)
        }.getOrDefault(false)
        var deletedRows = 0
        if (!deletedByDoc) {
            deletedRows = runCatching { context.contentResolver.delete(uri, null, null) }.getOrDefault(0)
        }
        val stillExists = isUriAccessible(uri)
        return when {
            !stillExists && (deletedByDoc || deletedRows > 0 || existedBefore) -> 1
            !stillExists -> 0
            else -> -1
        }
    }

    /** 兜底按 DISPLAY_NAME + Music/LxMine 清理本应用写入 MediaStore 的公共音频副本。 */
    private fun deleteMediaStoreFallback(item: MusicDownload): Int {
        if (Build.VERSION.SDK_INT < 29) return 0
        var removed = 0
        val expectedName = exportName(item)
        val baseWithoutExt = expectedName.substringBeforeLast('.')
        runCatching {
            val projection = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME)
            val selection = "${MediaStore.Audio.Media.RELATIVE_PATH} LIKE ? AND (${MediaStore.Audio.Media.DISPLAY_NAME} = ? OR ${MediaStore.Audio.Media.DISPLAY_NAME} LIKE ?)"
            val args = arrayOf("%Music/LxMine%", expectedName, "$baseWithoutExt%")
            context.contentResolver.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection, selection, args, null)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                while (cursor.moveToNext()) {
                    val rowId = cursor.getLong(idCol)
                    val rowUri = android.content.ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, rowId)
                    val rows = runCatching { context.contentResolver.delete(rowUri, null, null) }.getOrDefault(0)
                    if (rows > 0) removed += rows
                }
            }
        }
        return removed
    }

    /** 清掉已完成/失败记录；仅当 deleteSourceFile 为 true 时一并删除本地音频与已导出文件。 */
    fun remove(id: String, deleteSourceFile: Boolean = false): DownloadRemoveResult =
        removeBatch(listOf(id), deleteSourceFile)

    fun removeBatch(ids: List<String>, deleteSourceFile: Boolean = false): DownloadRemoveResult {
        if (ids.isEmpty()) return DownloadRemoveResult()
        val targetSet = ids.toSet()
        val snapshot = items().filter { it.id in targetSet }
        if (snapshot.isEmpty()) return DownloadRemoveResult()
        val removedPaths = mutableListOf<String>()
        val removedSongKeys = mutableListOf<String>()
        var deletedFileCount = 0
        var failedFileCount = 0
        for (item in snapshot) {
            if (item.state == "downloading") cancel(item.id)
            removedSongKeys.add(item.song.key)
            if (deleteSourceFile) {
                if (item.path.startsWith(dir.absolutePath + File.separator)) {
                    val f = File(item.path)
                    val existed = f.exists()
                    if (existed) runCatching { f.delete() }
                    if (!f.exists()) {
                        if (existed) deletedFileCount += 1
                        removedPaths.add(item.path)
                    } else {
                        failedFileCount += 1
                    }
                }
                val allPublicUris = (item.exportedUris + item.publicUri).filter { it.isNotBlank() }.distinct()
                for (uriText in allPublicUris) {
                    when (deletePublicCopy(uriText)) {
                        1 -> deletedFileCount += 1
                        -1 -> failedFileCount += 1
                    }
                }
                deletedFileCount += deleteMediaStoreFallback(item)
            }
        }
        synchronized(items) { items.removeAll { it.id in targetSet } }
        publish(true)
        return DownloadRemoveResult(
            removedPaths = removedPaths,
            removedSongKeys = removedSongKeys,
            deletedFileCount = deletedFileCount,
            failedFileCount = failedFileCount,
        )
    }
}
