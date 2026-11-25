package com.lxlia.player.lx

import android.content.Context
import android.net.wifi.WifiManager
import com.lxlia.player.model.MusicPlaylist
import com.lxlia.player.model.SyncSourcePayload
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.Proxy
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

const val SYNC_PROTOCOL = "lxlia-lansync/1"

private val secureRandom = SecureRandom()

fun generateTrustToken(): String {
    val bytes = ByteArray(16)
    secureRandom.nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
}

fun generatePairCode(): String = (100000 + secureRandom.nextInt(900000)).toString()

fun formatPairCode(code: String): String {
    val clean = code.filter { it.isDigit() }
    return if (clean.length == 6) "${clean.substring(0, 3)} ${clean.substring(3)}" else clean
}

fun safeTokenEquals(left: String, right: String): Boolean {
    val a = left.toByteArray(Charsets.UTF_8)
    val b = right.toByteArray(Charsets.UTF_8)
    if (a.size < 16 || a.size != b.size) return false
    return MessageDigest.isEqual(a, b)
}

data class TrustedDevice(
    val id: String,
    val name: String,
    val platform: String,
    val token: String,
    val trustedAt: Long = System.currentTimeMillis(),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("platform", platform)
        .put("token", token)
        .put("trustedAt", trustedAt)

    companion object {
        fun fromJson(obj: JSONObject): TrustedDevice? {
            val id = obj.optString("id").trim()
            val token = obj.optString("token").trim()
            if (id.isEmpty() || token.length < 16) return null
            return TrustedDevice(
                id = id,
                name = obj.optString("name").ifEmpty { "LxMine" },
                platform = obj.optString("platform").ifEmpty { "unknown" },
                token = token,
                trustedAt = obj.optLong("trustedAt", System.currentTimeMillis()),
            )
        }

        fun listToJson(list: List<TrustedDevice>): String = JSONArray().apply {
            list.forEach { put(it.toJson()) }
        }.toString()

        fun listFromJson(raw: String): List<TrustedDevice> = runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    arr.optJSONObject(i)?.let { fromJson(it) }?.let { add(it) }
                }
            }
        }.getOrDefault(emptyList())
    }
}

data class PeerSummary(
    val id: String,
    val name: String,
    val platform: String,
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name).put("platform", platform)

    companion object {
        fun fromArray(arr: JSONArray?, excludeIds: Set<String> = emptySet()): List<PeerSummary> {
            if (arr == null) return emptyList()
            val out = mutableListOf<PeerSummary>()
            for (i in 0 until minOf(arr.length(), 32)) {
                val obj = arr.optJSONObject(i) ?: continue
                val id = obj.optString("id").trim()
                if (id.isEmpty() || id in excludeIds) continue
                out.add(PeerSummary(id, obj.optString("name").ifEmpty { "LxMine" }, obj.optString("platform").ifEmpty { "unknown" }))
            }
            return out
        }
    }
}

data class IntroducedPeer(
    val id: String,
    val name: String,
    val platform: String,
    val token: String,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("platform", platform)
        .put("token", token)

    companion object {
        fun fromJson(obj: JSONObject?): IntroducedPeer? {
            if (obj == null) return null
            val id = obj.optString("id").trim()
            val token = obj.optString("token").trim()
            if (id.isEmpty() || token.length < 16) return null
            return IntroducedPeer(
                id = id,
                name = obj.optString("name").ifEmpty { "LxMine" },
                platform = obj.optString("platform").ifEmpty { "unknown" },
                token = token,
            )
        }

        fun fromArray(arr: JSONArray?, excludeIds: Set<String> = emptySet()): List<IntroducedPeer> {
            if (arr == null) return emptyList()
            val out = mutableListOf<IntroducedPeer>()
            for (i in 0 until minOf(arr.length(), 32)) {
                val item = fromJson(arr.optJSONObject(i)) ?: continue
                if (item.id in excludeIds) continue
                out.add(item)
            }
            return out
        }

        fun listToArray(list: List<IntroducedPeer>): JSONArray = JSONArray().apply {
            list.forEach { put(it.toJson()) }
        }
    }
}

data class PendingVouch(
    val targetId: String,
    val introduced: IntroducedPeer,
    val createdAt: Long = System.currentTimeMillis(),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("targetId", targetId)
        .put("introduced", introduced.toJson())
        .put("createdAt", createdAt)

    companion object {
        const val TTL_MS = 7L * 24L * 60L * 60L * 1000L

        fun listToJson(list: List<PendingVouch>): String = JSONArray().apply {
            list.takeLast(64).forEach { put(it.toJson()) }
        }.toString()

        fun listFromJson(raw: String, now: Long = System.currentTimeMillis()): List<PendingVouch> = runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val targetId = obj.optString("targetId").trim()
                    val intro = IntroducedPeer.fromJson(obj.optJSONObject("introduced")) ?: continue
                    val createdAt = obj.optLong("createdAt", now)
                    if (targetId.isEmpty() || now - createdAt > TTL_MS) continue
                    add(PendingVouch(targetId, intro, createdAt))
                }
            }
        }.getOrDefault(emptyList())
    }
}

data class LanPushResult(
    val accepted: Boolean,
    val code: String = "",
    val message: String = "",
    val peerId: String = "",
    val peerName: String = "",
    val peerPlatform: String = "",
    val transitive: Boolean = false,
    val introducedPeers: List<IntroducedPeer> = emptyList(),
    val reverseVouches: List<IntroducedPeer> = emptyList(),
    val acceptedIntroducedIds: List<String> = emptyList(),
)

data class LanDevice(
    val id: String,
    val name: String,
    val platform: String,
    val address: String,
    val port: Int,
    val lastSeen: Long,
    val ssid: String = "",
    val receiveMode: String = "direct",
    val pullRequests: List<String> = emptyList(),
    val autoSyncPlaylists: Boolean = false,
    val syncDigest: String = "",
)

data class AutoSyncExchangeResult(
    val accepted: Boolean,
    val changed: Boolean = false,
    val syncDigest: String = "",
    val playlists: List<MusicPlaylist> = emptyList(),
    val code: String = "",
)

private fun fnvHash32(text: String, seed: Int): String {
    var h = seed
    for (i in 0 until text.length) {
        h = (h xor text[i].code) * 0x01000193
    }
    return (h.toLong() and 0xffffffffL).toString(16).padStart(8, '0')
}

