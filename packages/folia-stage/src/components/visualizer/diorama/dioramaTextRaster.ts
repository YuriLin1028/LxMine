import * as THREE from 'three';

// src/components/visualizer/diorama/dioramaTextRaster.ts
// Canvas-rasterised lyric text for the diorama's 3D planes.
//
// WHY canvas and not an SDF text engine: CJK fonts build glyphs from OVERLAPPING stroke contours
// (unified by the fill winding rule). troika's GPU SDF generator mishandles those overlaps, drawing
// visible seams and translucent slabs inside every dense glyph - unfixable by resolution. The
// browser's own canvas text rasteriser is the same engine that renders the DOM subtitles: perfect
// shaping for every script, and it consumes the project's full CSS font STACK (theme font style,
// weight, the user's uploaded custom font, per-glyph fallback) via resolveThemeFontStack - so the 3D
// lyrics inherit the shared subtitle font settings exactly, with no single-font-file limitation.
//
// Each unit (CJK char / latin word) is rasterised TWICE into one shared canvas geometry:
// - base: the plain glyph (white - tinted per-frame by the material colour), and
// - glow: the glyph lit with cadenza (心象)'s drawShadowGlowText recipe (three stacked blurred
//   copies, composited 'lighter'), also white so the theme accent tints it live.
// Both rasters use the same canvas size and draw position, so the glow registers on the strokes
// EXACTLY, by construction - centring/misalignment is impossible (this is what fixes the interlude
// dot ● glow sitting high: the glow IS the blurred dot).

export const DIORAMA_RASTER_FONT_PX = 160;
const DEFAULT_FONT_WEIGHT = 700;
// Vertical band around the middle baseline (covers ascenders/descenders across fonts).
const LINE_BAND_EM = 1.4;
// Padding for the glow spread (must contain the widest shadow blur below plus ink overshoot).
const GLOW_PAD_EM = 0.7;
// Plain line rasters (neighbour lines, no glow) need only a small ink-overshoot pad.
const PLAIN_PAD_EM = 0.2;
// Stay under the guaranteed-safe texture edge for long lines.
const MAX_CANVAS_PX = 4096;
// Inner shadow blur as a fraction of the em; cadenza's 20/40/58px ladder scaled to the raster em.
const GLOW_BLUR_EM = 0.16;

// `fontStack` is the CSS font-family stack from resolveThemeFontStack(theme) - resolved by the
// caller so rasters only rebuild when the actual font selection changes, not on every theme tweak.
export const buildDioramaFontSpec = (fontStack: string, fontWeight = DEFAULT_FONT_WEIGHT): string =>
    `${fontWeight} ${DIORAMA_RASTER_FONT_PX}px ${fontStack}`;

let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = (): CanvasRenderingContext2D => {
    if (!measureCtx) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        measureCtx = canvas.getContext('2d')!;
    }
    return measureCtx;
};

/** Advance width in raster px of `text` under the diorama font spec (kerning included). */
export const measureDioramaText = (text: string, fontSpec: string): number => {
    const ctx = getMeasureCtx();
    ctx.font = fontSpec;
    return ctx.measureText(text).width;
};

const makeTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

// Bakes a PURE HALO of the glyph (cadenza's blur ladder: tight core / mid halo / faint outer air) at
// FULL strength - live intensity/colour come from the additive material's opacity/colour per frame.
//
// Why not cadenza's exact fill alphas: a canvas shadow inherits its source shape's alpha, so
// cadenza's faint fills (0.11 x 0.86 shadow ≈ 0.09 alpha per pass) only work because the DOM canvas
// REDRAWS and accumulates them every frame. Baked once into a texture, that halo peaks near-invisible
// (~0.2 alpha, then multiplied by the runtime opacity). So here the glyph is drawn OFF-canvas with a
// large shadow offset - only its blurred shadow lands on the texture, at full source alpha - giving a
// strong, crisp-fill-free halo that spreads purely outward from the strokes.
const drawGlowGlyph = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, blur: number) => {
    const OFFSCREEN = 10000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    const haloPass = (passBlur: number, alpha: number) => {
        ctx.shadowColor = `rgba(255,255,255,${alpha})`;
        ctx.shadowBlur = passBlur;
        ctx.shadowOffsetX = OFFSCREEN;
        ctx.shadowOffsetY = 0;
        ctx.fillText(text, x - OFFSCREEN, y);
    };
    haloPass(blur, 0.95);
    haloPass(blur, 0.85);
    haloPass(blur * 2, 0.55);
    haloPass(blur * 2.9, 0.3);
    ctx.restore();
};

