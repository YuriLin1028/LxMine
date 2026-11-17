package com.lxlia.player.lx

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.LinkedHashMap

data class CoverColors(val first: String, val last: String)

val EMPTY_COVER_COLORS = CoverColors("#FFFFFF", "#B8B8B8")

/** 小尺寸原生取色：不在 UI 线程做整图解码，也不编造合成色。 */
class CoverPalette(private val http: okhttp3.OkHttpClient) {
    private val cache = object : LinkedHashMap<String, CoverColors>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CoverColors>?): Boolean = size > 32
    }

    suspend fun colors(url: String): CoverColors = withContext(Dispatchers.IO) {
        if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) return@withContext EMPTY_COVER_COLORS
        synchronized(cache) { cache[url] }?.let { return@withContext it }
        try {
            val request = okhttp3.Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 LxMine/1.0").build()
            val bytes = http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext EMPTY_COVER_COLORS
                val body = response.body ?: return@withContext EMPTY_COVER_COLORS
                if (body.contentLength() > 4 * 1024 * 1024) return@withContext EMPTY_COVER_COLORS
                body.bytes()
            }
            val options = BitmapFactory.Options().apply { inSampleSize = 8 }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return@withContext EMPTY_COVER_COLORS
            val scaled = Bitmap.createScaledBitmap(bitmap, 24, 24, true).also { if (it !== bitmap) bitmap.recycle() }
            val counts = HashMap<Int, Int>()
            for (y in 0 until scaled.height) {
                for (x in 0 until scaled.width) {
                    val pixel = scaled.getPixel(x, y)
                    if (Color.alpha(pixel) < 128) continue
                    val key = ((Color.red(pixel) shr 4) shl 8) or ((Color.green(pixel) shr 4) shl 4) or (Color.blue(pixel) shr 4)
                    counts[key] = (counts[key] ?: 0) + 1
                }
            }
            scaled.recycle()
            val ranked = counts.entries.sortedByDescending { it.value }.map { it.key }
            if (ranked.isEmpty()) return@withContext EMPTY_COVER_COLORS
            val first = ranked.first()
            val alternate = ranked.drop(1).firstOrNull { key ->
                val dr = (key shr 8) - (first shr 8)
                val dg = ((key shr 4) and 15) - ((first shr 4) and 15)
                val db = (key and 15) - (first and 15)
                dr * dr + dg * dg + db * db >= 36
            } ?: first
            val colors = CoverColors(hex(first), hex(alternate))
            synchronized(cache) { cache[url] = colors }
            colors
        } catch (_: Throwable) {
            EMPTY_COVER_COLORS
        }
    }

    private fun hex(key: Int): String {
        val channels = intArrayOf((key shr 8) * 16 + 8, ((key shr 4) and 15) * 16 + 8, (key and 15) * 16 + 8)
        val luminance = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114
        val lift = maxOf(0.0, (130 - luminance) / maxOf(1.0, 255 - luminance))
        return "#" + channels.joinToString("") { channel ->
            Math.round(channel + (255 - channel) * lift).toString(16).padStart(2, '0')
        }
    }
}