/** 跨三端（Windows / Android / HarmonyOS）逐比特一致的 16 位十六进制歌单状态摘要。 */
fun computeSyncDigest(playlists: List<MusicPlaylist>): String {
    val entries = mutableListOf<String>()
    for (list in MusicPlaylist.normalizeList(playlists)) {
        if (list.kind == "local" || list.kind == "recent") continue
        val isFav = list.isFavorite
        val canonId = if (isFav) "__fav__" else list.id.trim()
        if (canonId.isEmpty()) continue
        val canonName = if (isFav) "我的收藏" else list.name.trim()
        val keys = sortedSetOf<String>()
        for (song in list.songs) {
            if (song.id.isNotEmpty()) {
                val src = song.source.ifEmpty { "kw" }
                keys.add("$src:${song.id}")
            }
        }
        val coverTrim = list.customCover.trim()
        val coverTag = if (coverTrim.isNotEmpty()) fnvHash32(coverTrim, 0x811c9dc5.toInt()) else ""
        entries.add("$canonId\t$canonName\t$coverTag\t${keys.joinToString(",")}")
    }
    entries.sort()
    val canonical = entries.joinToString("\n")
    return fnvHash32(canonical, 0x811c9dc5.toInt()) + fnvHash32(canonical, 0x050c5d1f)
}

/**
 * 歌单自动合并：按 isFavorite / id 匹配，保留 updatedAt 较新的歌单，不覆盖音源与设置。
 */
fun mergeSyncedPlaylists(local: List<MusicPlaylist>, incoming: List<MusicPlaylist>): List<MusicPlaylist> {
    if (incoming.isEmpty()) return local
    val normalizedLocal = MusicPlaylist.normalizeList(local)
    val normalizedIncoming = MusicPlaylist.normalizeList(incoming)
    val result = mutableListOf<MusicPlaylist>()
    val isFavList: (MusicPlaylist) -> Boolean = { it.isFavorite }
    val localFav = normalizedLocal.firstOrNull(isFavList)
    val incomingFav = normalizedIncoming.firstOrNull(isFavList)
    when {
        localFav != null && incomingFav != null -> {
            if (incomingFav.songs.isEmpty() && localFav.songs.isNotEmpty()) {
                result.add(localFav.copy(isFavorite = true))
            } else {
                val primary = if (incomingFav.updatedAt >= localFav.updatedAt) incomingFav.songs else localFav.songs
                val secondary = if (primary === incomingFav.songs) localFav.songs else incomingFav.songs
                val seen = LinkedHashSet<String>()
                val combined = mutableListOf<com.lxlia.player.model.Song>()
                for (song in primary) if (seen.add(song.key)) combined.add(song)
                for (song in secondary) if (seen.add(song.key)) combined.add(song)
                result.add(
                    localFav.copy(
                        name = incomingFav.name.takeIf { it.isNotEmpty() && it != "我喜欢的" }
                            ?: localFav.name.takeIf { it.isNotEmpty() && it != "我喜欢的" }
                            ?: "我的收藏",
                        songs = combined,
                        songIds = combined.map { it.key },
                        updatedAt = maxOf(localFav.updatedAt, incomingFav.updatedAt),
                        isFavorite = true,
                        customCover = incomingFav.customCover.ifEmpty { localFav.customCover },
                    ),
                )
            }
        }
        localFav != null -> result.add(localFav.copy(isFavorite = true))
        incomingFav != null -> result.add(incomingFav.copy(isFavorite = true))
    }

    val incomingById = normalizedIncoming.filterNot(isFavList).associateBy { it.id }
    val handledIds = mutableSetOf<String>()
    for (item in normalizedLocal) {
        if (isFavList(item)) continue
        val remote = incomingById[item.id]
        if (remote != null) {
            handledIds.add(item.id)
            val mergedCustom = when {
                remote.updatedAt > item.updatedAt ->
                    remote.copy(isFavorite = false, customCover = remote.customCover.ifEmpty { item.customCover })
                remote.updatedAt == item.updatedAt -> {
                    val seen = LinkedHashSet<String>()
                    val combined = mutableListOf<com.lxlia.player.model.Song>()
                    for (song in item.songs) if (seen.add(song.key)) combined.add(song)
                    for (song in remote.songs) if (seen.add(song.key)) combined.add(song)
                    item.copy(
                        songs = combined,
                        songIds = combined.map { it.key },
                        isFavorite = false,
                        customCover = item.customCover.ifEmpty { remote.customCover },
                    )
                }
                else -> item.copy(isFavorite = false, customCover = item.customCover.ifEmpty { remote.customCover })
            }
            result.add(mergedCustom)
        } else {
            result.add(item)
        }
    }
    for (remote in normalizedIncoming) {
        if (isFavList(remote)) continue
        if (remote.id.isNotEmpty() && remote.id !in handledIds) {
            result.add(remote)
            handledIds.add(remote.id)
        }
    }
    return result
}

data class SyncSummary(val settings: Int = 0, val sources: Int = 0, val playlists: Int = 0)

data class SyncIncoming(
    val id: String,
    val peerName: String,
    val platform: String,
    val bundleJson: String,
    val summary: SyncSummary,
    val kind: String = "push",
    val peerId: String = "",
    val pairCode: String = "",
    val pairToken: String = "",
    val transitive: Boolean = false,
    val peers: List<PeerSummary> = emptyList(),
    val introducedPeers: List<IntroducedPeer> = emptyList(),
)

/** 与鸿蒙一致的 id 去重：同 id 的批量导入音源不碰撞，PC 才不会拒绝整包。 */
fun uniqueSyncSources(sources: List<SyncSourcePayload>): List<SyncSourcePayload> {
    val used = mutableSetOf<String>()
    return sources.mapIndexed { index, source ->
        val base = source.id.ifEmpty { "android-source-legacy-$index" }
        var id = base
        var suffix = 0
        while (used.contains(id)) {
            suffix++
            id = "$base-$index-$suffix"
        }
        used.add(id)
        source.copy(id = id)
    }
}

