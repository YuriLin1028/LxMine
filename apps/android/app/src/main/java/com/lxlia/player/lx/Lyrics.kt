package com.lxlia.player.lx

import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.LyricWord
import com.lxlia.player.model.Song
import org.json.JSONObject

/** 原生歌词时间轴；精确逐字来自增强 LRC / LX 逐字格式，普通 LRC 保持逐行高亮。 */
object LyricParser {
    private fun stamp(value: String): Long {
        val parts = value.replace(Regex("^[\\[<]|[\\]>]$"), "").split(Regex("[:.]"))
        val first = parts.getOrNull(0)?.toLongOrNull() ?: 0
        val second = parts.getOrNull(1)?.toLongOrNull() ?: 0
        val third = (parts.getOrNull(2) ?: "").padEnd(3, '0').take(3).toLongOrNull() ?: 0
        return first * 60000 + second * 1000 + third
    }

    /** 解析多时间标签、offset、增强 LRC 与 LX 的 [start,duration]<offset,duration>。 */
    fun parse(lrc: String?): List<LyricLine> {
        if (lrc.isNullOrEmpty()) return emptyList()
        val result = mutableListOf<LyricLine>()
        val offset = Regex("\\[offset:([+-]?\\d+)]", RegexOption.IGNORE_CASE).find(lrc)
            ?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        for (row in lrc.split(Regex("\\r?\\n"))) {
            val lx = Regex("^\\[(\\d+),(\\d+)](.*)$").find(row)
            if (lx != null) {
                val start = lx.groupValues[1].toLong()
                val body = lx.groupValues[3]
                val words = mutableListOf<LyricWord>()
                val matcher = Regex("[<(](\\d+),(\\d+)(?:,\\d+)?[>)]([^<(]*)").findAll(body)
                for (part in matcher) {
                    val relative = part.value.startsWith("(")
                    val time = (if (relative) part.groupValues[1].toLong() else start + part.groupValues[1].toLong()) + offset
                    words.add(LyricWord(part.groupValues[3], time, part.groupValues[2].toLongOrNull() ?: 0))
                }
                val text = if (words.isNotEmpty()) {
                    words.joinToString("") { it.text }
                } else {
                    body.replace(Regex("[<(]\\d+,\\d+(?:,\\d+)?[>)]"), "").trim()
                }
                if (text.isNotEmpty()) result.add(LyricLine(start + offset, text, words))
                continue
            }
            val tagRegex = Regex("\\[\\d{1,3}:\\d{2}(?:[.:]\\d{1,3})?]")
            val tags = tagRegex.findAll(row).map { it.value }.toList()
            if (tags.isEmpty()) continue
            val tagBody = tagRegex.replace(row, "").trim()
            val text = tagBody
                .replace(Regex("<\\d{1,3}:\\d{2}(?:[.:]\\d{1,3})?>"), "")
                .replace(Regex("<-?\\d+,-?\\d+>"), "")
            for (tag in tags) {
                val words = mutableListOf<LyricWord>()
                val relativeMatcher = Regex("<(-?\\d+),(-?\\d+)>([^<]*)").findAll(tagBody)
                for (relative in relativeMatcher) {
                    words.add(
                        LyricWord(
                            relative.groupValues[3],
                            stamp(tag) + (relative.groupValues[1].toLongOrNull() ?: 0) + offset,
                            (relative.groupValues[2].toLongOrNull() ?: 0).coerceAtLeast(0),
                        )
                    )
                }
                val matcher = Regex("(<\\d{1,3}:\\d{2}(?:[.:]\\d{1,3})?>)([^<]*)").findAll(tagBody)
                for (part in matcher) {
                    words.add(
                        LyricWord(
                            part.groupValues[2],
                            stamp(part.groupValues[1]) + offset + stamp(tag) - stamp(tags[0]),
                            0,
                        )
                    )
                }
                for (index in 0 until words.size - 1) {
                    words[index] = words[index].copy(
                        durationMs = (words[index + 1].timeMs - words[index].timeMs).coerceAtLeast(0)
                    )
                }
                result.add(LyricLine(stamp(tag) + offset, text, words))
            }
        }
        result.sortBy { it.timeMs }
        for (index in result.indices) {
            val words = result[index].words
            if (words.isNotEmpty() && words.last().durationMs == 0L) {
                val next = result.getOrNull(index + 1)?.timeMs ?: (words.last().timeMs + 1800)
                val updated = words.toMutableList()
                updated[updated.lastIndex] = updated.last().copy(durationMs = (next - updated.last().timeMs).coerceAtLeast(0))
                result[index] = result[index].copy(words = updated)
            }
        }
        return result
    }

