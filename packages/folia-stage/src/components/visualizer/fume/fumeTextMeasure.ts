import { layoutWithLines, prepareWithSegments, type PreparedTextWithSegments, type LayoutCursor, type PrepareOptions } from '@chenglou/pretext';
import { Theme } from '../../../types';
import { resolveThemeFontWeight } from '../../../utils/fontStacks';
import type { RenderLineSlice, RenderSegmentSlice, SegmentMeta, WordRange } from './fumeTypes';
import { clamp, splitGraphemes } from './fumeMath';
import { measurePrefixOffsets, rememberBounded } from '../textMeasureCache';

// src/components/visualizer/fume/fumeTextMeasure.ts
// Text measurement for fume: pretext segments, glyph offsets and advances inside render lines.

const FUME_PRETEXT_OPTIONS = { whiteSpace: 'pre-wrap' } satisfies PrepareOptions;

export const buildSegmentMetas = (prepared: PreparedTextWithSegments) => {
    const segmentMetas: SegmentMeta[] = [];
    const graphemes: string[] = [];
    let graphemeCursor = 0;

    for (const segment of prepared.segments) {
        const segmentGraphemes = splitGraphemes(segment);
        segmentMetas.push({
            graphemeStart: graphemeCursor,
            graphemeEnd: graphemeCursor + segmentGraphemes.length,
            graphemeCount: segmentGraphemes.length,
        });
        graphemes.push(...segmentGraphemes);
        graphemeCursor += segmentGraphemes.length;
    }

    return { graphemes, segmentMetas };
};

export const cursorToGlobalOffset = (cursor: LayoutCursor, segmentMetas: SegmentMeta[]) => {
    if (segmentMetas.length === 0) return 0;
    const segment = segmentMetas[cursor.segmentIndex];

    if (!segment) {
        return segmentMetas[segmentMetas.length - 1]!.graphemeEnd;
    }

    return clamp(segment.graphemeStart + cursor.graphemeIndex, segment.graphemeStart, segment.graphemeEnd);
};

const getPartialSegmentWidth = (
    prepared: PreparedTextWithSegments,
    segmentIndex: number,
    segmentMeta: SegmentMeta,
    startOffset: number,
    endOffset: number,
) => {
    const localStart = clamp(startOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);
    const localEnd = clamp(endOffset - segmentMeta.graphemeStart, 0, segmentMeta.graphemeCount);

    if (localEnd <= localStart) return 0;
    if (localStart === 0 && localEnd === segmentMeta.graphemeCount) {
        return prepared.widths[segmentIndex] ?? 0;
    }

    const breakableFitAdvances = prepared.breakableFitAdvances[segmentIndex];
    if (breakableFitAdvances && breakableFitAdvances.length > 0) {
        let width = 0;
        for (let index = localStart; index < localEnd; index += 1) {
            width += breakableFitAdvances[index] ?? 0;
        }
        return width;
    }

    const fullWidth = prepared.widths[segmentIndex] ?? 0;
    if (segmentMeta.graphemeCount === 0) return fullWidth;
    return fullWidth * ((localEnd - localStart) / segmentMeta.graphemeCount);
};

export const widthBetweenOffsets = (
    prepared: PreparedTextWithSegments,
    segmentMetas: SegmentMeta[],
    startOffset: number,
    endOffset: number,
) => {
    if (endOffset <= startOffset) return 0;

    let width = 0;

    for (let segmentIndex = 0; segmentIndex < segmentMetas.length; segmentIndex += 1) {
        const meta = segmentMetas[segmentIndex]!;
        if (endOffset <= meta.graphemeStart) break;
        if (startOffset >= meta.graphemeEnd) continue;

        const sliceStart = Math.max(startOffset, meta.graphemeStart);
        const sliceEnd = Math.min(endOffset, meta.graphemeEnd);
        width += getPartialSegmentWidth(prepared, segmentIndex, meta, sliceStart, sliceEnd);
    }

    return width;
};

export const buildGlyphOffsets = (
    prepared: PreparedTextWithSegments,
    segmentMetas: SegmentMeta[],
    startOffset: number,
    graphemeCount: number,
) => {
    const offsets = new Array<number>(graphemeCount);
    for (let index = 0; index < graphemeCount; index += 1) {
        offsets[index] = widthBetweenOffsets(
            prepared,
            segmentMetas,
            startOffset,
            startOffset + index,
        );
    }
    return offsets;
};

export const resolveGlyphAdvance = (
    renderLine: RenderLineSlice,
    graphemeIndex: number,
) => {
    const currentOffset = renderLine.glyphOffsets[graphemeIndex] ?? 0;
    const nextOffset = graphemeIndex < renderLine.graphemes.length - 1
        ? (renderLine.glyphOffsets[graphemeIndex + 1] ?? renderLine.width)
        : renderLine.width;
    return Math.max(nextOffset - currentOffset, 0);
};

