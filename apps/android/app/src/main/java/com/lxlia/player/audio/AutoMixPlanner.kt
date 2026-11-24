package com.lxlia.player.audio

import com.lxlia.player.model.LyricLine
import com.lxlia.player.model.Song
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin

data class AutoMixPlan(
    val enabled: Boolean,
    val strategy: String,
    val strategyLabel: String,
    val vocalFinishMs: Long,
    val mixStartMs: Long,
    val nextEntryMs: Long,
    val crossfadeMs: Long,
    val bassSwap: Boolean,
    val filterSweep: String,
    val tempoMatch: Boolean,
    val rateA: Float,
    val rateB: Float,
    val compatibility: Double,
    val bpmA: Int,
    val bpmB: Int,
    val summary: String,
)

data class EqualPowerPair(val outGain: Float, val inGain: Float)

object AutoMixPlanner {
    private data class Profile(
        val durationMs: Long,
        val firstVocalMs: Long,
        val lastVocalMs: Long,
        val lastVocalEndMs: Long,
        val vocalFinishMs: Long,
        val pureOutroMs: Long,
        val introLeadMs: Long,
        val energy: Double,
        val bpm: Int,
        val isCalm: Boolean,
        val isHighEnergy: Boolean,
        val artistNorm: String,
        val albumNorm: String,
        val hasLyrics: Boolean,
    )

    private val META_RE = Regex("^(作词|作曲|词曲|词/曲|作词/作曲|编曲|制作人|制作|混音|母带|录音|吉他|贝斯|鼓|键盘|和声|监制|音乐总监|出品|出品方|发行|发行方|词|曲|编|唱|演唱|原唱|翻唱|统筹|企划|宣传|版权|版权声明|鸣谢|感谢|谢谢|录音棚|混音室|混音师|母带处理|OP|SP|END|完|lyricist|composer|arranger|producer|mixed|mastered|pure music|纯音乐|无歌词)(\\s*[:：]|$)", RegexOption.IGNORE_CASE)
    private val HIGH_RE = Regex("\\b(dj|remix|club|edm|house|techno|trap|drill|phunk|phonk|dance|rave|electro|cyber|bass|dubstep|rock|metal|punk|funk|disco|hip[\\s-]?hop|rap|hyperpop|nightcore|speed[\\s-]?up|sped\\s+up)\\b|电音|舞曲|说唱|摇滚|蹦迪|热舞|律动|劲爆|DJ版", RegexOption.IGNORE_CASE)
    private val CALM_RE = Regex("\\b(acoustic|piano|unplugged|ballad|lullaby|ambient|sleep|study|meditation|classical|violin|cello|guzheng|flute|solo|live|ost|instrumental)\\b|钢琴|纯音乐|轻音乐|民谣|抒情|晚安|助眠|独奏|清唱|古筝|大提琴|小提琴|慢摇|催眠", RegexOption.IGNORE_CASE)
    private val SYMBOL_ONLY_RE = Regex("^[♪♫~\\-\\s.。…]+$")
    private val CJK_RE = Regex("[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]")
    private val LATIN_WORD_RE = Regex("[a-zA-Z0-9']+")

    private fun smoothstep(x: Double): Double {
        val s = x.coerceIn(0.0, 1.0)
        return s * s * (3.0 - 2.0 * s)
    }

    private fun ramp(u: Double, start: Double, end: Double): Double =
        ((u - start) / max(0.001, end - start)).coerceIn(0.0, 1.0)

    private fun estimateSyllables(text: String): Double {
        val s = text.trim()
        if (s.isEmpty()) return 4.0
        val cjk = CJK_RE.findAll(s).count()
        val latin = LATIN_WORD_RE.findAll(CJK_RE.replace(s, " ")).count()
        return max(3.0, cjk + latin * 1.45)
    }

