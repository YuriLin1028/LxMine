package com.lxlia.player.lx

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** 公共 HTTP 小工具：与鸿蒙 @ohos.net.http 调用点一一对应。 */
object Http {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(true)
        .retryOnConnectionFailure(true)
        .build()

    private val userAgent = "Mozilla/5.0 LxMine/1.0"

    fun get(url: String, referer: String = "", timeoutMs: Long = 15000): String {
        val builder = Request.Builder().url(url).header("User-Agent", userAgent)
        if (referer.isNotEmpty()) builder.header("Referer", referer)
        val client = if (timeoutMs != 15000L) {
            client.newBuilder()
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build()
        } else client
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }

    fun postForm(url: String, body: String, referer: String = ""): String {
        val builder = Request.Builder()
            .url(url)
            .header("User-Agent", userAgent)
            .post(body.toRequestBody("application/x-www-form-urlencoded".toMediaType()))
        if (referer.isNotEmpty()) builder.header("Referer", referer)
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }

    fun bytes(url: String): ByteArray {
        val builder = Request.Builder().url(url).header("User-Agent", userAgent)
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}")
            return response.body?.bytes() ?: ByteArray(0)
        }
    }
}

fun decodeName(value: String?): String {
    if (value.isNullOrEmpty()) return ""
    return value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fun formatSinger(value: String?): String = decodeName(value).replace("&", "、")
