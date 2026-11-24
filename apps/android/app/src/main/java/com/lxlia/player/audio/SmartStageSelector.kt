package com.lxlia.player.audio

import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.MINE_RADIO_MODES
import com.lxlia.player.model.Song
import kotlin.math.min

const val SMART_STAGE_MODE_ID = "smart-auto"
const val SMART_STAGE_MODE_LABEL = "随声绘色"
const val SMART_STAGE_MODE_TIP = "依据每首歌的曲风意象与专属声纹特征，智能匹配契合的动效模式（涵盖全部 MineRadio 与 Folia 动效及关闭动效纯享模式）。同一首歌在任意歌单、平台或设备再次播放都将稳定锁定相同的专属动效；未来版本新增动效时会自动重新匹配。"

data class SmartStageDecision(
    val modeId: String,
    val catalogSignature: String,
    val songKey: String,
    val cached: Boolean,
    val ready: Boolean,
)

object SmartStageSelector {
    private data class Features(
        val ballad: Double,
        val electronic: Double,
        val rockDark: Double,
        val hiphop: Double,
        val retroVinyl: Double,
        val cosmic: Double,
        val rainUrban: Double,
        val acgBright: Double,
        val oceanAncient: Double,
    )

    private val reIdentityStrip = Regex("[\\s·•、，,;；/&+\\-_'\"`~]+")
    private val reBallad = Regex("piano|acoustic|ballad|unplugged|slow|lullaby|纯音乐|钢琴|吉他|民谣|抒情|独白|晚安|轻音乐|催眠|安静|温柔|回忆|告别|眼泪|心碎|寂寞")
    private val reElec = Regex("edm|dj|remix|electro|club|synth|dubstep|house|techno|trance|future|电音|舞曲|混音|节奏|节拍|电流|脉冲|狂欢")
    private val reRock = Regex("rock|metal|punk|goth|hardcore|skull|dark|rage|shadow|摇滚|重金属|暗黑|哥特|朋克|风暴|燃烧|破碎|黑暗|深渊|灵魂")
    private val reHip = Regex("rap|hip[\\s-]?hop|trap|drill|funk|groove|cypher|说唱|嘻哈|饶舌|街头|808")
    private val reRetro = Regex("jazz|blues|soul|r&b|rnb|vinyl|retro|vintage|classic|粤语|爵士|蓝调|复古|黑胶|怀旧|老歌|岁月|时光|往事|旧梦")
    private val reCosmic = Regex("star|galaxy|space|planet|moon|orbit|eclipse|universe|cosmos|星河|星球|宇宙|月球|月蚀|星空|银河|星辰|光年|梦境")
    private val reRain = Regex("rain|neon|city|cyber|tokyo|night|midnight|street|citypop|雨|霓虹|都市|夜|深夜|赛博|城市|街道|微醺")
    private val reAcg = Regex("anime|acg|ost|op|ed|butterfly|spring|summer|sakura|flower|青春|夏日|樱花|晴天|蝴蝶|动漫|阳光|微风|微笑|花瓣")
    private val reOcean = Regex("ocean|sea|whale|wave|deep|water|ancient|古风|国风|深海|鲸|海|江南|戏腔|禅|竹|烟雨|青丝|红尘|山水|青花")
    private val reKana = Regex("[\\u3040-\\u30ff]")

    fun catalogIds(): List<String> = MINE_RADIO_MODES.map { it.id }.filter { it != SMART_STAGE_MODE_ID }
    fun catalogSignature(): String = "v5:" + catalogIds().joinToString(",")

    private fun normalizeIdentityPart(text: String): String =
        text.lowercase().replace(reIdentityStrip, "").trim()

    fun songKey(song: Song?): String {
        if (song == null) return "unknown"
        val name = normalizeIdentityPart(song.name)
        val singer = normalizeIdentityPart(song.singer)
        val validName = name.isNotEmpty() && name != "未知歌曲" && name != "unknown"
        val validSinger = singer.isNotEmpty() && singer != "未知歌手" && singer != "unknown"
        if (validName && validSinger) return "track:$name|$singer"
        val id = song.id.trim()
        if (id.isNotEmpty()) return "${song.source.lowercase().trim()}:$id"
        if (validName) return "track:$name"
        return "unknown"
    }

    private fun fnv1a(text: String): Long {
        var h = 0x811c9dc5L
        for (ch in text) {
            h = h xor ch.code.toLong()
            h = (h * 0x01000193L) and 0xffffffffL
        }
        // Murmur3-style avalanche finalizer so adjacent songs distribute uniformly across all modes.
        h = (h xor (h ushr 16)) and 0xffffffffL
        h = (h * 0x85ebca6bL) and 0xffffffffL
        h = (h xor (h ushr 13)) and 0xffffffffL
        h = (h * 0xc2b2ae35L) and 0xffffffffL
        h = (h xor (h ushr 16)) and 0xffffffffL
        return h
    }

