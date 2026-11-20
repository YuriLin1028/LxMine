package com.lxlia.player.lx

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

interface LxHashValue {
    val hash: String
}

data class LxHash(override val hash: String) : LxHashValue

/** 与鸿蒙 LxSongInfo 同字段：音源脚本按 LX 协议读取。 */
data class LxSongInfo(
    val source: String,
    val songmid: String,
    val name: String,
    val singer: String,
    val albumName: String,
    val albumId: String,
    val interval: Long,
    val type: String,
    val hash: String? = null,
    val hashes: Map<String, String> = emptyMap(),
    val strMediaMid: String = "",
    val songId: String = "",
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("source", source)
        json.put("songmid", songmid)
        json.put("name", name)
        json.put("singer", singer)
        json.put("albumName", albumName)
        json.put("albumId", albumId)
        json.put("interval", interval)
        json.put("type", type)
        if (strMediaMid.isNotEmpty()) json.put("strMediaMid", strMediaMid)
        if (songId.isNotEmpty()) json.put("songId", songId)
        hash?.let { json.put("hash", it) }
        if (hashes.isNotEmpty()) {
            val types = JSONObject()
            hashes.forEach { (quality, value) -> types.put(quality, JSONObject().put("hash", value)) }
            json.put("_types", types)
        }
        return json
    }
}

data class LxSourceInfo(
    val name: String = "",
    val description: String = "",
    val version: String = "",
    val author: String = "",
    val homepage: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("name", name)
        .put("description", description)
        .put("author", author)
        .put("version", version)
        .put("homepage", homepage)
}

data class LyricBundle(
    val lyric: String = "",
    val lxlyric: String = "",
    val tlyric: String = "",
    val rlyric: String = "",
    val romalrc: String = "",
)

private data class SourceDeclaration(val actions: List<String> = emptyList(), val qualitys: List<String> = emptyList())

private class Pending(
    val resolve: (String) -> Unit,
    val reject: (Throwable) -> Unit,
    val timer: Runnable,
    val timeoutMs: Long = 0,
)

/**
 * 隐藏沙箱承载自定义源与共享歌单编解码：LX 协议仍是 Web 侧 JS，
 * 原生只做 HTTP 桥与调度（与鸿蒙 LxRuntime 同一套 __lxNative 方法名）。
 */
class LxHost(private val http: OkHttpClient) {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var webView: WebView? = null
    private val lock = Any()
    private val pending = mutableMapOf<String, Pending>()
    private var seq = 0
    private var init: Pending? = null
    @Volatile private var declarations: Map<String, SourceDeclaration> = emptyMap()

    /** 供 WebView 注入：JS 侧 window.__lxNative 指向这个对象。 */
    val bridge = Bridge()

    @Volatile
    var ready: Boolean = false
        private set

    fun attach(view: WebView) {
        webView = view
        ready = false
        view.loadUrl("file:///android_asset/lx-runtime/index-android.html")
    }

    fun onPageReady() {
        ready = true
    }
    fun onRendererGone() {
        ready = false
        webView = null
        declarations = emptyMap()
        val tasks = synchronized(lock) {
            val interrupted = pending.values.toMutableList()
            init?.let(interrupted::add)
            init = null
            pending.clear()
            interrupted
        }
        tasks.forEach { task ->
            main.removeCallbacks(task.timer)
            task.reject(IllegalStateException("音源运行时正在恢复，请重试"))
        }
    }

    fun supports(source: String, action: String): Boolean =
        declarations[source]?.actions?.contains(action) == true
    fun supportedSources(action: String): List<String> = declarations.keys.filter { supports(it, action) }

    fun quality(source: String, preferred: String): String {
        val options = declarations[source]?.qualitys ?: emptyList()
        return if (options.contains(preferred)) preferred else options.firstOrNull() ?: "128k"
    }

    inner class Bridge {
        @JavascriptInterface
        fun onInited(json: String) {
            main.post { handleInited(json) }
        }

        @JavascriptInterface
        fun onResult(id: String, json: String) {
            main.post { handleResult(id, json) }
        }

        @JavascriptInterface
        fun httpRequest(id: String, json: String) {
            main.post { handleHttp(id, json) }
        }
    }

    private fun handleInited(json: String) {
        val task = synchronized(lock) {
            val current = init
            init = null
            current
        } ?: return
        main.removeCallbacks(task.timer)
        try {
            val payload = JSONObject(json)
            val sources = payload.optJSONObject("sources")
            if (sources == null || sources.length() == 0) throw IllegalStateException("源没有声明支持的平台")
            val map = mutableMapOf<String, SourceDeclaration>()
            sources.keys().forEach { source ->
                val entry = sources.optJSONObject(source) ?: return@forEach
                map[source] = SourceDeclaration(readStrings(entry.optJSONArray("actions")), readStrings(entry.optJSONArray("qualitys")))
            }
            declarations = map
            task.resolve(json)
        } catch (error: Throwable) {
            task.reject(error)
        }
    }

