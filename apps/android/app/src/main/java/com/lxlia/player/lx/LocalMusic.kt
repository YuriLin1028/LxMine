package com.lxlia.player.lx

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

data class LocalTrack(
    val song: Song,
    val path: String,
    val sourceUri: String,
    val addedAt: Long,
    val lyric: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("song", song.toJson())
        .put("path", path)
        .put("sourceUri", sourceUri)
        .put("addedAt", addedAt)
        .put("lyric", lyric)

    companion object {
        fun fromJson(json: JSONObject): LocalTrack? {
            val song = Song.fromJson(json.optJSONObject("song")) ?: return null
            val path = json.optString("path")
            if (path.isEmpty() || !File(path).exists()) return null
            return LocalTrack(song, path, json.optString("sourceUri"), json.optLong("addedAt"), json.optString("lyric"))
        }
    }
}

data class DownloadTrack(val song: Song, val path: String)

private data class LocalMetadata(
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val durationMs: Long = 0,
    val coverUrl: String = "",
)

/**
 * 手机本地音乐：系统音频选择器/媒体库 URI 复制到沙箱，提取时长/封面/内嵌歌词并持久化；
 * 下载完成的歌曲也会并入本地音乐。
 */
class LocalMusic(private val context: Context) {
    private val dir: File = File(context.filesDir, "LocalMusic").apply { if (!exists()) mkdirs() }
    private var items: MutableList<LocalTrack> = mutableListOf()

    var onChange: (List<Song>) -> Unit = {}
    var onError: (String) -> Unit = {}

    fun initialize() {
        items = try {
            val saved = File(dir, "index.json").takeIf { it.isFile }?.readText().orEmpty()
            if (saved.isEmpty()) mutableListOf() else {
                val array = JSONArray(saved)
                (0 until array.length()).mapNotNull { LocalTrack.fromJson(array.optJSONObject(it) ?: JSONObject()) }.toMutableList()
            }
        } catch (_: Exception) {
            mutableListOf()
        }
        onChange(songs())
    }

    fun songs(): List<Song> = items.map { it.song }

    fun pathFor(song: Song): String {
        val item = items.firstOrNull { it.song.key == song.key } ?: return ""
        return if (File(item.path).exists()) item.path else ""
    }

    fun lyricFor(song: Song): String = items.firstOrNull { it.song.key == song.key }?.lyric.orEmpty()

    /** 软件内下载完成的歌曲自动并入本地音乐；只登记路径，不重复复制文件。 */
    fun adoptDownloads(downloads: List<DownloadTrack>) {
        var changed = false
        for (download in downloads) {
            val path = download.path
            if (path.isEmpty() || !File(path).exists()) continue
            if (items.any { it.song.key == download.song.key }) continue
            items.add(
                LocalTrack(
                    song = download.song,
                    path = path,
                    sourceUri = "download:${download.song.key}",
                    addedAt = System.currentTimeMillis(),
                )
            )
            changed = true
        }
        if (changed) {
            persist()
            onChange(songs())
        }
    }

    fun removeAdoptedPaths(paths: List<String>, songKeys: List<String> = emptyList()) {
        val targetSet = paths.filter { it.isNotEmpty() }.toSet()
        val targetKeySet = songKeys.filter { it.isNotEmpty() }.toSet()
        if (targetSet.isEmpty() && targetKeySet.isEmpty()) return
        val before = items.size
        items.removeAll { item ->
            item.path in targetSet || (targetKeySet.isNotEmpty() && item.sourceUri.startsWith("download:") && item.song.key in targetKeySet)
        }
        if (items.size != before) {
            persist()
            onChange(songs())
        }
    }