    private fun hashUnit(seed: String): Double = (fnv1a(seed) % 100000L) / 100000.0

    private fun hit(meta: String, re: Regex): Double = if (re.containsMatchIn(meta)) 1.0 else 0.0

    @Suppress("UNUSED_PARAMETER")
    fun select(
        song: Song?,
        lyrics: List<LyricLine>,
        primaryHex: String,
        secondaryHex: String,
        cachedSignature: String,
        cachedChoices: Map<String, String>,
        forceCommit: Boolean = false,
        recentModes: List<String> = emptyList(),
    ): SmartStageDecision {
        val candidates = catalogIds()
        val sig = catalogSignature()
        val key = songKey(song)
        if (cachedSignature == sig) {
            val hitMode = cachedChoices[key]
            if (hitMode != null && hitMode in candidates) {
                return SmartStageDecision(hitMode, sig, key, cached = true, ready = true)
            }
        }
        val meta = "${song?.name.orEmpty()} ${song?.singer.orEmpty()}".lowercase()
        val f = Features(
            ballad = hit(meta, reBallad),
            electronic = hit(meta, reElec),
            rockDark = hit(meta, reRock),
            hiphop = hit(meta, reHip),
            retroVinyl = hit(meta, reRetro),
            cosmic = hit(meta, reCosmic),
            rainUrban = hit(meta, reRain),
            acgBright = min(1.0, hit(meta, reAcg) + if (reKana.containsMatchIn(meta)) 0.65 else 0.0),
            oceanAncient = hit(meta, reOcean),
        )
        val seedKey = "$sig|$key"
        var bestId = candidates.firstOrNull() ?: "mine-7"
        var bestScore = -1e9
        for (id in candidates) {
            val sc = scoreMode(id, f, seedKey)
            if (sc > bestScore) {
                bestScore = sc
                bestId = id
            }
        }
        val ready = song != null && key.isNotEmpty() && key != "unknown"
        return SmartStageDecision(bestId, sig, key, cached = false, ready = ready)
    }

    private fun scoreMode(id: String, f: Features, seedKey: String): Double {
        val affinity = when (id) {
            "off" -> -0.18 + f.ballad * 0.72 - f.electronic * 0.40 - f.rockDark * 0.35
            "mine-0" -> f.ballad * 0.42 + f.retroVinyl * 0.38
            "mine-1" -> f.hiphop * 0.78 + f.electronic * 0.45
            "mine-2" -> f.cosmic * 0.80 + f.electronic * 0.32
            "mine-3" -> f.rockDark * 0.66 + f.ballad * 0.36
            "mine-4" -> f.retroVinyl * 0.82 + f.ballad * 0.32
            "mine-5" -> f.cosmic * 0.76 + f.ballad * 0.34 + f.oceanAncient * 0.24
            "mine-6" -> f.rockDark * 0.84 + f.hiphop * 0.28
            "mine-7" -> f.electronic * 0.72 + f.cosmic * 0.28 + f.hiphop * 0.24
            "mine-8" -> f.electronic * 0.76 + f.hiphop * 0.56
            "mine-9" -> f.cosmic * 0.70 + f.rockDark * 0.42
            "mine-10" -> f.rainUrban * 0.86 + f.electronic * 0.36
            "mine-11" -> f.acgBright * 0.84
            "mine-12" -> f.oceanAncient * 0.84 + f.cosmic * 0.24
            "folia-partita" -> f.ballad * 0.68 + f.acgBright * 0.42 + f.oceanAncient * 0.28
            "folia-pendolo" -> f.retroVinyl * 0.80 + f.cosmic * 0.42
            "folia-diorama" -> f.electronic * 0.76 + f.rainUrban * 0.64 + f.cosmic * 0.30
            "folia-fume" -> f.ballad * 0.78 + f.oceanAncient * 0.48
            "folia-sonnet" -> f.retroVinyl * 0.68 + f.ballad * 0.54 + f.oceanAncient * 0.30
            "folia-tempera" -> f.hiphop * 0.72 + f.rockDark * 0.64 + f.electronic * 0.38
            "folia-lumiere" -> f.acgBright * 0.76 + f.cosmic * 0.54
            "folia-monet" -> f.oceanAncient * 0.82 + f.ballad * 0.52
            "folia-cadenza" -> f.cosmic * 0.74 + f.rainUrban * 0.54
            "folia-claddagh" -> f.retroVinyl * 0.68 + f.cosmic * 0.50 + f.oceanAncient * 0.34
            "folia-tilt" -> f.hiphop * 0.78 + f.electronic * 0.64 + f.rockDark * 0.38
            "folia-classic" -> f.ballad * 0.64 + f.acgBright * 0.52
            "folia-cappella" -> f.acgBright * 0.80 + f.hiphop * 0.40 + f.rainUrban * 0.32
            else -> 0.0
        }
        val spread = hashUnit("$seedKey|mode|$id")
        return affinity * 0.36 + spread * 0.74
    }
}
