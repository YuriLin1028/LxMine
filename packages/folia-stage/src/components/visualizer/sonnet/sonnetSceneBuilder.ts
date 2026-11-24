import type { SonnetTuning, Theme } from '../../../types';
import { buildWordGraphemeTimings } from '../../../utils/lyrics/graphemeTiming';
import { normalizeFontWeight, resolveThemeFontStack } from '../../../utils/fontStacks';
import { buildCompanionLines } from '../companionTranslation';
import type { SonnetParagraph, SonnetSemanticSegment, SonnetShot } from './types';
import { hashSonnetSeed } from './sonnetRandom';
import { buildSonnetShotMg } from './sonnetShotMg';
import {
    applySonnetScenePostProcess,
    createSonnetHaloLayer,
    resolveSonnetPostProcessProfile,
} from './sonnetPostProcess';
import {
    isSonnetLayoutSegment,
    resolveSonnetTypographyLayout,
} from './sonnetTypographyLayout';
import {
    buildSonnetTextView,
    measureText as measureSonnetText,
    type SegmentView,
} from './sonnetTextViewBuilder';
import { createSonnetGlitchEffect, type SonnetGlitchEffect } from './sonnetGlitchFilter';
import {
    buildSonnetMeasuredBoundsDebug,
    createSonnetShotDebugInfo,
    type SonnetDebugShotInfo,
} from './sonnetDebug';
import { resolveSonnetGeoVariant } from './sonnetSpatialMgGeometry';
import { resolveSonnetBackgroundMgVariant } from './sonnetBackgroundMgVariants';
import { resolveSonnetBackgroundDecorVariant } from './sonnetBackgroundDecor';
import { resolveSonnetFixedGeoVariant } from './sonnetFixedGeoVariants';

// src/components/visualizer/sonnet/sonnetSceneBuilder.ts
// Builds one bounded paragraph scene; playback-time mutation remains in the runtime controller.
type PixiModule = typeof import('pixi.js');

export interface SonnetTranslationView {
    display: import('pixi.js').Text;
    baseX: number;
    baseY: number;
    startTime: number;
    endTime: number;
    activeUntil: number;
    sharedAnchor: boolean;
}

export interface ShotView {
    shot: SonnetShot;
    container: import('pixi.js').Container;
    segments: SegmentView[];
    translations: SonnetTranslationView[];
    debugInfo: SonnetDebugShotInfo;
    baseX: number;
    baseY: number;
    basePivotX: number;
    basePivotY: number;
    textLayer: import('pixi.js').Container;
    haloLayer: import('pixi.js').Container;
    mgLayer: import('pixi.js').Container;
    mgBackgroundLayer?: import('pixi.js').Container;
    mgGeoLayer?: import('pixi.js').Container;
    mgParticleLayer?: import('pixi.js').Container;
    mgFixedGeoLayer?: import('pixi.js').Container;
}

export interface SceneView {
    paragraph: SonnetParagraph;
    container: import('pixi.js').Container;
    shots: ShotView[];
    shotTimeline: SonnetShot[];
    postProcessFilters: import('pixi.js').Filter[];
    transitionBlurFilter: import('pixi.js').BlurFilter | null;
    transitionGlitchEffect: SonnetGlitchEffect | null;
    activeShotIndex: number;
}

export interface SonnetSceneBuildOptions {
    programSeed: string;
    host: HTMLDivElement;
    theme: Theme;
    tuning: SonnetTuning;
    lyricsFontScale: number;
    staticMode: boolean;
    transparentBackground: boolean;
}

const colorNumber = (pixi: PixiModule, color: string) => pixi.Color.shared.setValue(color).toNumber();

export const shouldDrawSonnetSceneBackdrop = (showBackgroundMg: boolean, transparentBackground: boolean) => (
    showBackgroundMg && !transparentBackground
);

