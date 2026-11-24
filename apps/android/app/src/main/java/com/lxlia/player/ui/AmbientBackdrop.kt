package com.lxlia.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp

/**
 * 封面取色与背景动效：鸿蒙端由共享 MineRadio 引擎驱动，
 * 这里保留同一层结构（模糊封面 + 取色渐变 + 压暗），让舞台 Spring 落位前不留空白。
 */
@Composable
fun AmbientBackdrop(
    playing: Boolean,
    styleName: String,
    coverUrl: String,
    colorFirst: Color,
    colorLast: Color,
    bgImage: String = "",
    bgOpacity: Float = 0.78f,
) {
    val effOpacity = bgOpacity.coerceIn(0f, 1f)
    Box(Modifier.fillMaxSize().background(if (AppAppearance.light) Color(0xFFD0D4DB) else INK)) {
        if (bgImage.isNotEmpty()) {
            val context = androidx.compose.ui.platform.LocalContext.current
            coil.compose.AsyncImage(
                model = remember(context, bgImage) { coil.request.ImageRequest.Builder(context)
                    .data(java.io.File(bgImage))
                    .size(1080, 1920)
                    .crossfade(false)
                    .build() },
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().alpha(effOpacity),
            )
            Box(Modifier.fillMaxSize().background(if (AppAppearance.light) Color(0x38EBF0F6) else Color(0x420C0E12)))
        } else {
            if (coverUrl.isNotEmpty()) {
                val context = androidx.compose.ui.platform.LocalContext.current
                coil.compose.AsyncImage(
                    model = remember(context, coverUrl) { coil.request.ImageRequest.Builder(context)
                        .data(coverUrl)
                        .size(128, 128)
                        .crossfade(false)
                        .build() },
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().blur(36.dp).alpha(effOpacity),
                )
            }
            Box(Modifier.fillMaxSize().background(if (AppAppearance.light) Color(0x59C8CDD4) else Color(0x9E151619)))
        }
    }
}
