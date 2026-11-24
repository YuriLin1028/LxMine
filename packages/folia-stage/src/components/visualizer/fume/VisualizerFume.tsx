import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_FUME_TUNING, FumeTuning } from '../../../types';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';

import { type VisualizerSharedProps } from '../definition';
import { buildFumeBackgroundScene } from '../FumeBackground';
import { getRecentCompletedLine, getUpcomingLines } from '../runtime';
import VisualizerShell from '../VisualizerShell';
import type { FumeArticleLayout, ViewportSize } from './fumeTypes';
import { createFumeCameraState, type FumeCameraState } from './fumeCameraStep';

import { clamp } from './fumeMath';

import { resolveFumePassedFadeDuration } from './fumeTextStyle';

import { buildArticleLayout, buildLayoutCacheKey } from './fumeArticleLayout';
import { resolveArticleOverviewCamera } from './fumeCamera';
import type { FumeStageDriver, FumeStageScene } from './fumeStage';
import { useFumeCanvasStage } from './useFumeCanvasStage';

// This mode is basically "turn the whole lyric into an article, then move a camera through it".
// So the pipeline is much bigger than the others: prebuild the article layout, split it into blocks/render lines/graphemes,
// resolve which block the camera should care about right now, then draw background + paper + typed text + passed text together every frame.
// If this mode breaks, it is usually not one tiny animation bug, it is some step in that whole pipeline drifting out of sync.
//
// For a single lyric line, the state handling is:
// waiting -> line already exists in the article, but the camera may not be on it yet and glyphs can stay unprinted.
// active -> line becomes the main reading target, camera focuses in, and glyphs print with stronger glow/presence.
// passed -> line becomes already-read text, keep some paper trace and fade it out with textHoldRatio instead of removing it instantly.
type VisualizerProps = VisualizerSharedProps;

let lastFumeLayoutCache: {
    key: string;
    article: FumeArticleLayout | null;
} | null = null;

