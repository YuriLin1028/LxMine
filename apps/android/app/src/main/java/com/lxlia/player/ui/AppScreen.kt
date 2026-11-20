package com.lxlia.player.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.layout.layout
import androidx.compose.ui.zIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.compose.runtime.CompositionLocalProvider
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.lxlia.player.LxMineApp
import com.lxlia.player.model.MusicPlaylist

/**
 * 应用根界面：与鸿蒙 Index.build() 的层级一致。
 * 背景动效 / 舞台 Web / 主内容 / 顶栏 / 快捷胶囊 / 播控 / 浮层 / 隐藏运行时。
 */
@Composable
fun AppScreen(
    viewModel: AppViewModel,
    lxRuntime: @Composable (Modifier) -> Unit,
    onShowPlayerChanged: (Boolean) -> Unit,
) {
    val showPlayer = viewModel.showPlayer
    val currentShowPlayer by rememberUpdatedState(showPlayer)
    LaunchedEffect(showPlayer, viewModel.allowLandscapeWhenLocked) { onShowPlayerChanged(currentShowPlayer) }

    val context = LocalContext.current
    val stagePlaceholder = remember { com.lxlia.player.model.Song(source = "local", id = "", name = "") }
    LaunchedEffect(viewModel.foreground) {
        if (viewModel.foreground) {
            kotlinx.coroutines.delay(350)
            viewModel.stageMounted = true
            viewModel.dynamicStageMounted = !viewModel.dynamicStageFailed
            viewModel.plainStageMounted = true
        }
    }
    // 音源脚本 / 歌单文件 / 本地音频：系统文件选择器（对应鸿蒙 Document/Audio Picker）。
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            viewModel.importFile(uri, false)
        }
    }
    val sourcePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            uris.forEach { uri ->
                runCatching { context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            }
            viewModel.importSourceFiles(uris)
        }
    }
    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) viewModel.importLocalAudio(uris)
    }
    val downloadExportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/*")) { uri ->
        if (uri != null) viewModel.exportDownload(uri)
    }
    LaunchedEffect(viewModel.downloadExportRequest) {
        if (viewModel.downloadExportRequest == 0L) return@LaunchedEffect
        val item = viewModel.downloadItems.firstOrNull { it.id == viewModel.pendingDownloadExportId } ?: return@LaunchedEffect
        downloadExportPicker.launch(viewModel.app.downloads.exportName(item))
    }
    LaunchedEffect(viewModel.filePickRequest) {
        if (viewModel.filePickRequest == 0L) return@LaunchedEffect
        // Providers use inconsistent MIME types for .js files. Validate the selected contents instead.
        val mime = arrayOf("*/*")
        runCatching {
            if (viewModel.pendingFilePickForSource) sourcePicker.launch(mime) else filePicker.launch(mime)
        }.onFailure { viewModel.error = "无法打开文件选择器：${it.message}" }
    }
    LaunchedEffect(viewModel.audioPickRequest) {
        if (viewModel.audioPickRequest == 0L) return@LaunchedEffect
        runCatching { audioPicker.launch(arrayOf("audio/*")) }
    }
    // 智能识别需要媒体库读权限：先申请，授权后再扫描（未授权时明确提示）。
    val mediaPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        android.Manifest.permission.READ_MEDIA_AUDIO
    } else {
        android.Manifest.permission.READ_EXTERNAL_STORAGE
    }
    val audioPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.startScan()
        else viewModel.error = "没有媒体库读取权限，无法智能识别本地音频"
    }
    LaunchedEffect(viewModel.scanRequest) {
        if (viewModel.scanRequest == 0) return@LaunchedEffect
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(context, mediaPermission) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) viewModel.startScan() else runCatching { audioPermissionLauncher.launch(mediaPermission) }
    }

    val view = LocalView.current
    val systemDark = isSystemInDarkTheme()
    val light = when (viewModel.appearance) {
        "light" -> true
        "dark" -> false
        else -> !systemDark
    }
    SideEffect {
        if (viewModel.foreground && viewModel.showPlayer) {
            viewModel.stageMounted = true
            if (viewModel.styleName == "off") viewModel.plainStageMounted = true else if (!viewModel.dynamicStageFailed) viewModel.dynamicStageMounted = true
        }
        AppAppearance.light = light
        (view.context as? android.app.Activity)?.window?.let { window ->
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = light
                isAppearanceLightNavigationBars = light
            }
        }
    }
    DisposableEffect(Unit) {
        val window = (view.context as? android.app.Activity)?.window
        if (window != null) WindowCompat.setDecorFitsSystemWindows(window, false)
        onDispose { }
    }

    val density = LocalDensity.current
    val statusInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    // 背景与页面内容分别录制，内容内的控件只采样背景，底栏同时采样页面。
    val levelBackdrop = rememberLayerBackdrop()
    // 内容层内部的玻璃只采样背景（不采样内容自身），避免递归，同时保留 lens/高光。
    val innerBackdrop = rememberLayerBackdrop {
        drawRect(INK)
        drawContent()
    }
    val pageBackdrop = rememberCombinedBackdrop(innerBackdrop, levelBackdrop)
    val backdrop = if (viewModel.showPlayer) innerBackdrop else pageBackdrop
    // 菜单/弹窗走应用内宿主，才能拿到主窗口 backdrop 做真玻璃。
    val glassOverlay = remember { GlassOverlayState() }
    val pageStates = rememberSaveableStateHolder()
    // 传给状态层的全部是 dp（与鸿蒙 vp 同一语义），界面直接用 .dp 落位。
    val statusInsetDp = statusInset.value
    val bottomInsetDp = navInset.value

    BackHandler {
        if (!viewModel.onBackPress()) {
            (view.context as? android.app.Activity)?.finish()
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize().background(INK)) {
        val widthDp = maxWidth.value
        val heightDp = maxHeight.value
        LaunchedEffect(widthDp, heightDp, statusInsetDp, bottomInsetDp) {
            viewModel.configureViewport(widthDp.toInt(), heightDp.toInt(), statusInsetDp, bottomInsetDp)
        }
        val colorFirst = parseColor(viewModel.coverColors.first)
        val colorLast = parseColor(viewModel.coverColors.last)
        val playerReveal by androidx.compose.animation.core.animateFloatAsState(
            targetValue = if (viewModel.showPlayer) 1f else 0f,
            animationSpec = androidx.compose.animation.core.spring(
                dampingRatio = 0.74f,
                stiffness = androidx.compose.animation.core.Spring.StiffnessMediumLow,
            ),
            label = "player-reveal-content",
        )
        // 详情页使用同一舞台，主页面保留状态并隐藏。
        val chromeVisible = !viewModel.showPlayer
        val playerControlsVisible = !showPlayer || viewModel.stageControlsVisible
        val playerControlsReveal = androidx.compose.animation.core.animateFloatAsState(
            if (playerControlsVisible) 1f else 0f,
            androidx.compose.animation.core.tween(280, easing = androidx.compose.animation.core.CubicBezierEasing(.2f, .8f, .2f, 1f)),
            label = "player-chrome",
        )

        ProvideBackdropTint(colorFirst, colorLast) {
            CompositionLocalProvider(
                LocalBackdrop provides backdrop,
                LocalGlassOverlay provides glassOverlay,
                LocalGlassInk provides TEXT,
            ) {
                MaterialTheme(
                    colorScheme = if (light) lightColorScheme(
                        primary = ACCENT, onPrimary = Color.White,
                        background = INK, onBackground = TEXT,
                        surface = Color(0xFFE3E6EB), onSurface = TEXT,
                        surfaceContainer = Color(0xFFE3E6EB),
                        surfaceVariant = Color(0xFFD3D8DF), onSurfaceVariant = MUTED,
                    ) else darkColorScheme(
                        primary = ACCENT,
                        onPrimary = ON_ACCENT,
                        background = INK,
                        onBackground = TEXT,
                        surface = Color(0xFF1A1C1F),
                        onSurface = TEXT,
                        surfaceContainer = Color(0xFF1A1C1F),
                        surfaceContainerHigh = Color(0xFF202226),
                        surfaceContainerHighest = Color(0xFF232529),
                        surfaceVariant = Color(0xFF232529),
                        onSurfaceVariant = MUTED,
                        outline = Color(0x33FFFFFF),
                        secondary = ACCENT,
                        error = Color(0xFFFFB4B4),
                    ),
                ) {
                    CompositionLocalProvider(
                        LocalTextStyle provides TextStyle(
                            fontSize = 16.sp,
                            platformStyle = PlatformTextStyle(includeFontPadding = false),
                        ),
                    ) {
                        Box(Modifier.fillMaxSize()) {
                            // Shared ambient wash, followed by the Web stage and native page content.
                            Box(Modifier.fillMaxSize()) {
                              // AndroidView/WebView draws through a native render
                              // node. Recording it into the glass sampling layer
                              // can lose its content when that layer is replayed.
                              // Capture the native cover/background once and draw
                              // the two cached WebViews as ordinary siblings.
                              Box(Modifier.fillMaxSize().layerBackdrop(innerBackdrop)) {
                                if (showPlayer && !viewModel.commentsOpen) AmbientBackdrop(
                                    playing = viewModel.playing,
                                    styleName = if (viewModel.dynamicStageFailed) "off" else viewModel.styleName,
                                    coverUrl = viewModel.selected?.coverUrl.orEmpty(),
                                    colorFirst = colorFirst,
                                    colorLast = colorLast,
                                    bgImage = viewModel.stageBgImagePath,
                                    bgOpacity = viewModel.stageBgOpacity,
                                )
                              }
                                val selected = viewModel.selected ?: stagePlaceholder
                                if (viewModel.stageMounted) {
                                    for (plain in listOf(false, true)) {
                                        val mounted = if (plain) viewModel.plainStageMounted else viewModel.dynamicStageMounted
                                        val visible = viewModel.foreground && showPlayer && !viewModel.commentsOpen &&
                                            (if (plain) viewModel.styleName == "off" || !viewModel.dynamicStageReady else viewModel.styleName != "off" && !viewModel.dynamicStageFailed)
                                        if (mounted) key(plain) {
                                            MineRadioStage(
                                                song = selected,
                                                audioUrl = viewModel.playbackUrl,
                                                lines = viewModel.lyrics,
                                                translationLines = viewModel.stageTranslations,
                                                lyricColorMode = if (viewModel.lyricPrefs.colorMode.endsWith("gradient")) "custom-gradient" else "custom-solid",
                                                lyricPrimary = viewModel.previewPrimary(),
                                                lyricSecondary = viewModel.previewSecondary(),
                                                lyricScale = viewModel.lyricPrefs.lyricScale,
                                                mode = if (plain) "off" else viewModel.dynamicStyle,
                                                light = light,
                                                bgImage = viewModel.stageBgDataUrl,
                                                bgOpacity = viewModel.stageBgOpacity,
                                                duration = viewModel.duration,
                                                lyricOffset = viewModel.lyricOffset,
                                                playing = viewModel.playing && viewModel.foreground,
                                                positionMs = viewModel.positionMs,
                                                topInset = statusInsetDp + 72,
                                                bottomInset = bottomInsetDp + 164,
                                                visible = visible,
                                                seekable = viewModel.showPlayer,
                                                interactive = if (plain) viewModel.styleName == "off" || viewModel.dynamicStageFailed
                                                    else viewModel.styleName != "off" && !viewModel.dynamicStageFailed,
                                                onSeek = { viewModel.seek(it) },
                                                onDegraded = {
                                                    viewModel.dynamicStageReady = false
                                                    viewModel.dynamicStageFailed = true
                                                    viewModel.dynamicStageMounted = false
                                                    viewModel.plainStageMounted = true
                                                    viewModel.notify("图形资源暂不可用，已临时使用纯文字歌词")
                                                },
                                                onVisualReady = { if (!plain && viewModel.foreground && viewModel.styleName != "off") viewModel.dynamicStageReady = true },
                                                onImmersiveToggle = { show -> viewModel.toggleStageControls(show) },
                                                modifier = Modifier.fillMaxSize().graphicsLayer {
                                                    alpha = when {
                                                        !visible -> 0f
                                                        plain -> 1f
                                                        viewModel.dynamicStageReady -> 1f
                                                        else -> 0.001f
                                                    }
                                                },
                                            )
                                        }
                                    }
                                }
                                if (!showPlayer) Box(Modifier.fillMaxSize().background(INK))
                            }
                            // 鸿蒙在播放详情展开时保留页面树，返回后恢复同一滚动位置、输入和排列状态。
                            // 隐藏期间不放置页面，WebView 仍能接收播放页手势。
                            Box(Modifier.fillMaxSize().zIndex(if (showPlayer) -1f else 0f)
                                    .layout { measurable, constraints ->
                                    val placeable = measurable.measure(constraints)
                                    layout(placeable.width, placeable.height) {
                                        if (!showPlayer) placeable.place(0, 0)
                                    }
                                }
                                    .layerBackdrop(levelBackdrop)) {
                                // 内容里的玻璃采样 innerBackdrop（只有背景），不会采到自己。
                                CompositionLocalProvider(LocalBackdrop provides innerBackdrop) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .layout { measurable, constraints ->
                                            val placeable = measurable.measure(constraints)
                                            layout(placeable.width, placeable.height) {
                                                if (viewModel.feedSection.isEmpty()) placeable.place(0, 0)
                                            }
                                        }
                                            .padding(
                                            start = if (viewModel.tab == "发现") (if (viewModel.searchOpen) 20.dp else 0.dp) else (if (viewModel.wide) 32.dp else 20.dp),
                                            end = if (viewModel.tab == "发现") (if (viewModel.searchOpen) 20.dp else 0.dp) else (if (viewModel.wide) 32.dp else 20.dp),
                                        ),
                                    ) {
                                        // Save scroll/form state while composing only the active tab.
                                        pageStates.SaveableStateProvider(viewModel.tab) {
                                            when (viewModel.tab) {
                                                "发现" -> DiscoverTab(viewModel)
                                                "资料库" -> LibraryTab(viewModel)
                                                else -> SettingsTab(viewModel)
                                            }
                                        }
                                    }
                                    if (viewModel.feedSection.isNotEmpty()) {
                                        FeedOverlay(viewModel)
                                    }
                                }
                            }
                            if (!showPlayer && viewModel.feedSection.isEmpty()) {
                                PageEdgeBlur(pageBackdrop, viewModel.headerHeight() + 24f, viewModel.viewportHeight * 0.06f)
                            }
                            // 顶栏
                            if (chromeVisible && viewModel.feedSection.isEmpty()) AppHeader(viewModel)
                            // 快捷胶囊（首页、非搜索、非播放页）
                            if (chromeVisible && viewModel.tab == "发现" && !viewModel.showPlayer && !viewModel.searchOpen &&
                                (viewModel.feedSection.isEmpty() || viewModel.feedClosing) && viewModel.openedPlaylist == null && viewModel.homeFeed != null
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = if (viewModel.wide) 32.dp else 20.dp)
                                        .padding(top = (viewModel.headerHeight() + 8).dp),
                                ) {
                                    HomeChips(
                                        active = viewModel.homeChipAnchor,
                                        onChip = { anchor -> viewModel.onHomeChip(anchor); viewModel.requestScrollToAnchor(anchor) },
                                    )
                                }
                            }
                            // 首页搜索入口（胶囊 ↔ 圆球同一个节点）
                            if (chromeVisible && viewModel.tab == "发现" && !viewModel.showPlayer && viewModel.feedSection.isEmpty()) {
                                HomeSearchEntry(viewModel)
                            }
                            // 错误提示
                            if (viewModel.error.isNotEmpty() && !viewModel.showSheet) {
                                ErrorToast(
                                    text = viewModel.error,
                                    bottomPadding = (if (viewModel.selected != null) 158 else 80).dp + navInset,
                                    onClick = { viewModel.error = "" },
                                )
                            } else if (viewModel.toastMessage.isNotEmpty() && !viewModel.showSheet) {
                                GlassToast(
                                    text = viewModel.toastMessage,
                                    bottomPadding = (if (viewModel.selected != null) 158 else 80).dp + navInset,
                                )
                            }
                            // 播放详情（内部做展开/回收动画与控件显隐）
                            if (viewModel.selected != null) {
                                PlayerOverlay(viewModel, playerControlsReveal)
                            }
                            // 底栏永远在最上层（板块浮层/详情之上），与鸿蒙 DockLayer 同层级。
                            // 鸿蒙版弹键盘时底栏不随输入法上浮，这里也只按系统导航栏 inset 固定。
                            val likedSet = viewModel.likedKeys
                            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = navInset + 8.dp)
                                .playerChromeVisibility(playerControlsVisible, playerControlsReveal, 24.dp)) {
                                DockLayer(
                                    song = viewModel.selected,
                                    tab = viewModel.tab,
                                    playing = viewModel.playing,
                                    busy = viewModel.resolving,
                                    availableWidth = viewModel.viewportWidth,
                                    landscape = viewModel.landscape,
                                    searchOpen = viewModel.searchOpen,
                                    secondary = viewModel.secondaryDock(),
                                    detail = viewModel.showPlayer,
                                    compact = viewModel.dockCollapsed || viewModel.viewportHeight < 500,
                                    mode = viewModel.mode,
                                    positionMs = viewModel.positionMs,
                                    duration = viewModel.duration,
                                    colorFirst = colorFirst,
                                    colorLast = colorLast,
                                    liked = viewModel.selected?.let { it.key in likedSet } == true,
                                    onTab = { viewModel.navigateTab(it) },
                                    onPlayer = {
                                        if (viewModel.selected != null) {
                                            viewModel.showPlayer = true
                                        } else {
                                            viewModel.tab = "发现"
                                            viewModel.openSearch()
                                        }
                                    },
                                    onToggle = { viewModel.togglePlayback() },
                                    onNext = { step -> viewModel.advance(step) },
                                    onQueue = { viewModel.openSheet("播放队列") },
                                    onMode = { viewModel.cycleField("mode") },
                                    onDownload = { viewModel.selected?.let { viewModel.downloadSong(it) } },
                                    onLike = { viewModel.selected?.let { viewModel.like(it) } },
                                    onExpand = { viewModel.expandDock() },
                                    onSeek = { viewModel.seek(it) },
                                )
                            }
                            if (viewModel.commentsOpen) {
                                CommentsOverlay(viewModel)
                            }
                            if (viewModel.scanOpen) {
                                LocalScanDialog(
                                    items = viewModel.scanItems,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onCancel = { viewModel.closeScanDialog() },
                                    onConfirm = { viewModel.confirmScan(it) },
                                )
                            }
                            if (viewModel.orderOpen) {
                                SongOrderDialog(
                                    songs = viewModel.orderSongs,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onCancel = { viewModel.orderOpen = false },
                                    onDone = { viewModel.applyManualOrder(it) },
                                )
                            }
                            viewModel.editPlaylistTarget?.let { target ->
                                PlaylistEditDialog(
                                    playlist = target,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onCancel = { viewModel.editPlaylistTarget = null },
                                    onDownloadSelected = { viewModel.downloadBatch(it) },
                                    onSave = { newName, newSongs ->
                                        viewModel.saveEditedPlaylist(target.id, newName, newSongs)
                                    },
                                )
                            }
                            viewModel.switchPlatformTarget?.let { target ->
                                SwitchPlatformDialog(
                                    vm = viewModel,
                                    target = target,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onDismiss = { viewModel.switchPlatformTarget = null },
                                    onSelect = { candidate -> viewModel.confirmSwitchPlatform(candidate) },
                                )
                            }
                            AppSheets(viewModel)
                            // 菜单宿主绘制在页面浮层之上，同步确认置于菜单之上。
                            GlassOverlayHost(glassOverlay)
                            IncomingSyncDialog(viewModel)
                            AppUpdateDialog(vm = viewModel, wide = viewModel.wide)
                            LaunchedEffect(Unit) {
                                kotlinx.coroutines.delay(5500)
                                viewModel.checkAppUpdate(silent = true)
                            }
                            // 隐藏的 LX 运行时（1dp，不参与布局观感）：等首帧画完再挂载，别抢启动。
                            var runtimeMounted by remember { mutableStateOf(false) }
                            LaunchedEffect(Unit) {
                                kotlinx.coroutines.delay(700)
                                runtimeMounted = true
                            }
                            if (runtimeMounted) {
                                Box(Modifier.size(1.dp).align(Alignment.TopStart)) {
                                    lxRuntime(Modifier.fillMaxSize())
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PageEdgeBlur(backdrop: Backdrop, topHeight: Float, bottomHeight: Float) {
    Box(Modifier.fillMaxSize()) {
        listOf(true, false).forEach { top ->
            Box(
                Modifier.align(if (top) Alignment.TopCenter else Alignment.BottomCenter)
                    .fillMaxWidth().height((if (top) topHeight else bottomHeight).dp)
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        val colors = if (top) listOf(Color.White, Color.Transparent)
                            else listOf(Color.Transparent, Color.White.copy(alpha = 0.7f))
                        drawRect(Brush.verticalGradient(colors), blendMode = BlendMode.DstIn)
                    }
                    .drawBackdrop(
                        backdrop = backdrop,
                        shape = { RectangleShape },
                        effects = { blur(10.dp.toPx()) },
                        highlight = null,
                        shadow = null,
                    ),
            )
        }
    }
}

@Composable
private fun ErrorToast(text: String, bottomPadding: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        GlassSurface(
            modifier = Modifier
                .padding(bottom = bottomPadding)
                .fillMaxWidth(0.9f)
                .tapNoRipple(onClick),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
            tone = GlassTone.Menu,
            floating = true,
        ) {
            Text(
                text,
                fontSize = 13.sp,
                color = Color(0xFFFFB4B4),
                modifier = Modifier.padding(16.dp),
            )
        }
    }
}

@Composable
private fun DiscoverTab(viewModel: AppViewModel) {
    val states = rememberSaveableStateHolder()
    val page = when {
        !viewModel.searchOpen -> "home"
        viewModel.openedEntity != null -> "entity-${viewModel.openedEntity!!.source}-${viewModel.openedEntity!!.id}"
        else -> "search-${viewModel.submitted}-${viewModel.platform.id}-${viewModel.searchKind}"
    }
    states.SaveableStateProvider(page) {
    when {
        !viewModel.searchOpen -> HomePage(
            vm = viewModel,
            contentTop = viewModel.headerHeight(),
            wide = viewModel.wide,
            onAnchorOffset = { anchor, y -> viewModel.storeAnchorOffset(anchor, y) },
            onScrollOffset = { offset, moving -> viewModel.homeScroll(offset, canTrackDock = moving) },
            onEdgeBottom = { atBottom -> viewModel.homeAtBottom = atBottom },
        )
        viewModel.openedEntity != null -> EntitySongList(viewModel)
        viewModel.entities.isNotEmpty() -> CatalogueResults(viewModel)
        viewModel.results.isNotEmpty() -> SearchSongList(viewModel)
        viewModel.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            androidx.compose.material3.CircularProgressIndicator(color = ACCENT, strokeWidth = 2.5.dp, modifier = Modifier.size(32.dp))
        }
        else -> SearchLanding(viewModel)
    }
    }
}
