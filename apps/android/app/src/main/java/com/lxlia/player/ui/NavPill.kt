package com.lxlia.player.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.ui.liquid.LiquidBottomTab
import com.lxlia.player.ui.liquid.LiquidBottomTabs

/** Harmony dock geometry and labels with Kyant0's layered refraction and damped gestures. */
@Composable
internal fun NavigationPill(
    tab: String,
    width: Float,
    collapsed: Boolean,
    onTab: (String) -> Unit,
    onExpand: () -> Unit,
) {
    val tabs = listOf("发现" to "ic_home.svg", "资料库" to "ic_library.svg", "设置" to "ic_settings.svg")
    val selectedIndex = tabs.indexOfFirst { it.first == tab }.coerceAtLeast(0)
    val currentIndex by rememberUpdatedState(selectedIndex)
    val backdrop = LocalBackdrop.current
    if (collapsed || backdrop == null) {
        GlassSurface(
            modifier = Modifier.width(width.dp).height(56.dp)
                .semantics { contentDescription = "展开导航" }
                .tapNoRipple(onExpand),
            shape = RoundedCornerShape(28.dp),
            interactive = true,
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                AssetIcon(tabs[selectedIndex].second, size = 24.dp, tint = ACCENT)
            }
        }
        return
    }
    if (!supportsFullLiquidGlass()) {
        GlassSurface(modifier = Modifier.width(width.dp).height(56.dp), shape = RoundedCornerShape(28.dp)) {
            Row(Modifier.fillMaxSize().padding(4.dp)) {
                tabs.forEachIndexed { index, (target, icon) ->
                    val selected = index == selectedIndex
                    Column(
                        Modifier.weight(1f).height(48.dp).pressDeform()
                            .clip(RoundedCornerShape(24.dp))
                            .background(if (selected) MUTED.copy(alpha = .12f) else Color.Transparent)
                            .semantics { this.selected = selected }
                            .tapNoRipple { onTab(target) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                    ) { NavigationTabContent(target, icon, selected) }
                }
            }
        }
        return
    }
    LiquidBottomTabs(
        selectedTabIndex = { currentIndex },
        onTabSelected = { onTab(tabs[it].first) },
        backdrop = backdrop,
        tabsCount = tabs.size,
        modifier = Modifier.width(width.dp),
        accentColor = ACCENT,
    ) {
        tabs.forEachIndexed { index, (target, icon) ->
            LiquidBottomTab(
                onClick = { onTab(target) },
                modifier = Modifier.semantics { selected = index == selectedIndex },
            ) {
                NavigationTabContent(target, icon, index == selectedIndex)
            }
        }
    }
}

@Composable
private fun NavigationTabContent(target: String, icon: String, selected: Boolean) {
    AssetIcon(icon, size = 20.dp, tint = if (selected) ACCENT else TEXT)
    Text(
        when (target) { "发现" -> "首页"; "资料库" -> "曲库"; else -> "设置" },
        style = TextStyle(fontSize = 8.sp, lineHeight = 10.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
        color = if (selected) ACCENT else MUTED,
    )
}
