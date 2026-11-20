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
    @Volatile
    private var currentActivityRef: java.lang.ref.WeakReference<android.app.Activity>? = null

    fun attachActivity(activity: android.app.Activity) {
        currentActivityRef = java.lang.ref.WeakReference(activity)
    }

    fun detachActivity(activity: android.app.Activity) {
        if (currentActivityRef?.get() === activity) {
            currentActivityRef = null
        }
    }

    private fun releaseEndpoints(): List<String> {
        val ts = System.currentTimeMillis() / 15000L
        return listOf(
            "https://yurilin1028.github.io/LxMine/android-release.json?t=$ts",
            "https://gh-proxy.org/https://raw.githubusercontent.com/$REPO/gh-pages/android-release.json",
            "https://ghfast.top/https://raw.githubusercontent.com/$REPO/gh-pages/android-release.json",
            "https://api.github.com/repos/$REPO/releases/latest",
            "https://yurilin1028.github.io/LxMine/release.json?t=$ts",
        )
    }
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

    private fun baseThreePart(v: String): String {
        val parts = v.trim().removePrefix("v").removePrefix("V").split("-", "+")[0].split(".")
        return parts.take(3).joinToString(".")
    }

    private fun installedApkSha256(context: Context): String {
        return runCatching {
            val apkPath = context.applicationInfo?.sourceDir ?: return ""
            val file = File(apkPath)
            if (!file.isFile) return ""
            val md = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buf = ByteArray(32768)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    md.update(buf, 0, n)
                }
            }
            md.digest().joinToString("") { "%02x".format(it) }
        }.getOrDefault("")
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

    suspend fun checkForUpdate(currentVersion: String, context: Context? = null): AppUpdateInfo = withContext(Dispatchers.IO) {
        val current = baseThreePart(currentVersion)
        val endpoints = releaseEndpoints()
        val results = coroutineScope {
            endpoints.mapIndexed { idx, endpoint ->
                async {
                    val data = fetchJson(endpoint)
                    if (data != null) idx to data else null
                }
            }.awaitAll().filterNotNull()
        }
        if (results.isEmpty()) {
            throw IllegalStateException("无法连接更新服务器，请检查网络")
        }
        fun apkUpdatedMs(obj: JSONObject): Long {
            val arr = obj.optJSONArray("assets")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val a = arr.optJSONObject(i) ?: continue
                    if (a.optString("name").endsWith(".apk", ignoreCase = true)) {
                        val t = parseIsoMs(a.optString("updated_at", ""))
                        if (t > 0L) return t
                    }
                }
            }
            return parseIsoMs(obj.optString("published_at", ""))
        }
        val best = results.sortedWith { a, b ->
            val cmp = compareVersions(baseThreePart(b.second.optString("tag_name")), baseThreePart(a.second.optString("tag_name")))
            if (cmp != 0) return@sortedWith cmp
            val tb = apkUpdatedMs(b.second)
            val ta = apkUpdatedMs(a.second)
            if (tb != ta) tb.compareTo(ta) else a.first.compareTo(b.first)
        }.first().second

        val rawTag = best.optString("tag_name")
        val latest = baseThreePart(rawTag)
        val tagName = "v$latest"
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
        val installedSha = if (context != null && cmp == 0 && !picked?.digest.isNullOrEmpty()) installedApkSha256(context) else ""
        val sameVersionNewer = cmp == 0 && picked != null && (
            if (picked.digest.isNotEmpty() && installedSha.isNotEmpty()) {
                !picked.digest.equals(installedSha, ignoreCase = true) && remoteTimeMs > com.lxlia.player.BuildConfig.BUILD_TIME_MS - 300_000L
            } else {
                remoteTimeMs > com.lxlia.player.BuildConfig.BUILD_TIME_MS + 60_000L
            }
        )

        AppUpdateInfo(
            currentVersion = current,
            latestVersion = latest,
            tagName = tagName,
            hasUpdate = picked != null && (cmp > 0 || sameVersionNewer),
            publishedAt = best.optString("published_at", ""),
            notes = best.optString("body", "").trim(),
            releaseUrl = "https://github.com/$REPO/releases/tag/$tagName",
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
        val baseDir = context.externalCacheDir ?: context.filesDir ?: context.cacheDir
        val dir = File(baseDir, "updates").apply { mkdirs() }
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
                    useCaches = false
                    setRequestProperty("Cache-Control", "no-cache")
                    setRequestProperty("User-Agent", "LxMine-Updater/1.2")
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
                                if (n < 4 || buf[0] != 0x50.toByte() || buf[1] != 0x4B.toByte()) {
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
                if (received < 1_000_000L || (total > 0 && received < total)) {
                    throw IllegalStateException("安装包下载不完整")
                }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (asset.digest.isNotEmpty() && !actual.equals(asset.digest, ignoreCase = true)) {
                    val archivePkg = context.packageManager.getPackageArchiveInfo(destFile.absolutePath, 0)?.packageName
                    if (archivePkg != context.packageName || mirrorName != "GitHub") {
                        throw IllegalStateException("镜像缓存尚未同步，正在切换源…")
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
            val host = currentActivityRef?.get() ?: context
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            )
            if (host !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            host.startActivity(intent)
        }
    }

    fun launchOverwriteInstall(context: Context, apkFile: File) {
        val host = currentActivityRef?.get() ?: context
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            clipData = android.content.ClipData.newRawUri("apk", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (host !is android.app.Activity) {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        host.startActivity(intent)
    }
}
