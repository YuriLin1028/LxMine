package com.lxlia.player

import com.lxlia.player.lx.LanSyncClient
import com.lxlia.player.lx.LanSyncServer
import com.lxlia.player.lx.LanDevice
import com.lxlia.player.lx.LanPullReceiver
import com.lxlia.player.lx.mergeSyncedPlaylists
import com.lxlia.player.lx.readLanSyncHttpRequest
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.Song
import okio.Buffer
import okio.buffer
import okio.source
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.EOFException
import java.net.ProtocolException
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LanSyncTest {
    @Test
    fun outboundRetrievalUsesTheNormalConfirmationAndCachesItsReceipt() {
        val sender = LanSyncServer(confirmationTimeoutMs = 5000)
        val receiver = LanSyncServer(confirmationTimeoutMs = 5000)
        val executor = Executors.newFixedThreadPool(2)
        sender.setIdentity("sender", "Windows")
        receiver.setIdentity("receiver", "Android container")
        try {
            sender.start()
            receiver.start()
            val peer = LanDevice("sender", "Windows", "win32", "127.0.0.1", sender.currentPort(), 0)
            val client = LanPullReceiver("receiver", receiver)
            val bundle = JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender"},"settings":{},"sources":[],"playlists":[]}""")
            for (accepted in listOf(true, false)) {
                val sent = executor.submit<Boolean> { sender.offerPush("receiver", bundle) }
                val deadline = System.nanoTime() + 2_000_000_000
                while (sender.pullRequests().length() == 0 && System.nanoTime() < deadline) Thread.sleep(5)
                val id = sender.pullRequests().getJSONObject(0).getString("id")
                val received = executor.submit { client.receive(peer, id) }
                while (receiver.pollIncoming() == null && System.nanoTime() < deadline) Thread.sleep(5)
                val incoming = receiver.pollIncoming()
                assertNotNull(incoming)
                assertTrue(!sent.isDone)
                if (accepted) assertTrue(receiver.beginApply(incoming!!.id))
                receiver.respond(incoming!!.id, accepted)
                assertEquals(accepted, sent.get(3, TimeUnit.SECONDS))
                received.get(3, TimeUnit.SECONDS)
                assertEquals(0, sender.pullRequests().length())
                client.receive(peer, id)
                assertNull(receiver.pollIncoming())
            }
        } finally {
            sender.stop()
            receiver.stop()
            executor.shutdownNow()
        }
    }

    @Test
    fun receiverListensOnIpv4AndCanRestartAfterItsSocketIsClosed() {
        val server = LanSyncServer()
        server.setIdentity("receiver", "Android")
        try {
            val port = server.start()
            assertEquals(port, server.start())
            server.stop()
            assertEquals(0, server.currentPort())
            Socket("127.0.0.1", server.start()).use { socket ->
                socket.soTimeout = 2000
                socket.getOutputStream().apply {
                    write("GET /lxlia-sync/ping HTTP/1.1\r\nHost: localhost\r\n\r\n".toByteArray())
                    flush()
                }
                val response = socket.getInputStream().source().buffer().readUtf8()
                assertTrue(response.startsWith("HTTP/1.1 200 OK"))
                assertEquals("android", JSONObject(response.substringAfter("\r\n\r\n")).getString("platform"))
            }
        } finally {
            server.stop()
        }
    }

    private fun sendBundle(server: LanSyncServer): Socket {
        val socket = Socket("127.0.0.1", server.currentPort())
        socket.soTimeout = 3000
        val body = """{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender"},"settings":{},"sources":[],"playlists":[]}""".toByteArray()
        socket.getOutputStream().apply {
            write("POST /lxlia-sync/push HTTP/1.1\r\nContent-Length: ${body.size}\r\n\r\n".toByteArray())
            write(body)
            flush()
        }
        return socket
    }

    @Test
    fun fixedLengthReadsFragmentedUtf8Body() {
        val body = "{\"name\":\"同步测试🎵\"}"
        val bytes = ("POST /lxlia-sync/push HTTP/1.1\r\n" +
            "Content-Length: ${body.toByteArray().size}\r\n\r\n" + body).toByteArray()
        val fragmented = object : ByteArrayInputStream(bytes) {
            override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
                super.read(buffer, offset, minOf(length, 3))
        }
        val request = readLanSyncHttpRequest(fragmented, 1024) { error("Unexpected continue") }
        assertEquals("POST", request.method)
        assertEquals("/lxlia-sync/push", request.path)
        assertEquals(body, request.body)
    }

    @Test
    fun chunkedReadsExtensionsTrailersAndSplitUtf8Characters() {
        val body = "{\"name\":\"同步测试🎵\"}"
        val bytes = body.toByteArray()
        val wire = Buffer().writeUtf8("POST /lxlia-sync/push HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n")
        val parts = listOf(bytes.copyOfRange(0, 11), bytes.copyOfRange(11, bytes.size))
        parts.forEach { part ->
            wire.writeUtf8("${part.size.toString(16)};test=value\r\n").write(part).writeUtf8("\r\n")
        }
        wire.writeUtf8("0\r\nX-Test: complete\r\n\r\n")
        val request = readLanSyncHttpRequest(wire.inputStream(), 1024) { error("Unexpected continue") }
        assertEquals(body, request.body)
    }

    @Test
    fun pingDoesNotWaitForABody() {
        val request = readLanSyncHttpRequest(
            ByteArrayInputStream("GET /lxlia-sync/ping?test=1 HTTP/1.1\r\nHost: local\r\n\r\n".toByteArray()),
            1024,
        ) { error("Unexpected continue") }
        assertEquals("/lxlia-sync/ping", request.path)
        assertEquals("", request.body)
    }

    @Test
    fun oversizedRequestsAreRejectedBeforeContinue() {
        val input = ByteArrayInputStream("POST / HTTP/1.1\r\nContent-Length: 9\r\nExpect: 100-continue\r\n\r\n".toByteArray())
        assertThrows(ProtocolException::class.java) {
            readLanSyncHttpRequest(input, 8) { error("Oversized request was acknowledged") }
        }
    }

    @Test
    fun chunkedBodyLimitCountsAllChunks() {
        val input = ByteArrayInputStream("POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n4\r\n1234\r\n5\r\n56789\r\n0\r\n\r\n".toByteArray())
        assertThrows(ProtocolException::class.java) { readLanSyncHttpRequest(input, 8) {} }
    }

    @Test
    fun incompleteBodiesAndInvalidFramingAreRejected() {
        val incomplete = ByteArrayInputStream("POST / HTTP/1.1\r\nContent-Length: 5\r\n\r\nab".toByteArray())
        assertThrows(EOFException::class.java) { readLanSyncHttpRequest(incomplete, 1024) {} }
        val ambiguous = ByteArrayInputStream("POST / HTTP/1.1\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n".toByteArray())
        assertThrows(ProtocolException::class.java) { readLanSyncHttpRequest(ambiguous, 1024) {} }
        val invalidChunk = ByteArrayInputStream("POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\nZZ\r\n".toByteArray())
        assertThrows(ProtocolException::class.java) { readLanSyncHttpRequest(invalidChunk, 1024) {} }
    }

    @Test
    fun serverAcknowledgesContinueBeforeReadingOrPresentingTheBundle() {
        val server = LanSyncServer()
        server.setIdentity("receiver", "Android")
        try {
            val port = server.start()
            Socket("127.0.0.1", port).use { socket ->
                socket.soTimeout = 2000
                val body = """{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender","name":"回归测试"},"settings":{},"sources":[],"playlists":[]}""".toByteArray()
                val output = socket.getOutputStream()
                output.write(("POST /lxlia-sync/push HTTP/1.1\r\nExpect: 100-continue\r\n" +
                    "Content-Length: ${body.size}\r\n\r\n").toByteArray())
                output.flush()
                val source = socket.getInputStream().source().buffer()
                assertEquals("HTTP/1.1 100 Continue", source.readUtf8LineStrict())
                assertEquals("", source.readUtf8LineStrict())
                assertNull(server.pollIncoming())
                output.write(body)
                output.flush()
                val deadline = System.nanoTime() + 2_000_000_000
                while (server.pollIncoming() == null && System.nanoTime() < deadline) Thread.sleep(5)
                val incoming = server.pollIncoming()
                assertNotNull(incoming)
                assertEquals("回归测试", incoming!!.peerName)
                server.respond(incoming.id, true)
                assertEquals("HTTP/1.1 200 OK", source.readUtf8LineStrict())
                while (source.readUtf8LineStrict().isNotEmpty()) { }
                assertTrue(JSONObject(source.readUtf8()).getBoolean("accepted"))
                assertNull(server.pollIncoming())
            }
        } finally {
            server.stop()
        }
    }

    @Test
    fun expiredRequestsCannotBeApplied() {
        val server = LanSyncServer(confirmationTimeoutMs = 1000)
        server.setIdentity("receiver", "Android")
        try {
            server.start()
            sendBundle(server).use { socket ->
                val response = socket.getInputStream().source().buffer().readUtf8()
                assertTrue(response.contains("接收方确认超时"))
                assertNull(server.pollIncoming())
                assertTrue(!server.beginApply("1"))
            }
        } finally {
            server.stop()
        }
    }

    @Test
    fun applyingRequestSurvivesItsConfirmationDeadline() {
        val server = LanSyncServer(confirmationTimeoutMs = 1000)
        server.setIdentity("receiver", "Android")
        try {
            server.start()
            sendBundle(server).use { socket ->
                val deadline = System.nanoTime() + 500_000_000
                while (server.pollIncoming() == null && System.nanoTime() < deadline) Thread.sleep(5)
                val incoming = server.pollIncoming()
                assertNotNull(incoming)
                assertTrue(server.beginApply(incoming!!.id))
                assertTrue(!server.beginApply(incoming.id))
                Thread.sleep(1200)
                assertEquals(incoming.id, server.pollIncoming()?.id)
                server.respond(incoming.id, true)
                val response = socket.getInputStream().source().buffer().readUtf8().substringAfter("\r\n\r\n")
                assertTrue(JSONObject(response).getBoolean("accepted"))
            }
        } finally {
            server.stop()
        }
    }

    @Test
    fun parseManualEndpointHandlesDefaultAndExplicitPorts() {
        assertEquals("192.168.1.25" to 41300, LanSyncClient.parseManualEndpoint("192.168.1.25"))
        assertEquals("192.168.1.25" to 41302, LanSyncClient.parseManualEndpoint(" 192.168.1.25:41302 "))
        assertEquals("[::1]" to 41300, LanSyncClient.parseManualEndpoint("[::1]"))
        assertEquals("[::1]" to 41301, LanSyncClient.parseManualEndpoint("[::1]:41301"))
        assertNull(LanSyncClient.parseManualEndpoint(""))
        assertNull(LanSyncClient.parseManualEndpoint("192.168.1.25:99999"))
    }

    @Test
    fun mergeSyncedPlaylistsMatchesFavoriteAndIdByUpdatedAt() {
        val songA = Song(source = "wy", id = "1", name = "A", singer = "S")
        val songB = Song(source = "wy", id = "2", name = "B", singer = "S")
        val local = listOf(
            MusicPlaylist(id = "local-fav", name = "我喜欢的", isFavorite = true, songs = listOf(songA), updatedAt = 100L),
            MusicPlaylist(id = "pl-1", name = "旧名字", songs = listOf(songA), updatedAt = 200L),
            MusicPlaylist(id = "pl-keep", name = "本地更新", songs = listOf(songA, songB), updatedAt = 500L),
        )
        val incoming = listOf(
            MusicPlaylist(id = "remote-fav", name = "我喜欢的", isFavorite = true, songs = listOf(songA, songB), updatedAt = 300L),
            MusicPlaylist(id = "pl-1", name = "新名字", songs = listOf(songB), updatedAt = 400L),
            MusicPlaylist(id = "pl-keep", name = "远端旧版", songs = emptyList(), updatedAt = 150L),
            MusicPlaylist(id = "pl-new", name = "远端新增", songs = listOf(songB), updatedAt = 250L),
        )
        val merged = mergeSyncedPlaylists(local, incoming)
        assertEquals(4, merged.size)
        val fav = merged.first { it.isFavorite }
        assertEquals("local-fav", fav.id)
        assertEquals(2, fav.songs.size)
        assertEquals("新名字", merged.first { it.id == "pl-1" }.name)
        assertEquals("本地更新", merged.first { it.id == "pl-keep" }.name)
        assertEquals(1, merged.first { it.id == "pl-new" }.songs.size)
    }

    @Test
    fun autoPlaylistsEndpointHonorsLanAutoSyncSwitch() {
        val server = LanSyncServer()
        server.setIdentity("receiver", "Android")
        var enabled = false
        var receivedFrom = ""
        var receivedCount = 0
        server.autoSyncEnabled = { enabled }
        server.onAutoPlaylists = { _, peerName, lists ->
            receivedFrom = peerName
            receivedCount = lists.size
            true
        }
        try {
            val port = server.start()
            val peer = LanDevice("receiver", "Android", "android", "127.0.0.1", port, 0)
            val payload = JSONObject()
                .put("protocol", "lxlia-lansync/1")
                .put("version", 1)
                .put("device", JSONObject().put("id", "desktop-1").put("name", "Windows PC"))
                .put(
                    "playlists",
                    org.json.JSONArray().put(
                        MusicPlaylist(id = "pl-1", name = "通勤歌单", updatedAt = 1000L).toJson(),
                    ),
                )
            assertEquals(false, LanSyncClient.pushAutoPlaylists(peer, payload))
            assertEquals(0, receivedCount)

            enabled = true
            assertEquals(true, LanSyncClient.pushAutoPlaylists(peer, payload))
            assertEquals("Windows PC", receivedFrom)
            assertEquals(1, receivedCount)
        } finally {
            server.stop()
        }
    }
}
