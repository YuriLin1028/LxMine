package com.lxlia.player.model

import org.json.JSONArray
import org.json.JSONObject

/** 与 Windows / 鸿蒙端共享同一套字段语义的歌曲身份。 */
data class Song(
    val source: String = "kw",
    val hash: String? = null,
    val hashes: Map<String, String> = emptyMap(),
    val id: String,
    val name: String,
    val singer: String = "",
    val albumName: String = "",
    val albumId: String = "",
    val durationMs: Long = 0,
    val qualitys: List<String> = emptyList(),
    val coverUrl: String = "",
    val strMediaMid: String = "",
    val songId: String = "",
) {
    val key: String get() = "${source}:$id"

    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("source", source)
        if (!hash.isNullOrEmpty()) json.put("hash", hash)
        if (hashes.isNotEmpty()) {
            val map = JSONObject()
            hashes.forEach { (quality, value) -> if (value.isNotEmpty()) map.put(quality, value) }
            json.put("hashes", map)
        }
        json.put("id", id)
        json.put("name", name)
        json.put("singer", singer)
        json.put("albumName", albumName)
        json.put("albumId", albumId)
        json.put("durationMs", durationMs)
        json.put("qualitys", JSONArray(qualitys))
        json.put("coverUrl", coverUrl)
        if (strMediaMid.isNotEmpty()) json.put("strMediaMid", strMediaMid)
        if (songId.isNotEmpty()) json.put("songId", songId)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject?): Song? {
            if (json == null) return null
            val id = json.optString("id")
            if (id.isEmpty()) return null
            val hashesJson = json.optJSONObject("hashes")
            val hashes = mutableMapOf<String, String>()
            hashesJson?.keys()?.forEach { quality ->
                val value = hashesJson.optString(quality)
                if (value.isNotEmpty()) hashes[quality] = value
            }
            val qualitys = mutableListOf<String>()
            json.optJSONArray("qualitys")?.let { array ->
                for (index in 0 until array.length()) array.optString(index).takeIf { it.isNotEmpty() }?.let(qualitys::add)
            }
            return Song(
                source = json.optString("source").ifEmpty { "kw" },
                hash = json.optString("hash").ifEmpty { null },
                hashes = hashes,
                id = id,
                name = json.optString("name"),
                singer = json.optString("singer"),
                albumName = json.optString("albumName"),
                albumId = json.optString("albumId"),
                durationMs = json.optLong("durationMs"),
                qualitys = qualitys,
                coverUrl = json.optString("coverUrl"),
                strMediaMid = json.optString("strMediaMid"),
                songId = json.optString("songId"),
            )
        }

        fun listFromJson(json: String?): List<Song> {
            if (json.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(json)
                (0 until array.length()).mapNotNull { fromJson(array.optJSONObject(it)) }
            } catch (_: Exception) {
                emptyList()
            }
        }

        fun listToJson(songs: List<Song>): String {
            val array = JSONArray()
            songs.forEach { array.put(it.toJson()) }
            return array.toString()
        }
    }
}

