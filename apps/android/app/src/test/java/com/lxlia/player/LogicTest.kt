package com.lxlia.player

import com.lxlia.player.lx.HomeFeedApi
import com.lxlia.player.lx.LyricParser
import com.lxlia.player.model.HomeFeed
import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import com.lxlia.player.model.SyncSourcePayload
import com.lxlia.player.ui.LyricPreferences
import com.lxlia.player.ui.MULTICOLOR_ASSET_ICONS
import com.lxlia.player.ui.orderSongList
import com.lxlia.player.ui.parseLyricOffset
import com.lxlia.player.ui.parsePlaylists
import com.lxlia.player.ui.playModeIcon
import com.lxlia.player.ui.stageBridgeCall
import com.lxlia.player.ui.supportsFullLiquidGlass
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    @Test
    fun playModeIconsCoverAllFourModes() {
        assertEquals("ic_repeat.svg", playModeIcon("列表循环"))
        assertEquals("ic_repeat_one.svg", playModeIcon("单曲循环"))
        assertEquals("ic_shuffle.svg", playModeIcon("随机播放"))
        assertEquals("ic_order_seq.svg", playModeIcon("顺序播放"))
    }

    @Test
    fun lyricPreferencesRoundTripsAndClampsLyricScale() {
        val defaults = LyricPreferences()
        assertEquals("#7DD3FC", defaults.primary)
        assertEquals("#A5B4FC", defaults.secondary)

        val prefs = LyricPreferences(lyricScale = 1.25f, showTranslation = true, showRomaji = true)
        val restored = LyricPreferences.fromJson(prefs.toJson().toString())
        assertEquals(1.25f, restored.lyricScale, 0.001f)
        assertTrue(restored.showRomaji)
        assertEquals(0.55f, LyricPreferences.fromJson("""{"lyricScale":0.2}""").lyricScale, 0.001f)
        assertEquals(1.50f, LyricPreferences.fromJson("""{"lyricScale":2.5}""").lyricScale, 0.001f)

        val legacyHex = "#" + "F4D2" + "8A"
        val legacySage = "#" + "8FB2" + "A6"
        val migrated = LyricPreferences.fromJson("""{"colorMode":"cover-gradient","primary":"$legacyHex","secondary":"$legacySage"}""")
        assertEquals("#7DD3FC", migrated.primary)
        assertEquals("#A5B4FC", migrated.secondary)
    }

    @Test
    fun personalizedTasteExtractsTopArtistsAndBlendsDaily30() {
        val fav = MusicPlaylist(
            id = "fav",
            name = "我喜欢的",
            isFavorite = true,
            songs = listOf(
                song("1", "晴天", "周杰伦"),
                song("2", "七里香", "周杰伦"),
                song("3", "泡沫", "邓紫棋"),
            ),
        )
        val recent = listOf(
            song("4", "光年之外", "邓紫棋"),
            song("5", "江南", "林俊杰"),
            song("6", "纯伴奏", "未知歌手"),
        )
        val topArtists = HomeFeedApi.extractTopTasteArtists(listOf(fav), recent, maxArtists = 3)
        assertEquals(listOf("周杰伦", "邓紫棋", "林俊杰"), topArtists)

        val base = (1..25).map { song("b-$it", "新歌$it", "歌手$it") }
        val personal = (1..15).map { song("p-$it", "定制$it", "周杰伦") }
        val blended = HomeFeedApi.blendPersonalizedDaily(base, personal, dayNumber = 20000L, targetCount = 30)
        assertEquals(30, blended.size)
        assertTrue(blended.any { it.id.startsWith("p-") })
        assertTrue(blended.any { it.id.startsWith("b-") })

        val rotated = HomeFeedApi.extractTopTasteArtists(listOf(fav), recent, maxArtists = 2, seedOffset = 1)
        assertEquals(listOf("邓紫棋", "林俊杰"), rotated)
    }

    @Test
    fun parsePlaylistsMarksNamedFavoriteAndMulticolorIconsAreProtected() {
        val raw = JSONArray()
            .put(JSONObject().put("id", "lx-custom").put("name", "我喜欢的").put("kind", "lx"))
            .toString()
        val parsed = parsePlaylists(raw)
        assertEquals(1, parsed.size)
        assertTrue(parsed[0].isFavorite)

        assertTrue("ic_heart_fill.svg" in MULTICOLOR_ASSET_ICONS)
        assertTrue("ic_style_wand.svg" in MULTICOLOR_ASSET_ICONS)
        assertTrue("ic_sparkle.svg" in MULTICOLOR_ASSET_ICONS)
        assertTrue("chip_music_on.svg" !in MULTICOLOR_ASSET_ICONS)
    }

    @Test
    fun importedFavoriteNamedPlaylistsStayIndependentAndHealDuplicateFavorites() {
        val songJson = JSONObject().put("id", "101").put("source", "wy").put("name", "晴天").put("singer", "周杰伦")
        val importedRaw = JSONArray()
            .put(JSONObject().put("id", "lx-imp-1").put("name", "我的收藏").put("kind", "lx").put("songs", JSONArray().put(songJson)))
            .put(JSONObject().put("id", "lx-imp-2").put("name", "我喜欢的").put("kind", "lx").put("isFavorite", true).put("songs", JSONArray().put(songJson)))
            .toString()
        val imported = parsePlaylists(importedRaw, imported = true)
        assertEquals(2, imported.size)
        assertFalse(imported[0].isFavorite)
        assertEquals("我的收藏", imported[0].name)
        assertFalse(imported[1].isFavorite)
        assertEquals("我喜欢的", imported[1].name)

        // v1.3.0 auto-heal: keep index 0 as the single built-in favorite and demote trapped duplicate
        val damagedRaw = JSONArray()
            .put(JSONObject().put("id", "builtin-fav").put("name", "我的收藏").put("kind", "lx").put("isFavorite", true))
            .put(JSONObject().put("id", "lx-trapped").put("name", "我的收藏").put("kind", "lx").put("isFavorite", true).put("songs", JSONArray().put(songJson)))
            .toString()
        val healed = parsePlaylists(damagedRaw)
        assertEquals(2, healed.size)
        assertTrue(healed[0].isFavorite)
        assertEquals("builtin-fav", healed[0].id)
        assertFalse(healed[1].isFavorite)
        assertEquals("lx-trapped", healed[1].id)
        assertEquals(1, healed[1].songs.size)
    }
}
