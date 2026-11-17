package com.lxlia.player.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lxlia.player.lx.SearchSource

/** 一级页顶栏与二级页顶栏共用一个宿主，几何与鸿蒙 Index.header() 一致。 */
@Composable
fun AppHeader(vm: AppViewModel) {
    Box(Modifier.fillMaxWidth().height(vm.headerHeight().dp)) {
        if (vm.secondaryHeader()) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PageHeader(
                    title = vm.secondaryTitle(),
                    subtitle = vm.secondarySubtitle(),
                    wide = vm.wide,
                    topInset = vm.statusInset,
                    backLabel = vm.secondaryBackLabel(),
                    onBack = vm.secondaryBack(),
                )
                if (vm.tab == "发现" && vm.searchOpen) {
                    // 搜索胶囊由 HomeSearchEntry 单独绘制；这里保留 48dp 占位与下方平台/类型胶囊。
                    Spacer(Modifier.height(48.dp))
                    SearchFilterRow(vm)
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = if (vm.wide) 32.dp else 20.dp,
                        end = if (vm.wide) 32.dp else 20.dp,
                        top = vm.statusInset.dp + 6.dp,
                        bottom = 12.dp,
                    ),
            ) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(
                        modifier = Modifier.weight(1f).padding(top = 2.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(
                            vm.primaryTitle(),
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = TEXT,
                            maxLines = 1,
                            modifier = Modifier.pointerInput(vm.tab) {
                                // 双击左上角 LxMine 标题 = 刷新首页内容（与 PC 端一致）。
                                detectTapGestures(
                                    onDoubleTap = {
                                        if (vm.tab == "发现") {
                                            vm.pendingHomeFeed = null
                                            vm.homeFeed = null
                                            vm.refreshHomeFeed(true)
                                        }
                                    },
                                )
                            },
                        )
                        if (vm.headerSubtitle().isNotEmpty()) {
                            Text(vm.headerSubtitle(), fontSize = 12.sp, color = MUTED)
                        }
                    }
                    if (vm.tab == "资料库" && vm.openedPlaylist == null && !vm.downloadsOpen) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                            MaterialIconButton("refresh.svg", "随机排列", diameter = 38.dp, onClick = { vm.refreshLibraryMosaic() })
                            MaterialIconButton("ic_download.svg", "下载管理", diameter = 38.dp, onClick = { vm.openDownloads() })
                            MaterialIconButton("ic_import.svg", "导入歌单", diameter = 38.dp, onClick = { vm.openSheet("导入歌单") })
                            MaterialIconButton("ic_plus.svg", "新建歌单", diameter = 38.dp, onClick = { vm.openSheet("新建歌单") })
                        }
                    }
                }
            }
        }
        // 本地音乐页右上角动作：智能识别 / 导入 / 搜索本列表（与 PageHeader 的 38vp 球同高）。
        val opened = vm.openedPlaylist
        if (vm.secondaryHeader() && opened != null && opened.kind == "local") {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = if (vm.wide) 32.dp else 20.dp, top = vm.statusInset.dp + 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MaterialIconButton("ic_sparkle.svg", "智能识别手机里的音频", diameter = 38.dp, enabled = !vm.localMusicBusy, onClick = { vm.scanLocalMusic() })
                MaterialIconButton("ic_import.svg", "导入本地音频", diameter = 38.dp, enabled = !vm.localMusicBusy, onClick = { vm.pickLocalAudio() })
                MaterialIconButton("ic_search.svg", "搜索本列表", diameter = 38.dp, onClick = {
                    vm.listSearchOpen = !vm.listSearchOpen
                    if (!vm.listSearchOpen) vm.listQuery = ""
                })
            }
        }
        if (vm.secondaryHeader() && opened != null && opened.kind != "local") {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = if (vm.wide) 32.dp else 20.dp, top = vm.statusInset.dp + 6.dp),
            ) {
                MaterialIconButton("ic_search.svg", "搜索本列表", diameter = 38.dp, onClick = {
                    vm.listSearchOpen = !vm.listSearchOpen
                    if (!vm.listSearchOpen) vm.listQuery = ""
                })
            }
        }
    }
}

@Composable
private fun SearchFilterRow(vm: AppViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(36.dp)
            .padding(horizontal = if (vm.wide) 34.dp else 22.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("平台", fontSize = 12.sp, color = MUTED)
            CapsuleSelect(
                label = vm.platform.label,
                items = vm.platforms.map { it.label },
                modifier = Modifier.weight(1f),
                onSelect = { index ->
                    vm.platform = vm.platforms[index]
                    vm.searchToken++
                    vm.loading = false
                    vm.results = emptyList()
                    vm.entities = emptyList()
                    vm.openedEntity = null
                    if (vm.keyword.trim().isNotEmpty()) vm.search()
                },
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("类型", fontSize = 12.sp, color = MUTED)
            CapsuleSelect(
                label = vm.searchKinds[vm.searchKindIds.indexOf(vm.searchKind).coerceAtLeast(0)],
                items = vm.searchKinds,
                modifier = Modifier.weight(1f),
                onSelect = { index ->
                    vm.searchKind = vm.searchKindIds[index]
                    vm.searchToken++
                    vm.loading = false
                    vm.results = emptyList()
                    vm.entities = emptyList()
                    if (vm.keyword.trim().isNotEmpty()) vm.search()
                },
            )
        }
    }
}