/** 可跨端携带完整歌曲身份的 LX 歌单；pcTracks 原样保留，避免同步时丢 PC 本地引用。 */
data class MusicPlaylist(
    val id: String,
    val name: String,
    val kind: String = "lx",
    val songs: List<Song> = emptyList(),
    val songIds: List<String> = emptyList(),
    val pcTracksJson: String? = null,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val isFavorite: Boolean = false,
    val warning: String = "",
    val customCover: String = "",
    val preserveQueue: Boolean = false,
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("id", id)
        json.put("name", name)
        json.put("kind", kind)
        val array = JSONArray()
        songs.forEach { array.put(it.toJson()) }
        json.put("songs", array)
        json.put("songIds", JSONArray(songIds))
        if (!pcTracksJson.isNullOrBlank()) json.put("pcTracks", JSONArray(pcTracksJson))
        json.put("createdAt", createdAt)
        json.put("updatedAt", updatedAt)
        if (isFavorite) json.put("isFavorite", true)
        if (warning.isNotEmpty()) json.put("warning", warning)
        if (customCover.isNotEmpty()) json.put("customCover", customCover)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): MusicPlaylist {
            val songs = mutableListOf<Song>()
            json.optJSONArray("songs")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(songs::add)
            }
            val ids = mutableListOf<String>()
            json.optJSONArray("songIds")?.let { array ->
                for (index in 0 until array.length()) array.optString(index).takeIf { it.isNotEmpty() }?.let(ids::add)
            }
            val name = json.optString("name")
            val rawIsFavorite = json.optBoolean("isFavorite") || name == "我喜欢的" || name == "我的收藏"
            val normalizedName = if (rawIsFavorite && (name.isEmpty() || name == "我喜欢的")) "我的收藏" else name
            return MusicPlaylist(
                id = json.optString("id"),
                name = normalizedName,
                kind = json.optString("kind").ifEmpty { "lx" },
                songs = songs,
                songIds = ids.ifEmpty { songs.map { it.key } },
                pcTracksJson = json.optJSONArray("pcTracks")?.toString(),
                createdAt = json.optLong("createdAt"),
                updatedAt = json.optLong("updatedAt"),
                isFavorite = rawIsFavorite,
                warning = json.optString("warning"),
                customCover = json.optString("customCover"),
            )
        }

        /** 验证同步/持久化数据；只丢弃坏歌单，不让整份数据打不开。 */
        fun listFromJson(json: String?): List<MusicPlaylist> {
            if (json.isNullOrBlank()) return emptyList()
            val array = try {
                JSONArray(json)
            } catch (_: Exception) {
                return emptyList()
            }
            val lists = mutableListOf<MusicPlaylist>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (item.optString("id").isEmpty() || item.optString("name").isEmpty()) continue
                lists.add(fromJson(item))
            }
            return lists
        }

        fun listToJson(lists: List<MusicPlaylist>): String {
            val array = JSONArray()
            lists.forEach { array.put(it.toJson()) }
            return array.toString()
        }
    }
}

/** 首页歌单卡 / 榜单 / 分类入口。 */
data class FeedPlaylist(
    val id: String,
    val name: String,
    val cover: String = "",
    val count: Int = 0,
    val playCount: Long = 0,
    val source: String? = null,
    val kind: String? = null,
    val period: String? = null,
    val parts: List<FeedPlaylist> = emptyList(),
    val request: FeedRequest? = null,
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("id", id)
        json.put("name", name)
        json.put("cover", cover)
        json.put("count", count)
        json.put("playCount", playCount)
        source?.let { json.put("source", it) }
        kind?.let { json.put("kind", it) }
        period?.let { json.put("period", it) }
        if (parts.isNotEmpty()) {
            val array = JSONArray()
            parts.forEach { array.put(it.toJson()) }
            json.put("parts", array)
        }
        request?.let { json.put("request", it.toJson()) }
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): FeedPlaylist {
            val parts = mutableListOf<FeedPlaylist>()
            json.optJSONArray("parts")?.let { array ->
                for (index in 0 until array.length()) array.optJSONObject(index)?.let { parts.add(fromJson(it)) }
            }
            return FeedPlaylist(
                id = json.optString("id"),
                name = json.optString("name"),
                cover = json.optString("cover"),
                count = json.optInt("count"),
                playCount = json.optLong("playCount"),
                source = json.optString("source").ifEmpty { null },
                kind = json.optString("kind").ifEmpty { null },
                period = json.optString("period").ifEmpty { null },
                parts = parts,
                request = json.optJSONObject("request")?.let { FeedRequest.fromJson(it) },
            )
        }

        fun listFromJson(value: String?): List<FeedPlaylist> {
            if (value.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(value)
                (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(::fromJson) }
            } catch (_: Exception) {
                emptyList()
            }
        }
    }
}

/** 分类入口按平台拉取歌单列表的请求。 */
data class FeedRequest(val source: String, val type: String, val category: String) {
    fun toJson(): JSONObject = JSONObject().put("source", source).put("type", type).put("category", category)

    companion object {
        fun fromJson(json: JSONObject): FeedRequest = FeedRequest(
            source = json.optString("source").ifEmpty { "wy" },
            type = json.optString("type").ifEmpty { "hot" },
            category = json.optString("category"),
        )
    }
}

