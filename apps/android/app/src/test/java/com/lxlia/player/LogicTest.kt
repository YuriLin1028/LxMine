package com.lxlia.player

import com.lxlia.player.lx.LyricParser
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import com.lxlia.player.model.SyncSourcePayload
import com.lxlia.player.ui.orderSongList
import com.lxlia.player.ui.parseLyricOffset
import com.lxlia.player.ui.stageBridgeCall
import com.lxlia.player.ui.supportsFullLiquidGlass
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import com.lxlia.player.lx.uniqueSyncSources

/** 纯逻辑单测：歌词解析、列表排序、JSON 往返与音源 id 去重。 */
class LogicTest {
    @Test
    fun completeGlassRequiresAndroid13() {
        assertEquals(false, supportsFullLiquidGlass(26))
        assertEquals(false, supportsFullLiquidGlass(31))
        assertEquals(false, supportsFullLiquidGlass(32))
        assertEquals(true, supportsFullLiquidGlass(33))
        assertEquals(true, supportsFullLiquidGlass(36))
    }

    @Test
    fun stageBridgePassesMetadataAsAnObject() {
        val payload = JSONObject().put("mode", "mine-7")
            .put("name", "歌词\"测试\n")
            .put("lines", JSONArray().put(JSONObject().put("timeMs", 1000).put("text", "第一行")))
        val call = stageBridgeCall("metadata", payload)
        assertTrue(call.startsWith("window.lxmineStage?.metadata({"))
        val received = JSONObject(call.substringAfter('(').dropLast(1))
        assertEquals("mine-7", received.getString("mode"))
        assertEquals("歌词\"测试\n", received.getString("name"))
        assertEquals("第一行", received.getJSONArray("lines").getJSONObject(0).getString("text"))
    }

    @Test
    fun stageBridgePassesTheNativePlaybackClock() {
        val call = stageBridgeCall("clock", JSONObject().put("positionMs", 3200).put("playing", true))
        val received = JSONObject(call.substringAfter('(').dropLast(1))
        assertEquals(3200, received.getInt("positionMs"))
        assertTrue(received.getBoolean("playing"))
    }

    @Test
    fun lyricOffsetMatchesHarmonyRoundingAndBounds() {
        assertEquals(-123L, parseLyricOffset(" -123.5 "))
        assertEquals(124L, parseLyricOffset("123.5"))
        assertEquals(1000L, parseLyricOffset("1e3"))
        assertEquals(10000L, parseLyricOffset("1e30"))
        assertEquals(-10000L, parseLyricOffset("-1e30"))
        assertNull(parseLyricOffset("NaN"))
        assertNull(parseLyricOffset("Infinity"))
        assertNull(parseLyricOffset("-"))
        assertNull(parseLyricOffset(""))
    }

    private fun song(id: String, name: String, singer: String, album: String = "") = Song(
        source = "wy",
        id = id,
        name = name,
        singer = singer,
        albumName = album,
        durationMs = 1000,
    )

    @Test
    fun parseLrcHandlesMultiTagsAndOffset() {
        val lrc = """
            [offset:100]
            [00:01.00]第一行
            [00:02.50][00:09.00]重复行
        """.trimIndent()
        val lines = LyricParser.parse(lrc)
        assertEquals(3, lines.size)
        assertEquals(1100L, lines[0].timeMs)
        assertEquals("第一行", lines[0].text)
        assertEquals(2600L, lines[1].timeMs)
        assertEquals(9100L, lines[2].timeMs)
    }

    @Test
    fun parseLrcHandlesLxWordFormat() {
        val lrc = "[1000,2000](0,500,0)你(500,500,0)好"
        val lines = LyricParser.parse(lrc)
        assertEquals(1, lines.size)
        assertEquals("你好", lines[0].text)
        assertEquals(2, lines[0].words.size)
        // 与鸿蒙一致：圆括号是绝对时间，尖括号才是相对行首的时间。
        assertEquals(0L, lines[0].words[0].timeMs)
        assertEquals(500L, lines[0].words[1].timeMs)
        assertEquals(1000L, lines[0].timeMs)
    }

