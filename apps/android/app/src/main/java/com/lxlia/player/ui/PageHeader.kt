package com.lxlia.player.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 二级及以下页面唯一顶栏（docs/MOBILE_PC_PARITY.md「二级页顶栏」规范）：
 * 38vp 返回球 + 28sp 粗标题 + 12sp 副标题，视觉球顶固定 statusInset + 6vp。
 * 标题块必须与球顶端对齐，只允许副标题向下生长。
 */
@Composable
fun PageHeader(
    title: String,
    subtitle: String = "",
    wide: Boolean = false,
    topInset: Float = 0f,
    backLabel: String = "返回",
    showBack: Boolean = true,
    onBack: () -> Unit = {},
    actions: @Composable () -> Unit = {},
) {
    val horizontal = if (wide) 32.dp else 20.dp
    val insetTop = topInset.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = horizontal,
                end = horizontal,
                top = insetTop + 6.dp,
                bottom = 6.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (showBack) {
            MaterialIconButton(
                icon = "ic_back.svg",
                label = backLabel,
                diameter = 38.dp,
                onClick = onBack,
            )
        }
        Column(
            modifier = Modifier.weight(1f).padding(top = 2.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = title,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = TEXT,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            if (subtitle.isNotEmpty()) {
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = MUTED,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
            actions()
        }
    }
}
