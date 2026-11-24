import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import { Line, Theme } from '../../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../../utils/fontStacks';
import { buildCompanionLines } from '../companionTranslation';
import type { PreparedStateCacheContext } from './cadenzaTypes';
import { clamp, isCJK, splitGraphemes } from './cadenzaEnvelopes';
import { buildLineFragments, buildSegmentMetas, findWordRanges } from './cadenzaFragments';
import { buildWordPlacements } from './cadenzaPlacements';

// src/components/visualizer/cadenza/cadenzaPreparedState.ts
// 一行歌词的完整准备：选字号、pretext 测量换行、切片段、算落点。整个模式最贵的一步，结果由组件缓存。

const chooseFontPx = (width: number, line: Line) => {
    const graphemeCount = splitGraphemes(line.fullText).length || 1;
    const wordCount = line.words.length || 1;
    const isNarrow = width < 680;
    const widthBase = isNarrow
        ? clamp(width * 0.086, 28, 54)
        : clamp(23 + width * 0.0205, 42, 76);
    const lengthPenalty = graphemeCount > 24
        ? Math.min((graphemeCount - 24) * (isNarrow ? 0.9 : (width >= 1180 ? 0.85 : 1.15)), isNarrow ? 12 : 18)
        : 0;
    const densityPenalty = wordCount > 10 ? Math.min((wordCount - 10) * 0.85, 9) : 0;
    return clamp(widthBase - lengthPenalty - densityPenalty, isNarrow ? 24 : 36, isNarrow ? 56 : 82);
};

const buildCanvasFont = (theme: Theme, fontPx: number) => `${resolveThemeFontWeight(theme, 700)} ${fontPx}px ${resolveThemeFontStack(theme)}`;