    @Test
    fun lyricLineAlwaysSerializesWords() {
        val json = LyricLine(1000, "歌词").toJson()
        assertTrue(json.has("words"))
        assertEquals(0, json.getJSONArray("words").length())
    }

    @Test
    fun orderSongListSortsAndFilters() {
        val list = listOf(
            song("1", "B 歌", "张三", "专辑二"),
            song("2", "A 歌", "李四", "专辑一"),
            song("3", "C 歌", "张三", "专辑一"),
        )
        assertEquals(listOf("2", "1", "3"), orderSongList(list, "name", emptyList()).map { it.id })
        assertEquals(listOf("2", "1", "3"), orderSongList(list, "artist", emptyList()).map { it.id })
        // 中文按拼音排序：专辑二(er) 在 专辑一(yi) 之前，同专辑再按歌名。
        assertEquals(listOf("1", "2", "3"), orderSongList(list, "album", emptyList()).map { it.id })
        assertEquals(listOf("3", "1", "2"), orderSongList(list, "manual", listOf("wy:3", "wy:1", "wy:2")).map { it.id })
        assertEquals(listOf("1", "3"), orderSongList(list, "added", emptyList(), "张三").map { it.id })
    }

    @Test
    fun playlistRoundTripKeepsPcTracks() {
        val json = JSONArray()
            .put(
                JSONObject()
                    .put("id", "lx-1")
                    .put("name", "我喜欢的")
                    .put("kind", "lx")
                    .put("isFavorite", true)
                    .put("songs", JSONArray().put(song("1", "A", "B").toJson()))
                    .put("pcTracks", JSONArray().put(JSONObject().put("path", "D:/music/a.mp3")))
            )
            .toString()
        val parsed = MusicPlaylist.listFromJson(json)
        assertEquals(1, parsed.size)
        assertTrue(parsed[0].isFavorite)
        assertEquals(1, parsed[0].songs.size)
        assertNotNull(parsed[0].pcTracksJson)
        val again = MusicPlaylist.listFromJson(MusicPlaylist.listToJson(parsed))
        assertEquals(1, again[0].songs.size)
        assertTrue(again[0].pcTracksJson!!.contains("D:/music/a.mp3"))
    }

    @Test
    fun homeFeedSignatureIgnoresTextRefresh() {
        val base = HomeFeed(newSongs = listOf(song("1", "A", "B")))
        val sameLayout = HomeFeed(newSongs = listOf(song("1", "A", "B").copy(name = "A（新版）")))
        val otherLayout = HomeFeed(newSongs = listOf(song("2", "A", "B")))
        assertEquals(base.signature(), sameLayout.signature())
        assertTrue(base.signature() != otherLayout.signature())
    }

    @Test
    fun homeFeedJsonRoundTrip() {
        val feed = HomeFeed(newSongs = listOf(song("1", "A", "B")), dailySongs = listOf(song("2", "C", "D")))
        val parsed = HomeFeed.fromJson(feed.toJson().toString())
        assertNotNull(parsed)
        assertEquals(1, parsed!!.newSongs.size)
        assertEquals(1, parsed.dailySongs.size)
        assertEquals(feed.signature(), parsed.signature())
    }

    @Test
    fun uniqueSyncSourcesAssignsUniqueIds() {
        val sources = listOf(
            SyncSourcePayload(id = "same", name = "A", script = "a"),
            SyncSourcePayload(id = "same", name = "B", script = "b"),
            SyncSourcePayload(id = "same", name = "C", script = "c"),
        )
        val unique = uniqueSyncSources(sources)
        assertEquals(3, unique.map { it.id }.toSet().size)
        assertEquals(listOf("a", "b", "c"), unique.map { it.script })
    }
}
