package com.lxlia.player.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.coroutines.coroutineContext

data class UpdateAsset(
    val name: String,
    val size: Long,
    val downloadUrl: String,
    val digest: String,
)

data class AppUpdateInfo(
    val currentVersion: String,
    val latestVersion: String,
    val tagName: String,
    val hasUpdate: Boolean,
    val publishedAt: String,
    val notes: String,
    val releaseUrl: String,
    val asset: UpdateAsset?,
)

data class UpdateProgress(
    val mirror: String = "",
    val received: Long = 0L,
    val total: Long = 0L,
    val percent: Int = 0,
)

object AppUpdater {
    private const val REPO = "YuriLin1028/LxMine"
    private val RELEASE_ENDPOINTS = listOf(
        "https://api.github.com/repos/$REPO/releases/latest",
        "https://gh-proxy.org/https://raw.githubusercontent.com/$REPO/gh-pages/release.json",
        "https://ghfast.top/https://raw.githubusercontent.com/$REPO/gh-pages/release.json",
        "https://yurilin1028.github.io/LxMine/release.json",
    )
    private val DOWNLOAD_MIRRORS = listOf(
        "GH-Proxy" to "https://gh-proxy.org/",
        "GHFast" to "https://ghfast.top/",
        "GitHub" to "",
    )

    fun compareVersions(a: String, b: String): Int {
        val pa = a.trim().removePrefix("v").removePrefix("V").split("-", "+")[0]
            .split(".").mapNotNull { it.toIntOrNull() }
        val pb = b.trim().removePrefix("v").removePrefix("V").split("-", "+")[0]
            .split(".").mapNotNull { it.toIntOrNull() }
        if (pa.isEmpty() || pb.isEmpty()) return 0
        val len = maxOf(pa.size, pb.size, 3)
        for (i in 0 until len) {
            val diff = pa.getOrElse(i) { 0 } - pb.getOrElse(i) { 0 }
            if (diff != 0) return if (diff > 0) 1 else -1
        }
        return 0
    }

    private fun validateAssetUrl(url: String): Boolean {
        return try {
            val parsed = URL(url)
            parsed.protocol == "https" &&
                parsed.host.equals("github.com", ignoreCase = true) &&
                parsed.path.startsWith("/$REPO/releases/download/") &&
                parsed.query == null
        } catch (_: Throwable) {
            false
        }
    }