export interface DioramaUnitRaster {
    baseTexture: THREE.CanvasTexture;
    glowTexture: THREE.CanvasTexture;
    /** Full canvas extent in raster px (the plane's intrinsic size before world scaling). */
    canvasWidthPx: number;
    canvasHeightPx: number;
    /** Typographic advance of the unit in raster px (for layout). */
    advancePx: number;
}

/** Rasterise one lyric unit (base + glow layers share one canvas geometry). */
export const rasterDioramaUnit = (text: string, fontSpec: string): DioramaUnitRaster => {
    const em = DIORAMA_RASTER_FONT_PX;
    const pad = Math.ceil(em * GLOW_PAD_EM);
    const advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    const canvasWidthPx = advancePx + pad * 2;
    const canvasHeightPx = Math.ceil(em * LINE_BAND_EM) + pad * 2;
    const drawX = pad;
    const drawY = canvasHeightPx / 2;

    const draw = (paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidthPx;
        canvas.height = canvasHeightPx;
        const ctx = canvas.getContext('2d')!;
        ctx.font = fontSpec;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        paint(ctx);
        return makeTexture(canvas);
    };

    const baseTexture = draw((ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, drawX, drawY);
    });
    const glowTexture = draw((ctx) => {
        drawGlowGlyph(ctx, text, drawX, drawY, em * GLOW_BLUR_EM);
    });

    return { baseTexture, glowTexture, canvasWidthPx, canvasHeightPx, advancePx };
};

export interface DioramaLineRaster {
    texture: THREE.CanvasTexture;
    canvasWidthPx: number;
    canvasHeightPx: number;
    advancePx: number;
    /** px of one em in THIS raster (long lines shrink to fit the max canvas edge). */
    fontPx: number;
}

/** Rasterise a whole (neighbour) line as one plain white texture - no glow, small pad. */
export const rasterDioramaLine = (
    text: string,
    fontStack: string,
    fontWeight = DEFAULT_FONT_WEIGHT,
    translation?: string | null,
): DioramaLineRaster => {
    let fontPx = DIORAMA_RASTER_FONT_PX;
    let fontSpec = buildDioramaFontSpec(fontStack, fontWeight);
    let advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    const pad = Math.ceil(fontPx * PLAIN_PAD_EM);
    if (advancePx + pad * 2 > MAX_CANVAS_PX) {
        const shrink = (MAX_CANVAS_PX - pad * 2) / advancePx;
        fontPx = Math.max(24, Math.floor(fontPx * shrink));
        fontSpec = `${fontWeight} ${fontPx}px ${fontStack}`;
        advancePx = Math.max(1, Math.ceil(measureDioramaText(text, fontSpec)));
    }

    const cleanSub = typeof translation === 'string' ? translation.trim() : '';
    const subFontPx = Math.max(20, Math.round(fontPx * 0.50));
    const subFontSpec = `${fontWeight} ${subFontPx}px ${fontStack}`;
    const subLineH = Math.ceil(subFontPx * 1.32);
    const subRows: string[] = [];
    let maxSubW = 0;
    if (cleanSub) {
        const ctxM = getMeasureCtx();
        ctxM.font = subFontSpec;
        const maxSubBudget = Math.max(advancePx * 1.12, Math.min(MAX_CANVAS_PX - pad * 2, fontPx * 10));
        for (const rawPara of cleanSub.split(/\r?\n/)) {
            const para = rawPara.trim();
            if (!para) continue;
            if (ctxM.measureText(para).width <= maxSubBudget) {
                subRows.push(para);
            } else {
                const tokens = para.split(/(\s+)/).filter(Boolean);
                let cur = '';
                for (const tok of tokens) {
                    const cand = cur ? cur + tok : tok;
                    if (ctxM.measureText(cand).width <= maxSubBudget) {
                        cur = cand;
                    } else if (!cur) {
                        let acc = '';
                        for (const ch of Array.from(tok)) {
                            if (acc && ctxM.measureText(acc + ch).width > maxSubBudget) {
                                subRows.push(acc.trim());
                                acc = ch;
                            } else {
                                acc += ch;
                            }
                        }
                        cur = acc;
                    } else {
                        subRows.push(cur.trim());
                        cur = tok.trimStart();
                    }
                }
                if (cur.trim()) subRows.push(cur.trim());
            }
        }
        for (const r of subRows) maxSubW = Math.max(maxSubW, Math.ceil(ctxM.measureText(r).width));
    }

    const mainBandH = Math.ceil(fontPx * LINE_BAND_EM) + pad * 2;
    const subGap = Math.ceil(fontPx * 0.34);
    const extraBelow = subRows.length > 0 ? subGap + subRows.length * subLineH + pad : 0;
    const canvasWidthPx = Math.min(MAX_CANVAS_PX, Math.max(advancePx, maxSubW) + pad * 2);
    // Symmetric vertical padding keeps the main lyric strictly at y=0 in 3D world space.
    const canvasHeightPx = mainBandH + extraBelow * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidthPx;
    canvas.height = canvasHeightPx;
    const ctx = canvas.getContext('2d')!;
    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvasWidthPx / 2, canvasHeightPx / 2);

    if (subRows.length > 0) {
        ctx.save();
        ctx.font = subFontSpec;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 1;
        const subStartY = canvasHeightPx / 2 + fontPx * 0.68;
        for (let i = 0; i < subRows.length; i += 1) {
            ctx.fillText(subRows[i], canvasWidthPx / 2, subStartY + i * subLineH);
        }
        ctx.restore();
    }

    return { texture: makeTexture(canvas), canvasWidthPx, canvasHeightPx, advancePx, fontPx };
};