/** 局域网同步接收端：最小 HTTP 服务，实现 /ping、/pair、/unpair、/push、/auto-playlists、/pull、/receipt。 */
class LanSyncServer(private val confirmationTimeoutMs: Long = 120000) {
    init {
        require(confirmationTimeoutMs >= 0)
    }

    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile private var port = 0
    private val pending = linkedMapOf<String, Pending>()
    private val outgoing = linkedMapOf<String, Outgoing>()
    private val rejectedPairAt = ConcurrentHashMap<String, Long>()
    private var seq = 0
    private var deviceId = ""
    private var deviceName = "Android"
    private val maxBody = 8 * 1024 * 1024
    var autoSyncEnabled: () -> Boolean = { false }
    var verifyTrust: (peerId: String, token: String) -> Boolean = { _, _ -> false }
    var onAcceptVouch: ((voucherId: String, introduced: IntroducedPeer) -> LanPushResult)? = null
    var onUnpair: ((peerId: String) -> Unit)? = null
    var onAutoPlaylists: ((peerId: String, peerName: String, peerDigest: String, playlists: List<MusicPlaylist>) -> AutoSyncExchangeResult)? = null

    private fun isTrusted(peerId: String, token: String): Boolean =
        runCatching { verifyTrust(peerId, token) }.getOrDefault(false)

    private class Pending(
        val incoming: SyncIncoming,
        val reply: (Int, String) -> Unit,
        val close: () -> Unit,
        var applying: Boolean = false,
    )
    private class Outgoing(val receiverId: String, val bundleJson: String, val kind: String = "push") {
        val confirmed = CountDownLatch(1)
        @Volatile var accepted = false
        @Volatile var code = ""
        @Volatile var message = ""
        @Volatile var peerId = ""
        @Volatile var peerName = ""
        @Volatile var peerPlatform = ""
        @Volatile var transitive = false
        @Volatile var introducedPeers: List<IntroducedPeer> = emptyList()
        @Volatile var acceptedIntroducedIds: List<String> = emptyList()
    }

    fun pullRequests(): JSONArray = synchronized(outgoing) {
        JSONArray().apply {
            outgoing.forEach { (id, entry) ->
                put(JSONObject().put("id", id).put("receiverId", entry.receiverId).put("kind", entry.kind))
            }
        }
    }

    fun offerPush(receiverId: String, bundle: JSONObject, onQueued: () -> Unit = {}): Boolean =
        offerOutgoing(receiverId, bundle, "push", onQueued).accepted

    fun offerPushDetailed(receiverId: String, bundle: JSONObject, onQueued: () -> Unit = {}): LanPushResult =
        offerOutgoing(receiverId, bundle, "push", onQueued)

    fun offerPair(receiverId: String, pairPayload: JSONObject, onQueued: () -> Unit = {}): LanPushResult =
        offerOutgoing(receiverId, pairPayload, "pair", onQueued)

    fun offerVouch(receiverId: String, vouchPayload: JSONObject, onQueued: () -> Unit = {}): LanPushResult =
        offerOutgoing(receiverId, vouchPayload, "vouch", onQueued, timeoutOverrideMs = 18_000L)

    private fun offerOutgoing(
        receiverId: String,
        payload: JSONObject,
        kind: String,
        onQueued: () -> Unit,
        timeoutOverrideMs: Long? = null,
    ): LanPushResult {
        val id = UUID.randomUUID().toString()
        val entry = Outgoing(receiverId, payload.toString(), kind)
        synchronized(outgoing) { outgoing[id] = entry }
        try {
            onQueued()
            val waitMs = timeoutOverrideMs ?: confirmationTimeoutMs
            if (!entry.confirmed.await(waitMs, TimeUnit.MILLISECONDS)) {
                throw IllegalStateException(
                    when (kind) {
                        "pair" -> "信任确认超时"
                        "vouch" -> "引荐确认超时"
                        else -> "接收方确认超时"
                    },
                )
            }
            return LanPushResult(
                accepted = entry.accepted,
                code = entry.code,
                message = entry.message,
                peerId = entry.peerId,
                peerName = entry.peerName,
                peerPlatform = entry.peerPlatform,
                transitive = entry.transitive,
                introducedPeers = entry.introducedPeers,
                acceptedIntroducedIds = entry.acceptedIntroducedIds,
            )
        } finally {
            synchronized(outgoing) { outgoing.remove(id) }
        }
    }

    fun setIdentity(id: String, name: String) {
        deviceId = id
        deviceName = name
    }

    fun currentPort(): Int = port

    @Synchronized
    fun start(): Int {
        if (serverSocket?.isClosed == false) return port
        for (attempt in 0 until 5) {
            val candidate = 41300 + attempt
            val socket = ServerSocket()
            try {
                socket.reuseAddress = true
                socket.bind(InetSocketAddress(InetAddress.getByName("0.0.0.0"), candidate))
                serverSocket = socket
                port = candidate
                thread(name = "lxmine-lansync", isDaemon = true) {
                    try {
                        while (!socket.isClosed) {
                            val client = try {
                                socket.accept()
                            } catch (_: Exception) {
                                break
                            }
                            thread(isDaemon = true) { handleConnection(client, maxBody) }
                        }
                    } finally {
                        synchronized(this@LanSyncServer) {
                            if (serverSocket === socket) { serverSocket = null; port = 0 }
                            runCatching { socket.close() }
                        }
                    }
                }
                return port
            } catch (_: Exception) {
                runCatching { socket.close() }
                // 端口被占用，换下一个。
            }
        }
        throw IllegalStateException("没有可用端口启动同步服务")
    }

    @Synchronized
    fun stop() {
        synchronized(outgoing) {
            outgoing.values.forEach { it.confirmed.countDown() }
            outgoing.clear()
        }
        val entries = synchronized(pending) {
            pending.values.toList().also { pending.clear() }
        }
        entries.forEach { entry ->
            runCatching { entry.close() }
        }
        runCatching { serverSocket?.close() }
        serverSocket = null
        port = 0
    }

    /** 局域网同步收到新请求或队列变化时的推送回调，避免 UI 300ms 轮询。 */
    @Volatile
    var onIncomingChanged: (() -> Unit)? = null

    /** 供 UI 轮询：返回尚未处理的第一条请求（不消费，respond 时移除）。 */
    fun pollIncoming(): SyncIncoming? = synchronized(pending) { pending.values.firstOrNull()?.incoming }

    /** Reserve a live request before committing data so its confirmation timer cannot expire mid-write. */
    fun beginApply(id: String): Boolean = synchronized(pending) {
        val entry = pending[id] ?: return@synchronized false
        if (entry.applying) return@synchronized false
        entry.applying = true
        true
    }

