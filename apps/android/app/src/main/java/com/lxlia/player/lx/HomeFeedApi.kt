package com.lxlia.player.lx

import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.FeedRequest
import com.lxlia.player.model.FeedSection
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class FeedSongsResult(val items: List<Song> = emptyList(), val warning: String? = null)

private data class FeedPage(val items: List<FeedPlaylist> = emptyList(), val total: Long = 0, val hasMore: Boolean? = null)

private data class PlatformLite(
    val source: String = "",
    val recommend: List<FeedPlaylist> = emptyList(),
    val hot: List<FeedPlaylist> = emptyList(),
    val charts: List<FeedPlaylist> = emptyList(),
    val newSongs: List<Song> = emptyList(),
    val categories: List<Pair<String, String>> = emptyList(),
)

/** 四平台融合首页：homeLite 只取推荐/热门/榜单/新歌，一首歌的来源用角标标注。 */
object HomeFeedApi {
    suspend fun loadPlatformSection(host: LxHost, request: FeedRequest, cancelled: () -> Boolean = { false }): List<FeedPlaylist> =
        withContext(Dispatchers.IO) {
            val all = mutableListOf<FeedPlaylist>()
            val seen = mutableSetOf<String>()
            val limit = if (request.source == "kg") 20 else 36
            var page = 1
            while (!cancelled() && page <= 4) {
                val params = JSONObject()
                    .put("source", request.source)
                    .put("type", request.type)
                    .put("category", request.category)
                    .put("page", page)
                    .put("limit", limit)
                val result = parseFeedPage(host.catalogue("home-section", params.toString()))
                var added = 0
                for (item in result.items) {
                    if (seen.add("${item.source.orEmpty()}:${item.id}")) {
                        all.add(item)
                        added++
                    }
                }
                if (result.items.isEmpty() || added == 0 || result.hasMore == false) break
                if (result.total > 0 && page.toLong() * limit >= result.total) break
                if (result.items.size < limit) break
                page++
            }
            all
        }

    suspend fun platformFeedSongs(host: LxHost, item: FeedPlaylist): FeedSongsResult =
        withContext(Dispatchers.IO) {
            val json = runCatching { JSONObject(host.catalogue("feed-tracks", item.toJson().toString())) }.getOrNull()
                ?: return@withContext FeedSongsResult()
            val items = mutableListOf<Song>()
            json.optJSONArray("items")?.let { array ->
                for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(items::add)
            }
            FeedSongsResult(items, json.optString("warning").ifEmpty { null })
        }

    /** 大融合榜单打开时：逐个拉组成部分的曲目再交错合并，多来源的榜单本身没有角标。 */
    suspend fun loadMergedChartSongs(host: LxHost, item: FeedPlaylist): List<Song> = withContext(Dispatchers.IO) {
        val settled = supervisorScope {
            item.parts.map { part ->
                async { runCatching { platformFeedSongs(host, part).items }.getOrDefault(emptyList()) }
            }.awaitAll()
        }
        val lists = mutableListOf<List<Song>>()
        for (index in settled.indices) {
            val part = item.parts.getOrNull(index) ?: continue
            val items = settled[index]
            if (items.isEmpty()) continue
            val cap = if (part.count > 0) part.count else items.size
            lists.add(items.take(cap))
        }
        roundRobinSongs(lists)
    }

    private fun roundRobinSongs(lists: List<List<Song>>): List<Song> {
        val out = mutableListOf<Song>()
        val seen = mutableSetOf<String>()
        var round = 0
        var added = true
        while (added) {
            added = false
            for (list in lists) {
                if (round < list.size) {
                    if (round + 1 < list.size) added = true
                    val song = list[round]
                    if (seen.add("${song.source}:${song.id}")) out.add(song)
                }
            }
            round++
        }
        return out
    }

    private fun <T> roundRobin(lists: List<List<T>>, key: (T) -> String): List<T> {
        val out = mutableListOf<T>()
        val seen = mutableSetOf<String>()
        var round = 0
        var added = true
        while (added) {
            added = false
            for (list in lists) {
                if (round < list.size) {
                    if (round + 1 < list.size) added = true
                    val item = list[round]
                    val k = key(item)
                    if (seen.add(k)) out.add(item)
                }
            }
            round++
        }
        return out
    }

    private fun chartConcept(name: String): String? = when {
        name.contains("飙升") || name.contains("上升") -> "飙升榜"
        name.contains("新歌") -> "新歌榜"
        name.contains("热歌") -> "热歌榜"
        name.contains("原创") -> "原创榜"
        else -> null
    }