    fun findIndex(lines: List<LyricLine>, positionMs: Long): Int {
        var low = 0
        var high = lines.size - 1
        var answer = -1
        while (low <= high) {
            val mid = (low + high) / 2
            if (lines[mid].timeMs <= positionMs) {
                answer = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return answer
    }

    fun alignAuxToMain(main: List<LyricLine>, aux: List<LyricLine>, maxDiffMs: Long = 650L): List<LyricLine> {
        if (aux.isEmpty()) return emptyList()
        if (main.isEmpty()) return aux
        return aux.mapNotNull { item ->
            val clean = item.text.trim()
            if (clean.isEmpty()) return@mapNotNull null
            var bestTime = item.timeMs
            var bestDiff = maxDiffMs + 1
            for (m in main) {
                val diff = kotlin.math.abs(m.timeMs - item.timeMs)
                if (diff < bestDiff) {
                    bestDiff = diff
                    bestTime = m.timeMs
                    if (diff == 0L) break
                }
            }
            LyricLine(if (bestDiff <= maxDiffMs) bestTime else item.timeMs, clean, emptyList())
        }
    }
}

data class PublicLyricBundle(
    val lines: List<LyricLine> = emptyList(),
    val translation: List<LyricLine> = emptyList(),
    val romaji: List<LyricLine> = emptyList(),
)

/** 音源未提供歌词时，读取歌曲原平台的公开歌词；不参与播放地址解析。 */
object LyricService {
    fun publicBundle(song: Song): PublicLyricBundle {
        val id = java.net.URLEncoder.encode(song.id, "UTF-8")
        return when (song.source) {
            "wy" -> {
                val data = runCatching {
                    JSONObject(Http.get("https://music.163.com/api/song/lyric?id=$id&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1&yrv=-1", "https://music.163.com/"))
                }.getOrNull() ?: return PublicLyricBundle()
                PublicLyricBundle(
                    lines = LyricParser.parse(text(data, "yrc") ?: text(data, "lrc")),
                    translation = LyricParser.parse(text(data, "ytlrc") ?: text(data, "tlyric")),
                    romaji = LyricParser.parse(text(data, "yromalrc") ?: text(data, "romalrc")),
                )
            }
            "tx" -> {
                val data = runCatching {
                    JSONObject(
                        Http.get(
                            "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=$id&format=json&nobase64=1",
                            "https://y.qq.com/",
                        )
                    )
                }.getOrNull() ?: return PublicLyricBundle()
                val lyric = htmlDecode(data.optString("lyric"))
                val trans = htmlDecode(data.optString("trans"))
                PublicLyricBundle(LyricParser.parse(lyric), LyricParser.parse(trans))
            }
            "kg" -> {
                val search = runCatching {
                    JSONObject(
                        Http.get(
                            "https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=" +
                                java.net.URLEncoder.encode(song.name, "UTF-8") +
                                "&duration=${song.durationMs}&hash=" + java.net.URLEncoder.encode(song.hash ?: song.id, "UTF-8")
                        )
                    )
                }.getOrNull() ?: return PublicLyricBundle()
                val candidate = search.optJSONArray("candidates")?.optJSONObject(0) ?: return PublicLyricBundle()
                val data = runCatching {
                    JSONObject(
                        Http.get(
                            "https://lyrics.kugou.com/download?ver=1&client=pc&id=" +
                                java.net.URLEncoder.encode(candidate.optString("id"), "UTF-8") +
                                "&accesskey=" + java.net.URLEncoder.encode(candidate.optString("accesskey"), "UTF-8") +
                                "&fmt=lrc&charset=utf8"
                        )
                    )
                }.getOrNull() ?: return PublicLyricBundle()
                val content = data.optString("content")
                val decoded = if (content.isEmpty()) "" else String(android.util.Base64.decode(content, android.util.Base64.DEFAULT))
                PublicLyricBundle(LyricParser.parse(decoded))
            }
            else -> {
                val data = runCatching {
                    JSONObject(Http.get("https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=$id"))
                }.getOrNull() ?: return PublicLyricBundle()
                val list = data.optJSONObject("data")?.optJSONArray("lrclist") ?: return PublicLyricBundle()
                val lines = mutableListOf<LyricLine>()
                for (index in 0 until list.length()) {
                    val row = list.optJSONObject(index) ?: continue
                    val seconds = row.optString("time").toDoubleOrNull() ?: continue
                    lines.add(LyricLine(Math.round(seconds * 1000), row.optString("lineLyric")))
                }
                PublicLyricBundle(lines = lines)
            }
        }
    }

    private fun text(json: JSONObject, key: String): String? =
        json.optJSONObject(key)?.optString("lyric")?.takeIf { it.isNotEmpty() }

    private fun htmlDecode(value: String): String = value
        .replace(Regex("&#(\\d+);")) { match -> String(Character.toChars(match.groupValues[1].toIntOrNull() ?: 0)) }
        .replace("&amp;", "&")
}