    /** 复制选中的音频到沙箱；返回本次新增数量。重复选择同一 URI 会跳过。 */
    suspend fun addUris(uris: List<Uri>): Int = withContext(Dispatchers.IO) {
        var added = 0
        uris.forEachIndexed { index, uri ->
            val uriText = uri.toString()
            if (items.any { it.sourceUri == uriText }) return@forEachIndexed
            val rawName = resolveDisplayName(uri) ?: "本地音频 ${index + 1}"
            val extension = Regex("\\.([a-z0-9]{2,5})$", RegexOption.IGNORE_CASE).find(rawName)?.groupValues?.get(1)?.lowercase() ?: "mp3"
            val id = "local-${System.currentTimeMillis()}-$index-${(0..1_000_000).random().toString(36)}"
            val destination = File(dir, "$id.$extension")
            try {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(destination).use { output -> input.copyTo(output) }
                } ?: throw IllegalStateException("无法读取所选文件")
            } catch (error: Throwable) {
                onError("添加「${rawName}」失败：${error.message}")
                destination.delete()
                return@forEachIndexed
            }
            val metadata = readMetadata(destination, id)
            val lyric = readEmbeddedLyric(destination)
            val fallbackName = rawName.replace(Regex("\\.[^.]+$"), "").ifEmpty { "本地音频" }
            val song = Song(
                source = "local",
                id = id,
                name = metadata.title.ifEmpty { fallbackName },
                singer = metadata.artist.ifEmpty { "本地文件" },
                albumName = metadata.album.ifEmpty { "本地音乐" },
                albumId = "",
                durationMs = metadata.durationMs,
                qualitys = listOf("local"),
                coverUrl = metadata.coverUrl,
            )
            items.add(LocalTrack(song, destination.absolutePath, uriText, System.currentTimeMillis(), lyric))
            added++
        }
        if (added > 0) persist()
        withContext(Dispatchers.Main) { onChange(songs()) }
        added
    }

    /** 智能识别：扫描媒体库里的音频（需要 READ_MEDIA_AUDIO）。 */
    fun scanMediaStore(): List<Uri> {
        val projection = arrayOf(MediaStore.Audio.Media._ID)
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        val uris = mutableListOf<Uri>()
        runCatching {
            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                "${MediaStore.Audio.Media.DATE_ADDED} DESC",
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                while (cursor.moveToNext() && uris.size < 500) {
                    val id = cursor.getLong(idColumn)
                    uris.add(Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id.toString()))
                }
            }
        }.onFailure { onError("识别本地音频失败：${it.message}") }
        return uris
    }

    fun displayName(uri: Uri): String = resolveDisplayName(uri) ?: "音频"

    private fun resolveDisplayName(uri: Uri): String? {
        if (uri.scheme == "file") return uri.lastPathSegment
        val projection = arrayOf(MediaStore.MediaColumns.DISPLAY_NAME)
        return runCatching {
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull() ?: uri.lastPathSegment
    }

    private fun readMetadata(file: File, id: String): LocalMetadata {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            val title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE).orEmpty()
            val artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST).orEmpty()
                .ifEmpty { retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST).orEmpty() }
            val album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM).orEmpty()
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
            var coverUrl = ""
            retriever.embeddedPicture?.let { bytes ->
                runCatching {
                    val coverFile = File(dir, "$id.jpg")
                    FileOutputStream(coverFile).use { it.write(bytes) }
                    coverUrl = Uri.fromFile(coverFile).toString()
                }
            }
            LocalMetadata(title, artist, album, duration.coerceAtLeast(0), coverUrl)
        } catch (_: Exception) {
            LocalMetadata()
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun persist() {
        try {
            val temporary = File(dir, "index.json.tmp")
            temporary.writeText(JSONArray().apply { items.forEach { put(it.toJson()) } }.toString())
            temporary.renameTo(File(dir, "index.json"))
        } catch (error: Throwable) {
            onError("本地音乐索引保存失败：${error.message}")
        }
    }

    // ---- 内嵌歌词：MP3 ID3v2 USLT 与 FLAC Vorbis LYRICS ----

    private fun syncsafe(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0x7f) shl 21) or
            ((bytes[offset + 1].toInt() and 0x7f) shl 14) or
            ((bytes[offset + 2].toInt() and 0x7f) shl 7) or
            (bytes[offset + 3].toInt() and 0x7f)

    private fun readEmbeddedLyric(file: File): String {
        return try {
            val size = minOf(file.length(), 4L * 1024 * 1024).toInt()
            val bytes = file.inputStream().use { input ->
                val buffer = ByteArray(size)
                val read = input.read(buffer)
                if (read > 0) buffer.copyOf(read) else return ""
            }
            if (bytes.size >= 4 && bytes[0] == 0x66.toByte() && bytes[1] == 0x4c.toByte() &&
                bytes[2] == 0x61.toByte() && bytes[3] == 0x43.toByte()
            ) {
                readFlacLyric(bytes)
            } else if (bytes.size >= 10 && bytes[0] == 0x49.toByte() && bytes[1] == 0x44.toByte() && bytes[2] == 0x33.toByte()) {
                readId3Lyric(bytes)
            } else ""
        } catch (_: Exception) {
            ""
        }
    }

    private fun readId3Lyric(bytes: ByteArray): String {
        val version = bytes[3].toInt()
        val tagEnd = minOf(bytes.size, 10 + syncsafe(bytes, 6))
        var pos = 10
        while (pos + 10 <= tagEnd) {
            val id = String(bytes, pos, 4, Charsets.ISO_8859_1)
            if (!Regex("^[A-Z0-9]{4}$").matches(id)) break
            val frameSize = if (version == 4) {
                syncsafe(bytes, pos + 4)
            } else {
                ((bytes[pos + 4].toInt() and 0xff) shl 24) or ((bytes[pos + 5].toInt() and 0xff) shl 16) or
                    ((bytes[pos + 6].toInt() and 0xff) shl 8) or (bytes[pos + 7].toInt() and 0xff)
            }
            val dataStart = pos + 10
            if (frameSize <= 0 || dataStart + frameSize > bytes.size) break
            if (id == "USLT" || id == "ULT") {
                val encoding = bytes[dataStart].toInt()
                var cursor = dataStart + 4
                if (encoding == 1 || encoding == 2) {
                    while (cursor + 1 < dataStart + frameSize && !(bytes[cursor] == 0.toByte() && bytes[cursor + 1] == 0.toByte())) cursor += 2
                    cursor += 2
                } else {
                    while (cursor < dataStart + frameSize && bytes[cursor] != 0.toByte()) cursor += 1
                    cursor += 1
                }
                val data = bytes.copyOfRange(cursor.coerceAtMost(bytes.size), minOf(dataStart + frameSize, bytes.size))
                return decodeId3Text(data, encoding).removePrefix("\uFEFF").trim()
            }
            pos = dataStart + frameSize
        }
        return ""
    }

    private fun readFlacLyric(bytes: ByteArray): String {
        var pos = 4
        while (pos + 4 <= bytes.size) {
            val header = bytes[pos].toInt() and 0xff
            val type = header and 0x7f
            val last = (header and 0x80) != 0
            val length = ((bytes[pos + 1].toInt() and 0xff) shl 16) or
                ((bytes[pos + 2].toInt() and 0xff) shl 8) or (bytes[pos + 3].toInt() and 0xff)
            val start = pos + 4
            val end = minOf(bytes.size, start + length)
            if (type == 4) return readVorbisComments(bytes.copyOfRange(start, end))
            pos = start + length
            if (last) break
        }
        return ""
    }

    private fun readVorbisComments(data: ByteArray): String {
        var pos = 0
        fun readU32(): Long {
            val value = ((data[pos].toLong() and 0xff)) or ((data[pos + 1].toLong() and 0xff) shl 8) or
                ((data[pos + 2].toLong() and 0xff) shl 16) or ((data[pos + 3].toLong() and 0xff) shl 24)
            pos += 4
            return value
        }
        if (data.size < 8) return ""
        val vendorLength = readU32().toInt()
        pos += vendorLength
        if (pos + 4 > data.size) return ""
        val count = readU32()
        var index = 0L
        while (index < count && pos + 4 <= data.size) {
            val length = readU32().toInt()
            if (length <= 0 || pos + length > data.size) break
            val comment = String(data, pos, length, Charsets.UTF_8)
            pos += length
            index++
            val separator = comment.indexOf('=')
            if (separator <= 0) continue
            val key = comment.substring(0, separator).trim().uppercase()
            if (key == "LYRICS" || key == "UNSYNCEDLYRICS" || key == "LYRIC") {
                return comment.substring(separator + 1).trim()
            }
        }
        return ""
    }

    private fun decodeId3Text(data: ByteArray, encoding: Int): String = try {
        when (encoding) {
            0 -> String(data, Charsets.ISO_8859_1)
            1 -> String(data, Charsets.UTF_16LE)
            2 -> String(data, Charsets.UTF_16BE)
            else -> String(data, Charsets.UTF_8)
        }
    } catch (_: Exception) {
        ""
    }
}
