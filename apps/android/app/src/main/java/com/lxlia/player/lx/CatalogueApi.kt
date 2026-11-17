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

data class CatalogueEntity(
    val id: String,
    val source: String,
    val kind: String,
    val name: String,
    val artist: String = "",
    val cover: String = "",
    val count: Int = 0,
    val song: Song? = null,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("source", source)
        .put("kind", kind)
        .put("name", name)
        .put("artist", artist)
        .put("cover", cover)
        .put("count", count)
        .apply { song?.let { put("song", it.toJson()) } }

    companion object {
        fun fromJson(json: JSONObject): CatalogueEntity = CatalogueEntity(
            id = json.optString("id"),
            source = json.optString("source"),
            kind = json.optString("kind"),
            name = json.optString("name"),
            artist = json.optString("artist"),
            cover = json.optString("cover"),
            count = json.optInt("count"),
            song = Song.fromJson(json.optJSONObject("song")),
        )
    }
}

data class CatalogueResult(
    val items: List<CatalogueEntity> = emptyList(),
    val total: Long = 0,
    val warning: String? = null,
    val hasMore: Boolean? = null,
)

/** 公开目录检索：歌曲/歌单/歌手/专辑/歌词/播客，聚合时歌单走四平台、其余走网易云。 */
object CatalogueApi {
    suspend fun search(
        host: LxHost,
        source: SearchSource,
        kind: String,
        query: String,
        page: Int,
        cancelled: () -> Boolean = { false },
        onProgress: (List<CatalogueEntity>, Long) -> Unit = { _, _ -> },
    ): CatalogueResult = withContext(Dispatchers.IO) {
        val sources = if (source == SearchSource.ALL) {
            if (kind == "songlist") listOf("kw", "kg", "wy", "tx") else listOf("wy")
        } else listOf(source.id)
        val collected = mutableListOf<CatalogueEntity>()
        val progressLock = Mutex()
        val totals = Array(sources.size) { 0L }
        val warnings = Array<String?>(sources.size) { null }
        val failed = Array(sources.size) { false }
        supervisorScope {
            sources.mapIndexed { index, platform ->
                async {
                    val seen = mutableSetOf<String>()
                    val all = mutableListOf<CatalogueEntity>()
                    var next = 1
                    var total = 0L
                    while (true) {
                        if (cancelled()) break
                        val result = try {
                            val params = JSONObject()
                                .put("source", platform)
                                .put("type", kind)
                                .put("query", query)
                                .put("page", next)
                                .put("limit", 30)
                            parse(host.catalogue("search", params.toString()))
                        } catch (error: Throwable) {
                            if (all.isEmpty()) {
                                failed[index] = true
                                return@async
                            }
                            warnings[index] = "网络中断，已保留获取的结果，请重新搜索重试"
                            break
                        }
                        total = maxOf(total, result.total)
                        val fresh = result.items.filter { seen.add("${it.source}:${it.kind}:${it.id}") }
                        all.addAll(fresh)
                        progressLock.withLock {
                            totals[index] = total
                            if (!cancelled()) {
                                collected.addAll(fresh)
                                val snapshot = collected.toList()
                                val totalCount = totals.sum()
                                withContext(Dispatchers.Main) { onProgress(snapshot, totalCount) }
                            }
                        }
                        if (result.items.isEmpty() || fresh.isEmpty()) {
                            if (all.size < total) warnings[index] = "平台已停止返回新结果，已显示全部可获取结果"
                            break
                        }
                        if (result.hasMore == false) break
                        if (total > result.items.size && next.toLong() * 30 >= total) break
                        if (total <= result.items.size && result.items.size < 30) break
                        next++
                    }
                }
            }.awaitAll()
        }
        val items = collected.toList()
        val warningList = warnings.filterNotNull().toMutableList()
        val failedCount = failed.count { it }
        if (failedCount == sources.size) throw IllegalStateException("公开检索暂不可用")
        if (failedCount > 0) warningList.add("部分平台暂时不可用，已显示其余结果")
        CatalogueResult(items, totals.sum(), warningList.joinToString("；").ifEmpty { null })
    }

    /** 实体详情（歌手/专辑/歌词/播客/歌单）歌曲列表：按页自动枚举。 */
    suspend fun tracks(
        host: LxHost,
        entity: CatalogueEntity,
        onProgress: (List<Song>, Long) -> Unit = { _, _ -> },
        cancelled: () -> Boolean = { false },
    ): SearchResult = withContext(Dispatchers.IO) {
        val items = mutableListOf<Song>()
        val seen = mutableSetOf<String>()
        var total = 0L
        var next = 1
        var warning: String? = null
        while (true) {
            if (cancelled()) break
            val result = try {
                val params = JSONObject()
                    .put("id", entity.id)
                    .put("source", entity.source)
                    .put("kind", entity.kind)
                    .put("page", next)
                    .put("limit", 50)
                parseTracks(host.catalogue("tracks", params.toString()))
            } catch (error: Throwable) {
                if (items.isEmpty()) throw error
                warning = "网络中断，已保留获取的歌曲，请重新打开重试"
                break
            }
            total = maxOf(total, result.total)
            var added = 0
            for (song in result.items) {
                if (seen.add("${song.source}:${song.id}")) {
                    items.add(song)
                    added++
                }
            }
            if (!cancelled()) onProgress(items.toList(), total)
            if (result.items.isEmpty() || added == 0) {
                if (items.size < total) warning = "平台已停止返回新结果"
                break
            }
            if (entity.kind == "album" || result.hasMore == false) break
            if (total > result.items.size && next.toLong() * 50 >= total) break
            if (total <= result.items.size && result.items.size < 50) break
            next++
        }
        SearchResult(items, total, warning)
    }

    private fun parse(value: String): CatalogueResult {
        val json = JSONObject(value)
        val items = mutableListOf<CatalogueEntity>()
        json.optJSONArray("items")?.let { array ->
            for (index in 0 until array.length()) array.optJSONObject(index)?.let { items.add(CatalogueEntity.fromJson(it)) }
        }
        return CatalogueResult(
            items = items,
            total = json.optLong("total"),
            hasMore = if (json.has("hasMore")) json.optBoolean("hasMore") else null,
        )
    }

    private fun parseTracks(value: String): SearchResult {
        val json = JSONObject(value)
        val items = mutableListOf<Song>()
        json.optJSONArray("items")?.let { array ->
            for (index in 0 until array.length()) Song.fromJson(array.optJSONObject(index))?.let(items::add)
        }
        return SearchResult(
            items,
            json.optLong("total"),
            json.optString("warning").ifEmpty { null },
            if (json.has("hasMore")) json.optBoolean("hasMore") else null,
        )
    }
}
