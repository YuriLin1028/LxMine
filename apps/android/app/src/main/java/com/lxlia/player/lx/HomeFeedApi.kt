package com.lxlia.player.lx

import com.lxlia.player.model.FeedPlaylist
import com.lxlia.player.model.FeedRequest
import com.lxlia.player.model.FeedSection
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.MusicPlaylist
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
    private fun dailyShuffle(songs: List<Song>, dayNumber: Long, limit: Int = 30): List<Song> {
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
        return pool.take(limit)
    }

    private val artistSplitRegex = Regex("[、/,，;&]+")
    private val ignoredArtists = setOf("未知", "未知歌手", "未知艺术家", "群星", "unknown", "various artists")

    /** 从歌单（尤其「我喜欢的」）与最近播放提取常听歌手池，支持按种子偏移采样。 */
    fun extractTopTasteArtists(
        playlists: List<MusicPlaylist>,
        recentSongs: List<Song>,
        currentSong: Song? = null,
        maxArtists: Int = 3,
        seedOffset: Int = 0,
    ): List<String> {
        val scores = linkedMapOf<String, Int>()
        val displayNames = linkedMapOf<String, String>()
        fun addSong(song: Song, weight: Int) {
            if (song.singer.isBlank()) return
            for (raw in song.singer.split(artistSplitRegex)) {
                val name = raw.trim()
                if (name.length < 2 && name.all { it.code < 128 }) continue
                val norm = name.lowercase()
                if (norm.isEmpty() || norm in ignoredArtists) continue
                displayNames.putIfAbsent(norm, name)
                scores[norm] = (scores[norm] ?: 0) + weight
            }
        }
        currentSong?.let { addSong(it, 2) }
        recentSongs.forEachIndexed { index, song ->
            addSong(song, if (index < 12) 3 else 2)
        }
        for (playlist in playlists) {
            if (playlist.isFavorite) {
                playlist.songs.forEach { addSong(it, 4) }
            } else if (playlist.kind == "lx") {
                playlist.songs.take(40).forEach { addSong(it, 1) }
            }
        }
        val ranked = scores.entries
            .sortedByDescending { it.value }
            .mapNotNull { displayNames[it.key] }
        if (ranked.isEmpty()) return emptyList()
        val count = maxArtists.coerceAtLeast(1)
        if (seedOffset <= 0 || ranked.size <= count) {
            return ranked.take(count)
        }
        val pool = ranked.take(minOf(ranked.size, 9))
        val shift = (seedOffset % pool.size + pool.size) % pool.size
        return (0 until count).map { idx -> pool[(shift + idx) % pool.size] }
    }

    /** 将常听歌手新鲜曲目与平台新歌按天确定性交错融合为每日三十首。 */
    fun blendPersonalizedDaily(
        baseSongs: List<Song>,
        personalizedSongs: List<Song>,
        dayNumber: Long,
        targetCount: Int = 30,
    ): List<Song> {
        if (personalizedSongs.isEmpty()) return dailyShuffle(baseSongs, dayNumber, targetCount)
        val shuffledPersonal = dailyShuffle(personalizedSongs, dayNumber xor 0x517CC1B7L, targetCount)
        val shuffledBase = dailyShuffle(baseSongs, dayNumber, targetCount)
        val out = mutableListOf<Song>()
        val seenKeys = mutableSetOf<String>()
        val seenNames = mutableSetOf<String>()
        fun tryAdd(song: Song): Boolean {
            val nameSig = "${song.name.trim().lowercase()}|${song.singer.trim().lowercase()}"
            if (!seenKeys.add(song.key) || !seenNames.add(nameSig)) return false
            out.add(song)
            return true
        }
        var pIdx = 0
        var bIdx = 0
        val personalQuota = minOf(15, (targetCount + 1) / 2)
        var personalAdded = 0
        while (out.size < targetCount && (pIdx < shuffledPersonal.size || bIdx < shuffledBase.size)) {
            if (personalAdded < personalQuota && pIdx < shuffledPersonal.size) {
                if (tryAdd(shuffledPersonal[pIdx++])) personalAdded++
            }
            if (out.size < targetCount && bIdx < shuffledBase.size) {
                tryAdd(shuffledBase[bIdx++])
            }
            if (personalAdded >= personalQuota && bIdx >= shuffledBase.size && pIdx < shuffledPersonal.size) {
                tryAdd(shuffledPersonal[pIdx++])
            }
        }
        return out
    }

    suspend fun fetchPersonalizedSongs(
        artists: List<String>,
        excludeKeys: Set<String> = emptySet(),
        algoSeed: Int = 0,
        dislikedKeys: Set<String> = emptySet(),
        host: LxHost? = null,
        seedSongs: List<Song> = emptyList(),
    ): List<Song> = withContext(Dispatchers.IO) {
        val targets = artists.map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(4)
        if (targets.isEmpty() && seedSongs.isEmpty()) return@withContext emptyList()
        val page = if (algoSeed <= 0) 1 else (algoSeed % 3) + 1

        val (cfSongs, perArtist) = supervisorScope {
            val cfJob = async {
                if (host == null || seedSongs.isEmpty()) emptyList()
                else runCatching {
                    val params = JSONObject()
                        .put("seeds", JSONArray().apply { seedSongs.take(12).forEach { put(it.toJson()) } })
                        .put("artists", JSONArray(targets))
                        .put("dislikedKeys", JSONArray(dislikedKeys.toList()))
                        .put("seed", algoSeed)
                        .put("limit", 24)
                    val raw = host.catalogue("personalized-mix", params.toString())
                    val obj = JSONObject(raw)
                    val out = mutableListOf<Song>()
                    obj.optJSONArray("items")?.let { arr ->
                        for (i in 0 until arr.length()) Song.fromJson(arr.optJSONObject(i))?.let(out::add)
                    }
                    out
                }.getOrDefault(emptyList())
            }
            val artistJobs = targets.take(3).map { artist ->
                async {
                    val primary = runCatching { SearchApi.search(SearchSource.ALL, artist, page = page, limit = 10).items }
                        .getOrDefault(emptyList())
                    if (primary.isNotEmpty() || page == 1) primary
                    else runCatching { SearchApi.search(SearchSource.ALL, artist, page = 1, limit = 10).items }
                        .getOrDefault(emptyList())
                }
            }
            cfJob.await() to artistJobs.awaitAll()
        }

        val combinedLists = buildList {
            if (cfSongs.isNotEmpty()) add(cfSongs)
            perArtist.forEach { if (it.isNotEmpty()) add(it) }
        }
        val merged = roundRobinSongs(combinedLists).filterNot { it.key in dislikedKeys }
        if (merged.isEmpty()) return@withContext emptyList()

        // 限制单个主歌手最多出现 2 首，避免推荐流被同一位歌手刷屏（#13）
        val deduped = mutableListOf<Song>()
        val seenNames = mutableSetOf<String>()
        val artistCount = mutableMapOf<String, Int>()
        val overflow = mutableListOf<Song>()
        for (song in merged) {
            val sig = "${song.name.trim().lowercase()}|${song.singer.trim().lowercase()}"
            if (!seenNames.add(sig)) continue
            val mainArtist = song.singer.split(artistSplitRegex).firstOrNull()?.trim()?.lowercase().orEmpty()
            val curCnt = if (mainArtist.isNotEmpty()) artistCount.getOrDefault(mainArtist, 0) else 0
            if (curCnt < 2) {
                if (mainArtist.isNotEmpty()) artistCount[mainArtist] = curCnt + 1
                deduped.add(song)
            } else {
                overflow.add(song)
            }
        }
        val balanced = if (deduped.size >= 16) deduped else deduped + overflow
        val orderedPool = if (algoSeed > 0) {
            dailyShuffle(balanced, algoSeed.toLong() * 2654435761L, balanced.size.coerceAtLeast(1))
        } else {
            balanced
        }
        val freshWithCover = orderedPool.filter { it.key !in excludeKeys && it.coverUrl.isNotEmpty() }
        val freshRest = orderedPool.filter { it.key !in excludeKeys && it.coverUrl.isEmpty() }
        val knownFallback = orderedPool.filter { it.key in excludeKeys }
        (freshWithCover + freshRest + knownFallback).take(24)
    }

    suspend fun loadMergedHome(
        host: LxHost,
        tasteArtists: List<String> = emptyList(),
        knownKeys: Set<String> = emptySet(),
        algoSeed: Int = 0,
        dislikedKeys: Set<String> = emptySet(),
        seedSongs: List<Song> = emptyList(),
    ): HomeFeed = withContext(Dispatchers.IO) {
        val platforms = listOf("wy", "tx", "kw", "kg")
        val reasons = java.util.Collections.synchronizedList(mutableListOf<String>())
        val (parts, personalizedSongs) = supervisorScope {
            val platformJobs = platforms.map { platform ->
                async {
                    runCatching { parsePlatformLite(host.catalogue("home-lite", JSONObject().put("source", platform).toString())) }
                        .onFailure { reasons.add("$platform: ${it.message}") }
                        .getOrNull()
                }
            }
            val personalJob = async {
                runCatching { fetchPersonalizedSongs(tasteArtists, knownKeys, algoSeed, dislikedKeys, host, seedSongs) }.getOrDefault(emptyList())
            }
            platformJobs.awaitAll() to personalJob.await()
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
        // 合并项在 charts 里是旧对象引用，替换成累计后的新对象（concepts 以 concept 名称为键）。
        for (index in charts.indices) {
            val current = charts[index]
            concepts[current.name]?.let { charts[index] = it }
        }
        val rawNewSongs = roundRobin(ok.map { it.newSongs }) { "${it.source}:${it.id}" }
            .filterNot { it.key in dislikedKeys }
        // 跨平台新歌按规范化歌名+主歌手去重，避免四平台同一热歌重复出现。
        val seenCanonicalNew = mutableSetOf<String>()
        val dedupedNewSongs = mutableListOf<Song>()
        for (song in rawNewSongs) {
            val cleanTitle = song.name.lowercase()
                .replace(Regex("""[(\（\[\【][^)\）\]\】]*[)\）\]\】]"""), "")
                .replace(Regex("""[\s\-_·.,，。!?！？'"]+"""), "")
                .trim()
            val cleanSinger = song.singer.lowercase()
                .split(artistSplitRegex).firstOrNull().orEmpty()
                .replace(Regex("""[\s\-_·.,，。'"]+"""), "")
                .trim()
            val ck = "${cleanTitle.ifEmpty { song.id }}|$cleanSinger"
            if (seenCanonicalNew.add(ck)) dedupedNewSongs.add(song)
        }
        // 兜底补齐所有榜单封面：优先融合子榜封面，其次取歌单/新歌不重复真实封面，杜绝榜单无封面。
        val chartFallbackPool = (recommend + hot).map { it.cover.trim() }.filter { it.isNotEmpty() } +
            dedupedNewSongs.map { it.coverUrl.trim() }.filter { it.isNotEmpty() }
        val usedChartCovers = charts.map { it.cover.trim() }.filter { it.isNotEmpty() }.toMutableSet()
        var fallbackCursor = 0
        for (index in charts.indices) {
            val current = charts[index]
            var cover = current.cover.trim()
            if (cover.isEmpty() && current.parts.isNotEmpty()) {
                cover = current.parts.firstOrNull { it.cover.isNotBlank() }?.cover?.trim().orEmpty()
            }
            if (cover.isEmpty() && chartFallbackPool.isNotEmpty()) {
                cover = chartFallbackPool.firstOrNull { it !in usedChartCovers }
                    ?: chartFallbackPool[fallbackCursor++ % chartFallbackPool.size]
            }
            if (cover.isNotEmpty() && cover != current.cover) {
                charts[index] = current.copy(cover = cover)
                usedChartCovers.add(cover)
            }
        }
        val daySeed = (System.currentTimeMillis() / 86400000L) + algoSeed.toLong() * 1315423911L
        // 首页第一行榜单按日期 + 刷新种子随机推荐（带封面优先）。
        val shuffledCharts = if (charts.size > 1) {
            val copy = charts.toMutableList()
            var st = (daySeed xor 0x5BD1E995L)
            for (i in copy.lastIndex downTo 1) {
                st = (st * 1664525L + 1013904223L) and 0xFFFFFFFFL
                val j = (st % (i + 1)).toInt()
                val tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
            }
            copy
        } else charts
        val categoryCoverPool = (recommend + hot + shuffledCharts)
            .map { it.cover.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
        val categoryItems = mutableListOf<FeedPlaylist>()
        val categorySeen = mutableSetOf<String>()
        for (part in ok) {
            for ((_, name) in part.categories) {
                if (name.isEmpty() || !categorySeen.add(name)) continue
                val matchedCover = (recommend + hot).firstOrNull {
                    it.cover.isNotEmpty() && it.name.contains(name, ignoreCase = true)
                }?.cover ?: if (categoryCoverPool.isNotEmpty()) {
                    categoryCoverPool[categoryItems.size % categoryCoverPool.size]
                } else ""
                categoryItems.add(
                    FeedPlaylist(
                        id = "category-$name",
                        name = name,
                        cover = matchedCover,
                        request = FeedRequest(part.source.ifEmpty { "wy" }, "hot", name),
                    )
                )
            }
        }
        val sections = listOf(
            FeedSection("playlists", "推荐歌单", "playlist", recommend),
            FeedSection("charts", "排行榜", "playlist", shuffledCharts),
            FeedSection("hot", "热门歌单", "playlist", hot),
            FeedSection("category", "歌单分类", "playlist", categoryItems),
        )
        val isPersonalized = personalizedSongs.isNotEmpty()
        // 每日三十首避开新歌速递前 20 首，减少板块重复。
        val tailFirstNew = if (dedupedNewSongs.size > 22) {
            dedupedNewSongs.drop(20) + dedupedNewSongs.take(20)
        } else dedupedNewSongs
        val dailySongs = if (isPersonalized) {
            blendPersonalizedDaily(tailFirstNew, personalizedSongs, daySeed, 30)
        } else {
            dailyShuffle(tailFirstNew, daySeed)
        }
        val dailyCanonical = dailySongs.map { "${it.name.trim().lowercase()}|${it.singer.trim().lowercase()}" }.toSet()
        val newSongs = dedupedNewSongs.filter { "${it.name.trim().lowercase()}|${it.singer.trim().lowercase()}" !in dailyCanonical } +
            dedupedNewSongs.filter { "${it.name.trim().lowercase()}|${it.singer.trim().lowercase()}" in dailyCanonical }
        val daily = FeedPlaylist(
            id = "daily-30",
            name = "每日三十首",
            cover = dailySongs.firstOrNull { it.coverUrl.isNotEmpty() }?.coverUrl
                ?: dailySongs.firstOrNull()?.coverUrl.orEmpty(),
            count = dailySongs.size,
            period = if (isPersonalized) "personalized" else null,
        )
        HomeFeed(
            source = "all",
            sections = sections,
            playlists = recommend,
            newSongs = newSongs,
            charts = shuffledCharts,
            bannerCharts = shuffledCharts.take(5),
            similar = emptyList(),
            forYou = personalizedSongs,
            personalized = isPersonalized,
            topArtists = tasteArtists.take(4),
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
        val data = JSONObject(Http.get("https://music.163.com/api/v6/playlist/detail?id=$id&n=1000&s=0", "https://music.163.com/"))
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