    /** 以日期为种子的确定性洗牌：同一天内顺序稳定，跨天变化，即"每日"推荐。 */
    private fun dailyShuffle(songs: List<Song>, dayNumber: Long): List<Song> {
        var state = (dayNumber xor 0x9E3779B9L).toInt()
        fun next(): Double {
            state += 0x6D2B79F5
            var t = (state xor (state ushr 15)) * (1 or state)
            t += ((t xor (t ushr 7)) * (61 or t)) xor t
            return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
        }
        val pool = songs.take(60).toMutableList()
        for (index in pool.size - 1 downTo 1) {
            val target = (next() * (index + 1)).toInt().coerceIn(0, index)
            val temp = pool[index]
            pool[index] = pool[target]
            pool[target] = temp
        }
        return pool.take(30)
    }

    suspend fun loadMergedHome(host: LxHost): HomeFeed = withContext(Dispatchers.IO) {
        val platforms = listOf("wy", "tx", "kw", "kg")
        val reasons = java.util.Collections.synchronizedList(mutableListOf<String>())
        val parts = supervisorScope {
            platforms.map { platform ->
                async {
                    runCatching { parsePlatformLite(host.catalogue("home-lite", JSONObject().put("source", platform).toString())) }
                        .onFailure { reasons.add("$platform: ${it.message}") }
                        .getOrNull()
                }
            }.awaitAll()
        }
        val ok = parts.filterNotNull()
        if (ok.isEmpty()) throw IllegalStateException("所有平台的首页都暂不可用 ${reasons.joinToString(" | ")}")
        val recommend = roundRobin(ok.map { it.recommend }) { "${it.source.orEmpty()}:${it.id}" }
        val hot = roundRobin(ok.map { it.hot }) { "${it.source.orEmpty()}:${it.id}" }
        val charts = mutableListOf<FeedPlaylist>()
        val concepts = linkedMapOf<String, FeedPlaylist>()
        for (part in ok) {
            for (chart in part.charts) {
                val concept = chartConcept(chart.name)
                if (concept == null) {
                    charts.add(chart)
                    continue
                }
                val merged = concepts[concept]
                if (merged != null) {
                    concepts[concept] = merged.copy(
                        cover = merged.cover.ifEmpty { chart.cover },
                        count = merged.count + chart.count,
                        playCount = merged.playCount + chart.playCount,
                        parts = merged.parts + chart,
                    )
                } else {
                    val entry = FeedPlaylist(
                        id = "merged-$concept",
                        name = concept,
                        cover = chart.cover,
                        count = chart.count,
                        playCount = chart.playCount,
                        parts = listOf(chart),
                    )
                    concepts[concept] = entry
                    charts.add(entry)
                }
            }
        }
        // 合并项在 charts 里是旧对象引用，替换成累计后的新对象。
        for (index in charts.indices) {
            val current = charts[index]
            concepts[current.id]?.let { charts[index] = it }
        }
        val newSongs = roundRobin(ok.map { it.newSongs }) { "${it.source}:${it.id}" }
        val categoryItems = mutableListOf<FeedPlaylist>()
        val categorySeen = mutableSetOf<String>()
        for (part in ok) {
            for ((id, name) in part.categories) {
                if (name.isEmpty() || !categorySeen.add(name)) continue
                categoryItems.add(
                    FeedPlaylist(
                        id = "category-$name",
                        name = name,
                        request = FeedRequest(part.source.ifEmpty { "wy" }, "hot", name),
                    )
                )
            }
        }
        val sections = listOf(
            FeedSection("playlists", "推荐歌单", "playlist", recommend),
            FeedSection("charts", "排行榜", "playlist", charts),
            FeedSection("hot", "热门歌单", "playlist", hot),
            FeedSection("category", "歌单分类", "playlist", categoryItems),
        )
        val dayNumber = System.currentTimeMillis() / 86400000L
        val dailySongs = dailyShuffle(newSongs, dayNumber)
        val daily = FeedPlaylist(
            id = "daily-30",
            name = "每日三十首",
            cover = dailySongs.firstOrNull()?.coverUrl.orEmpty(),
            count = dailySongs.size,
        )
        HomeFeed(
            source = "all",
            sections = sections,
            playlists = recommend,
            newSongs = newSongs,
            charts = charts,
            similar = emptyList(),
            daily = daily,
            dailySongs = dailySongs,
        )
    }

    private fun parseFeedPage(value: String): FeedPage {
        val json = JSONObject(value)
        val items = mutableListOf<FeedPlaylist>()
        json.optJSONArray("items")?.let { array ->
            for (index in 0 until array.length()) array.optJSONObject(index)?.let { items.add(FeedPlaylist.fromJson(it)) }
        }
        return FeedPage(items, json.optLong("total"), if (json.has("hasMore")) json.optBoolean("hasMore") else null)
    }

