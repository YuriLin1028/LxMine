package com.lxlia.player

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import com.lxlia.player.audio.PlaybackController
import com.lxlia.player.core.Store
import com.lxlia.player.lx.CoverPalette
import com.lxlia.player.lx.Http
import com.lxlia.player.lx.LxEngine
import com.lxlia.player.lx.LxHost
import com.lxlia.player.lx.LocalMusic
import com.lxlia.player.lx.LocalServer
import com.lxlia.player.lx.MusicDownloads

/**
 * 进程级装配：与鸿蒙 Index 里创建的各个 service 对应，
 * 但放在 Application 上，保证 Activity 重建/退后台后后台播控、音源与同步都还在。
 */
class LxMineApp : Application(), ImageLoaderFactory {
    companion object {
        lateinit var instance: LxMineApp
            private set
    }

    lateinit var store: Store
    lateinit var host: LxHost
    lateinit var engine: LxEngine
    lateinit var localMusic: LocalMusic
    lateinit var downloads: MusicDownloads
    lateinit var server: LocalServer
    lateinit var coverPalette: CoverPalette

    override fun onCreate() {
        super.onCreate()
        instance = this
        store = Store(this)
        server = LocalServer(this, Http.client)
        runCatching { server.start() }
        host = LxHost(Http.client)
        engine = LxEngine(host)
        localMusic = LocalMusic(this)
        downloads = MusicDownloads(this, Http.client)
        coverPalette = CoverPalette(Http.client)

        localMusic.initialize()
        downloads.initialize()

        PlaybackController.urlResolver = { song -> engine.resolveUrl(song) }
        PlaybackController.localResolver = { song ->
            val local = localMusic.pathFor(song)
            if (local.isNotEmpty()) local else downloads.offline(song)
        }

        // 播放服务由 MainActivity.onResume 在前台启动，返回应用时也会恢复连接。
    }

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .components { add(SvgDecoder.Factory()) }
        .crossfade(true)
        .build()
}