export const buildSonnetScene = (
    pixi: PixiModule,
    options: SonnetSceneBuildOptions,
    iconTextures: Map<string, import('pixi.js').Texture>,
    paragraph: SonnetParagraph,
): SceneView => {
    const { Container, Graphics, Sprite } = pixi;
    const width = Math.max(options.host.clientWidth, 320);
    const height = Math.max(options.host.clientHeight, 240);
    const container = new Container();
    const sceneBackgroundLayer = new Container();
    // Resolve visibility once while building; playback only mutates animation state afterward.
    const showOnlyText = options.tuning.showOnlyText;
    const showBackgroundMg = !showOnlyText && options.tuning.showBackgroundMg;
    const showFixedGeo = !showOnlyText && options.tuning.showFixedGeo;
    const showBackgroundDecor = !showOnlyText && options.tuning.showBackgroundDecor;
    const showGuide = !showOnlyText && options.tuning.showGuide;
    const showOuterMetadata = !showOnlyText && options.tuning.outerFrameMode === 'full';
    const sceneSeed = hashSonnetSeed(`${options.programSeed}:${paragraph.id}`);
    const postProcessProfile = resolveSonnetPostProcessProfile(
        options.theme,
        options.tuning,
        options.staticMode,
    );
    const fontFamily = resolveThemeFontStack(options.theme);
    const manualFontWeight = normalizeFontWeight(options.theme.fontWeight);
    const postProcessFilters: import('pixi.js').Filter[] = [];
    if (showBackgroundMg) {
        const density = Math.round(4 + options.tuning.mgDensity * 5);
        if (shouldDrawSonnetSceneBackdrop(showBackgroundMg, options.transparentBackground)) {
            sceneBackgroundLayer.addChild(new Graphics()
                .rect(0, 0, width, height)
                .fill({ color: colorNumber(pixi, options.theme.backgroundColor), alpha: 0.10 }));
        }

        for (let index = 0; index < density; index += 1) {
            const x = ((sceneSeed + index * 97) % 997) / 997 * width;
            const y = ((sceneSeed + index * 193) % 991) / 991 * height;
            const length = 32 + ((sceneSeed + index * 43) % 180);
            sceneBackgroundLayer.addChild(new Graphics()
                .moveTo(x, y)
                .lineTo(Math.min(width, x + length), y)
                .stroke({
                    color: colorNumber(pixi, index % 2 ? options.theme.secondaryColor : options.theme.accentColor),
                    width: index % 3 === 0 ? 2 : 1,
                    alpha: 0.12 + (index % 4) * 0.04,
                }));
        }
    }

    const { Text, TextStyle } = pixi;
    // Decorative theme metadata text
    if (options.theme.name) {
        const nameText = new Text({
            text: `[ THEME ] ${options.theme.name.toUpperCase()}`,
            style: new TextStyle({
                fontFamily,
                fontWeight: manualFontWeight === null
                    ? 'bold'
                    : String(manualFontWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize: 14,
                fill: options.theme.primaryColor,
                letterSpacing: 4
            })
        });
        nameText.alpha = 0.2;
        nameText.rotation = -Math.PI / 2;
        nameText.position.set(20, height - 20);
        nameText.anchor.set(0, 1);
        if (showOuterMetadata) sceneBackgroundLayer.addChild(nameText);
    }
    
    if (options.theme.description) {
        const descText = new Text({
            text: options.theme.description,
            style: new TextStyle({
                fontFamily,
                fontWeight: manualFontWeight === null
                    ? undefined
                    : String(manualFontWeight) as import('pixi.js').TextStyleFontWeight,
                fontSize: 12,
                fill: options.theme.secondaryColor,
                wordWrap: true,
                wordWrapWidth: width * 0.3
            })
        });
        descText.alpha = 0.3;
        descText.position.set(width - 20, 20);
        descText.anchor.set(1, 0);
        if (showOuterMetadata) sceneBackgroundLayer.addChild(descText);
    }
    container.addChild(sceneBackgroundLayer);
    const shots = paragraph.shots.map((shot, shotIndex) => {
        const shotContainer = new Container();
        const compiledLines = shot.lineIndices
            .map(lineIndex => paragraph.lines.find(item => item.sourceIndex === lineIndex))
            .filter(Boolean) as SonnetParagraph['lines'];
        const lineSegmentEntries: Array<{
            compiled: SonnetParagraph['lines'][number];
            segments: SonnetParagraph['lines'][number]['segments'];
            segStart: number;
            segEnd: number;
        }> = [];
        let segCursor = 0;
        for (const compiled of compiledLines) {
            const filtered = compiled.segments.filter(isSonnetLayoutSegment);
            if (filtered.length === 0) continue;
            lineSegmentEntries.push({
                compiled,
                segments: filtered,
                segStart: segCursor,
                segEnd: segCursor + filtered.length,
            });
            segCursor += filtered.length;
        }
        const linesSegments = lineSegmentEntries.map(entry => entry.segments);
        const segments = linesSegments.flat();
        const wordCount = Math.max(1, segments.filter(segment => segment.isWordLike).length);
        const heroScale = shot.kind === 'type-impact' ? 1.62 : shot.kind === 'quiet-tableau' ? 0.96 : 1.12;
        const effectiveTypeWidth = width < 680 ? width : (420 + width * 0.56);
        const fontSize = Math.max(36, Math.min(132, (
            effectiveTypeWidth / Math.max(6.0, wordCount * 1.65)
        ) * heroScale * options.lyricsFontScale));
        const views: SegmentView[] = [];
        const placements = resolveSonnetTypographyLayout({
            lines: linesSegments,
            shotKind: shot.kind,
            paragraphKind: paragraph.kind,
            width,
            height,
            baseFontSize: fontSize,
            fontFamily,
            fontWeight: manualFontWeight,
        });
        const shotSeed = sceneSeed + shotIndex * 97;
        const mgLayer = buildSonnetShotMg(
            pixi,
            shot.kind,
            options.theme,
            width,
            height,
            shotSeed,
            iconTextures
        );
        shotContainer.addChild(mgLayer);
        const mgBackgroundLayer = (mgLayer as any).bgLayer as import('pixi.js').Container | undefined;
        const mgGeoLayer = (mgLayer as any).geoLayer as import('pixi.js').Container | undefined;
        const mgParticleLayer = (mgLayer as any).particleLayer as import('pixi.js').Container | undefined;
        const mgFixedGeoLayer = (mgLayer as any).fixedGeoLayer as import('pixi.js').Container | undefined;
        mgLayer.visible = showBackgroundMg || showFixedGeo || showBackgroundDecor;
        if (mgBackgroundLayer) mgBackgroundLayer.visible = showBackgroundMg;
        if (mgGeoLayer) mgGeoLayer.visible = showBackgroundMg;
        if (mgParticleLayer) mgParticleLayer.visible = showBackgroundDecor;
        if (mgFixedGeoLayer) mgFixedGeoLayer.visible = showFixedGeo;
        const { layer: haloLayer, filters: haloFilters } = createSonnetHaloLayer(
            pixi,
            postProcessProfile,
        );
        const guideLayer = new Container();
        const textLayer = new Container();
        // Every glyph's screen-blended aberration copies share this one layer instead of sitting in
        // the glyph wrapper. Interleaved screen/normal children break Pixi's batch on each switch,
        // turning a shot into ~2 draws per glyph; an Intel iGPU has hung on exactly that stream and
        // the failed engine reset took the compositor down with it. Added first, so the bg shapes
        // and frame decor later inserted at index 0 still sit below the aberration.
        const caLayer = new Container();
        textLayer.addChild(caLayer);
        guideLayer.visible = showGuide;
        haloLayer.visible = !showOnlyText;
        shotContainer.addChild(guideLayer, haloLayer, textLayer);
        postProcessFilters.push(...haloFilters);
        // Virtual instrumental lines can share one shot; the complete staff belongs to the shot, not each line.
        let staffViewAdded = false;
        placements.forEach((placement, placementIndex) => {
            const segment = segments[placement.segmentIndex];
            if (segment.text === '♪') {
                if (staffViewAdded) return;
                staffViewAdded = true;
            }
            views.push(buildSonnetTextView(
                pixi,
                {
                    segment,
                    placement,
                    segmentIndex: placement.segmentIndex,
                    baseFontSize: fontSize,
                    shotStartTime: shot.startTime,
                    shotEndTime: shot.endTime,
                    paragraphKind: paragraph.kind,
                    width,
                    fontFamily,
                    fontWeight: manualFontWeight,
                    theme: options.theme,
                    glowEnabled: postProcessProfile.glowStrength > 0,
                    showFixedGeo,
                    guideLayer,
                    haloLayer,
                    textLayer,
                    caLayer,
                },
            ));
        });
        const bounds = shotContainer.getLocalBounds();

        // Attach kinetic Sonnet SegmentViews for translation/romaji directly beneath each main
        // segment placement (along its local normal & rotation) so even in tight close-ups like
        // `tracking-ribbon`, `type-impact`, or `fragment-collage`, every main word group carries
        // its own time-matched companion translation with 100% identical color, weight, slide,
        // halo glow, chromatic aberration, and 3D depth parallax.
        const translations: SonnetTranslationView[] = [];
        const subWeight = manualFontWeight ?? 600;
        let subSegmentCursor = segments.length + 100;

        lineSegmentEntries.forEach(entry => {
            const trRaw = entry.compiled.line.translation?.trim();
            if (!trRaw || entry.compiled.line.fullText === '♪') return;
            const companionLines = buildCompanionLines(entry.compiled.line, true);
            if (companionLines.length === 0) return;

            const linePlacements = placements
                .filter(p => p.segmentIndex >= entry.segStart && p.segmentIndex < entry.segEnd)
                .sort((a, b) => a.segmentIndex - b.segmentIndex);
            if (linePlacements.length === 0) return;

            // Group nearby main placements that share roughly the same baseline & rotation into visual clusters
            // so editorial columns keep clean wrapped sub-lines while ribbons/collages attach per-word/cluster!
            const clusters: Array<{
                anchor: typeof linePlacements[number];
                minX: number;
                maxX: number;
                maxBottomDist: number;
                startTime: number;
                endTime: number;
                weight: number;
            }> = [];

            for (const p of linePlacements) {
                const seg = segments[p.segmentIndex];
                if (!seg) continue;
                const segWeight = Math.max(1, Array.from(seg.text.trim()).length);
                const prev = clusters[clusters.length - 1];
                const canMerge = prev
                    && shot.kind !== 'tracking-ribbon'
                    && shot.kind !== 'type-impact'
                    && shot.kind !== 'fragment-collage'
                    && !p.vertical
                    && !prev.anchor.vertical
                    && Math.abs(p.rotation - prev.anchor.rotation) < 0.08
                    && Math.abs(p.y - prev.anchor.y) < fontSize * 0.42
                    && Math.abs((p.x - p.measuredWidth * 0.5) - prev.maxX) < fontSize * 1.6;

                if (canMerge && prev) {
                    prev.minX = Math.min(prev.minX, p.x - p.measuredWidth * 0.5);
                    prev.maxX = Math.max(prev.maxX, p.x + p.measuredWidth * 0.5);
                    prev.maxBottomDist = Math.max(prev.maxBottomDist, p.measuredHeight * 0.5);
                    prev.startTime = Math.min(prev.startTime, seg.startTime);
                    prev.endTime = Math.max(prev.endTime, seg.endTime);
                    prev.weight += segWeight;
                } else {
                    clusters.push({
                        anchor: p,
                        minX: p.x - p.measuredWidth * 0.5,
                        maxX: p.x + p.measuredWidth * 0.5,
                        maxBottomDist: Math.max(fontSize * p.fontScale * 0.48, p.measuredHeight * 0.48),
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        weight: segWeight,
                    });
                }
            }

            if (clusters.length === 0) return;
            const totalClusterWeight = clusters.reduce((s, c) => s + c.weight, 0) || 1;

            // Partition each companion sub-line's words across the clusters proportionally
            const clusterSubRows: Array<Array<typeof companionLines[number]['words']>> = clusters.map(() => []);
            for (const subLine of companionLines) {
                const words = subLine.words.filter(w => w.text.trim().length > 0);
                if (words.length === 0) continue;
                let wordCursor = 0;
                let accWeight = 0;
                clusters.forEach((cluster, cIdx) => {
                    accWeight += cluster.weight;
                    const targetEnd = cIdx === clusters.length - 1
                        ? words.length
                        : Math.max(wordCursor, Math.round((accWeight / totalClusterWeight) * words.length));
                    const slice = words.slice(wordCursor, targetEnd);
                    wordCursor = targetEnd;
                    if (slice.length > 0) {
                        const span = Math.max(0.08, cluster.endTime - cluster.startTime);
                        const retimed = slice.map((w, sIdx) => ({
                            ...w,
                            startTime: cluster.startTime + (sIdx / slice.length) * span,
                            endTime: cluster.startTime + ((sIdx + 1) / slice.length) * span,
                        }));
                        clusterSubRows[cIdx].push(retimed);
                    }
                });
            }

            clusters.forEach((cluster, cIdx) => {
                const subRowsForCluster = clusterSubRows[cIdx];
                if (!subRowsForCluster || subRowsForCluster.length === 0) return;

                const anchorScale = Math.max(0.65, Math.min(1.35, cluster.anchor.fontScale));
                const subFontSize = Math.max(13, Math.min(44, Math.round(fontSize * anchorScale * 0.42)));
                const effectiveSubScale = subFontSize / fontSize;
                const subFontSpec = `${subWeight} ${subFontSize}px ${fontFamily}`;
                const subLineHeight = Math.round(subFontSize * 1.36);
                const clusterSpanW = Math.max(subFontSize * 5.5, (cluster.maxX - cluster.minX) * 1.22);
                const maxRowW = Math.min(width * 0.66, Math.max(clusterSpanW, subFontSize * 7));

                const wrappedRows: Array<{
                    items: Array<{ seg: SonnetSemanticSegment; w: number; gapAfter: number }>;
                    totalW: number;
                }> = [];

                for (const wordList of subRowsForCluster) {
                    let curRow: Array<{ seg: SonnetSemanticSegment; w: number; gapAfter: number }> = [];
                    let curW = 0;
                    let charOff = 0;
                    wordList.forEach((word, wIdx) => {
                        const cleanText = word.text.trim();
                        const hasSpace = /\s$/.test(word.text);
                        const startOff = charOff;
                        charOff += word.text.length;
                        if (!cleanText) return;
                        const measuredW = Math.max(subFontSize * 0.35, measureSonnetText(cleanText, subFontSpec, subFontSize));
                        const gapAfter = hasSpace ? subFontSize * 0.28 : subFontSize * 0.02;
                        const seg: SonnetSemanticSegment = {
                            text: cleanText,
                            startOffset: startOff,
                            endOffset: startOff + cleanText.length,
                            startTime: word.startTime,
                            endTime: Math.max(word.startTime + 0.03, word.endTime),
                            wordIndices: [wIdx],
                            graphemes: buildWordGraphemeTimings({ ...word, text: cleanText }),
                            isWordLike: true,
                        };
                        if (curRow.length > 0 && curW + measuredW > maxRowW) {
                            wrappedRows.push({ items: curRow, totalW: curW });
                            curRow = [{ seg, w: measuredW, gapAfter }];
                            curW = measuredW + gapAfter;
                        } else {
                            curRow.push({ seg, w: measuredW, gapAfter });
                            curW += measuredW + gapAfter;
                        }
                    });
                    if (curRow.length > 0) {
                        const trimmedW = curW - (curRow[curRow.length - 1]?.gapAfter ?? 0);
                        wrappedRows.push({ items: curRow, totalW: Math.max(1, trimmedW) });
                    }
                }

                const rot = cluster.anchor.vertical ? 0 : cluster.anchor.rotation;
                const cosR = Math.cos(rot);
                const sinR = Math.sin(rot);
                const centerBaseX = (cluster.minX + cluster.maxX) * 0.5;
                const centerBaseY = cluster.anchor.y;
                const baseNormalDist = cluster.maxBottomDist + Math.max(12, subFontSize * 0.98);

                wrappedRows.forEach((row, rIdx) => {
                    const normalDist = baseNormalDist + rIdx * subLineHeight;
                    let tangentX = -row.totalW * 0.5;
                    row.items.forEach(item => {
                        subSegmentCursor += 1;
                        const localTanX = tangentX + item.w * 0.5;
                        tangentX += item.w + item.gapAfter;
                        const worldX = centerBaseX + localTanX * cosR - normalDist * sinR;
                        const worldY = centerBaseY + localTanX * sinR + normalDist * cosR;
                        const seedHash = hashSonnetSeed(`${shotSeed}:sub:${subSegmentCursor}:${item.seg.text}`);
                        const enterAngle = ((seedHash % 360) / 180) * Math.PI;
                        const subPlacement = {
                            segmentIndex: subSegmentCursor,
                            displayText: item.seg.text,
                            role: 'body' as const,
                            fontScale: effectiveSubScale,
                            measuredWidth: item.w,
                            measuredHeight: subFontSize,
                            x: worldX,
                            y: worldY,
                            rotation: rot,
                            enterX: Math.cos(enterAngle) * subFontSize * 0.45,
                            enterY: Math.sin(enterAngle) * subFontSize * 0.45 + subFontSize * 0.30,
                            vertical: false,
                            layoutDirection: 'horizontal' as const,
                            timingPhase: 0,
                        };
                        const segView = buildSonnetTextView(
                            pixi,
                            {
                                segment: item.seg,
                                placement: subPlacement,
                                segmentIndex: subSegmentCursor,
                                baseFontSize: fontSize,
                                shotStartTime: shot.startTime,
                                shotEndTime: shot.endTime,
                                paragraphKind: paragraph.kind,
                                width,
                                fontFamily,
                                fontWeight: manualFontWeight,
                                theme: options.theme,
                                glowEnabled: postProcessProfile.glowStrength > 0,
                                showFixedGeo: false,
                                guideLayer,
                                haloLayer,
                                textLayer,
                                caLayer,
                            },
                        );
                        segView.trackingGlyphs = [];
                        views.push(segView);
                    });
                });
            });
        });

        // `mask-reveal` is revealed by the glyph timeline. A bounds-sized mask would stay
        // static while camera tracking and parallax move the shot, clipping open MG artwork.
        // Debug overlay stays above the text and never feeds the bounds/focus math.
        shotContainer.addChild(buildSonnetMeasuredBoundsDebug(pixi, placements));
        const usesGeoMg = shot.kind === 'type-impact' || shot.kind === 'fragment-collage';
        const debugInfo = createSonnetShotDebugInfo({
            programSeed: options.programSeed,
            paragraphId: paragraph.id,
            paragraphKind: paragraph.kind,
            shot,
            shotIndex,
            shotCount: paragraph.shots.length,
            baseFontSize: fontSize,
            wordCount,
            geoVariant: usesGeoMg ? resolveSonnetGeoVariant(shotSeed) : null,
            backgroundMgVariant: resolveSonnetBackgroundMgVariant(shotSeed),
            fixedGeoVariant: usesGeoMg ? resolveSonnetFixedGeoVariant(shotSeed) : null,
            backgroundDecorVariant: resolveSonnetBackgroundDecorVariant(shotSeed),
            placements,
            segmentTexts: segments.map(segment => segment.text),
        });
        
        // Poster blocks start centered before runtime tracking; other templates start on the hero word.
        const heroPlacement = placements.find(p => p.role === 'hero');
        const focusX = shot.kind === 'poster-blocks'
            ? 0
            : heroPlacement ? heroPlacement.x : (bounds.x + bounds.width / 2);
        const focusY = shot.kind === 'poster-blocks'
            ? 0
            : heroPlacement ? heroPlacement.y : (bounds.y + bounds.height / 2);
        
        shotContainer.pivot.set(focusX, focusY);
        shotContainer.position.set(
            width * (shot.kind === 'poster-blocks' ? 0.5 : 0.5 + shot.camera.x),
            height * (shot.kind === 'poster-blocks'
                ? 0.5
                : 0.48 + shot.camera.y + (shotIndex % 2 ? 0.025 : -0.025)),
        );
        container.addChild(shotContainer);
        return {
            shot,
            container: shotContainer,
            segments: views,
            translations,
            debugInfo,
            baseX: shotContainer.x,
            baseY: shotContainer.y,
            basePivotX: focusX,
            basePivotY: focusY,
            textLayer,
            haloLayer,
            mgLayer,
            mgBackgroundLayer,
            mgGeoLayer,
            mgParticleLayer,
            mgFixedGeoLayer,
        };
    });


    if (!showOnlyText) {
        const sceneFilters = applySonnetScenePostProcess(
            pixi,
            container,
            postProcessProfile,
            sceneSeed,
        );
        if (sceneFilters.length > 0) {
            // Keep full-scene shaders in viewport space even when visible lyric/decor bounds are smaller.
            container.filterArea = new pixi.Rectangle(0, 0, width, height);
            postProcessFilters.push(...sceneFilters);
        }
    }
    const transitionBlurFilter = options.tuning.enableTransitions && !options.staticMode
        ? new pixi.BlurFilter({ strength: 0, quality: 1, kernelSize: 5, resolution: 0.5 })
        : null;
    if (transitionBlurFilter) {
        // BlurFilter's padding is strength * 2, and Pixi pads the chain's shared render frame
        // (already clipped to the viewport) by the sum of all enabled filters' padding. A growing
        // frame rescales the vignette pass's screen coordinates, so ramping the blur brightened the
        // vignette mid-transition. repeatEdgePixels pins padding at 0; the extra margin was
        // off-screen anyway.
        transitionBlurFilter.repeatEdgePixels = true;
        transitionBlurFilter.enabled = false;
        container.filters = [...(container.filters ?? []), transitionBlurFilter];
        postProcessFilters.push(transitionBlurFilter);
    }
    const transitionGlitchEffect = options.tuning.enableTransitions && !options.staticMode
        ? createSonnetGlitchEffect(pixi)
        : null;
    if (transitionGlitchEffect) {
        container.filters = [...(container.filters ?? []), transitionGlitchEffect.filter];
        postProcessFilters.push(transitionGlitchEffect.filter);
    }
    if (transitionBlurFilter || transitionGlitchEffect) {
        // Without a filterArea the transition filters run over the scene's content bounds, and those
        // follow what has drawn in so far: AnimatedGraphics skips commands that have not started yet,
        // so the glitch's slice offsets would depend on stagger progress. Pin the frame to the
        // viewport, as the post-process above does.
        container.filterArea = new pixi.Rectangle(0, 0, width, height);
    }
    container.visible = false;
    return {
        paragraph,
        container,
        shots,
        shotTimeline: shots.map(shot => shot.shot),
        postProcessFilters,
        transitionBlurFilter,
        transitionGlitchEffect,
        activeShotIndex: -1,
    };
};