    private fun parsePlatformLite(value: String): PlatformLite {
        val json = JSONObject(value)
        fun playlists(array: JSONArray?): List<FeedPlaylist> {
            if (array == null) return emptyList()
            return (0 until array.length()).mapNotNull { array.optJSONObject(it)?.let(FeedPlaylist::fromJson) }
        }
        fun songs(array: JSONArray?): List<Song> {
            if (array == null) return emptyList()
            return (0 until array.length()).mapNotNull { Song.fromJson(array.optJSONObject(it)) }
        }
        val categories = mutableListOf<Pair<String, String>>()
        json.optJSONArray("categories")?.let { array ->
            for (index in 0 until array.length()) {
                val tag = array.optJSONObject(index) ?: continue
                val name = tag.optString("name")
                if (name.isNotEmpty()) categories.add(tag.optString("id") to name)
            }
        }
        return PlatformLite(
            source = json.optString("source"),
            recommend = playlists(json.optJSONArray("recommend")),
            hot = playlists(json.optJSONArray("hot")),
            charts = playlists(json.optJSONArray("charts")),
            newSongs = songs(json.optJSONArray("newSongs")),
            categories = categories,
        )
    }

    /** 网易云歌单详情：曲目 id 可能超出首屏返回数量，按 200 一批补齐元数据。 */
    suspend fun loadFeedPlaylistSongs(id: String, onUnavailable: (Int) -> Unit = {}): List<Song> = withContext(Dispatchers.IO) {
        val data = JSONObject(Http.get("https://music.163.com/api/v6/playlist/detail?id=$id&n=0", "https://music.163.com/"))
        val playlist = data.optJSONObject("playlist")
        val ids = mutableListOf<String>()
        playlist?.optJSONArray("trackIds")?.let { array ->
            for (index in 0 until array.length()) array.optJSONObject(index)?.optString("id")?.takeIf { it.isNotEmpty() }?.let(ids::add)
        }
        val byId = linkedMapOf<String, JSONObject>()
        playlist?.optJSONArray("tracks")?.let { array ->
            for (index in 0 until array.length()) {
                val track = array.optJSONObject(index) ?: continue
                val trackId = track.optString("id")
                if (trackId.isNotEmpty()) byId[trackId] = track
            }
        }
        var offset = 0
        while (offset < ids.size) {
            val batch = ids.drop(offset).take(200).filter { !byId.containsKey(it) }
            offset += 200
            if (batch.isEmpty()) continue
            val idsJson = JSONArray().apply { batch.forEach { put(it.toLongOrNull() ?: it) } }.toString()
            val detail = JSONObject(
                Http.get(
                    "https://music.163.com/api/song/detail?ids=" + java.net.URLEncoder.encode(idsJson, "UTF-8"),
                    "https://music.163.com/",
                )
            )
            detail.optJSONArray("songs")?.let { array ->
                for (index in 0 until array.length()) {
                    val track = array.optJSONObject(index) ?: continue
                    val trackId = track.optString("id")
                    if (trackId.isNotEmpty()) byId[trackId] = track
                }
            }
        }
        val tracks = if (ids.isNotEmpty()) ids.mapNotNull { byId[it] } else byId.values.toList()
        val songs = tracks.mapNotNull { mapSong(it) }
        if (ids.size > songs.size) onUnavailable(ids.size - songs.size)
        songs
    }

    private fun mapSong(raw: JSONObject?): Song? {
        if (raw == null) return null
        val id = raw.optString("id")
        if (id.isEmpty()) return null
        val artists = raw.optJSONArray("artists") ?: raw.optJSONArray("ar")
        val singers = mutableListOf<String>()
        if (artists != null) for (index in 0 until artists.length()) {
            artists.optJSONObject(index)?.optString("name")?.takeIf { it.isNotEmpty() }?.let(singers::add)
        }
        val album = raw.optJSONObject("album") ?: raw.optJSONObject("al")
        return Song(
            source = "wy",
            id = id,
            name = raw.optString("name"),
            singer = singers.joinToString("、"),
            albumName = album?.optString("name").orEmpty(),
            albumId = album?.optString("id").orEmpty(),
            durationMs = raw.optLong("duration").takeIf { it > 0 } ?: raw.optLong("dt"),
            qualitys = listOf("128k", "320k", "flac"),
            coverUrl = album?.optString("picUrl").orEmpty(),
        )
    }
}