export const buildRenderSegments = (
    prepared: PreparedTextWithSegments,
    segmentMetas: SegmentMeta[],
    lineStart: number,
    lineEnd: number,
    fontSpec: string,
) => {
    const segments: RenderSegmentSlice[] = [];

    for (let segmentIndex = 0; segmentIndex < segmentMetas.length; segmentIndex += 1) {
        const meta = segmentMetas[segmentIndex]!;
        if (lineEnd <= meta.graphemeStart) {
            break;
        }
        if (lineStart >= meta.graphemeEnd) {
            continue;
        }

        const start = Math.max(lineStart, meta.graphemeStart);
        const end = Math.min(lineEnd, meta.graphemeEnd);
        if (end <= start) {
            continue;
        }

        const localStart = start - lineStart;
        const localEnd = end - lineStart;
        const segmentText = prepared.segments[segmentIndex] ?? '';
        const segmentGraphemes = splitGraphemes(segmentText);
        const text = start === meta.graphemeStart && end === meta.graphemeEnd
            ? segmentText
            : segmentGraphemes.slice(start - meta.graphemeStart, end - meta.graphemeStart).join('');
        const measuredGlyphOffsets = measureSegmentGlyphOffsets(text, fontSpec);

        segments.push({
            text,
            start,
            end,
            localStart,
            localEnd,
            x: widthBetweenOffsets(prepared, segmentMetas, lineStart, start),
            width: widthBetweenOffsets(prepared, segmentMetas, start, end),
            isFullSegment: start === meta.graphemeStart && end === meta.graphemeEnd,
            measuredGlyphOffsets,
        });
    }

    return segments;
};

export const buildFontSpec = (
    fontPx: number,
    variant: 'body' | 'hero',
    fontFamily: string,
    theme: Pick<Theme, 'fontWeight'>,
) => {
    const fontWeight = resolveThemeFontWeight(theme, variant === 'hero' ? 780 : 640);
    return `${fontWeight} ${fontPx}px ${fontFamily}`;
};

let segmentMeasureCanvas: HTMLCanvasElement | null = null;
// Bounded so a long session across many songs cannot grow it forever; far above one song's working set.
const SEGMENT_MEASURE_CACHE_LIMIT = 2048;
const segmentMeasureCache = new Map<string, number[]>();

const measureSegmentGlyphOffsets = (
    text: string,
    fontSpec: string,
) => {
    const cacheKey = `${fontSpec}__${text}`;
    const cached = segmentMeasureCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const graphemes = splitGraphemes(text);
    const offsets = new Array<number>(graphemes.length + 1).fill(0);
    if (typeof document === 'undefined') {
        return offsets;
    }

    if (!segmentMeasureCanvas) {
        segmentMeasureCanvas = document.createElement('canvas');
    }

    const context = segmentMeasureCanvas.getContext('2d');
    if (!context) {
        return offsets;
    }

    context.font = fontSpec;
    const measured = measurePrefixOffsets(graphemes, prefix => context.measureText(prefix).width);

    return rememberBounded(segmentMeasureCache, cacheKey, measured, SEGMENT_MEASURE_CACHE_LIMIT);
};

export const buildWordRangeIndexByOffset = (
    graphemeCount: number,
    wordRanges: WordRange[],
    rangeKind: 'timing' | 'color' = 'timing',
) => {
    const indices = new Array<number>(graphemeCount).fill(-1);
    for (let rangeIndex = 0; rangeIndex < wordRanges.length; rangeIndex += 1) {
        const range = wordRanges[rangeIndex]!;
        const start = rangeKind === 'color' ? range.colorStart : range.start;
        const end = rangeKind === 'color' ? range.colorEnd : range.end;
        for (let offset = start; offset < end && offset < graphemeCount; offset += 1) {
            indices[offset] = rangeIndex;
        }
    }
    return indices;
};

export const countRenderableGraphemes = (text: string) => (
    splitGraphemes(text).filter(value => value.trim().length > 0).length
);

const REF_MEASURE_FONT_PX = 24;
const SINGLE_LINE_WIDTH_CACHE_LIMIT = 1024;
const singleLineWidthCache = new Map<string, number>();

/** Measures a single line's natural width once at REF_MEASURE_FONT_PX; width scales linearly with fontPx. */
export const measureLineWidthAtRefPx = (
    text: string,
    fontFamily: string,
    variant: 'body' | 'hero',
    theme: Pick<Theme, 'fontWeight'>,
): number => {
    const fontSpec = buildFontSpec(REF_MEASURE_FONT_PX, variant, fontFamily, theme);
    const cacheKey = `${fontSpec}__${text}`;
    const cached = singleLineWidthCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    if (typeof document === 'undefined') {
        const est = Math.max(text.length, 1) * REF_MEASURE_FONT_PX * 0.68;
        return rememberBounded(singleLineWidthCache, cacheKey, est, SINGLE_LINE_WIDTH_CACHE_LIMIT);
    }
    if (!segmentMeasureCanvas) {
        segmentMeasureCanvas = document.createElement('canvas');
    }
    const context = segmentMeasureCanvas.getContext('2d');
    if (!context) {
        const est = Math.max(text.length, 1) * REF_MEASURE_FONT_PX * 0.68;
        return rememberBounded(singleLineWidthCache, cacheKey, est, SINGLE_LINE_WIDTH_CACHE_LIMIT);
    }
    context.font = fontSpec;
    const width = Math.max(context.measureText(text).width, 1);
    return rememberBounded(singleLineWidthCache, cacheKey, width, SINGLE_LINE_WIDTH_CACHE_LIMIT);
};