const VisualizerFume: React.FC<VisualizerProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        subtitleTheme,
        audioPower,
        audioBands,
        showText = true,
        seed,
        staticMode = false,
        lyricsFontScale = 1,
        subtitleFontScale = 1,
        fumeTuning,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        paused = false,
    } = props;
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const currentLineIndexRef = useRef(currentLineIndex);
    const cameraStateRef = useRef<FumeCameraState>(createFumeCameraState());
    const [viewport, setViewport] = useState<ViewportSize>(() => (
        typeof window === 'undefined'
            ? { width: 1200, height: 800 }
            : { width: Math.max(window.innerWidth, 1), height: Math.max(window.innerHeight, 1) }
    ));
    const [hasPrintedContent, setHasPrintedContent] = useState(false);
    const hasPrintedContentRef = useRef(false);

    useEffect(() => {
        currentLineIndexRef.current = currentLineIndex;
    }, [currentLineIndex]);

    useEffect(() => {
        const element = viewportRef.current;
        if (!element) {
            return;
        }

        const commitSize = (nextWidth: number, nextHeight: number) => {
            if (nextWidth <= 0 || nextHeight <= 0) return;
            setViewport(previous => (
                previous.width === nextWidth && previous.height === nextHeight
                    ? previous
                    : { width: nextWidth, height: nextHeight }
            ));
        };

        commitSize(element.clientWidth, element.clientHeight);
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) return;
            commitSize(entry.contentRect.width, entry.contentRect.height);
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const runtime = useMemo(() => {
        const activeLine = lines[currentLineIndex] ?? null;
        const timeNow = currentTime.get();
        return {
            activeLine,
            recentCompletedLine: getRecentCompletedLine({
                lines,
                currentLineIndex,
                currentTime: timeNow,
                getLineEndTime: getLineRenderEndTime,
            }),
            nextLines: getUpcomingLines(lines, currentLineIndex, 2),
        };
    }, [currentLineIndex, lines]);
    const resolvedFumeTuning = useMemo<FumeTuning>(() => ({
        hidePrintSymbols: fumeTuning?.hidePrintSymbols ?? DEFAULT_FUME_TUNING.hidePrintSymbols,
        disableGeometricBackground: fumeTuning?.disableGeometricBackground ?? DEFAULT_FUME_TUNING.disableGeometricBackground,
        backgroundObjectOpacity: clamp(
            fumeTuning?.backgroundObjectOpacity ?? DEFAULT_FUME_TUNING.backgroundObjectOpacity,
            0,
            1,
        ),
        textHoldRatio: clamp(fumeTuning?.textHoldRatio ?? DEFAULT_FUME_TUNING.textHoldRatio, 0, 1),
        cameraTrackingMode: fumeTuning?.cameraTrackingMode === 'stepped' || fumeTuning?.cameraTrackingMode === 'smooth'
            ? fumeTuning.cameraTrackingMode
            : DEFAULT_FUME_TUNING.cameraTrackingMode,
        cameraSpeed: clamp(fumeTuning?.cameraSpeed ?? DEFAULT_FUME_TUNING.cameraSpeed, 0.55, 1.85),
        glowIntensity: clamp(fumeTuning?.glowIntensity ?? DEFAULT_FUME_TUNING.glowIntensity, 0, 1.8),
        heroScale: clamp(fumeTuning?.heroScale ?? DEFAULT_FUME_TUNING.heroScale, 0.82, 1.32),
    }), [fumeTuning]);
    const layoutTheme = useMemo(
        () => ({
            name: 'fume-paper',
            fontStyle: theme.fontStyle,
            fontFamily: theme.fontFamily,
            fontFamilyStack: theme.fontFamilyStack,
            fontWeight: theme.fontWeight,
        }),
        [theme.fontFamily, theme.fontFamilyStack, theme.fontStyle, theme.fontWeight],
    );
    const layoutFumeTuning = useMemo<FumeTuning>(() => ({
        ...DEFAULT_FUME_TUNING,
        heroScale: resolvedFumeTuning.heroScale,
    }), [resolvedFumeTuning.heroScale]);

    const article = useMemo<FumeArticleLayout | null>(() => {
        if (viewport.width <= 0 || viewport.height <= 0 || lines.length === 0) {
            return null;
        }
        const layoutCacheKey = buildLayoutCacheKey(lines, viewport, layoutTheme, lyricsFontScale, layoutFumeTuning);
        if (lastFumeLayoutCache?.key === layoutCacheKey) {
            return lastFumeLayoutCache.article;
        }
        const nextArticle = buildArticleLayout(lines, viewport, layoutTheme, lyricsFontScale, layoutFumeTuning);
        lastFumeLayoutCache = {
            key: layoutCacheKey,
            article: nextArticle,
        };
        return nextArticle;
    }, [layoutFumeTuning, layoutTheme, lines, lyricsFontScale, viewport]);
    const lastRenderableLine = useMemo(() => {
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            const line = lines[index];
            if (line?.fullText.trim().length) {
                return line;
            }
        }
        return null;
    }, [lines]);
    const overviewStartTime = useMemo(() => {
        if (!lastRenderableLine) {
            return Number.POSITIVE_INFINITY;
        }

        const lineStartTime = lastRenderableLine.startTime;
        const lineRenderEndTime = getLineRenderEndTime(lastRenderableLine);
        return lineStartTime + Math.max(lineRenderEndTime - lineStartTime, 0) * 0.5;
    }, [lastRenderableLine]);
    const backgroundScene = useMemo(
        () => buildFumeBackgroundScene({
            viewport,
            world: {
                width: article?.width ?? Math.max(viewport.width * 1.8, viewport.width),
                height: article?.height ?? Math.max(viewport.height * 1.8, viewport.height),
            },
            paperBounds: article?.paperBounds,
            seed: `${seed ?? 'fume'}:${theme.name}`,
        }),
        [article?.height, article?.paperBounds, article?.width, seed, theme.name, viewport],
    );
    const overviewCamera = useMemo(
        () => (article ? resolveArticleOverviewCamera(article, viewport) : null),
        [article, viewport],
    );
    const cameraSpeed = resolvedFumeTuning.cameraSpeed;
    const glowIntensity = resolvedFumeTuning.glowIntensity;
    const backgroundObjectOpacity = resolvedFumeTuning.backgroundObjectOpacity;
    const showPrintStamp = !resolvedFumeTuning.hidePrintSymbols;
    const textHoldRatio = resolvedFumeTuning.textHoldRatio;
    const passedFadeDuration = useMemo(
        () => resolveFumePassedFadeDuration(lines, textHoldRatio),
        [lines, textHoldRatio],
    );
    const translationFontSize = `clamp(${(1.05 * lyricsFontScale).toFixed(3)}rem, ${(2.2 * lyricsFontScale).toFixed(3)}vw, ${(1.2 * lyricsFontScale).toFixed(3)}rem)`;
    const upcomingFontSize = `clamp(${(0.875 * lyricsFontScale).toFixed(3)}rem, ${(1.8 * lyricsFontScale).toFixed(3)}vw, ${(1 * lyricsFontScale).toFixed(3)}rem)`;

    useEffect(() => {
        hasPrintedContentRef.current = false;
        setHasPrintedContent(false);
    }, [article]);

    const stageScene = useMemo<FumeStageScene>(() => ({
        article,
        lines,
        theme,
        viewport,
        backgroundScene,
        overviewCamera,
        overviewStartTime,
        passedFadeDuration,
        cameraSpeed,
        cameraTrackingMode: resolvedFumeTuning.cameraTrackingMode,
        glowIntensity,
        backgroundObjectOpacity,
        showPrintStamp,
        textHoldRatio,
        showText,
        showTranslation: showSubtitleTranslation && !hideTranslationSubtitle,
        staticMode,
    }), [
        article,
        backgroundObjectOpacity,
        backgroundScene,
        cameraSpeed,
        glowIntensity,
        hideTranslationSubtitle,
        lines,
        overviewCamera,
        overviewStartTime,
        passedFadeDuration,
        resolvedFumeTuning.cameraTrackingMode,
        showPrintStamp,
        showSubtitleTranslation,
        showText,
        staticMode,
        textHoldRatio,
        theme,
        viewport,
    ]);
    const stageDriver = useMemo<FumeStageDriver>(() => ({
        currentTime,
        audioPower,
        audioBands,
        cameraState: cameraStateRef.current,
        getLineIndex: () => currentLineIndexRef.current,
        onPrintedContent: () => {
            if (hasPrintedContentRef.current) return;
            hasPrintedContentRef.current = true;
            setHasPrintedContent(true);
        },
    }), [audioBands, audioPower, currentTime]);

    useFumeCanvasStage(canvasRef, stageScene, stageDriver, paused);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={{
                ...props,
                background: {
                    ...props.background,
                    common: {
                        ...props.background?.common,
                        disableGeometricBackground: Boolean(props.background?.common?.disableGeometricBackground)
                            || resolvedFumeTuning.disableGeometricBackground,
                    },
                },
            }}
        >
            <div ref={viewportRef} className="relative z-10 h-full w-full pointer-events-none">
                <motion.div
                    initial={false}
                    animate={{
                        opacity: 1,
                        scale: article && showText ? (hasPrintedContent ? 1 : 0.992) : 1,
                    }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    className="absolute left-1/2 top-0 -translate-x-1/2"
                    style={{
                        width: viewport.width,
                        height: viewport.height,
                    }}
                >
                    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                </motion.div>
            </div>
        </VisualizerShell>
    );
};

export default VisualizerFume;