    fun respond(
        id: String,
        accepted: Boolean,
        message: String = "",
        transitive: Boolean = false,
        introducedPeers: List<IntroducedPeer> = emptyList(),
        reverseVouches: List<IntroducedPeer> = emptyList(),
        acceptedIntroducedIds: List<String> = emptyList(),
    ) {
        val entry = synchronized(pending) { pending.remove(id) } ?: return
        val out = JSONObject()
            .put("accepted", accepted)
            .put("message", message.ifEmpty { if (accepted) "accepted" else "rejected" })
        if (entry.incoming.kind == "pair") {
            if (!accepted && entry.incoming.peerId.isNotEmpty()) {
                rejectedPairAt[entry.incoming.peerId] = System.currentTimeMillis()
            }
            if (accepted) {
                out.put(
                    "device",
                    JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"),
                )
                out.put("transitive", transitive)
                out.put("introducedPeers", IntroducedPeer.listToArray(introducedPeers))
                out.put("reverseVouches", IntroducedPeer.listToArray(reverseVouches))
                out.put("acceptedIntroducedIds", JSONArray().apply { acceptedIntroducedIds.forEach { put(it) } })
            }
        }
        entry.reply(200, out.toString())
        onIncomingChanged?.invoke()
    }

    fun receivePulled(body: String): Boolean = receivePulledDetailed(body).accepted

    fun receivePulledDetailed(body: String): LanPushResult {
        if (body.toByteArray(Charsets.UTF_8).size > maxBody) return LanPushResult(false, message = "bundle too large")
        val result = CompletableFuture<LanPushResult>()
        enqueueIncoming(body, { status, response ->
            val obj = runCatching { JSONObject(response) }.getOrNull()
            result.complete(
                LanPushResult(
                    accepted = status == 200 && obj?.optBoolean("accepted") == true,
                    code = obj?.optString("code").orEmpty(),
                    message = obj?.optString("message").orEmpty(),
                ),
            )
        }, { result.complete(LanPushResult(false)) })
        return result.get()
    }

    fun receivePulledVouch(body: String): LanPushResult {
        val pair = processVouchBody(body)
        val obj = runCatching { JSONObject(pair.second) }.getOrNull()
        return LanPushResult(
            accepted = pair.first == 200 && obj?.optBoolean("accepted") == true,
            code = obj?.optString("code").orEmpty(),
            message = obj?.optString("message").orEmpty(),
        )
    }

    fun receivePulledPair(body: String): LanPushResult {
        if (body.toByteArray(Charsets.UTF_8).size > maxBody) return LanPushResult(false, message = "pair too large")
        val result = CompletableFuture<LanPushResult>()
        enqueuePair(body, { status, response ->
            val obj = runCatching { JSONObject(response) }.getOrNull()
            val dev = obj?.optJSONObject("device")
            val acceptedIds = mutableListOf<String>()
            obj?.optJSONArray("acceptedIntroducedIds")?.let { arr ->
                for (i in 0 until arr.length()) arr.optString(i).takeIf { it.isNotEmpty() }?.let { acceptedIds.add(it) }
            }
            result.complete(
                LanPushResult(
                    accepted = status == 200 && obj?.optBoolean("accepted") == true,
                    code = obj?.optString("code").orEmpty(),
                    message = obj?.optString("message").orEmpty(),
                    peerId = dev?.optString("id").orEmpty(),
                    peerName = dev?.optString("name").orEmpty(),
                    peerPlatform = dev?.optString("platform").orEmpty(),
                    transitive = obj?.optBoolean("transitive", false) == true,
                    introducedPeers = IntroducedPeer.fromArray(obj?.optJSONArray("introducedPeers")),
                    reverseVouches = IntroducedPeer.fromArray(obj?.optJSONArray("reverseVouches")),
                    acceptedIntroducedIds = acceptedIds,
                ),
            )
        }, { result.complete(LanPushResult(false)) })
        return result.get()
    }

    private fun reply(socket: Socket, status: Int, body: String) {
        runCatching {
            val bytes = body.toByteArray(Charsets.UTF_8)
            val head = "HTTP/1.1 $status ${if (status == 200) "OK" else "Error"}\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
            socket.getOutputStream().write(head.toByteArray(Charsets.UTF_8))
            socket.getOutputStream().write(bytes)
            socket.getOutputStream().flush()
        }
        runCatching { socket.close() }
    }

    private fun handleConnection(socket: Socket, maxBody: Int) {
        try {
            socket.soTimeout = 130000
            val request = readLanSyncHttpRequest(socket.getInputStream(), maxBody) {
                socket.getOutputStream().apply {
                    write("HTTP/1.1 100 Continue\r\n\r\n".toByteArray(Charsets.US_ASCII))
                    flush()
                }
            }
            handleRequest(socket, request.method, request.path, request.body)
        } catch (_: Exception) {
            reply(socket, 400, """{"accepted":false,"message":"invalid HTTP request"}""")
        }
    }