    private fun fetchJson(endpoint: String): JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", "LxMine-Updater/1.1")
                setRequestProperty("Accept", "application/vnd.github+json, application/json")
            }
            if (conn.responseCode != 200) return null
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(text)
            if (json.optBoolean("draft", false) || json.optBoolean("prerelease", false)) return null
            if (json.optString("tag_name").isBlank() || json.optJSONArray("assets") == null) return null
            json
        } catch (_: Throwable) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun parseIsoMs(iso: String): Long {
        if (iso.isBlank()) return 0L
        return runCatching {
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.parse(iso.trim().replace(Regex("\\.\\d+Z$"), "Z"))?.time ?: 0L
        }.getOrDefault(0L)
    }

    suspend fun checkForUpdate(currentVersion: String): AppUpdateInfo = withContext(Dispatchers.IO) {
        val current = currentVersion.trim().removePrefix("v").removePrefix("V")
        val results = coroutineScope {
            RELEASE_ENDPOINTS.mapIndexed { idx, endpoint ->
                async {
                    val data = fetchJson(endpoint)
                    if (data != null) idx to data else null
                }
            }.awaitAll().filterNotNull()
        }
        if (results.isEmpty()) {
            throw IllegalStateException("无法连接更新服务器，请检查网络")
        }
        val best = results.sortedWith { a, b ->
            val cmp = compareVersions(b.second.optString("tag_name"), a.second.optString("tag_name"))
            if (cmp != 0) cmp else a.first.compareTo(b.first)
        }.first().second

        val tagName = best.optString("tag_name")
        val latest = tagName.removePrefix("v").removePrefix("V")
        val assetsArr = best.optJSONArray("assets")
        val assets = mutableListOf<Pair<UpdateAsset, String>>()
        if (assetsArr != null) {
            for (i in 0 until assetsArr.length()) {
                val item = assetsArr.optJSONObject(i) ?: continue
                val name = item.optString("name")
                val url = item.optString("browser_download_url")
                if (name.isBlank() || !validateAssetUrl(url)) continue
                val rawDigest = item.optString("digest", "")
                val digest = if (rawDigest.startsWith("sha256:", ignoreCase = true) && rawDigest.length == 71) {
                    rawDigest.substring(7).lowercase()
                } else ""
                assets.add(UpdateAsset(name, item.optLong("size", 0L), url, digest) to item.optString("updated_at", ""))
            }
        }
        val exactName = "lxmine-$latest-android.apk"
        val pickedPair = assets.firstOrNull { it.first.name.equals(exactName, ignoreCase = true) }
            ?: assets.firstOrNull { it.first.name.endsWith(".apk", ignoreCase = true) }
        val picked = pickedPair?.first
        val cmp = compareVersions(latest, current)
        val remoteTimeMs = parseIsoMs(pickedPair?.second?.ifBlank { best.optString("published_at", "") } ?: best.optString("published_at", ""))
        val sameVersionNewer = cmp == 0 && picked != null && remoteTimeMs > com.lxlia.player.BuildConfig.BUILD_TIME_MS + 120_000L

        AppUpdateInfo(
            currentVersion = current,
            latestVersion = latest,
            tagName = tagName,
            hasUpdate = cmp > 0 || sameVersionNewer,
            publishedAt = best.optString("published_at", ""),
            notes = best.optString("body", "").trim(),
            releaseUrl = best.optString("html_url", "https://github.com/$REPO/releases/tag/$tagName"),
            asset = picked,
        )
    }

    suspend fun downloadApk(
        context: Context,
        asset: UpdateAsset,
        onProgress: (UpdateProgress) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        if (!validateAssetUrl(asset.downloadUrl)) {
            throw IllegalArgumentException("无效的安装包地址")
        }
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val safeName = asset.name.replace(Regex("[^\\w.\\-]"), "_")
        val destFile = File(dir, safeName)
        var lastError: Throwable? = null

        for ((mirrorName, prefix) in DOWNLOAD_MIRRORS) {
            coroutineContext.ensureActive()
            if (destFile.exists()) destFile.delete()
            onProgress(UpdateProgress(mirror = mirrorName, received = 0L, total = asset.size, percent = 0))
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(prefix + asset.downloadUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 30000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "LxMine-Updater/1.1")
                }
                if (conn.responseCode != 200) {
                    throw IllegalStateException("HTTP ${conn.responseCode}")
                }
                val total = conn.contentLengthLong.takeIf { it > 0 } ?: asset.size
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                var checkedHeader = false
                var lastEmit = 0L

                conn.inputStream.use { input ->
                    FileOutputStream(destFile).use { output ->
                        val buf = ByteArray(16384)
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buf)
                            if (n <= 0) break
                            if (!checkedHeader) {
                                checkedHeader = true
                                val head = String(buf, 0, minOf(n, 32)).trim().lowercase()
                                if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("{")) {
                                    throw IllegalStateException("镜像返回了非安装包内容")
                                }
                            }
                            output.write(buf, 0, n)
                            digest.update(buf, 0, n)
                            received += n
                            val now = System.currentTimeMillis()
                            if (now - lastEmit > 150) {
                                lastEmit = now
                                val pct = if (total > 0) ((received * 100L) / total).toInt().coerceIn(0, 99) else 0
                                onProgress(UpdateProgress(mirrorName, received, total, pct))
                            }
                        }
                        output.fd.sync()
                    }
                }
                if (received <= 0 || (total > 0 && received < total)) {
                    throw IllegalStateException("安装包下载不完整")
                }
                if (asset.digest.isNotEmpty()) {
                    val actual = digest.digest().joinToString("") { "%02x".format(it) }
                    if (!actual.equals(asset.digest, ignoreCase = true)) {
                        throw IllegalStateException("安装包校验失败")
                    }
                }
                onProgress(UpdateProgress(mirrorName, received, received, 100))
                return@withContext destFile
            } catch (e: Throwable) {
                if (destFile.exists()) destFile.delete()
                if (e is kotlinx.coroutines.CancellationException) throw e
                lastError = e
            } finally {
                conn?.disconnect()
            }
        }
        throw IllegalStateException("下载失败：${lastError?.message ?: "所有镜像均不可用"}")
    }

    fun canInstallPackages(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }

    fun launchOverwriteInstall(context: Context, apkFile: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
