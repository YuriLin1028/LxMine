package com.lxlia.player.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.request.SuccessResult
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.layout.size

internal object AppAppearance {
    var light by mutableStateOf(false)
}
val INK: Color get() = if (AppAppearance.light) Color(0xFFDCE0E5) else Color(0xFF151619)
val TEXT: Color get() = if (AppAppearance.light) Color(0xFF17181A) else Color(0xFFF4F4F4)
val MUTED: Color get() = if (AppAppearance.light) Color(0xFF565C65) else Color(0xFF9D9FA3)
val ACCENT: Color get() = if (AppAppearance.light) Color(0xFF38BDF8) else Color(0xFF64D2FF)
val ON_ACCENT: Color get() = if (AppAppearance.light) Color.White else Color(0xFF081018)
// 统一使用天蓝色主题，与底部栏高亮及首页快捷胶囊完全一致。
val CONTROL_BLUE: Color get() = ACCENT
val BLUE: Color get() = ACCENT
// Solid liked heart tint across dock, lists, and player controls.
val HEART_RED = Color(0xFFFF4D5A)

private val GLACIAL_FALLBACK_GRADS = listOf(
    listOf(Color(0xFF0B2B5B), Color(0xFF38BDF8)),
    listOf(Color(0xFF162456), Color(0xFF64D2FF)),
    listOf(Color(0xFF1E295E), Color(0xFF818CF8)),
    listOf(Color(0xFF0D4A56), Color(0xFF2DD4BF)),
    listOf(Color(0xFF1B3A73), Color(0xFF7DD3FC)),
    listOf(Color(0xFF2B2467), Color(0xFFA5B4FC)),
)

fun glacialGradFor(name: String): List<Color> {
    var hash = 0
    for (char in name) hash = (hash * 31 + char.code) and 0x7FFFFFFF
    return GLACIAL_FALLBACK_GRADS[hash % GLACIAL_FALLBACK_GRADS.size]
}

val MULTICOLOR_ASSET_ICONS = setOf(
    "ic_heart_fill.svg",
    "ic_style_wand.svg",
    "ic_sparkle.svg",
    "chip_music_on.svg",
    "chip_library_on.svg",
    "chip_queue_on.svg",
    "chip_play_on.svg",
    "chip_more_on.svg",
)

fun playModeIcon(mode: String): String = when (mode) {
    "单曲循环" -> "ic_repeat_one.svg"
    "随机播放" -> "ic_shuffle.svg"
    "顺序播放" -> "ic_order_seq.svg"
    else -> "ic_repeat.svg"
}

fun parseColor(value: String?, fallback: Color = Color.White): Color {
    if (value.isNullOrEmpty()) return fallback
    return runCatching {
        if (value.startsWith("#")) {
            val hex = value.removePrefix("#")
            when (hex.length) {
                8 -> Color(hex.toLong(16))
                6 -> Color(("FF$hex").toLong(16))
                else -> fallback
            }
        } else fallback
    }.getOrDefault(fallback)
}

fun formatTime(ms: Long): String {
    val seconds = (ms.coerceAtLeast(0)) / 1000
    val minutes = seconds / 60
    return "$minutes:${(seconds % 60).toString().padStart(2, '0')}"
}

fun platformName(source: String): String = when (source) {
    "all" -> "聚合"
    "wy" -> "网易云"
    "tx" -> "QQ 音乐"
    "kg" -> "酷狗"
    "kw" -> "酷我"
    "mg" -> "咪咕"
    "qishui" -> "汽水"
    else -> "聚合"
}

/** 平台 logo 角标：封面右上角用图标标注来源，替代文字。 */
fun sourceBadgeAsset(source: String?): String? = when (source) {
    "wy" -> "ic_src_wy.png"
    "tx" -> "ic_src_tx.png"
    "kg" -> "ic_src_kg.png"
    "kw" -> "ic_src_kw.png"
    else -> null
}

fun formatPlayCount(count: Long): String = when {
    count >= 100_000_000 -> String.format("%.1f亿", count / 100_000_000.0)
    count >= 10_000 -> "${Math.round(count / 10_000.0)}万"
    count > 0 -> count.toString()
    else -> ""
}

/** 资源目录里的 SVG/PNG 图标（自带多色高光的 SVG 自动保留原色，不被单色滤镜覆盖）。 */
@Composable
fun AssetIcon(
    name: String,
    size: Dp,
    modifier: Modifier = Modifier,
    tint: Color? = if (name.endsWith(".svg") && name !in MULTICOLOR_ASSET_ICONS) TEXT else null,
    alpha: Float = 1f,
    systemSymbol: Boolean = true,
) {
    val context = LocalContext.current
    val isMulticolor = name in MULTICOLOR_ASSET_ICONS || !name.endsWith(".svg")
    val asset = if (!systemSymbol || isMulticolor) name else when (name) {
        "ic_settings.svg" -> "symbol_settings.svg"
        "ic_import.svg" -> "symbol_import.svg"
        "ic_shuffle.svg" -> "symbol_shuffle.svg"
        "ic_repeat.svg" -> "symbol_repeat.svg"
        "ic_download.svg" -> "symbol_download.svg"
        "ic_queue.svg" -> "symbol_queue.svg"
        "ic_more.svg" -> "symbol_more.svg"
        "ic_cast.svg" -> "symbol_cast.svg"
        else -> name
    }
    val effectiveTint = if (isMulticolor) null else tint
    AsyncImage(
        model = remember(context, asset) {
            ImageRequest.Builder(context)
                .data("file:///android_asset/icons/$asset")
                .memoryCacheKey("asset_icon:$asset")
                .crossfade(false)
                .build()
        },
        contentDescription = null,
        colorFilter = effectiveTint?.let { ColorFilter.tint(it) },
        alpha = alpha,
        modifier = modifier.size(size),
    )
}

/** 封面等远程图片：与 Harmony Image(objectFit=Cover) 同语义。 */
@Composable
fun RemoteImage(
    url: String?,
    modifier: Modifier = Modifier,
    contentScale: androidx.compose.ui.layout.ContentScale = androidx.compose.ui.layout.ContentScale.Crop,
) {
    if (url.isNullOrEmpty()) return
    val context = LocalContext.current
    AsyncImage(
        model = ImageRequest.Builder(context).data(url).crossfade(false).build(),
        contentDescription = null,
        contentScale = contentScale,
        modifier = modifier,
    )
}
