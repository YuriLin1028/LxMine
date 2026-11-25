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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
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
    private val testTrustToken = "0123456789abcdef0123456789abcdef"

    @Test
    fun outboundRetrievalUsesTheNormalConfirmationAndCachesItsReceipt() {
        val sender = LanSyncServer(confirmationTimeoutMs = 5000)
        val receiver = LanSyncServer(confirmationTimeoutMs = 5000)
        val executor = Executors.newFixedThreadPool(2)
        sender.setIdentity("sender", "Windows")
        receiver.setIdentity("receiver", "Android container")
        receiver.verifyTrust = { peerId, token -> peerId == "sender" && token == testTrustToken }
        try {
            sender.start()
            receiver.start()
            val peer = LanDevice("sender", "Windows", "win32", "127.0.0.1", sender.currentPort(), 0)
            val client = LanPullReceiver("receiver", receiver)
            val bundle = JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender"},"trustToken":"$testTrustToken","settings":{},"sources":[],"playlists":[]}""")
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
        val body = """{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender"},"trustToken":"$testTrustToken","settings":{},"sources":[],"playlists":[]}""".toByteArray()
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
        server.verifyTrust = { peerId, token -> peerId == "sender" && token == testTrustToken }
        try {
            val port = server.start()
            Socket("127.0.0.1", port).use { socket ->
                socket.soTimeout = 2000
                val body = """{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender","name":"回归测试"},"trustToken":"$testTrustToken","settings":{},"sources":[],"playlists":[]}""".toByteArray()
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
        server.verifyTrust = { peerId, token -> peerId == "sender" && token == testTrustToken }
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
        server.verifyTrust = { peerId, token -> peerId == "sender" && token == testTrustToken }
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
    fun mergeSyncedPlaylistsPreservesImportedFavoriteNamedPlaylistSeparately() {
        val songA = Song(source = "wy", id = "1", name = "A", singer = "S")
        val songB = Song(source = "tx", id = "2", name = "B", singer = "S")
        val local = listOf(
            MusicPlaylist(id = "local-fav", name = "我的收藏", isFavorite = true, songs = listOf(songA), updatedAt = 100L),
        )
        val incoming = listOf(
            MusicPlaylist(id = "peer-fav", name = "我的收藏", isFavorite = true, songs = listOf(songA), updatedAt = 100L),
            MusicPlaylist(id = "lx-imported-fav", name = "我的收藏", isFavorite = false, songs = listOf(songB), updatedAt = 200L),
        )
        val merged = mergeSyncedPlaylists(local, incoming)
        assertEquals(2, merged.size)
        assertEquals(1, merged.count { it.isFavorite })
        val imported = merged.first { it.id == "lx-imported-fav" }
        assertFalse(imported.isFavorite)
        assertEquals("我的收藏", imported.name)
        assertEquals(listOf("tx:2"), imported.songs.map { it.key })
        assertNotEquals(
            com.lxlia.player.lx.computeSyncDigest(local),
            com.lxlia.player.lx.computeSyncDigest(merged),
        )
    }

    @Test
    fun autoPlaylistsEndpointHonorsLanAutoSyncSwitch() {
        val server = LanSyncServer()
        server.setIdentity("receiver", "Android")
        var enabled = false
        var receivedFrom = ""
        var receivedCount = 0
        server.autoSyncEnabled = { enabled }
        server.verifyTrust = { peerId, token -> peerId == "desktop-1" && token == testTrustToken }
        val localLists = listOf(
            MusicPlaylist(id = "local-pl", name = "本机歌单", updatedAt = 2000L),
        )
        server.onAutoPlaylists = { _, peerName, _, lists ->
            receivedFrom = peerName
            receivedCount = lists.size
            val merged = mergeSyncedPlaylists(localLists, lists)
            com.lxlia.player.lx.AutoSyncExchangeResult(
                accepted = true,
                changed = true,
                syncDigest = com.lxlia.player.lx.computeSyncDigest(merged),
                playlists = merged,
            )
        }
        try {
            val port = server.start()
            val peer = LanDevice("receiver", "Android", "android", "127.0.0.1", port, 0)
            val payload = JSONObject()
                .put("protocol", "lxlia-lansync/1")
                .put("version", 1)
                .put("device", JSONObject().put("id", "desktop-1").put("name", "Windows PC"))
                .put("trustToken", testTrustToken)
                .put(
                    "playlists",
                    org.json.JSONArray().put(
                        MusicPlaylist(id = "pl-1", name = "通勤歌单", updatedAt = 1000L).toJson(),
                    ),
                )
            assertEquals(false, LanSyncClient.pushAutoPlaylists(peer, payload))
            assertEquals(0, receivedCount)

            enabled = true
            val res = LanSyncClient.exchangeAutoPlaylists(peer, payload)
            assertEquals(true, res.accepted)
            assertEquals(true, res.changed)
            assertEquals(16, res.syncDigest.length)
            assertEquals(2, res.playlists.size)
            assertEquals("Windows PC", receivedFrom)
            assertEquals(1, receivedCount)
        } finally {
            server.stop()
        }
    }

    @Test
    fun trustedCircleBlocksUntrustedSyncAndSupportsDirectAndPullPairing() {
        val sender = LanSyncServer(confirmationTimeoutMs = 5000)
        val receiver = LanSyncServer(confirmationTimeoutMs = 5000)
        val trusted = java.util.concurrent.ConcurrentHashMap<String, String>()
        val executor = Executors.newFixedThreadPool(2)
        sender.setIdentity("sender-pc", "Windows PC")
        receiver.setIdentity("android-box", "Android")
        receiver.autoSyncEnabled = { true }
        receiver.verifyTrust = { peerId, token -> trusted[peerId] == token }
        receiver.onUnpair = { peerId -> trusted.remove(peerId) }
        var autoHits = 0
        receiver.onAutoPlaylists = { _, _, _, _ ->
            autoHits += 1
            com.lxlia.player.lx.AutoSyncExchangeResult(accepted = true, changed = false, syncDigest = "0123456789abcdef")
        }
        try {
            sender.start()
            val recvPort = receiver.start()
            val recvPeer = LanDevice("android-box", "Android", "android", "127.0.0.1", recvPort, 0)

            // 1. Untrusted push & auto-playlists are rejected 403 UNTRUSTED without prompting user.
            val pushRes = LanSyncClient.pushDetailed(
                recvPeer,
                JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"stranger","name":"Stranger"},"settings":{},"sources":[],"playlists":[]}"""),
            )
            assertEquals(false, pushRes.accepted)
            assertEquals("UNTRUSTED", pushRes.code)
            assertNull(receiver.pollIncoming())

            val autoRes = LanSyncClient.exchangeAutoPlaylists(
                recvPeer,
                JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"stranger","name":"Stranger"},"playlists":[]}"""),
            )
            assertEquals(false, autoRes.accepted)
            assertEquals("UNTRUSTED", autoRes.code)
            assertEquals(0, autoHits)

            // 2. Pull-mode pairing (for 卓易通 container) delivers 6-digit code and returns confirmed identity.
            val token = "fedcba9876543210fedcba9876543210"
            val pairPayload = JSONObject()
                .put("protocol", "lxlia-lansync/1")
                .put("version", 1)
                .put("type", "pair")
                .put("code", "135790")
                .put("token", token)
                .put("device", JSONObject().put("id", "sender-pc").put("name", "Windows PC").put("platform", "win32"))
            val senderPeer = LanDevice("sender-pc", "Windows PC", "win32", "127.0.0.1", sender.currentPort(), 0)
            val pullClient = LanPullReceiver("android-box", receiver)

            val pairFuture = executor.submit<com.lxlia.player.lx.LanPushResult> { sender.offerPair("android-box", pairPayload) }
            val deadline = System.nanoTime() + 2_000_000_000
            while (sender.pullRequests().length() == 0 && System.nanoTime() < deadline) Thread.sleep(5)
            val offer = sender.pullRequests().getJSONObject(0)
            assertEquals("pair", offer.getString("kind"))
            val pullFuture = executor.submit { pullClient.receive(senderPeer, offer.getString("id")) }
            while (receiver.pollIncoming() == null && System.nanoTime() < deadline) Thread.sleep(5)
            val incomingPair = receiver.pollIncoming()
            assertNotNull(incomingPair)
            assertEquals("pair", incomingPair!!.kind)
            assertEquals("135790", incomingPair.pairCode)
            trusted[incomingPair.peerId] = incomingPair.pairToken
            receiver.respond(incomingPair.id, true)
            val pairOutcome = pairFuture.get(3, TimeUnit.SECONDS)
            pullFuture.get(3, TimeUnit.SECONDS)
            assertEquals(true, pairOutcome.accepted)
            assertEquals("android-box", pairOutcome.peerId)

            // 3. Trusted auto-sync now succeeds; authenticated unpair revokes it immediately.
            val trustedAuto = LanSyncClient.exchangeAutoPlaylists(
                recvPeer,
                JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender-pc","name":"Windows PC"},"trustToken":"$token","playlists":[]}"""),
            )
            assertEquals(true, trustedAuto.accepted)
            assertEquals(1, autoHits)

            LanSyncClient.unpair(
                recvPeer,
                JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"type":"unpair","device":{"id":"sender-pc"},"trustToken":"$token"}"""),
            )
            assertEquals(false, trusted.containsKey("sender-pc"))
            val revokedAuto = LanSyncClient.exchangeAutoPlaylists(
                recvPeer,
                JSONObject("""{"protocol":"lxlia-lansync/1","version":1,"device":{"id":"sender-pc","name":"Windows PC"},"trustToken":"$token","playlists":[]}"""),
            )
            assertEquals(false, revokedAuto.accepted)
            assertEquals("UNTRUSTED", revokedAuto.code)
        } finally {
            sender.stop()
            receiver.stop()
            executor.shutdownNow()
        }
    }

    @Test
    fun syncDigestIsOrderInsensitiveAndStable() {
        val a = Song(source = "wy", id = "1", name = "A")
        val b = Song(source = "wy", id = "2", name = "B")
        val d1 = com.lxlia.player.lx.computeSyncDigest(listOf(MusicPlaylist(id = "p1", name = "X", songs = listOf(b, a))))
        val d2 = com.lxlia.player.lx.computeSyncDigest(listOf(MusicPlaylist(id = "p1", name = "X", songs = listOf(a, b))))
        assertEquals(d1, d2)
        assertEquals(16, d1.length)
    }

    @Test
    fun transitiveVouchEndpointValidatesTokenAndSwitch() {
        val server = LanSyncServer()
        server.setIdentity("dev-b", "Android B")
        val trusted = java.util.concurrent.ConcurrentHashMap<String, String>()
        val tokAB = "aaaa1111bbbb2222cccc3333dddd4444"
        val tokBD = "99998888777766665555444433332222"
        trusted["dev-a"] = tokAB
        var transitiveEnabled = false
        server.verifyTrust = { peerId, token -> token.isNotEmpty() && trusted[peerId] == token }
        server.onAcceptVouch = { _, intro ->
            if (!transitiveEnabled) {
                com.lxlia.player.lx.LanPushResult(false, code = "TRANSITIVE_DISABLED")
            } else {
                trusted[intro.id] = intro.token
                com.lxlia.player.lx.LanPushResult(true)
            }
        }
        try {
            val port = server.start()
            val target = LanDevice("dev-b", "Android B", "android", "127.0.0.1", port, 0)

            val badAuth = LanSyncClient.vouch(
                target,
                JSONObject()
                    .put("protocol", "lxlia-lansync/1")
                    .put("version", 1)
                    .put("type", "vouch")
                    .put("device", JSONObject().put("id", "dev-a").put("name", "A"))
                    .put("trustToken", "wrongtoken0000000000000000000000")
                    .put("introduced", com.lxlia.player.lx.IntroducedPeer("dev-d", "D", "harmony", tokBD).toJson()),
            )
            assertEquals(false, badAuth.accepted)
            assertEquals("UNTRUSTED", badAuth.code)
            assertEquals(false, trusted.containsKey("dev-d"))

            val disabled = LanSyncClient.vouch(
                target,
                JSONObject()
                    .put("protocol", "lxlia-lansync/1")
                    .put("version", 1)
                    .put("type", "vouch")
                    .put("device", JSONObject().put("id", "dev-a").put("name", "A"))
                    .put("trustToken", tokAB)
                    .put("introduced", com.lxlia.player.lx.IntroducedPeer("dev-d", "D", "harmony", tokBD).toJson()),
            )
            assertEquals(false, disabled.accepted)
            assertEquals("TRANSITIVE_DISABLED", disabled.code)
            assertEquals(false, trusted.containsKey("dev-d"))

            transitiveEnabled = true
            val ok = LanSyncClient.vouch(
                target,
                JSONObject()
                    .put("protocol", "lxlia-lansync/1")
                    .put("version", 1)
                    .put("type", "vouch")
                    .put("device", JSONObject().put("id", "dev-a").put("name", "A"))
                    .put("trustToken", tokAB)
                    .put("introduced", com.lxlia.player.lx.IntroducedPeer("dev-d", "D", "harmony", tokBD).toJson()),
            )
            assertEquals(true, ok.accepted)
            assertEquals(tokBD, trusted["dev-d"])
        } finally {
            server.stop()
        }
    }
}