/** O(1) analytical font-size & line-count estimate for fast measure-only layout passes (zero pretext calls). */
export const estimateSingleLineMetrics = (
    text: string,
    fontFamily: string,
    width: number,
    variant: 'body' | 'hero',
    lyricsFontScale: number,
    densityScale: number,
    heroScale: number,
    theme: Pick<Theme, 'fontWeight'>,
): { fontPx: number; lineCount: number } => {
    const scaleFactor = lyricsFontScale * densityScale * (variant === 'hero' ? heroScale : 1);
    const minPx = (variant === 'hero' ? 18 : 10) * scaleFactor;
    const maxPx = (variant === 'hero' ? 58 : 30) * scaleFactor;
    const refWidth = measureLineWidthAtRefPx(text, fontFamily, variant, theme);
    const fitPx = (width * 0.965 * REF_MEASURE_FONT_PX) / Math.max(refWidth, 1);
    if (fitPx >= minPx) {
        return { fontPx: clamp(fitPx, minPx, maxPx), lineCount: 1 };
    }
    const wrappedWidth = refWidth * (minPx / REF_MEASURE_FONT_PX);
    const lineCount = Math.max(1, Math.ceil(wrappedWidth / Math.max(width * 0.94, 1)));
    return { fontPx: minPx, lineCount };
};

export const buildPreparedSingleLine = (
    text: string,
    fontFamily: string,
    width: number,
    variant: 'body' | 'hero',
    lyricsFontScale: number,
    densityScale: number,
    heroScale: number,
    theme: Pick<Theme, 'fontWeight'>,
) => {
    const scaleFactor = lyricsFontScale * densityScale * (variant === 'hero' ? heroScale : 1);
    const minPx = (variant === 'hero' ? 18 : 10) * scaleFactor;
    const maxPx = (variant === 'hero' ? 58 : 30) * scaleFactor;
    const refWidth = measureLineWidthAtRefPx(text, fontFamily, variant, theme);
    let candidateFontPx = clamp((width * 0.965 * REF_MEASURE_FONT_PX) / Math.max(refWidth, 1), minPx, maxPx);
    const lineHeightFactor = variant === 'hero' ? 1.02 : 1.06;

    let fontSpec = buildFontSpec(candidateFontPx, variant, fontFamily, theme);
    let prepared = prepareWithSegments(text, fontSpec, FUME_PRETEXT_OPTIONS);
    let layout = layoutWithLines(prepared, width, Math.round(candidateFontPx * lineHeightFactor));

    // One fast refinement pass if glyph kerning pushed the line just past the column edge.
    if (layout.lineCount > 1 && candidateFontPx > minPx * 1.01) {
        const widest = layout.lines.reduce((acc, item) => Math.max(acc, item.width), 0);
        const shrink = widest > 0 ? Math.min(0.92, (width * 0.95) / Math.max(widest, width)) : 0.88;
        candidateFontPx = Math.max(minPx, candidateFontPx * shrink);
        fontSpec = buildFontSpec(candidateFontPx, variant, fontFamily, theme);
        prepared = prepareWithSegments(text, fontSpec, FUME_PRETEXT_OPTIONS);
        layout = layoutWithLines(prepared, width, Math.round(candidateFontPx * lineHeightFactor));
    }

    return {
        fontPx: candidateFontPx,
        prepared,
        layout,
    };
};

export const resolveRenderLineOffset = (
    renderLine: RenderLineSlice,
    localOffset: number,
) => {
    if (localOffset <= 0) {
        return 0;
    }
    if (localOffset >= renderLine.graphemes.length) {
        return renderLine.width;
    }
    return renderLine.glyphOffsets[localOffset] ?? renderLine.width;
};

export const resolveSegmentGlyphOffset = (
    segment: RenderSegmentSlice,
    globalOffset: number,
) => {
    const localOffset = clamp(globalOffset - segment.start, 0, segment.measuredGlyphOffsets.length - 1);
    return segment.measuredGlyphOffsets[localOffset] ?? 0;
};

export const resolveSegmentGlyphAdvance = (
    segment: RenderSegmentSlice,
    globalOffset: number,
) => {
    const localOffset = clamp(globalOffset - segment.start, 0, segment.measuredGlyphOffsets.length - 2);
    const current = segment.measuredGlyphOffsets[localOffset] ?? 0;
    const next = segment.measuredGlyphOffsets[localOffset + 1] ?? current;
    return Math.max(next - current, 0);
};
