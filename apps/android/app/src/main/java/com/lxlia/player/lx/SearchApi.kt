package com.lxlia.player.lx

import com.lxlia.player.model.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

enum class SearchSource(val id: String, val label: String) {
    ALL("all", "聚合搜索"),
    KW("kw", "酷我"),
    KG("kg", "酷狗"),
    WY("wy", "网易云"),
    TX("tx", "QQ 音乐");

    companion object {
        fun of(id: String): SearchSource = entries.firstOrNull { it.id == id } ?: ALL
    }
}

data class SearchResult(
    val items: List<Song> = emptyList(),
    val total: Long = 0,
    val warning: String? = null,
    val hasMore: Boolean? = null,
)

/** 鸿蒙端 LX 内置源搜索：酷我 / 酷狗 / 网易云 / QQ。只做搜索，播放地址仍由自定义源提供。 */
object SearchApi {
    fun search(source: SearchSource, keyword: String, page: Int = 1, limit: Int = 30): SearchResult {
        val query = keyword.trim()
        if (query.isEmpty()) return SearchResult()
        return when (source) {
            SearchSource.ALL -> searchAllPlatforms(query, page, limit)
            SearchSource.KW -> searchKuwo(query, page, limit)
            SearchSource.KG -> searchKugou(query, page, limit)
            SearchSource.WY -> searchNetease(query, page, limit)
            SearchSource.TX -> searchQQ(query, page, limit)
        }
    }

    private fun searchAllPlatforms(query: String, page: Int, limit: Int): SearchResult {
        val platforms = listOf(SearchSource.KW, SearchSource.KG, SearchSource.WY, SearchSource.TX)
        val results = platforms.map { runCatching { search(it, query, page, limit) } }
        val fulfilled = results.mapNotNull { it.getOrNull() }
        if (fulfilled.isEmpty()) throw IllegalStateException("检索平台暂时不可用，请稍后重试")
        var total = 0L
        fulfilled.forEach { total += it.total }
        val items = mutableListOf<Song>()
        val length = fulfilled.maxOf { it.items.size }
        for (index in 0 until length) {
            for (result in fulfilled) result.items.getOrNull(index)?.let(items::add)
        }
        val failed = platforms.size - fulfilled.size
        return SearchResult(items, total, if (failed > 0) "${failed} 个检索平台暂时不可用，已显示其余结果" else null)
    }

    /** 一次搜索自动枚举平台所有可访问页；用户看到进度式追加。 */
    suspend fun searchAll(
        source: SearchSource,
        keyword: String,
        onProgress: (List<Song>, Long) -> Unit = { _, _ -> },
        cancelled: () -> Boolean = { false },
    ): SearchResult = withContext(Dispatchers.IO) {
        val sources = if (source == SearchSource.ALL) listOf(SearchSource.KW, SearchSource.KG, SearchSource.WY, SearchSource.TX) else listOf(source)
        val collected = mutableListOf<Song>()
        val progressLock = Mutex()
        val totals = Array(sources.size) { 0L }
        val failures = Array(sources.size) { false }
        val outcomes = supervisorScope {
            sources.mapIndexed { index, platform ->
                async {
                    val seen = mutableSetOf<String>()
                    var page = 1
                    var warning: String? = null
                    while (true) {
                        if (cancelled()) break
                        val result = try {
                            search(platform, keyword, page, 50)
                        } catch (error: Throwable) {
                            if (seen.isEmpty()) {
                                failures[index] = true
                                return@async error.message
                            }
                            warning = "网络中断，已保留获取的结果，请重新搜索重试"
                            break
                        }
                        val fresh = result.items.filter { seen.add("${it.source}:${it.id}") }
                        progressLock.withLock {
                            totals[index] = maxOf(totals[index], result.total)
                            if (!cancelled()) {
                                collected.addAll(fresh)
                                val snapshot = collected.toList()
                                val total = totals.sum()
                                withContext(Dispatchers.Main) { onProgress(snapshot, total) }
                            }
                        }
                        if (cancelled()) break
                        if (result.items.isEmpty() || fresh.isEmpty()) {
                            if (page * 50 < totals[index]) warning = "平台已停止返回新结果，已显示全部可获取结果"
                            break
                        }
                        if (result.hasMore == false) break
                        if (totals[index] > result.items.size && page * 50 >= totals[index]) break
                        if (totals[index] <= result.items.size && result.items.size < 50) break
                        page++
                    }
                    warning
                }
            }.awaitAll()
        }
        val items = collected.toList()
        val warnings = mutableListOf<String>()
        var failed = 0
        for (outcome in outcomes) {
            if (outcome != null && outcome.isNotEmpty()) warnings.add(outcome)
        }
        failures.forEach { if (it) failed++ }
        if (failed == sources.size) throw IllegalStateException("检索平台暂时不可用，请稍后重试")
        if (failed > 0) warnings.add("$failed 个平台暂时不可用")
        SearchResult(items, totals.sum(), warnings.joinToString("；").ifEmpty { null })
    }