    private fun analyze(song: Song, durationOverrideMs: Long, lines: List<LyricLine>): Profile {
        val valid = lines.filter {
            val t = it.text.trim()
            it.timeMs >= 0 && t.isNotEmpty() && !SYMBOL_ONLY_RE.matches(t) && !META_RE.containsMatchIn(t)
        }.sortedBy { it.timeMs }
        val durationMs = max(0L, if (durationOverrideMs > 0L) durationOverrideMs else song.durationMs)
        val textSig = "${song.name} ${song.albumName} ${song.singer}"

        var firstVocalMs = -1L
        var lastVocalMs = -1L
        var lastLine: LyricLine? = null
        var medianGapMs = 3400.0
        var avgGapMs = 0.0
        var vocalDensity = 0.0
        if (valid.size >= 2) {
            firstVocalMs = valid.first().timeMs
            lastLine = valid.last()
            lastVocalMs = lastLine.timeMs
            val spanSec = max(10.0, (lastVocalMs - firstVocalMs) / 1000.0)
            vocalDensity = valid.size / spanSec
            val gaps = (1 until valid.size)
                .map { (valid[it].timeMs - valid[it - 1].timeMs).toDouble() }
                .filter { it in 500.0..14000.0 }
                .sorted()
            if (gaps.isNotEmpty()) {
                medianGapMs = gaps[gaps.size / 2]
                avgGapMs = gaps.average()
            }
        } else if (valid.size == 1) {
            firstVocalMs = valid.first().timeMs
            lastLine = valid.first()
            lastVocalMs = lastLine.timeMs
        }

        var energy = 0.54
        if (HIGH_RE.containsMatchIn(textSig)) energy += 0.28
        if (CALM_RE.containsMatchIn(textSig)) energy -= 0.28
        if (vocalDensity >= 0.48) energy += 0.14
        else if (vocalDensity >= 0.34) energy += 0.05
        else if (vocalDensity > 0 && vocalDensity < 0.22) energy -= 0.14
        if (durationMs in 1L..175_000L) energy += 0.06
        if (durationMs > 300_000L) energy -= 0.08
        energy = energy.coerceIn(0.12, 0.98)
        val isCalm = energy < 0.42
        val isHighEnergy = energy >= 0.66

        var bpmD = 82.0 + energy * 52.0
        if (avgGapMs > 0.0) {
            val cadenceBpm = (320_000.0 / max(1500.0, avgGapMs)).coerceIn(68.0, 152.0)
            bpmD = bpmD * 0.65 + cadenceBpm * 0.35
        }
        val bpm = bpmD.coerceIn(60.0, 185.0).roundToInt()

        val hasLyrics = valid.size >= 2
        var lastVocalEndMs = -1L
        var vocalFinishMs = if (durationMs > 0L) (durationMs * 0.80).roundToLong() else 0L
        if (lastVocalMs >= 0L && lastLine != null) {
            val syllables = estimateSyllables(lastLine.text)
            val msPerSyl = if (isCalm) 265.0 else if (isHighEnergy) 165.0 else 210.0
            val textDurMs = (syllables * msPerSyl + 650.0).coerceIn(2000.0, 4600.0)
            val gapRefMs = (medianGapMs * 0.92).coerceIn(2200.0, 4400.0)
            val sungMs = max(textDurMs, gapRefMs * 0.85).coerceIn(2200.0, 4800.0).roundToLong()
            lastVocalEndMs = lastVocalMs + sungMs
            val tailReverbMs = if (isCalm) 1700L else if (isHighEnergy) 1000L else 1350L
            vocalFinishMs = if (durationMs > 0L) min(durationMs, lastVocalEndMs + tailReverbMs) else (lastVocalEndMs + tailReverbMs)
        }

        val pureOutroMs = if (durationMs > 0L && hasLyrics) {
            max(0L, durationMs - vocalFinishMs)
        } else {
            min(18_000L, (durationMs * 0.14).roundToLong())
        }
        val introLeadMs = if (hasLyrics && firstVocalMs >= 0L) {
            firstVocalMs
        } else {
            if (isCalm) 10_000L else if (isHighEnergy) 8500L else 9000L
        }

        return Profile(
            durationMs = durationMs,
            firstVocalMs = firstVocalMs,
            lastVocalMs = lastVocalMs,
            lastVocalEndMs = lastVocalEndMs,
            vocalFinishMs = vocalFinishMs,
            pureOutroMs = pureOutroMs,
            introLeadMs = introLeadMs,
            energy = energy,
            bpm = bpm,
            isCalm = isCalm,
            isHighEnergy = isHighEnergy,
            artistNorm = song.singer.split(Regex("[、/,，;&]+")).firstOrNull()?.trim()?.lowercase().orEmpty(),
            albumNorm = song.albumName.trim().lowercase(),
            hasLyrics = hasLyrics,
        )
    }

