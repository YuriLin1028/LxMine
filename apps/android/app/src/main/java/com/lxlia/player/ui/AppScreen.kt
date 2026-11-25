package com.lxlia.player.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.displayCutout
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
            val eff = viewModel.effectiveStyleName()
            if (eff != "off") {
                if (eff.startsWith("folia-")) viewModel.lastFoliaStyle = eff
                else viewModel.lastMineStyle = eff
            }
            viewModel.stageMounted = true
            when {
                eff == "off" || viewModel.dynamicStageFailed -> viewModel.plainStageMounted = true
                eff.startsWith("folia-") -> viewModel.foliaStageMounted = true
                else -> viewModel.mineStageMounted = true
            }
            viewModel.syncDynamicStageReady()
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
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            viewModel.exportDownload(uri)
        }
    }
    val batchFolderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            viewModel.executeBatchDownloadToTree(uri)
        } else {
            viewModel.pendingBatchDownloadSongs = emptyList()
        }
    }
    val batchExportFolderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            }
            viewModel.exportDownloadsBatchToTree(uri)
        } else {
            viewModel.pendingBatchExportDownloadIds = emptyList()
        }
    }
    val playlistCoverPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) viewModel.importPlaylistCoverImage(uri) else viewModel.pendingCoverPickPlaylistId = ""
    }
    val earMonitorPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        viewModel.onEarMonitorPermissionResult(granted)
    }
    LaunchedEffect(viewModel.playlistCoverPickRequest) {
        if (viewModel.playlistCoverPickRequest == 0L) return@LaunchedEffect
        runCatching { playlistCoverPicker.launch("image/*") }
            .onFailure { viewModel.notify("无法打开系统相册", 2000) }
    }
    LaunchedEffect(viewModel.earMonitorPermissionRequest) {
        if (viewModel.earMonitorPermissionRequest == 0L) return@LaunchedEffect
        runCatching { earMonitorPermissionLauncher.launch(android.Manifest.permission.RECORD_AUDIO) }
            .onFailure { viewModel.notify("无法申请麦克风权限", 2000) }
    }
    LaunchedEffect(viewModel.downloadExportRequest) {
        if (viewModel.downloadExportRequest == 0L) return@LaunchedEffect
        val item = viewModel.downloadItems.firstOrNull { it.id == viewModel.pendingDownloadExportId } ?: return@LaunchedEffect
        downloadExportPicker.launch(viewModel.app.downloads.exportName(item))
    }
    LaunchedEffect(viewModel.batchFolderPickRequest) {
        if (viewModel.batchFolderPickRequest == 0L) return@LaunchedEffect
        runCatching { batchFolderPicker.launch(null) }
            .onFailure { viewModel.error = "无法打开系统目录选择器：${it.message}" }
    }
    LaunchedEffect(viewModel.batchExportFolderPickRequest) {
        if (viewModel.batchExportFolderPickRequest == 0L) return@LaunchedEffect
        runCatching { batchExportFolderPicker.launch(null) }
            .onFailure { viewModel.error = "无法打开系统目录选择器：${it.message}" }
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
    val effectiveStyle = viewModel.effectiveStyleName()
    LaunchedEffect(viewModel.foreground, viewModel.showPlayer, effectiveStyle, viewModel.dynamicStageFailed) {
        if (viewModel.foreground && viewModel.showPlayer) {
            viewModel.stageMounted = true
            when {
                effectiveStyle == "off" || viewModel.dynamicStageFailed -> viewModel.plainStageMounted = true
                effectiveStyle.startsWith("folia-") -> viewModel.foliaStageMounted = true
                else -> viewModel.mineStageMounted = true
            }
        }
    }
    LaunchedEffect(light, view) {
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
    val layoutDirection = androidx.compose.ui.platform.LocalLayoutDirection.current
    val statusInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navPadding = WindowInsets.navigationBars.asPaddingValues()
    val cutoutPadding = WindowInsets.displayCutout.asPaddingValues()
    val navInset = navPadding.calculateBottomPadding()
    val leftInsetDp = maxOf(
        navPadding.calculateLeftPadding(layoutDirection).value,
        cutoutPadding.calculateLeftPadding(layoutDirection).value,
    )
    val rightInsetDp = maxOf(
        navPadding.calculateRightPadding(layoutDirection).value,
        cutoutPadding.calculateRightPadding(layoutDirection).value,
    )
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
    val statusInsetDp = maxOf(statusInset.value, cutoutPadding.calculateTopPadding().value)
    val bottomInsetDp = navInset.value

    BackHandler {
        if (!viewModel.onBackPress()) {
            (view.context as? android.app.Activity)?.finish()
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize().background(INK)) {
        val widthDp = maxWidth.value
        val heightDp = maxHeight.value
        val liveWidth = widthDp.toInt().coerceAtLeast(1)
        val liveHeight = heightDp.toInt().coerceAtLeast(1)
        val liveLandscape = liveWidth > liveHeight
        LaunchedEffect(liveWidth, liveHeight, statusInsetDp, bottomInsetDp, leftInsetDp, rightInsetDp) {
            viewModel.configureViewport(liveWidth, liveHeight, statusInsetDp, bottomInsetDp, leftInsetDp, rightInsetDp)
        }
        val colorFirst = parseColor(viewModel.coverColors.first)
        val colorLast = parseColor(viewModel.coverColors.last)
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
                LocalRootGlassOverlay provides glassOverlay,
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
                                val needPlayerAmbient = showPlayer && !viewModel.commentsOpen && (
                                    !((effectiveStyle == "sonic-workshop" || effectiveStyle.startsWith("folia-")) && viewModel.dynamicStageReady) ||
                                        glassOverlay.modals.isNotEmpty() || glassOverlay.menu != null
                                )
                                if (needPlayerAmbient) AmbientBackdrop(
                                    playing = viewModel.playing,
                                    styleName = if (viewModel.dynamicStageFailed) "off" else effectiveStyle,
                                    coverUrl = viewModel.selected?.coverUrl.orEmpty(),
                                    colorFirst = colorFirst,
                                    colorLast = colorLast,
                                    bgImage = viewModel.stageBgImagePath,
                                    bgOpacity = viewModel.stageBgOpacity,
                                ) else if (!showPlayer && viewModel.pageBgImagePath.isNotEmpty()) {
                                    val cleanPath = viewModel.pageBgImagePath.substringBefore('?')
                                    Box(Modifier.fillMaxSize().background(INK)) {
                                        coil.compose.AsyncImage(
                                            model = remember(context, viewModel.pageBgImagePath) {
                                                coil.request.ImageRequest.Builder(context)
                                                    .data(java.io.File(cleanPath))
                                                    .size(1080, 1920)
                                                    .memoryCacheKey(viewModel.pageBgImagePath)
                                                    .crossfade(false)
                                                    .build()
                                            },
                                            contentDescription = null,
                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = viewModel.pageBgOpacity.coerceIn(0.10f, 0.85f) },
                                        )
                                        Box(
                                            Modifier.fillMaxSize().background(
                                                if (light) Color(0xB8F4F6FA) else Color(0x96090B10),
                                            ),
                                        )
                                    }
                                }
                              }
                                val selected = viewModel.selected ?: stagePlaceholder
                                if (viewModel.stageMounted) {
                                    val isFoliaActive = effectiveStyle.startsWith("folia-")
                                    val stageTopInset = minOf(statusInsetDp + 72f, heightDp * 0.22f)
                                    val stageBottomInset = minOf(bottomInsetDp + 164f, heightDp * 0.34f)
                                    for (slot in listOf("mine", "folia", "plain")) {
                                        val mounted = when (slot) {
                                            "plain" -> viewModel.plainStageMounted
                                            "folia" -> viewModel.foliaStageMounted
                                            else -> viewModel.mineStageMounted
                                        }
                                        val visible = viewModel.foreground && showPlayer && !viewModel.commentsOpen && when (slot) {
                                            "plain" -> effectiveStyle == "off" || viewModel.dynamicStageFailed || (!viewModel.dynamicStageReady && viewModel.plainStageMounted)
                                            "folia" -> effectiveStyle != "off" && !viewModel.dynamicStageFailed && isFoliaActive
                                            else -> effectiveStyle != "off" && !viewModel.dynamicStageFailed && !isFoliaActive
                                        }
                                        val slotMode = when (slot) {
                                            "plain" -> "off"
                                            "folia" -> viewModel.lastFoliaStyle
                                            else -> viewModel.lastMineStyle
                                        }
                                        val slotReady = when (slot) {
                                            "plain" -> true
                                            "folia" -> viewModel.foliaStageReady
                                            else -> viewModel.mineStageReady
                                        }
                                        if (mounted) key(slot) {
                                            MineRadioStage(
                                                song = selected,
                                                audioUrl = viewModel.playbackUrl,
                                                lines = if (viewModel.lyricsSongKey == selected.key) viewModel.lyrics else emptyList(),
                                                translationLines = if (viewModel.lyricsSongKey == selected.key) viewModel.stageTranslations else emptyList(),
                                                lyricColorMode = if (viewModel.lyricPrefs.colorMode.endsWith("gradient")) "custom-gradient" else "custom-solid",
                                                lyricPrimary = viewModel.previewPrimary(),
                                                lyricSecondary = viewModel.previewSecondary(),
                                                lyricScale = viewModel.lyricPrefs.lyricScale,
                                                lyricLineSpacing = viewModel.lyricPrefs.lyricLineSpacing,
                                                lyricMaxLines = viewModel.lyricPrefs.lyricMaxLines,
                                                resetCameraOnSong = viewModel.stageResetCameraOnSong,
                                                mode = slotMode,
                                                light = light,
                                                bgImage = viewModel.stageBgDataUrl,
                                                bgOpacity = viewModel.stageBgOpacity,
                                                duration = viewModel.duration,
                                                lyricOffset = viewModel.lyricOffset,
                                                playing = (viewModel.playing || viewModel.stageFadingOut) && viewModel.foreground,
                                                positionMsProvider = {
                                                    // 订阅 Compose positionMs 触发 200ms 刷新，同时读取 ExoPlayer 真实实时时刻消除歌词滞后
                                                    val fallback = viewModel.positionMs
                                                    com.lxlia.player.audio.PlaybackController.livePositionMs().takeIf { it > 0L || fallback <= 0L } ?: fallback
                                                },
                                                topInset = stageTopInset,
                                                bottomInset = stageBottomInset,
                                                visible = visible,
                                                seekable = viewModel.showPlayer,
                                                interactive = visible,
                                                onSeek = { viewModel.seek(it) },
                                                onDegraded = {
                                                    viewModel.mineStageReady = false
                                                    viewModel.foliaStageReady = false
                                                    viewModel.dynamicStageReady = false
                                                    viewModel.dynamicStageFailed = true
                                                    viewModel.mineStageMounted = false
                                                    viewModel.foliaStageMounted = false
                                                    viewModel.plainStageMounted = true
                                                    viewModel.notify("图形资源暂不可用，已临时使用纯文字歌词")
                                                },
                                                onVisualReady = {
                                                    if (slot == "mine") viewModel.mineStageReady = true
                                                    else if (slot == "folia") viewModel.foliaStageReady = true
                                                    viewModel.syncDynamicStageReady()
                                                },
                                                onImmersiveToggle = { show -> viewModel.toggleStageControls(show) },
                                                modifier = Modifier.fillMaxSize().graphicsLayer {
                                                    alpha = when {
                                                        !visible -> 0f
                                                        slotReady -> 1f
                                                        else -> 0.001f
                                                    }
                                                },
                                            )
                                        }
                                    }
                                }
                                if (!showPlayer && viewModel.pageBgImagePath.isEmpty()) Box(Modifier.fillMaxSize().background(INK))
                            }
                            val hasHomeChips = chromeVisible && viewModel.tab == "发现" && !viewModel.showPlayer && !viewModel.searchOpen &&
                                (viewModel.feedSection.isEmpty() || viewModel.feedClosing) && viewModel.openedPlaylist == null && viewModel.homeFeed != null
                            val topBlurHeight = viewModel.headerHeight() + if (hasHomeChips) 60f else 20f
                            // 鸿蒙在播放详情展开时保留页面树，返回后恢复同一滚动位置、输入和排列状态。
                            // 隐藏期间跳过离线测量与放置，旋转时零主界面重排且 WebView 可接收手势。
                            Box(Modifier.fillMaxSize().zIndex(if (showPlayer) -1f else 0f)
                                    .layout { measurable, constraints ->
                                    if (showPlayer) {
                                        layout(0, 0) {}
                                    } else {
                                        val placeable = measurable.measure(constraints)
                                        layout(placeable.width, placeable.height) {
                                            placeable.place(0, 0)
                                        }
                                    }
                                }
                                    .then(if (!showPlayer && viewModel.feedSection.isEmpty()) Modifier.topProgressiveFade(topBlurHeight) else Modifier)
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
                                        },
                                    ) {
                                        // Save scroll/form state while composing only the active tab with unified spring transitions.
                                        AnimatedContent(
                                            targetState = viewModel.tab,
                                            transitionSpec = {
                                                val offsetPx = with(density) { 18.dp.roundToPx() }
                                                val slideSpec = spring<androidx.compose.ui.unit.IntOffset>(dampingRatio = 0.84f, stiffness = 420f)
                                                (slideInVertically(slideSpec) { offsetPx } + fadeIn(tween(220)))
                                                    .togetherWith(slideOutVertically(slideSpec) { offsetPx / 2 } + fadeOut(tween(150)))
                                            },
                                            label = "root-tab",
                                        ) { currentTab ->
                                            val sidePad = if (currentTab == "发现") {
                                                if (viewModel.searchOpen) 20.dp else 0.dp
                                            } else {
                                                if (viewModel.wide) 32.dp else 20.dp
                                            }
                                            Box(Modifier.fillMaxSize().padding(horizontal = sidePad)) {
                                                pageStates.SaveableStateProvider(currentTab) {
                                                    when (currentTab) {
                                                        "发现" -> DiscoverTab(viewModel)
                                                        "资料库" -> LibraryTab(viewModel)
                                                        else -> SettingsTab(viewModel)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if (viewModel.feedSection.isNotEmpty()) {
                                        FeedOverlay(viewModel)
                                    }
                                }
                            }
                            // 严格对齐鸿蒙「上模糊、下穿透」：仅在顶部绘制渐进模糊，底部完全不做遮罩。
                            if (!showPlayer && viewModel.feedSection.isEmpty()) {
                                Box(Modifier.align(Alignment.TopCenter).fillMaxWidth()) {
                                    TopProgressiveBlur(pageBackdrop, topBlurHeight)
                                }
                            }
                            // 顶栏
                            if (chromeVisible && viewModel.feedSection.isEmpty()) AppHeader(viewModel)
                            // 快捷胶囊（首页、非搜索、非播放页）
                            if (hasHomeChips) {
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
                                    availableWidth = liveWidth,
                                    landscape = liveLandscape,
                                    searchOpen = viewModel.searchOpen,
                                    secondary = viewModel.secondaryDock(),
                                    detail = viewModel.showPlayer,
                                    compact = viewModel.dockCollapsed || liveHeight < 500,
                                    mode = viewModel.mode,
                                    positionMsProvider = { viewModel.positionMs },
                                    duration = viewModel.duration,
                                    colorFirst = colorFirst,
                                    colorLast = colorLast,
                                    stageDark = !light || (effectiveStyle != "off" && !effectiveStyle.startsWith("folia-") && !viewModel.dynamicStageFailed),
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
                                    onMore = { viewModel.openSheet("更多") },
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
                            if (viewModel.queueOrderOpen) {
                                SongOrderDialog(
                                    songs = viewModel.queue,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    title = "播放队列排序",
                                    onCancel = {
                                        viewModel.queueOrderOpen = false
                                        viewModel.maybeReturnToParentSheet()
                                    },
                                    onDone = { viewModel.applyQueueOrder(it) },
                                )
                            }
                            viewModel.editPlaylistTarget?.let { target ->
                                PlaylistEditDialog(
                                    playlist = target,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onCancel = { viewModel.editPlaylistTarget = null },
                                    onCollectSelected = { viewModel.collectSongsBatch(it) },
                                    onDownloadSelected = { viewModel.downloadBatch(it) },
                                    onSave = { newName, newSongs ->
                                        viewModel.saveEditedPlaylist(target.id, newName, newSongs)
                                    },
                                )
                            }
                            viewModel.batchDownloadPickerSongs?.let { songsToPick ->
                                val qualityLabel = when (viewModel.quality) {
                                    "flac" -> "无损 FLAC"
                                    "320k" -> "高品质 320k"
                                    else -> "标准 128k"
                                }
                                BatchDownloadDialog(
                                    title = viewModel.batchDownloadPickerTitle,
                                    songs = songsToPick,
                                    qualityLabel = qualityLabel,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onDismiss = { viewModel.batchDownloadPickerSongs = null },
                                    onConfirm = { chosen ->
                                        viewModel.batchDownloadPickerSongs = null
                                        viewModel.downloadBatch(chosen)
                                    },
                                )
                            }
                            viewModel.batchCollectPickerSongs?.let { songsToCollect ->
                                BatchCollectDialog(
                                    title = viewModel.batchCollectPickerTitle,
                                    songs = songsToCollect,
                                    playlists = viewModel.playlists,
                                    likedKeys = viewModel.likedKeys,
                                    wide = viewModel.wide,
                                    onDismiss = { viewModel.batchCollectPickerSongs = null },
                                    onConfirm = { chosen, targetId, newName ->
                                        viewModel.batchCollectPickerSongs = null
                                        viewModel.collectSongsToPlaylist(chosen, targetId, newName)
                                    },
                                )
                            }
                            viewModel.coverPickerPlaylist?.let { targetPl ->
                                PlaylistCoverDialog(
                                    playlist = targetPl,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onDismiss = { viewModel.coverPickerPlaylist = null },
                                    onPickLocalImage = { viewModel.requestPickLocalPlaylistCover(targetPl.id) },
                                    onSelectCover = { cover -> viewModel.applyPlaylistCover(targetPl.id, cover) },
                                )
                            }
                            if (viewModel.colorPickerTarget.isNotEmpty()) {
                                val target = viewModel.colorPickerTarget
                                val dialogTitle = when (target) {
                                    "primary" -> "选择歌词主色"
                                    "secondary" -> "选择歌词辅色"
                                    "desktop-primary" -> "选择桌面歌词主色"
                                    else -> "选择桌面歌词辅色"
                                }
                                val initHex = when (target) {
                                    "primary" -> viewModel.lyricPrefs.primary
                                    "secondary" -> viewModel.lyricPrefs.secondary
                                    "desktop-primary" -> viewModel.mobileDesktopLyricColor
                                    else -> viewModel.mobileDesktopLyricColor2
                                }
                                ColorPickerDialog(
                                    title = dialogTitle,
                                    initialHex = initHex,
                                    wide = viewModel.wide,
                                    onDismiss = { viewModel.colorPickerTarget = "" },
                                    onConfirm = { hex ->
                                        when (target) {
                                            "primary" -> viewModel.setLyricPrimary(hex)
                                            "secondary" -> viewModel.setLyricSecondary(hex)
                                            "desktop-primary" -> viewModel.setMobileDesktopLyricColor(hex)
                                            else -> viewModel.setMobileDesktopLyricColor2(hex)
                                        }
                                        viewModel.colorPickerTarget = ""
                                    },
                                )
                            }
                            if (viewModel.overlayPermissionPromptOpen) {
                                GlassDialog(onDismiss = {
                                    viewModel.overlayPermissionPromptOpen = false
                                    viewModel.pendingEnableDesktopLyrics = false
                                }) {
                                    Text("开启悬浮窗权限", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TEXT)
                                    Text(
                                        "桌面歌词需要系统的「显示在其他应用上层」权限，授权返回后将自动为您开启。",
                                        fontSize = 14.sp,
                                        color = TEXT,
                                        lineHeight = 20.sp,
                                    )
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                                    ) {
                                        SheetHeaderTextAction("取消", color = MUTED) {
                                            viewModel.overlayPermissionPromptOpen = false
                                            viewModel.pendingEnableDesktopLyrics = false
                                        }
                                        SheetHeaderTextAction("前往开启", color = ACCENT) {
                                            viewModel.openOverlayPermissionSettings()
                                        }
                                    }
                                }
                            }
                            if (viewModel.earMonitorOpen) {
                                viewModel.earMonitorOpen = false
                                viewModel.openSheet("耳返监听")
                            }
                            viewModel.switchPlatformTarget?.let { target ->
                                SwitchPlatformDialog(
                                    vm = viewModel,
                                    target = target,
                                    wide = viewModel.wide,
                                    statusInset = statusInsetDp,
                                    bottomInset = bottomInsetDp,
                                    onDismiss = {
                                        viewModel.switchPlatformTarget = null
                                        viewModel.maybeReturnToParentSheet()
                                    },
                                    onSelect = { candidate -> viewModel.confirmSwitchPlatform(candidate) },
                                )
                            }
                            AppSheets(viewModel)
                            IncomingSyncDialog(viewModel)
                            AppUpdateDialog(vm = viewModel, wide = viewModel.wide)
                            // 固定玻璃独立页 / 对话框宿主置于主页面、底栏与评论层之上，锚点菜单宿主置于最顶层。
                            GlassModalHost(glassOverlay)
                            GlassOverlayHost(glassOverlay)
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