    private fun handleRequest(socket: Socket, method: String, path: String, body: String) {
        val parts = path.split('/')
        if (method == "GET" && parts.size == 5 && parts[1] == "lxlia-sync" && parts[2] == "pull") {
            val id = runCatching { URLDecoder.decode(parts[3], "UTF-8") }.getOrDefault("")
            val receiver = runCatching { URLDecoder.decode(parts[4], "UTF-8") }.getOrDefault("")
            val entry = synchronized(outgoing) { outgoing[id]?.takeIf { it.receiverId == receiver } }
            if (entry == null) reply(socket, 404, """{"message":"request expired"}""")
            else reply(socket, 200, "{\"bundle\":${entry.bundleJson}}")
            return
        }
        if (method == "POST" && parts.size == 4 && parts[1] == "lxlia-sync" && parts[2] == "receipt") {
            val receipt = runCatching { JSONObject(body) }.getOrNull()
            val confirmed = synchronized(outgoing) {
                val entry = outgoing[parts[3]]
                if (entry == null || receipt == null || receipt.optString("receiverId") != entry.receiverId ||
                    receipt.opt("accepted") !is Boolean) false
                else {
                    outgoing.remove(parts[3])
                    entry.accepted = receipt.getBoolean("accepted")
                    entry.code = receipt.optString("code")
                    entry.message = receipt.optString("message")
                    receipt.optJSONObject("device")?.let { dev ->
                        entry.peerId = dev.optString("id")
                        entry.peerName = dev.optString("name")
                        entry.peerPlatform = dev.optString("platform")
                    }
                    entry.transitive = receipt.optBoolean("transitive", false)
                    entry.introducedPeers = IntroducedPeer.fromArray(receipt.optJSONArray("introducedPeers"))
                    val accIds = mutableListOf<String>()
                    receipt.optJSONArray("acceptedIntroducedIds")?.let { arr ->
                        for (i in 0 until arr.length()) arr.optString(i).takeIf { it.isNotEmpty() }?.let { accIds.add(it) }
                    }
                    entry.acceptedIntroducedIds = accIds
                    entry.confirmed.countDown()
                    true
                }
            }
            reply(socket, if (confirmed) 200 else 404, JSONObject().put("confirmed", confirmed).toString())
            return
        }
        if (method == "GET" && path == "/lxlia-sync/ping") {
            reply(
                socket,
                200,
                JSONObject()
                    .put("protocol", SYNC_PROTOCOL)
                    .put("id", deviceId)
                    .put("name", deviceName)
                    .put("platform", "android")
                    .put("port", port)
                    .put("autoSyncPlaylists", autoSyncEnabled())
                    .toString(),
            )
            return
        }
        if (method == "POST" && path == "/lxlia-sync/pair") {
            enqueuePair(body, { status, response -> reply(socket, status, response) }, { socket.close() })
            return
        }
        if (method == "POST" && path == "/lxlia-sync/vouch") {
            val (status, response) = processVouchBody(body)
            reply(socket, status, response)
            return
        }
        if (method == "POST" && path == "/lxlia-sync/unpair") {
            handleUnpair(socket, body)
            return
        }
        if (method == "POST" && path == "/lxlia-sync/auto-playlists") {
            handleAutoPlaylists(socket, body)
            return
        }
        if (method != "POST" || path != "/lxlia-sync/push") {
            reply(socket, 404, """{"accepted":false,"message":"not found"}""")
            return
        }
        enqueueIncoming(body, { status, response -> reply(socket, status, response) }, { socket.close() })
    }

    private fun processVouchBody(body: String): Pair<Int, String> {
        val obj = runCatching { JSONObject(body) }.getOrNull()
        val peerId = obj?.optJSONObject("device")?.optString("id").orEmpty()
        val token = obj?.optString("trustToken").orEmpty()
        val intro = IntroducedPeer.fromJson(obj?.optJSONObject("introduced"))
        if (obj == null || obj.optString("protocol") != SYNC_PROTOCOL || obj.optInt("version") != 1 ||
            obj.optString("type") != "vouch" || peerId.isEmpty() || intro == null || intro.id == this.deviceId
        ) {
            return 400 to """{"accepted":false,"code":"INVALID","message":"invalid vouch payload"}"""
        }
        if (!isTrusted(peerId, token)) {
            return 403 to """{"accepted":false,"code":"UNTRUSTED","message":"设备不在信任圈内"}"""
        }
        val handler = onAcceptVouch
            ?: return 403 to """{"accepted":false,"code":"TRANSITIVE_DISABLED","message":"未开启信任圈成员互通"}"""
        val res = runCatching { handler(peerId, intro) }.getOrDefault(LanPushResult(false, code = "ERROR"))
        return if (res.accepted) {
            200 to """{"accepted":true}"""
        } else {
            403 to JSONObject()
                .put("accepted", false)
                .put("code", res.code.ifEmpty { "TRANSITIVE_DISABLED" })
                .put("message", res.message.ifEmpty { "对方未开启信任圈成员互通" })
                .toString()
        }
    }

    private fun handleUnpair(socket: Socket, body: String) {
        val obj = runCatching { JSONObject(body) }.getOrNull()
        val peerId = obj?.optJSONObject("device")?.optString("id").orEmpty()
        val token = obj?.optString("trustToken").orEmpty()
        if (obj == null || obj.optString("protocol") != SYNC_PROTOCOL || peerId.isEmpty() || !isTrusted(peerId, token)) {
            reply(socket, 403, """{"ok":false,"code":"UNTRUSTED"}""")
            return
        }
        runCatching { onUnpair?.invoke(peerId) }
        reply(socket, 200, """{"ok":true}""")
    }

    private fun handleAutoPlaylists(socket: Socket, body: String) {
        if (!autoSyncEnabled()) {
            reply(socket, 200, """{"accepted":false,"message":"auto sync disabled"}""")
            return
        }
        val bundle = runCatching { JSONObject(body) }.getOrNull()
        val device = bundle?.optJSONObject("device")
        val peerId = device?.optString("id").orEmpty()
        val playlistsArray = bundle?.opt("playlists") as? JSONArray
        if (bundle == null || bundle.optString("protocol") != SYNC_PROTOCOL ||
            device == null || peerId.isEmpty() || peerId == this.deviceId || playlistsArray == null
        ) {
            reply(socket, 400, """{"accepted":false,"message":"invalid auto-playlists payload"}""")
            return
        }
        if (!isTrusted(peerId, bundle.optString("trustToken"))) {
            reply(socket, 403, """{"accepted":false,"code":"UNTRUSTED","message":"设备不在信任圈内"}""")
            return
        }
        val incoming = MusicPlaylist.normalizeList(MusicPlaylist.listFromJson(playlistsArray.toString()))
        val peerName = device.optString("name").ifEmpty { "LxMine" }
        val peerDigest = bundle.optString("syncDigest")
        val res = runCatching {
            onAutoPlaylists?.invoke(peerId, peerName, peerDigest, incoming) ?: AutoSyncExchangeResult(false)
        }.getOrDefault(AutoSyncExchangeResult(false))
        val out = JSONObject()
            .put("accepted", res.accepted)
            .put("changed", res.changed)
            .put("syncDigest", res.syncDigest)
            .put("playlists", JSONArray().apply { res.playlists.forEach { put(it.toJson()) } })
        reply(socket, 200, out.toString())
    }