    private fun tempoCompat(bpmA: Int, bpmB: Int): Double {
        if (bpmA <= 0 || bpmB <= 0) return 0.65
        val a = bpmA.toDouble()
        val b = bpmB.toDouble()
        val ratios = doubleArrayOf(a / b, (a * 2.0) / b, a / (b * 2.0))
        var bestDiff = 1.0
        for (r in ratios) {
            val diff = abs(1.0 - r)
            if (diff < bestDiff) bestDiff = diff
        }
        return (1.0 - bestDiff * 2.8).coerceIn(0.15, 1.0)
    }

    fun plan(
        currentSong: Song,
        currentDurationMs: Long,
        currentLyrics: List<LyricLine>,
        nextSong: Song?,
        nextLyrics: List<LyricLine> = emptyList(),
    ): AutoMixPlan {
        if (nextSong == null) {
            return AutoMixPlan(false, "none", "自然播完", 0L, 0L, 0L, 0L, false, "none", false, 1f, 1f, 0.0, 0, 0, "队列末尾无下一首")
        }
        val a = analyze(currentSong, currentDurationMs, currentLyrics)
        val b = analyze(nextSong, nextSong.durationMs, nextLyrics)
        if (a.durationMs < 24_000L) {
            return AutoMixPlan(false, "none", "标准衔接", a.vocalFinishMs, max(0L, a.durationMs - 1000L), 0L, 0L, false, "none", false, 1f, 1f, 0.0, a.bpm, b.bpm, "短曲目保持原样播完")
        }

        val tempoScore = tempoCompat(a.bpm, b.bpm)
        val energySigned = b.energy - a.energy
        val energyDelta = abs(energySigned)
        val energyScore = (1.0 - energyDelta * 1.35).coerceIn(0.22, 1.0)
        val continuityBonus = when {
            a.albumNorm.isNotEmpty() && a.albumNorm == b.albumNorm -> 0.12
            a.artistNorm.isNotEmpty() && a.artistNorm == b.artistNorm -> 0.08
            else -> 0.0
        }
        val compat = (tempoScore * 0.55 + energyScore * 0.45 + continuityBonus).coerceIn(0.18, 1.0)

        val shortNextIntro = b.hasLyrics && b.firstVocalMs in 0L..2199L
        val shortOutro = a.hasLyrics && a.pureOutroMs < 2600L

        var strategy = "echo-wash-bridge"
        var label = "余韵丝滑桥接"
        var baseCrossfadeMs = 7600L
        var bassSwap = false
        var filterSweep = "lowpass-warm"
        var tempoMatch = false
        var rateA = 1f
        var rateB = 1f
        val nextEntryMs = 0L

        if (shortNextIntro || shortOutro) {
            strategy = "clean-air-handoff"
            label = "呼吸气口衔接"
            baseCrossfadeMs = (if (shortNextIntro) max(2600L, b.firstVocalMs + 900L) else 3400L).coerceIn(2600L, 4000L)
            bassSwap = false
            filterSweep = "none"
        } else if (a.energy >= 0.54 && b.energy >= 0.54 && tempoScore >= 0.60 && a.pureOutroMs >= 5500L) {
            strategy = "beat-lock-mix"
            label = "节拍锁定混音"
            val avgBpm = (a.bpm + b.bpm) * 0.5
            val barMs = (60_000.0 / max(60.0, avgBpm)) * 4.0
            val targetBars = if (compat >= 0.72 && a.pureOutroMs >= 10_000L) 4.0 else 3.0
            baseCrossfadeMs = (barMs * targetBars).roundToLong().coerceIn(6600L, 10_200L)
            bassSwap = true
            filterSweep = "highpass-lift"
            val rawRatio = a.bpm.toDouble() / max(1, b.bpm).toDouble()
            if (rawRatio in 0.94..1.065 && abs(1.0 - rawRatio) >= 0.012) {
                rateA = (avgBpm / a.bpm.toDouble()).coerceIn(0.965, 1.035).toFloat()
                rateB = (avgBpm / b.bpm.toDouble()).coerceIn(0.965, 1.035).toFloat()
                tempoMatch = true
            }
        } else if (energySigned >= 0.20) {
            strategy = "energy-lift-drop"
            label = "能量抬升切入"
            baseCrossfadeMs = (5600.0 + compat * 1800.0).roundToLong().coerceIn(5400L, 7600L)
            bassSwap = b.energy >= 0.56
            filterSweep = "highpass-lift"
        } else if (energySigned <= -0.20) {
            strategy = "energy-cool-settle"
            label = "缓降沉淀过渡"
            baseCrossfadeMs = (6400.0 + (1.0 - energyDelta) * 2000.0).roundToLong().coerceIn(6200L, 8800L)
            bassSwap = false
            filterSweep = "lowpass-warm"
        } else {
            strategy = "echo-wash-bridge"
            label = "余韵丝滑桥接"
            baseCrossfadeMs = (6400.0 + compat * 2400.0).roundToLong().coerceIn(6200L, 9000L)
            bassSwap = a.energy >= 0.50 && b.energy >= 0.50 && tempoScore >= 0.58
            filterSweep = "lowpass-warm"
        }

        var crossfadeMs = baseCrossfadeMs
        if (b.hasLyrics && b.firstVocalMs >= 2200L) {
            val vocalCap = max(3200L, (b.firstVocalMs * 0.96).roundToLong())
            crossfadeMs = min(crossfadeMs, vocalCap)
        }

        val endSilenceMs = when {
            a.pureOutroMs >= 20_000L -> 3200L
            a.pureOutroMs >= 10_000L -> 2000L
            else -> 900L
        }
        val usableOutroMs = max(0L, a.pureOutroMs - endSilenceMs)
        var soloOutroMs = 0L
        if (a.hasLyrics) {
            when {
                usableOutroMs >= 15_000L -> {
                    soloOutroMs = (usableOutroMs * 0.36).roundToLong().coerceIn(4200L, 9500L)
                    crossfadeMs = crossfadeMs.coerceIn(6400L, max(6400L, min(10_500L, usableOutroMs - soloOutroMs + 800L)))
                }
                usableOutroMs >= 8500L -> {
                    soloOutroMs = (usableOutroMs * 0.28).roundToLong().coerceIn(2200L, 4200L)
                    crossfadeMs = min(crossfadeMs, usableOutroMs - soloOutroMs + 600L).coerceIn(5400L, 9000L)
                }
                usableOutroMs >= 4500L -> {
                    soloOutroMs = (usableOutroMs * 0.22).roundToLong().coerceIn(1000L, 2000L)
                    crossfadeMs = min(crossfadeMs, usableOutroMs - soloOutroMs + 600L).coerceIn(3800L, 6600L)
                }
                else -> {
                    soloOutroMs = (usableOutroMs * 0.15).roundToLong().coerceIn(0L, 800L)
                    crossfadeMs = max(2600L, a.pureOutroMs - soloOutroMs - 300L).coerceIn(2400L, 4800L)
                }
            }
            if (b.hasLyrics && b.firstVocalMs >= 2200L) {
                crossfadeMs = min(crossfadeMs, max(2800L, (b.firstVocalMs * 0.96).roundToLong()))
            }
        }

        var mixStartMs = if (a.hasLyrics) {
            if (usableOutroMs > soloOutroMs + crossfadeMs + 5000L) {
                val livelyWait = min(13_500L, max(soloOutroMs, usableOutroMs - crossfadeMs - 2500L))
                a.vocalFinishMs + livelyWait
            } else {
                a.vocalFinishMs + soloOutroMs
            }
        } else {
            a.durationMs - crossfadeMs - endSilenceMs
        }

        val minAllowedStart = if (a.hasLyrics) a.vocalFinishMs + soloOutroMs else (a.durationMs * 0.72).roundToLong()
        if (strategy == "beat-lock-mix" && a.bpm >= 60) {
            val halfBarMs = (60_000.0 / a.bpm.toDouble()) * 2.0
            val anchor = if (a.firstVocalMs >= 0L) a.firstVocalMs else 0L
            val steps = ceil(max(0.0, (mixStartMs - anchor).toDouble()) / halfBarMs)
            val snapped = anchor + (steps * halfBarMs).roundToLong()
            if (snapped in minAllowedStart..(a.durationMs - crossfadeMs - 400L)) {
                mixStartMs = snapped
            }
        }

        val availAfterStart = a.durationMs - mixStartMs - 350L
        if (availAfterStart < crossfadeMs) {
            if (availAfterStart >= 2400L) {
                crossfadeMs = availAfterStart
            } else {
                val vocalFloor = if (a.hasLyrics && a.lastVocalEndMs > 0L) {
                    min(a.lastVocalEndMs + 400L, a.durationMs - 2400L)
                } else {
                    a.durationMs - 3200L
                }
                mixStartMs = max((a.durationMs * 0.65).roundToLong(), vocalFloor)
                crossfadeMs = (a.durationMs - mixStartMs - 300L).coerceIn(2200L, 3400L)
                strategy = "clean-air-handoff"
                label = "呼吸气口衔接"
                bassSwap = false
                filterSweep = "none"
                tempoMatch = false
                rateA = 1f
                rateB = 1f
            }
        }

        val maxFade = min(10_800L, (a.durationMs * 0.28).roundToLong())
        crossfadeMs = crossfadeMs.coerceIn(2200L, max(2200L, maxFade))
        val maxStart = max(4000L, a.durationMs - 2200L)
        val minStart = if (a.hasLyrics && a.lastVocalEndMs > 0L && a.lastVocalEndMs < maxStart - 300L) {
            max((a.durationMs * 0.60).roundToLong(), a.lastVocalEndMs)
        } else {
            (a.durationMs * 0.65).roundToLong()
        }
        mixStartMs = mixStartMs.coerceIn(min(minStart, maxStart), maxStart)

        val secs = String.format(java.util.Locale.US, "%.1f", crossfadeMs / 1000.0)
        val extra = when {
            tempoMatch -> " · 微调速对拍"
            bassSwap -> " · 低频交换"
            filterSweep == "lowpass-warm" -> " · 尾奏前奏交织"
            filterSweep == "highpass-lift" -> " · 能量抬升"
            else -> ""
        }
        val summary = "$label · ${secs}s$extra"
        return AutoMixPlan(
            enabled = true,
            strategy = strategy,
            strategyLabel = label,
            vocalFinishMs = a.vocalFinishMs,
            mixStartMs = mixStartMs,
            nextEntryMs = nextEntryMs,
            crossfadeMs = crossfadeMs,
            bassSwap = bassSwap,
            filterSweep = filterSweep,
            tempoMatch = tempoMatch,
            rateA = rateA,
            rateB = rateB,
            compatibility = compat,
            bpmA = a.bpm,
            bpmB = b.bpm,
            summary = summary,
        )
    }

