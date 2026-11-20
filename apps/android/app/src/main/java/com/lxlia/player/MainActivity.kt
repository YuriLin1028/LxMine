package com.lxlia.player

import android.Manifest
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.lxlia.player.lx.LxHost
import com.lxlia.player.audio.PlaybackService
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.ui.AppScreen
import com.lxlia.player.ui.AppViewModelProvider
import com.lxlia.player.ui.handleDeepLink
import com.lxlia.player.ui.handleSharedText
import com.lxlia.player.ui.importFile
import com.lxlia.player.ui.onBackground
import com.lxlia.player.ui.onForeground
import com.lxlia.player.ui.onHostReady
import com.lxlia.player.ui.AppViewModel
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch

/**
 * 单 Activity：可见界面全部 Compose；隐藏的 LX 运行时 WebView 挂在窗口里跑自定义音源。
 * 对应鸿蒙 Index 页里的 Web({ src: $rawfile('lx-runtime/index.html') }) 与舞台 Web。
 */
class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels { AppViewModelProvider(LxMineApp.instance) }
    private var hostView: WebView? = null
    private var hostGeneration by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.lxlia.player.data.AppUpdater.attachActivity(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // 直接衔接应用内启动动画或首页，避免系统图标再播放一次。
            splashScreen.setOnExitAnimationListener { it.remove() }
        }
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < 35) window.navigationBarColor = android.graphics.Color.TRANSPARENT
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        applyHighRefreshRate()
        applyOrientation(detail = false)
        requestNotificationPermission()
        handleIntent(intent)

        setContent {
            LaunchedEffect(viewModel.intro, viewModel.foreground) {
                if (viewModel.foreground) applyHighRefreshRate()
            }
            LaunchedEffect(viewModel.showPlayer, viewModel.styleName, viewModel.playing, viewModel.foreground, viewModel.commentsOpen, viewModel.dynamicStageFailed) {
                val active = viewModel.showPlayer && viewModel.foreground && !viewModel.commentsOpen &&
                    viewModel.playing && viewModel.styleName != "off" && !viewModel.dynamicStageFailed
                PlaybackController.setSpectrumEnabled(active)
                if (viewModel.foreground) applyHighRefreshRate()
            }
            AppScreen(
                viewModel = viewModel,
                lxRuntime = { modifier ->
                  key(hostGeneration) {
                    AndroidView(
                        modifier = modifier,
                        factory = { context ->
                            WebView(context).apply {
                                layoutParams = ViewGroup.LayoutParams(1, 1)
                                setBackgroundColor(0x00000000)
                                alpha = 0f
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = true
                                settings.allowFileAccessFromFileURLs = true
                                settings.allowUniversalAccessFromFileURLs = true
                                settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
                                settings.mediaPlaybackRequiresUserGesture = false
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                                    WebView.setWebContentsDebuggingEnabled(true)
                                }
                                addJavascriptInterface(LxMineApp.instance.host.bridge, "LxNativeBridge")
                                webViewClient = object : android.webkit.WebViewClient() {
                                    override fun onRenderProcessGone(view: WebView?, detail: android.webkit.RenderProcessGoneDetail?): Boolean {
                                        LxMineApp.instance.host.onRendererGone()
                                        viewModel.hostReady = false
                                        hostView = null
                                        hostGeneration++
                                        return true
                                    }
                                    override fun onPageFinished(view: WebView?, url: String?) {
                                        super.onPageFinished(view, url)
                                        LxMineApp.instance.host.onPageReady()
                                        viewModel.hostReady = true
                                        viewModel.onHostReady()
                                    }
                                }
                                LxMineApp.instance.host.attach(this)
                                hostView = this
                            }
                        },
                    )
                  }
                },
                onShowPlayerChanged = { visible -> applyOrientation(visible) },
            )
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 小窗/折叠屏/旋转都由 Compose 的 BoxWithConstraints 处理，这里只需要同步方向策略。
        applyOrientation(viewModel.showPlayer)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        com.lxlia.player.data.AppUpdater.attachActivity(this)
        applyHighRefreshRate()
        // 文件选择期间空闲服务可能被系统停止，回到前台时重新连接播放器。
        runCatching { startService(Intent(this, PlaybackService::class.java)) }
            .onFailure { viewModel.error = "播放器服务启动失败：${it.message}" }
        viewModel.onForeground()
        if (viewModel.updateNeedsInstallPermission && viewModel.updateDownloadedApk != null &&
            com.lxlia.player.data.AppUpdater.canInstallPackages(this)
        ) {
            viewModel.triggerDownloadedApkInstall()
        }
    }

    override fun onPause() {
        super.onPause()
        PlaybackController.setSpectrumEnabled(false)
        viewModel.onBackground()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        val pressure = level == android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW ||
            level == android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL ||
            level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND
        if (pressure && (!viewModel.foreground || !viewModel.showPlayer)) {
            viewModel.stageMounted = false
            viewModel.dynamicStageMounted = false
            viewModel.plainStageMounted = false
            viewModel.dynamicStageReady = false
        }
    }

    override fun onDestroy() {
        com.lxlia.player.data.AppUpdater.detachActivity(this)
        hostView?.let { view ->
            runCatching { view.stopLoading(); view.destroy() }
        }
        hostView = null
        super.onDestroy()
    }

    /** 解锁窗口最高物理分辨率刷新率（90Hz / 120Hz+），保障启动动画与液态交互满帧运行。 */
    private fun applyHighRefreshRate() {
        runCatching {
            @Suppress("DEPRECATION")
            val screen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) display else windowManager.defaultDisplay
            if (screen == null) return
            val current = screen.mode
            val bestMode = screen.supportedModes
                .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
                .maxByOrNull { it.refreshRate }
            if (bestMode != null && bestMode.refreshRate >= 90f) {
                val params = window.attributes
                var changed = false
                if (params.preferredDisplayModeId != bestMode.modeId) {
                    params.preferredDisplayModeId = bestMode.modeId
                    changed = true
                }
                if (Build.VERSION.SDK_INT < 35 && params.preferredRefreshRate != bestMode.refreshRate) {
                    params.preferredRefreshRate = bestMode.refreshRate
                    changed = true
                }
                if (changed) {
                    window.attributes = params
                }
            }
        }
    }

    /** 手机端：非播放详情页锁竖屏；播放详情页依据设置决定是否突破系统竖屏锁定进入横屏。平板自由旋转。 */
    private fun applyOrientation(detail: Boolean) {
        val smallestWidth = resources.configuration.smallestScreenWidthDp
        val tablet = smallestWidth >= 600 || viewModel.wide
        val target = when {
            tablet -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            !detail -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            viewModel.allowLandscapeWhenLocked -> ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            else -> ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        }
        if (requestedOrientation != target) {
            runCatching { requestedOrientation = target }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            runCatching { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11) }
        }
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        val data: Uri? = intent.data
        if (data != null) {
            when (data.scheme) {
                "lxmine" -> viewModel.handleDeepLink(data.toString())
                "http", "https" -> viewModel.handleSharedText(data.toString())
                "content" -> viewModel.importFile(data, false)
            }
            return
        }
        if (intent.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
                val sharedSong = Regex("lxmine://play\\?[^\\s]+").find(text)?.value
                if (sharedSong != null) {
                    viewModel.handleDeepLink(sharedSong)
                } else {
                    viewModel.handleSharedText(text)
                }
            }
            @Suppress("DEPRECATION")
            val file = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (file != null) viewModel.importFile(file, false)
        }
    }
}