export const buildPreparedState = (
    line: Line,
    context: PreparedStateCacheContext,
) => {
    const { showText, viewport, theme, tuning } = context;

    if (!showText || viewport.width <= 0 || viewport.height <= 0) {
        return null;
    }

    const fontPx = clamp(chooseFontPx(viewport.width, line) * tuning.fontScale, 22, 128);
    const font = buildCanvasFont(theme, fontPx);
    // This is the expensive part of the mode.
    // Once a line reaches here, we fully measure it, wrap it, split it, and convert it into placement-ready fragments.
    const prepared = prepareWithSegments(line.fullText, font);
    const text = prepared.segments.join('');
    const { segmentMetas, graphemes } = buildSegmentMetas(prepared);
    const cssSpacing = typeof document !== 'undefined'
        ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lyric-line-spacing')) || 1.2)
        : 1.2;
    const lineHeight = Math.round(fontPx * (isCJK(text) ? 1.22 : 1.12) * (Math.max(0.85, Math.min(1.8, cssSpacing)) / 1.2));
    const availableWidth = Math.max(viewport.width - (viewport.width < 680 ? 28 : 64), 140);
    const minWidth = Math.min(200, availableWidth);
    const wrapCompression = viewport.width >= 1180
        ? 0.96
        : (graphemes.length > 26
            ? clamp(0.96 - (graphemes.length - 26) * 0.008, 0.86, 0.96)
            : 0.96);
    const compactWidthRatio = Math.min(0.92, tuning.widthRatio * wrapCompression);
    const maxWidth = clamp(viewport.width * compactWidthRatio, minWidth, availableWidth);
    const layout = layoutWithLines(prepared, maxWidth, lineHeight);
    const ranges = findWordRanges(line, graphemes, theme);
    const lineFragments = buildLineFragments(prepared, segmentMetas, graphemes, layout, ranges);
    const placements = buildWordPlacements(
        lineFragments,
        fontPx,
        lineHeight,
        maxWidth,
        theme.animationIntensity,
        line.startTime * 1000,
        line.fullText === '......',
    );

    if (context.showTranslation) {
        const companionLines = buildCompanionLines(line, true);
        if (companionLines.length > 0) {
            const subFontPx = clamp(Math.round(fontPx * 0.50), 15, 58);
            const subFont = buildCanvasFont(theme, subFontPx);
            const subMaxWidth = clamp(Math.max(maxWidth, viewport.width * 0.90), minWidth, availableWidth);
            const maxMainBottomY = placements.reduce(
                (maxY, p) => Math.max(maxY, p.y + p.height * 0.58),
                fontPx * 0.64,
            );
            let cursorBaselineY = maxMainBottomY + Math.max(14, subFontPx * 1.68);
            let subWordSeq = 1000;

            companionLines.forEach((subLine, subRowIdx) => {
                const subPrepared = prepareWithSegments(subLine.fullText, subFont);
                const subText = subPrepared.segments.join('');
                const { segmentMetas: subSegMetas, graphemes: subGraphemes } = buildSegmentMetas(subPrepared);
                const subLineHeight = Math.round(subFontPx * (isCJK(subText) ? 1.36 : 1.28));
                const subLayout = layoutWithLines(subPrepared, subMaxWidth, subLineHeight);
                const subRanges = findWordRanges(subLine, subGraphemes, theme);
                const subLineFragments = buildLineFragments(subPrepared, subSegMetas, subGraphemes, subLayout, subRanges);

                subLineFragments.forEach((lineView, wrappedIdx) => {
                    const lineLeft = -lineView.line.width / 2;
                    const rowBaselineY = cursorBaselineY + wrappedIdx * subLineHeight;
                    lineView.fragments.forEach((fragment, fragIdx) => {
                        if (!fragment.text.trim()) return;
                        subWordSeq += 1;
                        const seedVal = line.startTime * 1000 + (subRowIdx + 1) * 313 + wrappedIdx * 71 + fragIdx * 19;
                        const rand = (off: number) => {
                            const v = Math.sin(seedVal + off) * 10000;
                            return v - Math.floor(v);
                        };
                        const fragWidth = Math.max(fragment.endX - fragment.startX, subFontPx * 0.22);
                        const fragHeight = subFontPx * 0.95;
                        const chosenX = lineLeft + fragment.startX + (rand(1) - 0.5) * (theme.animationIntensity === 'chaotic' ? 5 : 2);
                        const chosenY = rowBaselineY + (rand(2) - 0.5) * (theme.animationIntensity === 'chaotic' ? 4 : 1.5);
                        const driftAmt = theme.animationIntensity === 'chaotic' ? 5 + rand(6) * 5 : 3 + rand(6) * 3.5;
                        placements.push({
                            id: `sub-${subRowIdx}-${wrappedIdx}-${fragIdx}-${subWordSeq}-${fragment.word.text}`,
                            wordIndex: subWordSeq,
                            word: fragment.word,
                            text: fragment.text,
                            color: fragment.color,
                            x: chosenX,
                            y: chosenY,
                            width: fragWidth,
                            height: fragHeight,
                            rotate: 0,
                            scale: 1,
                            passedRotate: (rand(3) - 0.5) * (theme.animationIntensity === 'chaotic' ? 14 : 8),
                            passedDriftX: (rand(7) - 0.5) * driftAmt,
                            passedDriftY: driftAmt * 0.55 + (rand(8) - 0.5) * 1.5,
                            entryOffsetX: 0,
                            entryOffsetY: 0,
                            fragmentStartInWord: fragment.fragmentStartInWord,
                            fragmentEndInWord: fragment.fragmentEndInWord,
                            wordGraphemeCount: fragment.wordGraphemeCount,
                            wordGraphemeTimings: fragment.wordGraphemeTimings,
                            emphasis: 1,
                            isInterlude: false,
                            font: subFont,
                            fontPx: subFontPx,
                        });
                    });
                });

                cursorBaselineY += Math.max(1, subLineFragments.length) * subLineHeight + Math.round(subFontPx * 0.34);
            });
        }
    }

    return {
        prepared,
        text,
        font,
        fontPx,
        lineHeight,
        maxWidth,
        layout,
        segmentMetas,
        graphemes,
        placements,
    };
};