    private fun readStrings(array: org.json.JSONArray?): List<String> {
        if (array == null) return emptyList()
        return (0 until array.length()).mapNotNull { array.optString(it).takeIf { value -> value.isNotEmpty() } }
    }

    private fun handleResult(id: String, json: String) {
        val progress = runCatching { JSONObject(json).optBoolean("progress") }.getOrDefault(false)
        if (progress) {
            val task = synchronized(lock) { pending[id] } ?: return
            main.removeCallbacks(task.timer)
            main.postDelayed(task.timer, task.timeoutMs)
            return
        }
        val task = synchronized(lock) { pending.remove(id) } ?: return
        main.removeCallbacks(task.timer)
        try {
            val result = JSONObject(json)
            if (!result.optBoolean("ok")) throw IllegalStateException(result.optString("error").ifEmpty { "音源请求失败" })
            val data = result.opt("data")
            task.resolve(if (data is String) data else data?.toString() ?: "")
        } catch (error: Throwable) {
            task.reject(error)
        }
    }

    private fun handleHttp(id: String, json: String) {
        try {
            val payload = JSONObject(json)
            val url = payload.optString("url")
            if (url.isEmpty()) throw IllegalArgumentException("HTTP 请求地址为空")
            val method = payload.optString("method", "get").uppercase()
            val headers = mutableMapOf<String, String>()
            payload.optJSONObject("headers")?.let { objectHeaders ->
                objectHeaders.keys().forEach { key -> headers[key] = objectHeaders.optString(key) }
            }
            var body: String? = payload.optString("body").ifEmpty { null }
            payload.optJSONObject("form")?.let { form ->
                val encoded = mutableListOf<String>()
                form.keys().forEach { key ->
                    encoded.add(urlEncode(key) + "=" + urlEncode(form.optString(key)))
                }
                body = encoded.joinToString("&")
                if (headers.keys.none { it.equals("content-type", true) }) {
                    headers["content-type"] = "application/x-www-form-urlencoded"
                }
            }
            val timeout = payload.optLong("timeout").takeIf { it > 0 } ?: 20000L
            val builder = Request.Builder().url(url)
            if (headers.keys.none { it.equals("user-agent", true) }) {
                headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
            headers.forEach { (name, value) -> runCatching { builder.header(name, value) } }
            val contentTypeHeader = headers.entries.firstOrNull { it.key.equals("content-type", true) }?.value
            val mediaType = contentTypeHeader?.toMediaTypeOrNull() ?: "application/x-www-form-urlencoded".toMediaType()
            val requestBody = when {
                method == "GET" || method == "HEAD" -> null
                body != null -> body.toRequestBody(mediaType)
                else -> "".toRequestBody(mediaType)
            }
            builder.method(method, requestBody)
            val client = http.newBuilder()
                .connectTimeout(timeout, TimeUnit.MILLISECONDS)
                .readTimeout(timeout, TimeUnit.MILLISECONDS)
                .build()
            client.newCall(builder.build()).enqueue(object : Callback {
                override fun onFailure(call: Call, error: IOException) {
                    finishHttp(id, JSONObject().put("error", error.message ?: "请求失败").toString())
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { result ->
                        val text = runCatching { result.body?.string() ?: "" }.getOrDefault("")
                        val headerMap = JSONObject()
                        result.headers.names().forEach { name ->
                            val joined = result.headers.values(name).joinToString(", ")
                            headerMap.put(name, joined)
                            headerMap.put(name.lowercase(), joined)
                        }
                        val finalUrl = result.request.url.toString()
                        if (!headerMap.has("location") && (result.priorResponse != null || finalUrl != url)) {
                            headerMap.put("location", finalUrl)
                        }
                        val parsed: Any = runCatching { JSONObject(text) }.getOrElse { runCatching { org.json.JSONArray(text) }.getOrElse { text } }
                        val payloadOut = JSONObject()
                        val responseJson = JSONObject()
                        responseJson.put("statusCode", result.code)
                        responseJson.put("headers", headerMap)
                        responseJson.put("body", parsed)
                        payloadOut.put("response", responseJson)
                        finishHttp(id, payloadOut.toString())
                    }
                }
            })
        } catch (error: Throwable) {
            finishHttp(id, JSONObject().put("error", "HTTP 请求格式错误").toString())
        }
    }

    private fun urlEncode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    private fun finishHttp(id: String, json: String) {
        main.post { evaluate("window.__lxHttpResult(${quote(id)},${quote(json)})") }
    }

    fun dispose() {
        val (current, tasks) = synchronized(lock) {
            val snapshot = init to pending.values.toList()
            init = null
            pending.clear()
            snapshot
        }
        current?.let { main.removeCallbacks(it.timer); it.reject(IllegalStateException("运行时已关闭")) }
        tasks.forEach { main.removeCallbacks(it.timer); it.reject(IllegalStateException("运行时已关闭")) }
        webView = null
        ready = false
    }

    private fun quote(value: String): String = JSONObject.quote(value)

    private fun evaluate(script: String) {
        val view = webView ?: return
        if (Looper.myLooper() == Looper.getMainLooper()) view.evaluateJavascript(script, null)
        else main.post { view.evaluateJavascript(script, null) }
    }

    suspend fun loadSource(script: String, info: LxSourceInfo) {
        if (webView == null || !ready) throw IllegalStateException("音源运行时尚未就绪")
        synchronized(lock) {
            if (init != null) throw IllegalStateException("正在加载音源")
            declarations = emptyMap()
        }
        val json = awaitInit { resolve, reject, timer ->
            synchronized(lock) { init = Pending(resolve, reject, timer) }
            evaluate("window.__lxRunSource(${quote(script)},${quote(info.toJson().toString())})")
        }
    }

    private suspend fun awaitInit(start: (resolve: (String) -> Unit, reject: (Throwable) -> Unit, timer: Runnable) -> Unit): String =
        suspendCancellableCoroutine { continuation ->
            val timer = Runnable {
                synchronized(lock) { init = null }
                if (continuation.isActive) continuation.resumeWithException(IllegalStateException("音源初始化超时"))
            }
            main.postDelayed(timer, 15000)
            start(
                { value -> if (continuation.isActive) continuation.resume(value) },
                { error -> if (continuation.isActive) continuation.resumeWithException(error) },
                timer,
            )
            continuation.invokeOnCancellation {
                main.removeCallbacks(timer)
                synchronized(lock) { init = null }
            }
        }

    private suspend fun bridge(expression: String, timeoutMs: Long = 20000): String {
        if (webView == null) throw IllegalStateException("运行时尚未就绪")
        val id = synchronized(lock) { (++seq).toString() }
        return suspendCancellableCoroutine { continuation ->
            val timer = Runnable {
                synchronized(lock) { pending.remove(id) }
                if (continuation.isActive) continuation.resumeWithException(IllegalStateException("请求超时，请稍后重试"))
            }
            synchronized(lock) {
                pending[id] = Pending(
                    { value -> if (continuation.isActive) continuation.resume(value) },
                    { error -> if (continuation.isActive) continuation.resumeWithException(error) },
                    timer,
                    timeoutMs,
                )
            }
            main.postDelayed(timer, timeoutMs)
            evaluate(expression.replace("__REQUEST_ID__", quote(id)))
            continuation.invokeOnCancellation {
                main.removeCallbacks(timer)
                synchronized(lock) { pending.remove(id) }
            }
        }
    }

    suspend fun request(action: String, info: LxSongInfo): String {
        if (!supports(info.source, action)) {
            throw IllegalStateException("当前音源不支持 ${info.source} 的 $action，请切换音源")
        }
        val payload = JSONObject()
            .put("source", info.source)
            .put("action", action)
            .put("info", JSONObject().put("musicInfo", info.toJson()).put("type", info.type))
        return bridge("window.__lxRequest(__REQUEST_ID__,${quote(payload.toString())})")
    }

    suspend fun requestMusicUrl(info: LxSongInfo): String {
        val url = request("musicUrl", info).trim()
        if (!url.startsWith("http", ignoreCase = true)) throw IllegalStateException("音源返回的播放地址无效")
        return url
    }

    suspend fun requestLyricBundle(info: LxSongInfo): LyricBundle {
        val raw = request("lyric", info)
        val trimmed = raw.trim()
        if (!trimmed.startsWith("{")) return LyricBundle(lyric = raw)
        val json = runCatching { JSONObject(trimmed) }.getOrNull() ?: return LyricBundle(lyric = raw)
        return LyricBundle(
            lyric = json.optString("lyric"),
            lxlyric = json.optString("lxlyric"),
            tlyric = json.optString("tlyric"),
            rlyric = json.optString("rlyric"),
            romalrc = json.optString("romalrc"),
        )
    }

    suspend fun importPlaylist(input: String, source: String): String =
        bridge(
            "window.__lxImportPlaylist(__REQUEST_ID__,${quote(input)},${quote(source)})",
            120000,
        )

    suspend fun catalogue(operation: String, paramsJson: String): String =
        bridge("window.__lxCatalogue(__REQUEST_ID__,${quote(operation)},$paramsJson)", 30000)
}