    /** 酷狗：song_search_v2，拍平 Grp 子项并按 Audioid+FileHash 去重。 */
    private fun searchKugou(keyword: String, page: Int, limit: Int): SearchResult {
        val url = "https://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=" +
            java.net.URLEncoder.encode(keyword, "UTF-8") +
            "&hifiquality=0&pagesize=$limit&PrivilegeFilter=0&page=$page"
        val payload = JSONObject(Http.get(url, timeoutMs = 15000))
        if (payload.optInt("error_code", 0) != 0) throw IllegalStateException("酷狗搜索失败")
        val items = mutableListOf<Song>()
        val seen = mutableSetOf<String>()
        fun push(entry: JSONObject) {
            val hash = entry.optString("FileHash")
            if (hash.isEmpty()) return
            val key = "${entry.optString("Audioid")}$hash"
            if (!seen.add(key)) return
            val duration = entry.optString("Duration").toLongOrNull() ?: 0
            val rawImage = entry.optString("Image").ifEmpty {
                entry.optJSONObject("trans_param")?.optString("union_cover").orEmpty()
            }
            val image = if (rawImage.isNotEmpty()) {
                rawImage.replace("{size}", "400")
                    .replace(Regex("^//"), "https://")
                    .replace(Regex("^http:"), "https:")
            } else ""
            items.add(
                Song(
                    source = "kg",
                    hash = hash,
                    hashes = buildMap {
                        put("128k", hash)
                        entry.optString("HQFileHash").takeIf { it.isNotEmpty() }?.let { put("320k", it) }
                        entry.optString("SQFileHash").takeIf { it.isNotEmpty() }?.let { put("flac", it) }
                    },
                    id = hash,
                    name = decodeName(entry.optString("SongName")),
                    singer = formatSinger(entry.optString("SingerName")),
                    albumName = decodeName(entry.optString("AlbumName")),
                    albumId = entry.optString("AlbumID"),
                    durationMs = duration * 1000,
                    qualitys = buildList {
                        add("128k")
                        if (entry.optString("HQFileHash").isNotEmpty()) add("320k")
                        if (entry.optString("SQFileHash").isNotEmpty()) add("flac")
                    },
                    coverUrl = image,
                )
            )
        }
        val data = payload.optJSONObject("data")
        val lists = data?.optJSONArray("lists")
        if (lists != null) {
            for (index in 0 until lists.length()) {
                val raw = lists.optJSONObject(index) ?: continue
                push(raw)
                raw.optJSONArray("Grp")?.let { group ->
                    for (groupIndex in 0 until group.length()) group.optJSONObject(groupIndex)?.let { push(it) }
                }
            }
        }
        val total = data?.optLong("total") ?: items.size.toLong()
        return SearchResult(items, total)
    }

