@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.lxlia.player.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

private val COLOR_SWATCHES = listOf(
    "#7DD3FC", "#A5B4FC", "#F9A8D4", "#FDE68A",
    "#86EFAC", "#67E8F9", "#C4B5FD", "#FCA5A5",
    "#FFFFFF", "#E2E8F0", "#38BDF8", "#F472B6",
)

private fun hexToHsvArray(hex: String): FloatArray {
    val clean = hex.removePrefix("#").trim()
    val rgb = if (Regex("^[0-9a-fA-F]{6}$").matches(clean)) clean.toInt(16) else 0x7DD3FC
    val hsv = FloatArray(3)
    android.graphics.Color.RGBToHSV((rgb shr 16) and 0xFF, (rgb shr 8) and 0xFF, rgb and 0xFF, hsv)
    return hsv
}

private fun hsvToHex(h: Float, s: Float, v: Float): String {
    val argb = android.graphics.Color.HSVToColor(floatArrayOf(h.coerceIn(0f, 360f), s.coerceIn(0f, 1f), v.coerceIn(0f, 1f)))
    return String.format(java.util.Locale.US, "#%06X", argb and 0xFFFFFF)
}

/**
 * 液态玻璃风格歌词取色器（严格对齐鸿蒙 ColorPickerSheet）：
 * 2D 饱和度/明度色盘 + 色相彩虹条（含角度读数）+ 12 精选色板 + 色值输入框 + 取消/确定使用。
 */
@Composable
fun ColorPickerDialog(
    title: String,
    initialHex: String,
    wide: Boolean = false,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val initHsv = remember(initialHex) { hexToHsvArray(initialHex) }
    var hue by remember(initialHex) { mutableFloatStateOf(initHsv[0]) }
    var sat by remember(initialHex) { mutableFloatStateOf(initHsv[1]) }
    var bri by remember(initialHex) { mutableFloatStateOf(initHsv[2]) }
    var hexDraft by remember(initialHex) { mutableStateOf(hsvToHex(initHsv[0], initHsv[1], initHsv[2])) }

    fun syncFromHsv() {
        hexDraft = hsvToHex(hue, sat, bri)
    }

    val currentColor = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, bri)))
    val pureHueColor = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 1f, 1f)))

    GlassSheet(onDismiss = onDismiss, wide = wide, large = false) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 22.dp, end = 22.dp, top = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(currentColor)
                        .border(1.5.dp, BORDER_SUBTLE, CircleShape)
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TEXT)
                    Text("拖动色盘或色相条自由调色，也可点击预设色板", fontSize = 12.sp, color = MUTED)
                }
                SheetHeaderTextAction("关闭", color = MUTED, onClick = onDismiss)
            }

            // 2D 饱和度/明度色盘
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(176.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, BORDER_SUBTLE, RoundedCornerShape(16.dp))
                    .pointerInput(Unit) {
                        detectTapGestures { offset ->
                            sat = (offset.x / size.width.coerceAtLeast(1)).coerceIn(0f, 1f)
                            bri = (1f - offset.y / size.height.coerceAtLeast(1)).coerceIn(0f, 1f)
                            syncFromHsv()
                        }
                    }
                    .pointerInput(Unit) {
                        detectDragGestures { change, _ ->
                            change.consume()
                            sat = (change.position.x / size.width.coerceAtLeast(1)).coerceIn(0f, 1f)
                            bri = (1f - change.position.y / size.height.coerceAtLeast(1)).coerceIn(0f, 1f)
                            syncFromHsv()
                        }
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    drawRect(Brush.horizontalGradient(listOf(Color.White, pureHueColor)))
                    drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                    val cx = sat * size.width
                    val cy = (1f - bri) * size.height
                    drawCircle(Color.Black.copy(alpha = 0.55f), radius = 11.dp.toPx(), center = Offset(cx, cy), style = Stroke(width = 3.dp.toPx()))
                    drawCircle(Color.White, radius = 9.dp.toPx(), center = Offset(cx, cy), style = Stroke(width = 2.2.dp.toPx()))
                }
            }

            // 色相滑条
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("色相", fontSize = 12.sp, color = MUTED, modifier = Modifier.weight(1f))
                    Text("${hue.roundToInt()}°", fontSize = 12.sp, color = TEXT)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(28.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .border(0.8.dp, BORDER_SUBTLE, RoundedCornerShape(14.dp))
                        .pointerInput(Unit) {
                            detectTapGestures { offset ->
                                hue = ((offset.x / size.width.coerceAtLeast(1)) * 359f).coerceIn(0f, 359f)
                                syncFromHsv()
                            }
                        }
                        .pointerInput(Unit) {
                            detectDragGestures { change, _ ->
                                change.consume()
                                hue = ((change.position.x / size.width.coerceAtLeast(1)) * 359f).coerceIn(0f, 359f)
                                syncFromHsv()
                            }
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        drawRect(
                            Brush.horizontalGradient(
                                listOf(
                                    Color.Red,
                                    Color.Yellow,
                                    Color.Green,
                                    Color.Cyan,
                                    Color.Blue,
                                    Color.Magenta,
                                    Color.Red,
                                )
                            )
                        )
                        val hx = (hue / 359f).coerceIn(0f, 1f) * size.width
                        drawCircle(Color.Black.copy(alpha = 0.45f), radius = 11.dp.toPx(), center = Offset(hx, size.height / 2f), style = Stroke(width = 3.dp.toPx()))
                        drawCircle(Color.White, radius = 9.dp.toPx(), center = Offset(hx, size.height / 2f), style = Stroke(width = 2.2.dp.toPx()))
                    }
                }
            }

            // 精选色板（34dp 圆形）
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                COLOR_SWATCHES.forEach { swatch ->
                    val active = hexDraft.equals(swatch, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(parseColor(swatch))
                            .border(
                                if (active) 2.5.dp else 1.dp,
                                if (active) (if (AppAppearance.light) ACCENT else Color.White) else BORDER_SUBTLE,
                                CircleShape,
                            )
                            .clickable {
                                val next = hexToHsvArray(swatch)
                                hue = next[0]; sat = next[1]; bri = next[2]
                                hexDraft = swatch.uppercase()
                            },
                    )
                }
            }

            // 十六进制输入框
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("色值", fontSize = 13.sp, color = MUTED)
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(INPUT_BG)
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    BasicTextField(
                        value = hexDraft,
                        onValueChange = { next ->
                            val cleaned = next.uppercase().take(7)
                            hexDraft = cleaned
                            if (Regex("^#[0-9A-F]{6}$").matches(cleaned)) {
                                val parsed = hexToHsvArray(cleaned)
                                hue = parsed[0]; sat = parsed[1]; bri = parsed[2]
                            }
                        },
                        singleLine = true,
                        cursorBrush = SolidColor(ACCENT),
                        textStyle = TextStyle(color = TEXT, fontSize = 14.sp, fontWeight = FontWeight.Medium),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Spacer(Modifier.weight(1f))
                PillButton("取消", filled = false, onClick = onDismiss)
                PillButton("确定使用", filled = true) {
                    onConfirm(hsvToHex(hue, sat, bri))
                }
            }
        }
    }
}