data class FeedSection(
    val id: String,
    val title: String,
    val kind: String,
    val items: List<FeedPlaylist> = emptyList(),
    val error: String? = null,
    val request: FeedRequest? = null,
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("id", id)
        json.put("title", title)
        json.put("kind", kind)
        val array = JSONArray()
        items.forEach { array.put(it.toJson()) }
        json.put("items", array)
        error?.let { json.put("error", it) }
        request?.let { json.put("request", it.toJson()) }
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): FeedSection {
            val items = mutableListOf<FeedPlaylist>()
            json.optJSONArray("items")?.let { array ->
                for (index in 0 until array.length()) array.optJSONObject(index)?.let { items.add(FeedPlaylist.fromJson(it)) }
            }
            return FeedSection(
                id = json.optString("id"),
                title = json.optString("title"),
                kind = json.optString("kind").ifEmpty { "playlist" },
                items = items,
                error = json.optString("error").ifEmpty { null },
                request = json.optJSONObject("request")?.let { FeedRequest.fromJson(it) },
            )
        }
    }
}

/** 四平台融合首页快照：板块、推荐、新歌、榜单、猜你喜欢与每日三十首。 */
data class HomeFeed(
    val source: String = "all",
    val sections: List<FeedSection> = emptyList(),
    val playlists: List<FeedPlaylist> = emptyList(),
    val newSongs: List<Song> = emptyList(),
    val charts: List<FeedPlaylist> = emptyList(),
    val bannerCharts: List<FeedPlaylist> = emptyList(),
    val similar: List<Song> = emptyList(),
    val forYou: List<Song> = emptyList(),
    val personalized: Boolean = false,
    val topArtists: List<String> = emptyList(),
    val daily: FeedPlaylist? = null,
    val dailySongs: List<Song> = emptyList(),
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("source", source)
        val sectionsArray = JSONArray()
        sections.forEach { sectionsArray.put(it.toJson()) }
        json.put("sections", sectionsArray)
        val playlistsArray = JSONArray()
        playlists.forEach { playlistsArray.put(it.toJson()) }
        json.put("playlists", playlistsArray)
        json.put("newSongs", JSONArray().apply { newSongs.forEach { put(it.toJson()) } })
        val chartsArray = JSONArray()
        charts.forEach { chartsArray.put(it.toJson()) }
        json.put("charts", chartsArray)
        val bannerChartsArray = JSONArray()
        bannerCharts.forEach { bannerChartsArray.put(it.toJson()) }
        json.put("bannerCharts", bannerChartsArray)
        json.put("similar", JSONArray().apply { similar.forEach { put(it.toJson()) } })
        json.put("forYou", JSONArray().apply { forYou.forEach { put(it.toJson()) } })
        json.put("personalized", personalized)
        json.put("topArtists", JSONArray(topArtists))
        daily?.let { json.put("daily", it.toJson()) }
        json.put("dailySongs", JSONArray().apply { dailySongs.forEach { put(it.toJson()) } })
        return json
    }

    /** 只比较会改变布局的内容，忽略播放量等文字刷新。 */
    fun signature(): String {
        fun listSig(items: List<FeedPlaylist>): String = items.joinToString(",") { "${it.id}:${it.count}" }
        fun songSig(songs: List<Song>): String = songs.joinToString(",") { "${it.source}:${it.id}" }
        val sectionSig = sections.joinToString("|") { "${it.id}:${listSig(it.items)}" }
        return "$sectionSig#${listSig(charts)}#${listSig(bannerCharts)}#${songSig(newSongs)}#${songSig(forYou)}#${songSig(similar)}#${daily?.count ?: 0}#${dailySongs.size}"
    }

    companion object {
        fun fromJson(value: String?): HomeFeed? {
            if (value.isNullOrBlank()) return null
            return try {
                fromJson(JSONObject(value))
            } catch (_: Exception) {
                null
            }
        }

        fun fromJson(json: JSONObject): HomeFeed {
            val sections = mutableListOf<FeedSection>()
            json.optJSONArray("sections")?.let { array ->
                for (index in 0 until array.length()) array.optJSONObject(index)?.let { sections.add(FeedSection.fromJson(it)) }
            }
            val charts = mutableListOf<FeedPlaylist>()
            json.optJSONArray("charts")?.let { array ->
                for (index in 0 until array.length()) array.optJSONObject(index)?.let { charts.add(FeedPlaylist.fromJson(it)) }
            }
            val bannerCharts = mutableListOf<FeedPlaylist>()
            json.optJSONArray("bannerCharts")?.let { array ->
                for (index in 0 until array.length()) array.optJSONObject(index)?.let { bannerCharts.add(FeedPlaylist.fromJson(it)) }
            }
            val newSongs = mutableListOf<Song>()
            json.optJSONArray("newSongs")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(newSongs::add)
            }
            val similar = mutableListOf<Song>()
            json.optJSONArray("similar")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(similar::add)
            }
            val forYou = mutableListOf<Song>()
            json.optJSONArray("forYou")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(forYou::add)
            }
            val topArtists = mutableListOf<String>()
            json.optJSONArray("topArtists")?.let { array ->
                for (index in 0 until array.length()) array.optString(index).takeIf { it.isNotEmpty() }?.let(topArtists::add)
            }
            val dailySongs = mutableListOf<Song>()
            json.optJSONArray("dailySongs")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(dailySongs::add)
            }
            return HomeFeed(
                source = json.optString("source").ifEmpty { "all" },
                sections = sections,
                playlists = sections.firstOrNull { it.id == "playlists" }?.items
                    ?: FeedPlaylist.listFromJson(json.optJSONArray("playlists")?.toString()),
                newSongs = newSongs,
                charts = charts,
                bannerCharts = bannerCharts,
                similar = similar,
                forYou = forYou,
                personalized = json.optBoolean("personalized", false),
                topArtists = topArtists,
                daily = json.optJSONObject("daily")?.let { FeedPlaylist.fromJson(it) },
                dailySongs = dailySongs,
            )
        }
    }
}