/**
 * Rasterise an active line's translation / romaji (supports `\n` multi-line stacking) as a crisp
 * white canvas texture to mount directly beneath the 3D lyric in Diorama space.
 */
export const rasterDioramaTranslation = (
    text: string,
    fontStack: string,
    maxRowWidthPx = 1400,
): DioramaLineRaster | null => {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const fontPx = 92;
    const fontWeight = 500;
    const fontSpec = `${fontWeight} ${fontPx}px ${fontStack}`;
    const maxWidth = Math.max(640, Math.min(MAX_CANVAS_PX - 120, Math.round(maxRowWidthPx)));
    const ctxMeasure = getMeasureCtx();
    ctxMeasure.font = fontSpec;

    const wrappedRows: string[] = [];
    for (const rawParagraph of clean.split(/\r?\n/)) {
        const para = rawParagraph.trim();
        if (!para) continue;
        if (ctxMeasure.measureText(para).width <= maxWidth) {
            wrappedRows.push(para);
            continue;
        }
        // Wrap cleanly by word or character so long translations never widen past the lyric bounds.
        const tokens = para.split(/(\s+)/).filter(Boolean);
        let current = '';
        for (const token of tokens) {
            const candidate = current ? current + token : token;
            if (ctxMeasure.measureText(candidate).width <= maxWidth) {
                current = candidate;
            } else if (!current) {
                let acc = '';
                for (const ch of Array.from(token)) {
                    if (acc && ctxMeasure.measureText(acc + ch).width > maxWidth) {
                        wrappedRows.push(acc.trim());
                        acc = ch;
                    } else {
                        acc += ch;
                    }
                }
                current = acc;
            } else {
                wrappedRows.push(current.trim());
                current = token.trimStart();
            }
        }
        if (current.trim()) wrappedRows.push(current.trim());
    }
    const rows = wrappedRows.slice(0, 4);
    if (rows.length === 0) return null;

    const pad = Math.ceil(fontPx * 0.25);
    const lineHeightPx = Math.ceil(fontPx * 1.34);
    let advancePx = 1;
    for (const row of rows) {
        advancePx = Math.max(advancePx, Math.ceil(ctxMeasure.measureText(row).width));
    }
    const canvasWidthPx = Math.min(MAX_CANVAS_PX, advancePx + pad * 2);
    const canvasHeightPx = rows.length * lineHeightPx + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidthPx;
    canvas.height = canvasHeightPx;
    const ctx = canvas.getContext('2d')!;
    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    rows.forEach((row, idx) => {
        ctx.fillText(row, canvasWidthPx / 2, pad + lineHeightPx * (idx + 0.5), canvasWidthPx - pad * 2);
    });

    return { texture: makeTexture(canvas), canvasWidthPx, canvasHeightPx, advancePx, fontPx };
};
