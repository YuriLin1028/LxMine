package com.lxlia.player.audio

data class AudioFxPreset(
    val id: String,
    val label: String,
    val shortLabel: String,
    val detail: String,
    val bands: List<Int>,
    val bassBoost: Int,
    val spatial: Boolean,
    val reverb: String,
)

data class AudioFxConfig(
    val preset: String = "off",
    val customBands: List<Int> = listOf(0, 0, 0, 0, 0),
    val spatial: Boolean = false,
    val reverb: String = "none",
    val spatialMode: String = "system", // "off" | "system" | "binaural"
)

object AudioFxPresets {
    val BAND_FREQS_HZ = listOf(60, 230, 910, 3600, 14000)
    val BAND_LABELS = listOf("60Hz", "230Hz", "910Hz", "3.6kHz", "14kHz")

    val ALL: List<AudioFxPreset> = listOf(
        AudioFxPreset("off", "原声（关闭）", "原声", "原始音频直出，无染色", listOf(0, 0, 0, 0, 0), 0, false, "none"),
        AudioFxPreset("pop", "流行 Pop", "流行", "均衡微提人声与通透高音", listOf(2, 1, 3, 2, 1), 2, false, "none"),
        AudioFxPreset("bass", "重低音 Bass", "重低音", "低频下潜强劲，鼓点冲击力拉满", listOf(7, 5, 0, 1, 2), 8, false, "none"),
        AudioFxPreset("vocal", "清澈人声 Vocal", "人声", "突出人声质感，削减低频浑浊", listOf(-2, 1, 5, 4, 1), 0, false, "none"),
        AudioFxPreset("rock", "摇滚 Rock", "摇滚", "电吉他张力与澎湃鼓组动态", listOf(5, 2, -1, 3, 5), 4, false, "small"),
        AudioFxPreset("edm", "电子舞曲 EDM", "电音", "超低频脉冲与闪耀高频能量", listOf(6, 4, 0, 3, 6), 7, true, "none"),
        AudioFxPreset("hiphop", "说唱 Hip-Hop", "说唱", "808 肥厚低音与清晰人声咬字", listOf(6, 4, 2, 1, 3), 6, false, "none"),
        AudioFxPreset("acoustic", "民谣原声", "民谣", "温暖木吉他与自然空气感", listOf(2, 2, 3, 2, 3), 1, false, "small"),
        AudioFxPreset("classical", "古典交响", "古典", "宽广动态与音乐厅弦乐光泽", listOf(3, 1, 0, 2, 4), 1, true, "hall"),
        AudioFxPreset("jazz", "爵士蓝调", "爵士", "丝滑中频与温暖萨克斯质感", listOf(3, 2, 2, 3, 2), 2, true, "small"),
        AudioFxPreset("ancient", "古风轻音", "古风", "清越笛萧与温润丝竹泛音", listOf(0, 2, 4, 4, 3), 0, true, "hall"),
        AudioFxPreset("acg", "ACG 动漫", "ACG", "甜亮女声与轻快节奏层次", listOf(3, 1, 3, 5, 4), 3, false, "none"),
        AudioFxPreset("live", "Live 现场", "现场", "环绕声场与演唱会空间混响", listOf(4, 2, 1, 3, 4), 3, true, "hall"),
        AudioFxPreset("vinyl", "黑胶温暖", "黑胶", "模拟暖声底，柔和顺滑高频", listOf(3, 3, 1, -2, -3), 2, false, "small"),
        AudioFxPreset("night", "深夜柔音", "深夜", "柔化尖锐频段，久听不累", listOf(1, 2, 2, -1, -3), 0, false, "none"),
        AudioFxPreset("custom", "自定义均衡器", "自定义", "自由调节 5 段均衡与空间环绕", listOf(0, 0, 0, 0, 0), 0, false, "none"),
    )

    fun byId(id: String): AudioFxPreset = ALL.firstOrNull { it.id == id } ?: ALL.first()

    fun effectiveBands(config: AudioFxConfig): List<Int> {
        val preset = byId(config.preset)
        return if (preset.id == "custom") {
            List(5) { idx -> config.customBands.getOrElse(idx) { 0 }.coerceIn(-12, 12) }
        } else preset.bands
    }

    fun effectiveBassBoost(config: AudioFxConfig): Int {
        val preset = byId(config.preset)
        return if (preset.id == "custom") {
            (config.customBands.firstOrNull()?.coerceAtLeast(0) ?: 0).times(8).div(10).coerceIn(0, 10)
        } else preset.bassBoost
    }

    fun isActive(config: AudioFxConfig): Boolean =
        config.preset != "off" || config.spatial || config.reverb != "none" || config.spatialMode == "binaural"

    fun summary(config: AudioFxConfig): String {
        val preset = byId(config.preset)
        if (!isActive(config)) return "原声（关闭）"
        val parts = mutableListOf(if (preset.id == "off") "原声" else preset.shortLabel)
        if (config.spatial) parts += "3D 环绕"
        if (config.spatialMode == "binaural") parts += "空间音频"
        when (config.reverb) {
            "hall" -> parts += "音乐厅"
            "small" -> parts += "室内混响"
        }
        return parts.joinToString(" · ")
    }
}