    private fun enqueuePair(body: String, sendReply: (Int, String) -> Unit, closeConnection: () -> Unit) {
        val obj = runCatching { JSONObject(body) }.getOrNull()
        val device = obj?.optJSONObject("device")
        val peerId = device?.optString("id").orEmpty()
        val code = obj?.optString("code").orEmpty()
        val token = obj?.optString("token").orEmpty()
        if (obj == null || obj.optString("protocol") != SYNC_PROTOCOL || obj.optInt("version") != 1 ||
            obj.optString("type") != "pair" || device == null || peerId.isEmpty() || peerId == this.deviceId ||
            code.length != 6 || code.any { !it.isDigit() } || token.length < 16
        ) {
            sendReply(400, """{"accepted":false,"message":"invalid pair protocol"}""")
            return
        }
        if (isTrusted(peerId, token)) {
            sendReply(
                200,
                JSONObject()
                    .put("accepted", true)
                    .put("device", JSONObject().put("id", deviceId).put("name", deviceName).put("platform", "android"))
                    .put("message", "already trusted")
                    .toString(),
            )
            return
        }
        val lastRejected = rejectedPairAt[peerId] ?: 0L
        if (System.currentTimeMillis() - lastRejected < 10_000L) {
            sendReply(429, """{"accepted":false,"code":"RATE_LIMITED","message":"对方刚刚拒绝了请求，请稍后再试"}""")
            return
        }
        var duplicate = false
        val id = synchronized(pending) {
            if (pending.values.any { it.incoming.peerId == peerId }) {
                duplicate = true
                null
            } else if (pending.size >= 3) {
                null
            } else {
                val nextId = (++seq).toString()
                val incoming = SyncIncoming(
                    id = nextId,
                    peerName = device.optString("name").ifEmpty { "LxMine" },
                    platform = device.optString("platform").ifEmpty { "unknown" },
                    bundleJson = body,
                    summary = SyncSummary(),
                    kind = "pair",
                    peerId = peerId,
                    pairCode = code,
                    pairToken = token,
                    transitive = obj.optBoolean("transitive", false),
                    peers = PeerSummary.fromArray(obj.optJSONArray("peers"), setOf(this.deviceId, peerId)),
                    introducedPeers = IntroducedPeer.fromArray(obj.optJSONArray("introducedPeers"), setOf(this.deviceId, peerId)),
                )
                pending[nextId] = Pending(incoming, sendReply, closeConnection)
                nextId
            }
        }
        if (duplicate) {
            sendReply(409, """{"accepted":false,"code":"PENDING","message":"对方已有待处理的请求，请在对方屏幕确认"}""")
            return
        }
        if (id == null) {
            sendReply(429, """{"accepted":false,"code":"BUSY","message":"对方待处理请求过多，请稍后再试"}""")
            return
        }
        onIncomingChanged?.invoke()
        thread(isDaemon = true) {
            Thread.sleep(confirmationTimeoutMs)
            val expired = synchronized(pending) {
                pending[id]?.takeUnless { it.applying }?.also { pending.remove(id) }
            }
            if (expired != null) {
                expired.reply(200, JSONObject().put("accepted", false).put("message", "信任确认超时").toString())
                onIncomingChanged?.invoke()
            }
        }
    }

    private fun enqueueIncoming(body: String, sendReply: (Int, String) -> Unit, closeConnection: () -> Unit) {
        val bundle = runCatching { JSONObject(body) }.getOrNull()
        if (bundle == null) {
            sendReply(400, """{"accepted":false,"message":"invalid bundle"}""")
            return
        }
        val protocol = bundle.optString("protocol")
        val version = bundle.optInt("version")
        val device = bundle.optJSONObject("device")
        val peerId = device?.optString("id").orEmpty()
        val sources = bundle.opt("sources") as? JSONArray
        val playlists = bundle.opt("playlists") as? JSONArray
        if (protocol != SYNC_PROTOCOL || version != 1 || device == null || peerId.isEmpty() ||
            peerId == this.deviceId || sources == null || playlists == null
        ) {
            sendReply(400, """{"accepted":false,"message":"invalid bundle protocol"}""")
            return
        }
        if (!isTrusted(peerId, bundle.optString("trustToken"))) {
            sendReply(403, """{"accepted":false,"code":"UNTRUSTED","message":"设备不在信任圈内，请先加入信任圈"}""")
            return
        }
        val settings = bundle.optJSONObject("settings")
        val id = synchronized(pending) {
            if (pending.size >= 3) null else {
                val nextId = (++seq).toString()
                val incoming = SyncIncoming(
                    id = nextId,
                    peerName = device.optString("name").ifEmpty { "LxMine" },
                    platform = device.optString("platform").ifEmpty { "unknown" },
                    bundleJson = body,
                    summary = SyncSummary(
                        settings = settings?.length() ?: 0,
                        sources = sources.length(),
                        playlists = playlists.length(),
                    ),
                    kind = "push",
                    peerId = peerId,
                )
                pending[nextId] = Pending(incoming, sendReply, closeConnection)
                nextId
            }
        }
        if (id == null) {
            sendReply(400, """{"accepted":false,"message":"too many pending requests"}""")
            return
        }
        onIncomingChanged?.invoke()
        // 2 分钟无人确认则拒绝；请求一直挂起，本机落盘成功后才回 success。
        thread(isDaemon = true) {
            Thread.sleep(confirmationTimeoutMs)
            val expired = synchronized(pending) {
                pending[id]?.takeUnless { it.applying }?.also { pending.remove(id) }
            }
            if (expired != null) {
                expired.reply(200, JSONObject().put("accepted", false).put("message", "接收方确认超时").toString())
                onIncomingChanged?.invoke()
            }
        }
    }
}

/** 局域网同步发送：把本机音源（及设置/歌单）推给已信任设备，对方确认后覆盖。 */
object LanSyncClient {
    private val client = OkHttpClient.Builder()
        .proxy(Proxy.NO_PROXY)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(130, TimeUnit.SECONDS)
        .build()

    private val fastClient = OkHttpClient.Builder()
        .proxy(Proxy.NO_PROXY)
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    fun parseManualEndpoint(raw: String, defaultPort: Int = 41300): Pair<String, Int>? {
        val text = raw.trim().removePrefix("http://").removePrefix("https://").substringBefore('/').trim()
        if (text.isEmpty()) return null
        val host: String
        val port: Int
        if (text.startsWith("[")) {
            val close = text.indexOf(']')
            if (close <= 1) return null
            host = text.substring(0, close + 1)
            val rest = text.substring(close + 1)
            port = when {
                rest.isEmpty() -> defaultPort
                rest.startsWith(":") -> rest.substring(1).toIntOrNull() ?: return null
                else -> return null
            }
        } else {
            val colonCount = text.count { it == ':' }
            if (colonCount == 0) {
                host = text
                port = defaultPort
            } else if (colonCount == 1) {
                host = text.substringBefore(':').trim()
                port = text.substringAfter(':').trim().toIntOrNull() ?: return null
            } else {
                return null
            }
        }
        if (host.isEmpty() || host.any { it.isWhitespace() } || port !in 1..65535) return null
        return host to port
    }