    /** 网易云：优先请求 cloudsearch/pc（原生自带高清专辑封面 al.picUrl），失败回退 search/get/web。 */
    private fun searchNetease(keyword: String, page: Int, limit: Int): SearchResult {
        val offset = (page - 1).coerceAtLeast(0) * limit
        val body = "s=${java.net.URLEncoder.encode(keyword, "UTF-8")}&type=1&offset=$offset&limit=$limit&total=true"
        val payload = runCatching {
            val pc = JSONObject(Http.postForm("https://music.163.com/api/cloudsearch/pc", body, "https://music.163.com/"))
            if (pc.optJSONObject("result")?.optJSONArray("songs") != null) pc
            else JSONObject(Http.postForm("https://music.163.com/api/search/get/web", body, "https://music.163.com/"))
        }.getOrElse {
            JSONObject(Http.postForm("https://music.163.com/api/search/get/web", body, "https://music.163.com/"))
        }
        val songs = payload.optJSONObject("result")?.optJSONArray("songs") ?: return SearchResult()
        val items = mutableListOf<Song>()
        for (index in 0 until songs.length()) {
            val song = songs.optJSONObject(index) ?: continue
            val id = song.optString("id")
            if (id.isEmpty()) continue
            val artists = song.optJSONArray("ar") ?: song.optJSONArray("artists")
            val singers = mutableListOf<String>()
            if (artists != null) for (artistIndex in 0 until artists.length()) {
                artists.optJSONObject(artistIndex)?.optString("name")?.takeIf { it.isNotEmpty() }?.let(singers::add)
            }
            val album = song.optJSONObject("al") ?: song.optJSONObject("album")
            val durationMs = song.optLong("dt").takeIf { it > 0 } ?: song.optLong("duration")
            items.add(
                Song(
                    source = "wy",
                    id = id,
                    name = decodeName(song.optString("name")),
                    singer = singers.joinToString("、"),
                    albumName = decodeName(album?.optString("name")),
                    albumId = album?.optString("id").orEmpty(),
                    durationMs = durationMs,
                    qualitys = listOf("128k", "320k", "flac"),
                    coverUrl = normalizeCoverUrl(album?.optString("picUrl")),
                )
            )
        }
        val total = payload.optJSONObject("result")?.optLong("songCount") ?: items.size.toLong()
        return SearchResult(items, total)
    }

    /** QQ 音乐：client_search_cp（new_json），album.mid 为空时回退 album.pmid。 */
    private fun searchQQ(keyword: String, page: Int, limit: Int): SearchResult {
        val params = listOf(
            "w=" + java.net.URLEncoder.encode(keyword, "UTF-8"),
            "format=json",
            "n=$limit",
            "p=$page",
            "new_json=1",
            "cr=1",
            "t=0",
            "aggr=1",
            "lossless=0",
            "flag_qc=0",
            "g_tk=5381",
        ).joinToString("&")
        val payload = JSONObject(Http.get("https://c.y.qq.com/soso/fcgi-bin/client_search_cp?$params", "https://y.qq.com/"))
        if (payload.optInt("code", 0) != 0) throw IllegalStateException("QQ 搜索失败")
        val songList = payload.optJSONObject("data")?.optJSONObject("song")
        val list = songList?.optJSONArray("list") ?: return SearchResult()
        val items = mutableListOf<Song>()
        for (index in 0 until list.length()) {
            val song = list.optJSONObject(index) ?: continue
            val mid = song.optString("mid")
            if (mid.isEmpty()) continue
            val singersJson = song.optJSONArray("singer")
            val singers = mutableListOf<String>()
            if (singersJson != null) for (singerIndex in 0 until singersJson.length()) {
                singersJson.optJSONObject(singerIndex)?.optString("name")?.takeIf { it.isNotEmpty() }?.let(singers::add)
            }
            val albumObj = song.optJSONObject("album")
            val albumMid = albumObj?.optString("mid").orEmpty().ifEmpty { albumObj?.optString("pmid").orEmpty() }
            items.add(
                Song(
                    source = "tx",
                    id = mid,
                    name = decodeName(song.optString("name")),
                    singer = singers.joinToString("、"),
                    albumName = decodeName(albumObj?.optString("name")),
                    albumId = albumMid,
                    durationMs = song.optLong("interval") * 1000,
                    qualitys = listOf("128k", "320k"),
                    coverUrl = if (albumMid.isNotEmpty()) "https://y.gtimg.cn/music/photo_new/T002R500x500M000$albumMid.jpg" else "",
                )
            )
        }
        val total = songList.optLong("totalnum", items.size.toLong())
        return SearchResult(items, total)
    }