/** 音源脚本携带的 LX 自定义源声明。 */
data class SyncSourcePayload(
    val id: String,
    val name: String,
    val script: String,
    val description: String = "",
    val author: String = "",
    val version: String = "",
    val homepage: String = "",
    val allowShowUpdateAlert: Boolean = false,
    val importedAt: Long = 0,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("script", script)
        .put("description", description)
        .put("author", author)
        .put("version", version)
        .put("homepage", homepage)
        .put("allowShowUpdateAlert", allowShowUpdateAlert)
        .put("importedAt", importedAt)

    companion object {
        fun fromJson(json: JSONObject): SyncSourcePayload = SyncSourcePayload(
            id = json.optString("id"),
            name = json.optString("name"),
            script = json.optString("script"),
            description = json.optString("description"),
            author = json.optString("author"),
            version = json.optString("version"),
            homepage = json.optString("homepage"),
            allowShowUpdateAlert = json.optBoolean("allowShowUpdateAlert"),
            importedAt = json.optLong("importedAt"),
        )

        fun listFromJson(value: String?): List<SyncSourcePayload> {
            if (value.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(value)
                (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(::fromJson) }.filter { it.script.isNotEmpty() }
            } catch (_: Exception) {
                emptyList()
            }
        }

        fun listToJson(sources: List<SyncSourcePayload>): String {
            val array = JSONArray()
            sources.forEach { array.put(it.toJson()) }
            return array.toString()
        }
    }
}

/** 逐字时间轴：增强 LRC / LX 逐字格式才有；普通 LRC 保持逐行。 */
data class LyricWord(val text: String, val timeMs: Long, val durationMs: Long = 0) {
    fun toJson(): JSONObject = JSONObject()
        .put("text", text)
        .put("timeMs", timeMs)
        .put("durationMs", durationMs)
}

data class LyricLine(
    val timeMs: Long,
    val text: String,
    val words: List<LyricWord> = emptyList(),
) {
    fun toJson(): JSONObject {
        // 舞台 JS 会直接读 line.words.length，words 必须始终存在（空数组也要写）。
        val json = JSONObject()
            .put("timeMs", timeMs)
            .put("text", text)
            .put("words", JSONArray().apply { words.forEach { put(it.toJson()) } })
        return json
    }

    companion object {
        fun listFromJson(value: String?): List<LyricLine> {
            if (value.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(value)
                (0 until array.length()).mapNotNull { index ->
                    val json = array.optJSONObject(index) ?: return@mapNotNull null
                    val words = mutableListOf<LyricWord>()
                    json.optJSONArray("words")?.let { wordArray ->
                        for (wordIndex in 0 until wordArray.length()) {
                            val word = wordArray.optJSONObject(wordIndex) ?: continue
                            words.add(LyricWord(word.optString("text"), word.optLong("timeMs"), word.optLong("durationMs")))
                        }
                    }
                    LyricLine(json.optLong("timeMs"), json.optString("text"), words)
                }
            } catch (_: Exception) {
                emptyList()
            }
        }

        fun listToJson(lines: List<LyricLine>): String {
            val array = JSONArray()
            lines.forEach { array.put(it.toJson()) }
            return array.toString()
        }
    }
}