    fun equalPowerGains(progress: Float, strategy: String): EqualPowerPair {
        val u = progress.coerceIn(0f, 1f).toDouble()
        if (u <= 0.0) return EqualPowerPair(1f, 0f)
        if (u >= 1.0) return EqualPowerPair(0f, 1f)
        if (strategy == "clean-air-handoff") {
            return EqualPowerPair(
                cos(smoothstep(ramp(u, 0.0, 0.66)) * PI * 0.5).toFloat(),
                sin(smoothstep(ramp(u, 0.26, 0.92)) * PI * 0.5).toFloat(),
            )
        }
        if (strategy == "beat-lock-mix" || strategy == "beat-blend") {
            val outPhase = if (u <= 0.40) (u / 0.40) * 0.10 else (0.10 + 0.90 * smoothstep(ramp(u, 0.40, 0.96)))
            return EqualPowerPair(
                cos(outPhase * PI * 0.5).toFloat(),
                sin(smoothstep(ramp(u, 0.0, 0.58)) * PI * 0.5).toFloat(),
            )
        }
        if (strategy == "energy-lift-drop") {
            val outPhase = if (u <= 0.32) (u / 0.32) * 0.14 else (0.14 + 0.86 * smoothstep(ramp(u, 0.32, 0.88)))
            return EqualPowerPair(
                cos(outPhase * PI * 0.5).toFloat(),
                sin(smoothstep(ramp(u, 0.04, 0.60)) * PI * 0.5).toFloat(),
            )
        }
        if (strategy == "energy-cool-settle") {
            val outPhase = if (u <= 0.36) (u / 0.36) * 0.16 else (0.16 + 0.84 * smoothstep(ramp(u, 0.36, 1.0)))
            return EqualPowerPair(
                cos(outPhase * PI * 0.5).toFloat(),
                sin(smoothstep(ramp(u, 0.06, 0.74)) * PI * 0.5).toFloat(),
            )
        }
        val outPhase = if (u <= 0.34) (u / 0.34) * 0.14 else (0.14 + 0.86 * smoothstep(ramp(u, 0.34, 1.0)))
        return EqualPowerPair(
            cos(outPhase * PI * 0.5).toFloat(),
            sin(smoothstep(ramp(u, 0.0, 0.68)) * PI * 0.5).toFloat(),
        )
    }
}