    /** 鸿蒙端 LX 内置源搜索（酷我）：移植自 lx-music-desktop 的 kw/musicSearch.js。 */
    fun searchKuwo(keyword: String, page: Int = 1, limit: Int = 30): SearchResult {
        val query = keyword.trim()
        if (query.isEmpty()) return SearchResult()
        val params = listOf(
            "client=kt",
            "all=" + java.net.URLEncoder.encode(query, "UTF-8"),
            "pn=${(page - 1).coerceAtLeast(0)}",
            "rn=$limit",
            "uid=794762570",
            "ver=kwplayer_ar_9.2.2.1",
            "vipver=1",
            "show_copyright_off=1",
            "newver=1",
            "ft=music",
            "cluster=0",
            "strategy=2012",
            "encoding=utf8",
            "rformat=json",
            "vermerge=1",
            "mobi=1",
            "issubtitle=1",
        ).joinToString("&")
        val text = runCatching { Http.get("https://search.kuwo.cn/r.s?$params") }.getOrElse { return SearchResult() }
        val payload = runCatching { JSONObject(text) }.getOrNull() ?: return SearchResult()
        val list = payload.optJSONArray("abslist") ?: return SearchResult()
        val items = mutableListOf<Song>()
        for (index in 0 until list.length()) {
            val entry = list.optJSONObject(index) ?: continue
            val musicRid = entry.optString("MUSICRID")
            if (musicRid.isEmpty()) continue
            val id = musicRid.replace("MUSIC_", "")
            if (id.isEmpty()) continue
            val duration = entry.optString("DURATION").toLongOrNull() ?: 0
            val coverPath = entry.optString("web_albumpic_short").trim()
            val albumPic = entry.optString("albumpic").trim()
            val artistPath = entry.optString("web_artistpic_short").trim()
            val resolvedCover = when {
                coverPath.isNotEmpty() -> "https://img1.kuwo.cn/star/albumcover/${coverPath.replace(Regex("^120/"), "500/")}"
                albumPic.startsWith("http", ignoreCase = true) -> albumPic.replace(Regex("^http:"), "https:")
                artistPath.isNotEmpty() -> "https://img1.kuwo.cn/star/starheads/${artistPath.replace(Regex("^120/"), "500/")}"
                else -> ""
            }
            items.add(
                Song(
                    source = "kw",
                    id = id,
                    name = decodeName(entry.optString("SONGNAME")),
                    singer = formatSinger(entry.optString("ARTIST")),
                    albumName = decodeName(entry.optString("ALBUM")),
                    albumId = entry.optString("ALBUMID"),
                    durationMs = duration * 1000,
                    qualitys = parseKuwoQualitys(entry.optString("N_MINFO")),
                    coverUrl = resolvedCover,
                )
            )
        }
        val total = payload.optString("TOTAL").toLongOrNull() ?: items.size.toLong()
        return SearchResult(items, total)
    }

    private fun parseKuwoQualitys(minfo: String): List<String> {
        if (minfo.isEmpty()) return emptyList()
        val qualitys = mutableListOf<String>()
        val matcher = Regex("level:(\\w+),bitrate:(\\d+),format:(\\w+),size:([\\w.]+)")
        for (part in minfo.split(";")) {
            val match = matcher.find(part) ?: continue
            when (match.groupValues[2]) {
                "4000" -> qualitys.add("flac24bit")
                "2000" -> qualitys.add("flac")
                "320" -> qualitys.add("320k")
                "128" -> qualitys.add("128k")
            }
        }
        return qualitys
    }

    private fun normalizeCoverUrl(value: String?): String {
        if (value.isNullOrEmpty()) return ""
        val secure = value.replace(Regex("^http:"), "https:")
        return if (secure.contains("?")) secure else "$secure?param=300y300"
    }
}