    fun ping(host: String, port: Int): JSONObject? {
        if (port !in 1..65535) return null
        val request = Request.Builder()
            .url("http://$host:$port/lxlia-sync/ping")
            .get()
            .build()
        return runCatching {
            fastClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) null
                else JSONObject(response.body?.string().orEmpty()).takeIf { it.optString("protocol") == SYNC_PROTOCOL }
            }
        }.getOrNull()
    }

    fun push(device: LanDevice, bundle: JSONObject): Boolean = pushDetailed(device, bundle).accepted

    fun pushDetailed(device: LanDevice, bundle: JSONObject): LanPushResult {
        if (device.port <= 0) throw IllegalStateException("该设备没有可接收的端口")
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/push")
            .header("content-type", "application/json; charset=utf-8")
            .post(bundle.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val obj = runCatching { JSONObject(body) }.getOrNull()
            return LanPushResult(
                accepted = response.isSuccessful && obj?.optBoolean("accepted") == true,
                code = obj?.optString("code").orEmpty(),
                message = obj?.optString("message").orEmpty(),
            )
        }
    }

    fun pair(device: LanDevice, payload: JSONObject): LanPushResult {
        if (device.port <= 0) throw IllegalStateException("该设备没有可接收的端口")
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/pair")
            .header("content-type", "application/json; charset=utf-8")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val obj = runCatching { JSONObject(body) }.getOrNull()
            val dev = obj?.optJSONObject("device")
            return LanPushResult(
                accepted = response.isSuccessful && obj?.optBoolean("accepted") == true,
                code = obj?.optString("code").orEmpty(),
                message = obj?.optString("message").orEmpty(),
                peerId = dev?.optString("id").orEmpty(),
                peerName = dev?.optString("name").orEmpty(),
                peerPlatform = dev?.optString("platform").orEmpty(),
                transitive = obj?.optBoolean("transitive", false) == true,
                introducedPeers = IntroducedPeer.fromArray(obj?.optJSONArray("introducedPeers")),
                reverseVouches = IntroducedPeer.fromArray(obj?.optJSONArray("reverseVouches")),
            )
        }
    }

    fun vouch(device: LanDevice, payload: JSONObject): LanPushResult {
        if (device.port <= 0) return LanPushResult(false, code = "NO_PORT")
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/vouch")
            .header("content-type", "application/json; charset=utf-8")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        return runCatching {
            fastClient.newCall(request).execute().use { response ->
                val obj = runCatching { JSONObject(response.body?.string().orEmpty()) }.getOrNull()
                LanPushResult(
                    accepted = response.isSuccessful && obj?.optBoolean("accepted") == true,
                    code = obj?.optString("code").orEmpty(),
                    message = obj?.optString("message").orEmpty(),
                )
            }
        }.getOrDefault(LanPushResult(false, code = "NETWORK"))
    }

    fun unpair(device: LanDevice, payload: JSONObject) {
        if (device.port <= 0) return
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/unpair")
            .header("content-type", "application/json; charset=utf-8")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        runCatching { fastClient.newCall(request).execute().close() }
    }

    fun exchangeAutoPlaylists(device: LanDevice, bundle: JSONObject): AutoSyncExchangeResult {
        if (device.port <= 0) return AutoSyncExchangeResult(false)
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/auto-playlists")
            .header("content-type", "application/json; charset=utf-8")
            .post(bundle.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        return runCatching {
            fastClient.newCall(request).execute().use { response ->
                val obj = runCatching { JSONObject(response.body?.string().orEmpty()) }.getOrNull()
                if (!response.isSuccessful) {
                    return@use AutoSyncExchangeResult(
                        accepted = false,
                        code = obj?.optString("code").orEmpty(),
                    )
                }
                val accepted = obj?.optBoolean("accepted", false) == true
                val changed = obj?.optBoolean("changed", false) == true
                val digest = obj?.optString("syncDigest").orEmpty()
                val arr = obj?.optJSONArray("playlists")
                val lists = if (arr != null) MusicPlaylist.normalizeList(MusicPlaylist.listFromJson(arr.toString())) else emptyList()
                AutoSyncExchangeResult(
                    accepted = accepted,
                    changed = changed,
                    syncDigest = digest,
                    playlists = lists,
                    code = obj?.optString("code").orEmpty(),
                )
            }
        }.getOrDefault(AutoSyncExchangeResult(false))
    }

    fun pushAutoPlaylists(device: LanDevice, bundle: JSONObject): Boolean =
        exchangeAutoPlaylists(device, bundle).accepted
}

/**
 * 局域网发现：与 Windows 端共用 docs/LANSYNC.md 的 UDP 广播协议，
 * 只负责“看见谁在线”，推送与接收由 LanSyncServer / LanSyncClient 负责。
 */
class LanDiscovery(private val deviceId: String, private val deviceName: String) {
    companion object {
        private const val DISCOVERY_PORT = 41234

        /** 获取本机局域网 IPv4 地址，优先内网网段（192.168 / 10 / 172.16-31）。 */
        fun localIpv4(): String {
            val candidates = mutableListOf<String>()
            runCatching {
                val interfaces = java.net.NetworkInterface.getNetworkInterfaces() ?: return@runCatching
                for (iface in interfaces) {
                    if (!iface.isUp || iface.isLoopback || iface.isVirtual) continue
                    for (addr in iface.inetAddresses) {
                        if (addr is java.net.Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                            val ip = addr.hostAddress.orEmpty()
                            if (ip.isNotEmpty()) {
                                if (addr.isSiteLocalAddress) candidates.add(0, ip) else candidates.add(ip)
                            }
                        }
                    }
                }
            }
            return candidates.firstOrNull { it.startsWith("192.168.") || it.startsWith("10.") || it.startsWith("172.") }
                ?: candidates.firstOrNull().orEmpty()
        }
    }
    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val devices = ConcurrentHashMap<String, LanDevice>()
    private var timer: java.util.Timer? = null
    var port: Int = 0
    var ssid: String = ""
        private set
    var onDevices: ((List<LanDevice>) -> Unit)? = null
    var pullRequests: () -> JSONArray = { JSONArray() }
    var autoSyncProvider: () -> Boolean = { false }
    var syncDigestProvider: () -> String = { "" }
    @Volatile private var broadcasts: Set<String> = setOf("255.255.255.255")
    @Volatile private var lastBroadcastRefreshAt: Long = 0L

