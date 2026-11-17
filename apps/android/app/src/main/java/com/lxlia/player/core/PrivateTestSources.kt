package com.lxlia.player.core

import android.content.Context
import com.lxlia.player.BuildConfig
import com.lxlia.player.model.SyncSourcePayload
import org.json.JSONObject
import java.security.MessageDigest

/** Only explicitly requested personal APKs contain this opt-in snapshot. */
internal object PrivateTestSources {
    const val SEEDED_SETTING = "lxmine_private_test_sources_seed"

    data class Snapshot(val sources: List<SyncSourcePayload>, val activeId: String)

    fun read(context: Context): Snapshot? {
        val expectedHash = BuildConfig.PRIVATE_TEST_SOURCES_SHA256
        if (expectedHash.isEmpty()) return null
        val bytes = context.assets.open("private-test-sources.json").use { it.readBytes() }
        return decode(bytes, expectedHash)
    }

    internal fun decode(bytes: ByteArray, expectedHash: String): Snapshot {
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it) }
        require(hash == expectedHash) { "个人测试音源快照校验失败" }
        val json = JSONObject(bytes.toString(Charsets.UTF_8))
        val sources = SyncSourcePayload.listFromJson(json.getJSONArray("sources").toString())
        require(sources.size == 20 && sources.map { it.id }.toSet().size == 20 &&
            sources.all { it.id.isNotBlank() && it.script.isNotBlank() }) { "个人测试包应包含 20 个完整音源" }
        val activeId = json.optString("activeId").takeIf { id -> sources.any { it.id == id } }
            ?: sources.first().id
        return Snapshot(sources, activeId)
    }
}
