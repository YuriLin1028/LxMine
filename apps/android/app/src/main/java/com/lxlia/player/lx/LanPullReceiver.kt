package com.lxlia.player.lx

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.Proxy
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Receives announced transfers through outbound HTTP, including isolated Android containers. */
class LanPullReceiver(private val ownId: String, private val server: LanSyncServer) {
    private data class Receipt(val accepted: Boolean, val at: Long)
    private val running = ConcurrentHashMap.newKeySet<String>()
    private val receipts = ConcurrentHashMap<String, Receipt>()
    private val client = OkHttpClient.Builder()
        .proxy(Proxy.NO_PROXY)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(130, TimeUnit.SECONDS)
        .build()

    fun receive(device: LanDevice, requestId: String) {
        val key = device.id + ":" + requestId
        synchronized(running) {
            if (running.size >= 3 || !running.add(key)) return
        }
        try {
            val now = System.currentTimeMillis()
            receipts.entries.removeIf { now - it.value.at > 180000 }
            val encoded = URLEncoder.encode(requestId, "UTF-8").replace("+", "%20")
            val base = "http://${device.address}:${device.port}/lxlia-sync/"
            val receipt = receipts[key] ?: run {
                val response = request(base + "pull/" + encoded + "/" + URLEncoder.encode(ownId, "UTF-8").replace("+", "%20"))
                val bundle = response.getJSONObject("bundle")
                require(bundle.optJSONObject("device")?.optString("id") == device.id) { "同步发送设备不匹配" }
                // Both delivery paths share validation, confirmation and durable saving.
                Receipt(server.receivePulled(bundle.toString()), System.currentTimeMillis()).also { receipts[key] = it }
            }
            // A lost acknowledgement is retried from the cached result on the next announcement.
            runCatching {
                request(base + "receipt/" + encoded,
                    JSONObject().put("receiverId", ownId).put("accepted", receipt.accepted))
            }
        } finally {
            running.remove(key)
        }
    }

    private fun request(url: String, body: JSONObject? = null): JSONObject {
        val builder = Request.Builder().url(url)
        if (body != null) builder.post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        return client.newCall(builder.build()).execute().use { response ->
            check(response.isSuccessful) { "同步请求失败（${response.code}）" }
            JSONObject(response.body?.string().orEmpty())
        }
    }
}
