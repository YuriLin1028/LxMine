package com.lxlia.player

import com.lxlia.player.core.PrivateTestSources
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.MessageDigest

class PrivateTestSourcesTest {
    private fun snapshot(count: Int = 20): JSONObject = JSONObject()
        .put("activeId", "source-8")
        .put("sources", JSONArray().apply {
            repeat(count) { index -> put(JSONObject().put("id", "source-$index")
                .put("name", "测试音源 $index").put("script", "/* 测试 $index */")) }
        })

    private fun decode(json: JSONObject, expectedHash: String? = null): PrivateTestSources.Snapshot {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        return PrivateTestSources.decode(bytes, expectedHash ?: hash)
    }

    @Test fun importsTwentyCompleteSourcesAndPreservesSelection() {
        val result = decode(snapshot())
        assertEquals(20, result.sources.size)
        assertEquals("测试音源 8", result.sources[8].name)
        assertEquals("source-8", result.activeId)
    }

    @Test fun rejectsChangedSnapshot() {
        assertThrows(IllegalArgumentException::class.java) { decode(snapshot(), "0".repeat(64)) }
    }

    @Test fun rejectsIncompleteOrDuplicateSources() {
        assertThrows(IllegalArgumentException::class.java) { decode(snapshot(19)) }
        val duplicate = snapshot()
        duplicate.getJSONArray("sources").getJSONObject(19).put("id", "source-0")
        assertThrows(IllegalArgumentException::class.java) { decode(duplicate) }
        val missingScript = snapshot()
        missingScript.getJSONArray("sources").getJSONObject(19).put("script", "")
        assertThrows(IllegalArgumentException::class.java) { decode(missingScript) }
    }

    @Test fun selectsExistingSourceIfSnapshotSelectionIsMissing() {
        assertEquals("source-0", decode(snapshot().put("activeId", "missing")).activeId)
    }
}
