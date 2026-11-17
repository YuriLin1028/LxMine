package com.lxlia.player.lx

import com.lxlia.player.model.SyncSourcePayload
import java.util.UUID

/** Keep the active runtime untouched while collecting files. A bad file only fails itself. */
class SourceImportBatch(existing: List<SyncSourcePayload>) {
    private val scripts = existing.map { it.script.removePrefix("\uFEFF") }.toMutableSet()
    val imported = mutableListOf<SyncSourcePayload>()
    var skipped = 0
        private set
    val failures = mutableListOf<String>()

    fun add(file: String, raw: String) {
        try {
            val script = raw.removePrefix("\uFEFF")
            require(script.isNotBlank()) { "文件内容为空" }
            val header = Regex("^/\\*[\\s\\S]+?\\*/").find(script)?.value
                ?: throw IllegalArgumentException("缺少 LX 音源头部信息注释")
            if (script in scripts) { skipped++; return }
            fun info(key: String) = Regex("(?m)^\\s?\\*\\s?@$key\\s+([^\\r\\n]+)")
                .find(header)?.groupValues?.get(1)?.trim().orEmpty()
            imported += SyncSourcePayload(id = "android-source-${UUID.randomUUID()}",
                name = info("name").ifEmpty { "自定义音源" }, script = script,
                description = info("description"), version = info("version"),
                author = info("author"), homepage = info("homepage"), importedAt = System.currentTimeMillis())
            scripts += script
        } catch (error: IllegalArgumentException) { fail(file, error.message ?: "无效音源文件") }
    }

    fun fail(file: String, message: String) { failures += "$file：$message" }
    fun summary() = "已导入 ${imported.size} 个音源，跳过 $skipped 个重复，${failures.size} 个失败"
    fun report() = (listOf(summary()) + failures).joinToString("\n")
}