    @Synchronized
    fun start(context: Context? = null) {
        if (socket != null) return
        try {
            val udp = DatagramSocket(null)
            udp.reuseAddress = true
            udp.broadcast = true
            // 必须绑发现端口 41234：绑随机端口收不到其他设备的广播。
            udp.bind(InetSocketAddress(DISCOVERY_PORT))
            socket = udp
            if (context != null) {
                runCatching {
                    val manager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                    multicastLock = manager.createMulticastLock("lxmine-lan").apply {
                        setReferenceCounted(false)
                        acquire()
                    }
                    @Suppress("DEPRECATION")
                    ssid = manager.connectionInfo?.ssid?.trim('"').orEmpty().takeIf { it != "<unknown ssid>" }.orEmpty()
                }
            }
            refreshBroadcasts()
            thread(name = "lxmine-lan-discovery", isDaemon = true) {
                val buffer = ByteArray(8192)
                while (true) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        udp.receive(packet)
                    } catch (_: Exception) {
                        break
                    }
                    val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                    handleMessage(text, packet.address.hostAddress ?: "")
                }
            }
            timer = java.util.Timer("lxmine-lan-announce", true).apply {
                scheduleAtFixedRate(object : java.util.TimerTask() {
                    override fun run() {
                        announce()
                        prune()
                    }
                }, 0, 3000)
            }
        } catch (_: Exception) {
            stop()
        }
    }

    @Synchronized
    fun stop() {
        timer?.cancel()
        timer = null
        val udp = socket
        if (udp != null) {
            runCatching {
                val bye = JSONObject()
                    .put("protocol", SYNC_PROTOCOL)
                    .put("type", "bye")
                    .put("id", deviceId)
                    .toString()
                    .toByteArray(Charsets.UTF_8)
                for (host in broadcasts) {
                    runCatching { udp.send(DatagramPacket(bye, bye.size, InetAddress.getByName(host), DISCOVERY_PORT)) }
                }
            }
        }
        runCatching { udp?.close() }
        socket = null
        runCatching { multicastLock?.release() }
        multicastLock = null
        devices.clear()
    }

    @Synchronized
    fun restart(context: Context? = null) {
        stop()
        devices.clear()
        onDevices?.invoke(emptyList())
        start(context)
    }

    /** 按网卡子网计算广播地址（部分路由器不回 255.255.255.255）。 */
    private fun refreshBroadcasts() {
        lastBroadcastRefreshAt = System.currentTimeMillis()
        runCatching {
            val targets = mutableSetOf("255.255.255.255")
            for (iface in java.net.NetworkInterface.getNetworkInterfaces()) {
                if (!iface.isUp || iface.isLoopback) continue
                for (address in iface.interfaceAddresses) {
                    address.broadcast?.hostAddress?.let { targets.add(it) }
                }
            }
            broadcasts = targets
        }
    }

    private fun announce(directAddress: String? = null) {
        val udp = socket ?: return
        if (directAddress == null && System.currentTimeMillis() - lastBroadcastRefreshAt > 15000L) {
            refreshBroadcasts()
        }
        val payload = JSONObject()
            .put("protocol", SYNC_PROTOCOL)
            .put("type", "announce")
            .put("id", deviceId)
            .put("name", deviceName)
            .put("platform", "android")
            .put("receiveMode", "pull")
            .put("pullRequests", pullRequests())
            .put("autoSyncPlaylists", autoSyncProvider())
            .put("syncDigest", syncDigestProvider())
            .put("port", port)
            .put("ssid", ssid)
            .put("ts", System.currentTimeMillis())
            .toString()
            .toByteArray(Charsets.UTF_8)
        val targets = if (directAddress != null) listOf(directAddress) else broadcasts
        for (host in targets) {
            runCatching {
                udp.send(DatagramPacket(payload, payload.size, InetAddress.getByName(host), DISCOVERY_PORT))
            }
        }
    }

    private fun handleMessage(text: String, address: String) {
        val parsed = runCatching { JSONObject(text) }.getOrNull() ?: return
        if (parsed.optString("protocol") != SYNC_PROTOCOL) return
        val id = parsed.optString("id")
        if (id.isEmpty() || id == deviceId) return
        val type = parsed.optString("type")
        if (type == "bye") {
            if (devices.remove(id) != null) {
                onDevices?.invoke(devices.values.sortedBy { it.name })
            }
            return
        }
        if (type != "announce") return
        val port = parsed.optInt("port")
        if (port < 1 || port > 65535) return
        val requested = parsed.optJSONArray("pullRequests")
        val pullIds = mutableListOf<String>()
        if (requested != null) for (index in 0 until requested.length()) {
            val request = requested.optJSONObject(index) ?: continue
            if (request.optString("receiverId") == deviceId && request.optString("id").isNotEmpty()) {
                pullIds.add(request.getString("id"))
            }
        }
        val previous = devices[id]
        val device = LanDevice(
            id = id,
            name = parsed.optString("name").ifEmpty { "LxMine" },
            platform = parsed.optString("platform").ifEmpty { "unknown" },
            address = address,
            port = port,
            lastSeen = System.currentTimeMillis(),
            ssid = parsed.optString("ssid"),
            receiveMode = parsed.optString("receiveMode", "direct"),
            pullRequests = pullIds,
            autoSyncPlaylists = parsed.optBoolean("autoSyncPlaylists", false),
            syncDigest = parsed.optString("syncDigest"),
        )
        devices[id] = device
        if (previous == null && address.isNotEmpty()) {
            announce(address)
        }
        val changed = previous == null ||
            previous.name != device.name ||
            previous.address != device.address ||
            previous.port != device.port ||
            previous.ssid != device.ssid ||
            previous.receiveMode != device.receiveMode ||
            previous.autoSyncPlaylists != device.autoSyncPlaylists ||
            previous.syncDigest != device.syncDigest ||
            previous.pullRequests != device.pullRequests
        if (changed) {
            onDevices?.invoke(devices.values.sortedBy { it.name })
        }
    }

    private fun prune() {
        val now = System.currentTimeMillis()
        val stale = devices.values.filter { now - it.lastSeen > 10000 }.map { it.id }
        if (stale.isEmpty()) return
        stale.forEach { devices.remove(it) }
        onDevices?.invoke(devices.values.sortedBy { it.name })
    }

    fun announceNow() = announce(null)
}
