import type { Line, Word } from '../../types';
import { splitLyricGraphemes } from '../../utils/lyrics/graphemeTiming';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const STICKY_PUNCT_RE = /^[，。！？、；：,.!?;:'"’”)\]）】》〉…—\-~·\s]+$/;

export function splitTranslationSubLines(
    translation?: string | null,
    enabled = true,
): string[] {
    if (!enabled || !translation) return [];
    return String(translation)
        .split(/\r?\n/)
        .map(row => row.trim())
        .filter(Boolean);
}

/**
 * Splits a translation/romaji row into natural word/character tokens whose concatenation
 * equals `text` (`tokens.join('') === text`), keeping spaces and trailing punctuation attached
 * so inline/flex/canvas layouts wrap cleanly without dropping word spacing.
 */
export function chunkCompanionTokens(text: string): string[] {
    const graphemes = splitLyricGraphemes(text);
    if (graphemes.length === 0) return [];

    const rawTokens: string[] = [];
    let current = '';
    let currentIsLatin = false;

    for (const g of graphemes) {
        const isSpace = /^\s+$/.test(g);
        const isCjk = CJK_CHAR_RE.test(g);
        const isPunct = STICKY_PUNCT_RE.test(g) && !isSpace;

        if (isCjk) {
            if (current) {
                rawTokens.push(current);
                current = '';
                currentIsLatin = false;
            }
            rawTokens.push(g);
        } else if (isPunct) {
            if (current) {
                current += g;
            } else if (rawTokens.length > 0) {
                rawTokens[rawTokens.length - 1] += g;
            } else {
                rawTokens.push(g);
            }
        } else if (isSpace) {
            if (current) {
                current += g;
                rawTokens.push(current);
                current = '';
                currentIsLatin = false;
            } else if (rawTokens.length > 0) {
                rawTokens[rawTokens.length - 1] += g;
            } else {
                rawTokens.push(g);
            }
        } else {
            if (!currentIsLatin && current) {
                rawTokens.push(current);
                current = '';
            }
            current += g;
            currentIsLatin = true;
        }
    }

    if (current) {
        rawTokens.push(current);
    }

    return rawTokens.length > 0 ? rawTokens : [text];
}

/**
 * Maps a normalized progress fraction `u` in [0, 1] onto `parentLine`'s actual vocal timing curve.
 * When `parentLine` has word-level timings, the companion translation/romaji accelerates, holds,
 * and finishes at the exact millisecond the main lyric does.
 */
export function createParentTimingMapper(parentLine: Line): (u: number) => number {
    const lineStart = parentLine.startTime;
    const renderEnd = Math.max(lineStart + 0.2, getLineRenderEndTime(parentLine));
    const validWords = (parentLine.words ?? []).filter(
        w => w && w.text.length > 0 && Number.isFinite(w.startTime) && Number.isFinite(w.endTime),
    );

    if (validWords.length >= 2) {
        const weights = validWords.map(w => {
            const trimmed = w.text.trim();
            return Math.max(1, splitLyricGraphemes(trimmed || w.text).length);
        });
        const totalWeight = weights.reduce((sum, v) => sum + v, 0) || 1;
        const knots: Array<{ uStart: number; uEnd: number; tStart: number; tEnd: number }> = [];
        let acc = 0;
        for (let i = 0; i < validWords.length; i += 1) {
            const uStart = acc / totalWeight;
            acc += weights[i];
            const uEnd = i === validWords.length - 1 ? 1 : acc / totalWeight;
            const tStart = Math.max(lineStart, validWords[i].startTime);
            const tEnd = Math.min(renderEnd, Math.max(tStart + 0.02, validWords[i].endTime));
            knots.push({ uStart, uEnd, tStart, tEnd });
        }

        return (rawU: number) => {
            const u = Math.max(0, Math.min(1, rawU));
            if (u <= 0) return knots[0].tStart;
            if (u >= 1) return knots[knots.length - 1].tEnd;
            for (let i = 0; i < knots.length; i += 1) {
                const k = knots[i];
                if (u <= k.uEnd || i === knots.length - 1) {
                    const span = Math.max(1e-6, k.uEnd - k.uStart);
                    const local = Math.max(0, Math.min(1, (u - k.uStart) / span));
                    return k.tStart + local * (k.tEnd - k.tStart);
                }
            }
            return knots[knots.length - 1].tEnd;
        };
    }

    const singStart = validWords.length === 1 ? Math.max(lineStart, validWords[0].startTime) : lineStart;
    const defaultSpan = Math.max(0.2, (renderEnd - singStart) * 0.88);
    const singEnd = validWords.length === 1
        ? Math.min(renderEnd, Math.max(singStart + 0.08, validWords[0].endTime))
        : Math.min(renderEnd, singStart + defaultSpan);

    return (rawU: number) => {
        const u = Math.max(0, Math.min(1, rawU));
        return singStart + u * (singEnd - singStart);
    };
}

export function buildCompanionLine(
    parentLine: Line,
    subText: string,
    subIndex = 0,
): Line {
    const tokens = chunkCompanionTokens(subText);
    const mapTime = createParentTimingMapper(parentLine);
    const renderEnd = Math.max(parentLine.startTime + 0.2, getLineRenderEndTime(parentLine));
    const weights = tokens.map(token => {
        const trimmed = token.trim();
        return Math.max(1, splitLyricGraphemes(trimmed || token).length);
    });
    const totalWeight = weights.reduce((sum, v) => sum + v, 0) || 1;

    let acc = 0;
    const words: Word[] = tokens.map((token, idx) => {
        const uStart = acc / totalWeight;
        acc += weights[idx];
        const uEnd = idx === tokens.length - 1 ? 1 : acc / totalWeight;
        const startTime = mapTime(uStart);
        const rawEnd = mapTime(uEnd);
        const endTime = Math.min(renderEnd, Math.max(startTime + 0.03, rawEnd));
        return {
            text: token,
            startTime,
            endTime,
        };
    });

    return {
        id: `${parentLine.id ?? parentLine.startTime}:sub:${subIndex}`,
        startTime: parentLine.startTime,
        endTime: parentLine.endTime,
        fullText: subText,
        words,
        isChorus: parentLine.isChorus,
        chorusEffect: parentLine.chorusEffect,
        renderHints: parentLine.renderHints,
        autoWordSegments: tokens.length > 1 ? tokens : undefined,
    };
}

export function buildCompanionLines(
    parentLine: Line | null | undefined,
    enabled = true,
): Line[] {
    if (!parentLine) return [];
    const subRows = splitTranslationSubLines(parentLine.translation, enabled);
    return subRows.map((row, idx) => buildCompanionLine(parentLine, row, idx));
}
