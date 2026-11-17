package com.lxlia.player.lx

import android.content.Context
import android.net.wifi.WifiManager
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
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

const val SYNC_PROTOCOL = "lxlia-lansync/1"

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
)

data class SyncSummary(val settings: Int = 0, val sources: Int = 0, val playlists: Int = 0)

data class SyncIncoming(
    val id: String,
    val peerName: String,
    val platform: String,
    val bundleJson: String,
    val summary: SyncSummary,
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

/** 局域网同步接收端：最小 HTTP 服务，只实现 /lxlia-sync/ping 与 /lxlia-sync/push。 */
class LanSyncServer(private val confirmationTimeoutMs: Long = 120000) {
    init {
        require(confirmationTimeoutMs >= 0)
    }

    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile private var port = 0
    private val pending = linkedMapOf<String, Pending>()
    private val outgoing = linkedMapOf<String, Outgoing>()
    private var seq = 0
    private var deviceId = ""
    private var deviceName = "Android"
    private val maxBody = 8 * 1024 * 1024

    private class Pending(
        val incoming: SyncIncoming,
        val reply: (Int, String) -> Unit,
        val close: () -> Unit,
        var applying: Boolean = false,
    )
    private class Outgoing(val receiverId: String, val bundleJson: String) {
        val confirmed = CountDownLatch(1)
        @Volatile var accepted = false
    }

    fun pullRequests(): JSONArray = synchronized(outgoing) {
        JSONArray().apply {
            outgoing.forEach { (id, entry) -> put(JSONObject().put("id", id).put("receiverId", entry.receiverId)) }
        }
    }

    fun offerPush(receiverId: String, bundle: JSONObject, onQueued: () -> Unit = {}): Boolean {
        val id = UUID.randomUUID().toString()
        val entry = Outgoing(receiverId, bundle.toString())
        synchronized(outgoing) { outgoing[id] = entry }
        try {
            onQueued()
            if (!entry.confirmed.await(confirmationTimeoutMs, TimeUnit.MILLISECONDS)) {
                throw IllegalStateException("接收方确认超时")
            }
            return entry.accepted
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

    /** 供 UI 轮询：返回尚未处理的第一条请求（不消费，respond 时移除）。 */
    fun pollIncoming(): SyncIncoming? = synchronized(pending) { pending.values.firstOrNull()?.incoming }

    /** Reserve a live request before committing data so its confirmation timer cannot expire mid-write. */
    fun beginApply(id: String): Boolean = synchronized(pending) {
        val entry = pending[id] ?: return@synchronized false
        if (entry.applying) return@synchronized false
        entry.applying = true
        true
    }

    fun respond(id: String, accepted: Boolean, message: String = "") {
        val entry = synchronized(pending) { pending.remove(id) } ?: return
        entry.reply(200, JSONObject().put("accepted", accepted).put("message", message).toString())
    }

    fun receivePulled(body: String): Boolean {
        if (body.toByteArray(Charsets.UTF_8).size > maxBody) return false
        val result = CompletableFuture<Boolean>()
        enqueueIncoming(body, { status, response ->
            result.complete(status == 200 && JSONObject(response).optBoolean("accepted"))
        }, { result.complete(false) })
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
                    .toString(),
            )
            return
        }
        if (method != "POST" || path != "/lxlia-sync/push") {
            reply(socket, 404, """{"accepted":false,"message":"not found"}""")
            return
        }
        enqueueIncoming(body, { status, response -> reply(socket, status, response) }, { socket.close() })
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
        val deviceId = device?.optString("id").orEmpty()
        val sources = bundle.opt("sources") as? JSONArray
        val playlists = bundle.opt("playlists") as? JSONArray
        if (protocol != SYNC_PROTOCOL || version != 1 || device == null || deviceId.isEmpty() ||
            deviceId == this.deviceId || sources == null || playlists == null
        ) {
            sendReply(400, """{"accepted":false,"message":"invalid bundle protocol"}""")
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
                )
                pending[nextId] = Pending(incoming, sendReply, closeConnection)
                nextId
            }
        }
        if (id == null) {
            sendReply(400, """{"accepted":false,"message":"too many pending requests"}""")
            return
        }
        // 2 分钟无人确认则拒绝；请求一直挂起，本机落盘成功后才回 success。
        thread(isDaemon = true) {
            Thread.sleep(confirmationTimeoutMs)
            val expired = synchronized(pending) {
                pending[id]?.takeUnless { it.applying }?.also { pending.remove(id) }
            }
            if (expired != null) {
                expired.reply(200, JSONObject().put("accepted", false).put("message", "接收方确认超时").toString())
            }
        }
    }
}

/** 局域网同步发送：把本机音源（及设置/歌单）推给对方，对方确认后覆盖。 */
object LanSyncClient {
    private val client = OkHttpClient.Builder()
        .proxy(Proxy.NO_PROXY)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(130, TimeUnit.SECONDS)
        .build()

    fun push(device: LanDevice, bundle: JSONObject): Boolean {
        if (device.port <= 0) throw IllegalStateException("该设备没有可接收的端口")
        val request = Request.Builder()
            .url("http://${device.address}:${device.port}/lxlia-sync/push")
            .header("content-type", "application/json; charset=utf-8")
            .post(bundle.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return false
            val body = response.body?.string().orEmpty()
            return runCatching { JSONObject(body).optBoolean("accepted") }.getOrDefault(false)
        }
    }
}

/**
 * 局域网发现：与 Windows 端共用 docs/LANSYNC.md 的 UDP 广播协议，
 * 只负责“看见谁在线”，推送与接收由 LanSyncServer / LanSyncClient 负责。
 */
class LanDiscovery(private val deviceId: String, private val deviceName: String) {
    private companion object {
        const val DISCOVERY_PORT = 41234
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
    @Volatile private var broadcasts: Set<String> = setOf("255.255.255.255")

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
        runCatching { socket?.close() }
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

    private fun announce() {
        val udp = socket ?: return
        val payload = JSONObject()
            .put("protocol", SYNC_PROTOCOL)
            .put("type", "announce")
            .put("id", deviceId)
            .put("name", deviceName)
            .put("platform", "android")
            .put("receiveMode", "pull")
            .put("pullRequests", pullRequests())
            .put("port", port)
            .put("ssid", ssid)
            .put("ts", System.currentTimeMillis())
            .toString()
            .toByteArray(Charsets.UTF_8)
        for (host in broadcasts) {
            runCatching {
                udp.send(DatagramPacket(payload, payload.size, InetAddress.getByName(host), 41234))
            }
        }
    }

    private fun handleMessage(text: String, address: String) {
        val parsed = runCatching { JSONObject(text) }.getOrNull() ?: return
        if (parsed.optString("protocol") != SYNC_PROTOCOL) return
        val id = parsed.optString("id")
        if (id.isEmpty() || id == deviceId || parsed.optString("type") != "announce") return
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
        )
        devices[id] = device
        onDevices?.invoke(devices.values.sortedBy { it.name })
    }

    private fun prune() {
        val now = System.currentTimeMillis()
        val stale = devices.values.filter { now - it.lastSeen > 10000 }.map { it.id }
        if (stale.isEmpty()) return
        stale.forEach { devices.remove(it) }
        onDevices?.invoke(devices.values.sortedBy { it.name })
    }

    fun announceNow() = announce()
}