@Composable
private fun CapsuleSelect(label: String, items: List<String>, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    val menu = rememberGlassMenuTrigger {
        items.mapIndexed { index, item ->
            GlassMenuItem(item, selected = item == label) { onSelect(index) }
        }
    }
    GlassSurface(
        modifier = modifier.height(30.dp).then(menu.modifier).tapNoRipple { menu.show() },
        shape = RoundedCornerShape(15.dp),
        tone = GlassTone.UltraThin,
        interactive = true,
    ) {
        Box(Modifier.fillMaxWidth().height(30.dp), contentAlignment = Alignment.CenterStart) {
            Text(label, fontSize = 13.sp, color = LocalGlassInk.current, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 12.dp))
        }
    }
}

/** 搜索入口：一根胶囊同时承担“展开的搜索条”和“收起后的圆球”，只改变几何不重建。 */
@Composable
fun HomeSearchEntry(vm: AppViewModel) {
    val morph = vm.searchMorph
    val pad = if (vm.wide) 32f else 20f
    val barWidth = vm.viewportWidth - pad * 2
    val barY = vm.statusInset + 70f
    val ballX = vm.viewportWidth - pad - 44f
    val ballY = vm.statusInset + 10f
    val spec = spring<Float>(dampingRatio = 0.83f, stiffness = Spring.StiffnessMediumLow)
    val rawMorph by animateFloatAsState(morph, spec, label = "search-morph")
    val animatedMorph = rawMorph.coerceIn(0f, 1f)
    val x = pad + (ballX - pad) * animatedMorph
    val y = barY + (ballY - barY) * animatedMorph
    val width = barWidth + (44f - barWidth) * animatedMorph
    val height = 48f - 4f * animatedMorph
    val radius = 24f - 2f * animatedMorph
    val fade = (1f - animatedMorph * 2.2f).coerceAtLeast(0f)
    var pressed by remember { mutableStateOf(false) }
    val focusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(vm.searchOpen) {
        if (vm.searchOpen) {
            val token = vm.searchToken
            kotlinx.coroutines.delay(120)
            if (vm.searchToken == token) runCatching { focusRequester.requestFocus() }
        }
    }
    LaunchedEffect(vm.searchToken) {
        if (vm.searchOpen && vm.loading) {
            focusManager.clearFocus()
            keyboard?.hide()
        }
    }
    val scale by animateFloatAsState(if (pressed) GLASS_PRESS_SCALE else 1f, spring(0.9f, Spring.StiffnessMedium), label = "search-press")
    val pressScale = scale

    Box(
        Modifier
            .offset(x = x.dp, y = y.dp)
            .width(width.dp)
            .height(height.dp)
            .graphicsScale(pressScale),
    ) {
        GlassSurface(
            modifier = Modifier
                .fillMaxWidth()
                .height(height.dp)
                .semantics { contentDescription = "搜索歌曲、歌手" }
                .clickable(
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    indication = null,
                    onClick = { vm.openSearch() },
                ),
            shape = RoundedCornerShape(radius.dp),
            tone = GlassTone.UltraThin,
            liquid = true,
            interactive = true,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().height(height.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AssetIcon("ic_search.svg", size = 20.dp, alpha = 0.72f, tint = LocalGlassInk.current)
                val ink = LocalGlassInk.current
                if (vm.searchOpen) {
                    BasicTextField(
                        value = vm.keyword,
                        cursorBrush = SolidColor(CONTROL_BLUE),
                        onValueChange = { vm.keyword = it },
                        singleLine = true,
                        textStyle = TextStyle(color = ink, fontSize = 15.sp),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            imeAction = androidx.compose.ui.text.input.ImeAction.Search,
                        ),
                        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                            onSearch = { vm.search() },
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(height.dp)
                            .focusRequester(focusRequester),
                        // 输入文字和占位文字都放进同一个居中的 decorationBox，
                        // 不再让 BasicTextField 顶部对齐后和胶囊错位。
                        decorationBox = { innerTextField ->
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                                if (vm.keyword.isEmpty()) {
                                    Text("歌曲、歌手", fontSize = 15.sp, color = ink.copy(alpha = 0.55f))
                                }
                                innerTextField()
                            }
                        },
                    )
                    Text(
                        "搜索",
                        fontSize = 13.sp,
                        color = ink,
                        modifier = Modifier.clickable { vm.search() }.padding(4.dp),
                    )
                } else if (animatedMorph < 0.5f) {
                    Text("歌曲、歌手", fontSize = 15.sp, color = ink.copy(alpha = 0.55f), modifier = Modifier.weight(1f).graphicsAlpha(fade))
                    Text("搜索", fontSize = 13.sp, color = ink.copy(alpha = 0.55f), modifier = Modifier.graphicsAlpha(fade))
                }
            }
        }
    }
}

private fun Modifier.graphicsScale(value: Float): Modifier = this.graphicsLayer {
    scaleX = value
    scaleY = value
}

private fun Modifier.graphicsAlpha(value: Float): Modifier = this.graphicsLayer { alpha = value }
