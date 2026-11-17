package com.lxlia.player

import com.lxlia.player.lx.SourceImportBatch
import com.lxlia.player.lx.readImportFile
import com.lxlia.player.model.SyncSourcePayload
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class SourceImportTest {
    private fun script(name: String) = "/*\n * @name $name\n * @version 2.0\n * @author Test\n */\nconst value = '$name';"

    @Test fun partialBatchRetainsLaterValidFilesAndSkipsAllDuplicates() {
        val existing = SyncSourcePayload(id = "active", name = "Existing", script = script("Existing"))
        val batch = SourceImportBatch(listOf(existing))
        batch.add("duplicate.js", script("Existing"))
        batch.add("invalid.txt", "not a script")
        batch.add("first.js", "\uFEFF" + script("First"))
        batch.add("repeated.js", script("First"))
        batch.fail("unreadable.js", "无法读取文件")
        batch.add("last.js", script("Last"))
        assertEquals(listOf("First", "Last"), batch.imported.map { it.name })
        assertEquals(2, batch.skipped)
        assertEquals(2, batch.failures.size)
        assertTrue(batch.failures.any { it.startsWith("invalid.txt：") })
        assertTrue(batch.failures.any { it.startsWith("unreadable.js：") })
        assertEquals("2.0", batch.imported.first().version)
        assertEquals("Test", batch.imported.first().author)
        assertEquals(2, batch.imported.map { it.id }.distinct().size)
        assertEquals("active", existing.id)
        assertTrue(batch.summary().contains("已导入 2 个音源"))
    }

    @Test fun sourceSizeLimitFailsBeforeTheNextFileIsProcessed() {
        val batch = SourceImportBatch(emptyList())
        val failure = runCatching { readImportFile(ByteArrayInputStream(ByteArray(8 * 1024 * 1024 + 1)), true) }.exceptionOrNull()
        assertNotNull(failure)
        batch.fail("huge.js", failure!!.message.orEmpty())
        batch.add("next.js", script("Next"))
        assertEquals(1, batch.imported.size)
        assertEquals(1, batch.failures.size)
    }
}
