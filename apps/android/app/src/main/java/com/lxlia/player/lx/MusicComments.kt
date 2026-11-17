package com.lxlia.player.lx

import com.lxlia.player.model.Song
import org.json.JSONObject

data class SongComment(
    val id: String,
    val nick: String,
    val avatar: String,
    val content: String,
    val liked: Int,
    val timeMs: Long,
    val location: String,
)

data class SongComments(
    val platform: String,
    val total: Long,
    val hot: List<SongComment>,
    val latest: List<SongComment>,
)

/** 只读取原平台公开评论，不提供登录、点赞或发表入口。 */
object MusicComments {
    private fun getJson(url: String, referer: String): String =
        Http.get(url, referer, timeoutMs = 12000)

    private fun clean(value: String?): String {
        if (value.isNullOrEmpty()) return ""
        return value
            .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
            .replace(Regex("<[^>]+>"), "")
            .replace(Regex("&#(\\d+);")) { match -> String(Character.toChars(match.groupValues[1].toIntOrNull() ?: 0)) }
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .trim()
    }

    private fun wyComment(item: JSONObject): SongComment = SongComment(
        id = item.optString("commentId"),
        nick = item.optJSONObject("user")?.optString("nickname").orEmpty().ifEmpty { "网易云用户" },
        avatar = item.optJSONObject("user")?.optString("avatarUrl").orEmpty(),
        content = clean(item.optString("content")),
        liked = item.optInt("likedCount"),
        timeMs = item.optLong("time"),
        location = item.optJSONObject("ipLocation")?.optString("location").orEmpty().ifEmpty { item.optString("location") },
    )

    private fun txComment(item: JSONObject): SongComment = SongComment(
        id = item.optString("commentid"),
        nick = item.optString("nick").ifEmpty { "QQ 音乐用户" },
        avatar = item.optString("avatarurl"),
        content = clean(item.optString("rootcommentcontent")),
        liked = item.optInt("praisenum"),
        timeMs = item.optLong("time") * 1000,
        location = item.optString("location"),
    )

    private fun netease(id: String, platform: String = "网易云音乐"): SongComments {
        val url = "https://music.163.com/api/v1/resource/comments/R_SO_4_$id?limit=50&offset=0"
        val payload = JSONObject(getJson(url, "https://music.163.com/"))
        val hot = mutableListOf<SongComment>()
        payload.optJSONArray("hotComments")?.let { array ->
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (clean(item.optString("content")).isNotEmpty()) hot.add(wyComment(item))
            }
        }
        val latest = mutableListOf<SongComment>()
        payload.optJSONArray("comments")?.let { array ->
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (clean(item.optString("content")).isNotEmpty()) latest.add(wyComment(item))
            }
        }
        return SongComments(platform, payload.optLong("total", latest.size.toLong()), hot.take(6), latest.take(40))
    }

    private fun qq(songmid: String): SongComments {
        val detail = JSONObject(
            getJson(
                "https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=$songmid&format=json",
                "https://y.qq.com/",
            )
        )
        val songId = detail.optJSONArray("data")?.optJSONObject(0)?.optLong("id") ?: 0L
        if (songId == 0L) throw IllegalStateException("未找到 QQ 音乐评论")
        val url = "https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?g_tk=5381&loginUin=0&hostUin=0&format=json" +
            "&inCharset=utf8&outCharset=GB2312&notice=0&platform=yqq.json&needNewCode=0&cid=205360772&reqtype=2" +
            "&biztype=1&topid=$songId&cmd=8&needmusiccrit=0&pagenum=0&pagesize=40"
        val payload = JSONObject(getJson(url, "https://y.qq.com/"))
        if (payload.optInt("code", 0) != 0) throw IllegalStateException("QQ 音乐评论读取失败")
        val hot = mutableListOf<SongComment>()
        payload.optJSONObject("hot_comment")?.optJSONArray("commentlist")?.let { array ->
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (clean(item.optString("rootcommentcontent")).isNotEmpty()) hot.add(txComment(item))
            }
        }
        val latest = mutableListOf<SongComment>()
        payload.optJSONObject("comment")?.optJSONArray("commentlist")?.let { array ->
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (clean(item.optString("rootcommentcontent")).isNotEmpty()) latest.add(txComment(item))
            }
        }
        return SongComments(
            "QQ 音乐",
            payload.optJSONObject("comment")?.optLong("commenttotal") ?: latest.size.toLong(),
            hot.take(6),
            latest.take(40),
        )
    }

    private fun neteaseFallback(song: Song): SongComments {
        val singer = song.singer.split("、").firstOrNull().orEmpty().split("&").firstOrNull().orEmpty().split(",").firstOrNull().orEmpty().trim()
        val query = java.net.URLEncoder.encode("${song.name} $singer".trim(), "UTF-8")
        val search = JSONObject(getJson("https://music.163.com/api/search/get?s=$query&type=1&limit=5&offset=0", "https://music.163.com/"))
        val match = search.optJSONObject("result")?.optJSONArray("songs")?.optJSONObject(0)
        val id = match?.optString("id").orEmpty()
        if (id.isEmpty()) throw IllegalStateException("未找到这首歌曲的公开评论")
        return netease(id, "网易云音乐 · 同名歌曲")
    }

    fun fetch(song: Song): SongComments = when (song.source) {
        "wy" -> netease(song.id)
        "tx" -> qq(song.id)
        else -> neteaseFallback(song)
    }

    fun platform(source: String?): String = when (source) {
        "tx" -> "QQ 音乐"
        "wy" -> "网易云音乐"
        else -> "网络平台"
    }
}
