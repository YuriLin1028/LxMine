import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PARTITA_TUNING, Line } from '../../../types';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import { shouldPreheatLine, useVisualizerRuntime } from '../runtime';
import { type VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import { buildCompanionLines } from '../companionTranslation';
import { GlowWord } from '../GlowWord';
import { buildGlowWordLayoutVariants, glowWordBodyVariants } from '../glowWordVariants';
import { getGlowWordLineContainerMotion, resolveGlowWordRenderProfile } from '../glowWordTiming';
import {
    EMPTY_PARTITA_LAYOUT,
    PARTITA_PREHEAT_WINDOW,
    type PartitaSequentialLayout,
    getOrBuildPartitaLayout,
    resolvePartitaTuning,
} from './partitaLayout';
import { PartitaChunk } from './PartitaChunk';

// This one is still word-driven, but unlike Classic it needs to pre-build a column/chunk structure first.
// The flow is basically: ask runtime for the active line, optionally preheat the upcoming line,
// split the active line into chunks, place those chunks into columns, then let the words animate inside that structure.
// The important bit is that the layout should feel stable while the words are moving through it.
//
// For a single lyric line, the state handling is:
// waiting -> layout is already there, but the words stay in a light "not entered yet" state.
// active -> this is where the stagger, highlight, and line energy actually happen.
// passed -> words fall back into a softer exit state, and the chunk keeps a little bit of structure for the afterimage.

type VisualizerPartitaProps = VisualizerSharedProps;

const VisualizerPartita: React.FC<VisualizerPartitaProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        subtitleTheme,
        audioPower,
        audioBands,
        showText = true,
        partitaTuning = DEFAULT_PARTITA_TUNING,
        lyricsFontScale = 1,
        subtitleFontScale = 1,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
    } = props;
    const { t } = useTranslation();
    const [windowSize, setWindowSize] = useState(() => (
        typeof window === 'undefined' ? { width: 1200, height: 800 } : { width: window.innerWidth, height: window.innerHeight }
    ));
    const windowHeight = windowSize.height;
    const windowWidth = windowSize.width;
    const resolvedPartitaTuning = useMemo(() => resolvePartitaTuning(partitaTuning), [partitaTuning]);
    const layoutCacheRef = useRef<Map<string, PartitaSequentialLayout>>(new Map());

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const commitResize = () => {
            timer = null;
            const w = window.innerWidth;
            const h = window.innerHeight;
            React.startTransition(() => {
                setWindowSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
            });
        };
        const handleResize = () => {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(commitResize, 76);
        };
        commitResize();
        window.addEventListener('resize', handleResize, { passive: true });
        return () => {
            if (timer !== null) clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const {
        activeLine,
        upcomingLine,
        recentCompletedLine,
        nextLines,
    } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });
    const activeLineRenderProfile = activeLine ? resolveGlowWordRenderProfile(activeLine) : null;
    const activeLineContainerMotion = getGlowWordLineContainerMotion(activeLineRenderProfile);

    const sequentialLayout = useMemo(() => {
        if (!activeLine) {
            return EMPTY_PARTITA_LAYOUT;
        }

        return getOrBuildPartitaLayout(layoutCacheRef.current, activeLine, theme, windowHeight, resolvedPartitaTuning, windowWidth);
    }, [activeLine, theme, windowHeight, windowWidth, resolvedPartitaTuning]);

    const nextLineRef = useRef<Line | null>(upcomingLine);
    useEffect(() => {
        nextLineRef.current = upcomingLine;
    }, [upcomingLine]);

    useMotionValueEvent(currentTime, 'change', (latest: number) => {
        const nextLine = nextLineRef.current;
        if (!nextLine) {
            return;
        }

        if (!shouldPreheatLine(nextLine, latest, PARTITA_PREHEAT_WINDOW)) {
            return;
        }

        getOrBuildPartitaLayout(layoutCacheRef.current, nextLine, theme, windowHeight, resolvedPartitaTuning, windowWidth);
    });

    const isNarrow = windowWidth < 680;
    const lengthScale = sequentialLayout.totalGraphemes > 48 ? 0.82 : sequentialLayout.totalGraphemes > 32 ? 0.90 : 1;
    const narrowScale = isNarrow ? 0.92 : 1;
    const densityScale = lengthScale * narrowScale;
    const mainEffectScale = densityScale * lyricsFontScale;
    const mainFontSize = `clamp(${(2.05 * mainEffectScale).toFixed(3)}rem, calc(${(1.55 * mainEffectScale).toFixed(3)}rem + ${(2.40 * mainEffectScale).toFixed(3)}vw), ${(5.10 * mainEffectScale).toFixed(3)}rem)`;
    const subScale = 0.50 * densityScale * lyricsFontScale;
    const subFontSize = `clamp(${Math.max(0.95, 2.05 * subScale).toFixed(3)}rem, calc(${(1.55 * subScale).toFixed(3)}rem + ${(2.40 * subScale).toFixed(3)}vw), ${(5.10 * subScale).toFixed(3)}rem)`;
    const emptyFontSize = `clamp(${(1.35 * lyricsFontScale).toFixed(3)}rem, ${(2.8 * lyricsFontScale).toFixed(3)}vw, ${(2.2 * lyricsFontScale).toFixed(3)}rem)`;
    const companionLines = useMemo(
        () => buildCompanionLines(activeLine, showSubtitleTranslation && !hideTranslationSubtitle),
        [activeLine, hideTranslationSubtitle, showSubtitleTranslation],
    );

    const layoutVariants = buildGlowWordLayoutVariants(theme.animationIntensity);
    const bodyVariants = glowWordBodyVariants;

    const lyricContainerFloat = useMemo(() => {
        const configByIntensity = {
            calm: { distance: 10, duration: 8.5 },
            normal: { distance: 14, duration: 7 },
            chaotic: { distance: 18, duration: 5.8 },
        } as const;

        const { distance, duration } = configByIntensity[theme.animationIntensity];

        return {
            animate: {
                y: [0, -distance, 0, distance * 0.45, 0],
                scale: [1, 1.01, 1, 0.995, 1],
            },
            transition: {
                duration,
                repeat: Infinity,
                ease: 'easeInOut' as const,
            },
        };
    }, [theme.animationIntensity]);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <motion.div
                className="relative z-10 w-full h-[74vh] flex items-center justify-center px-3 sm:px-6 pointer-events-none will-change-transform"
                animate={lyricContainerFloat.animate}
                transition={lyricContainerFloat.transition}
            >
                <AnimatePresence mode="popLayout">
                    {showText && activeLine && activeLineRenderProfile && (
                        <motion.div
                            key={activeLine.startTime}
                            initial={activeLineContainerMotion.initial}
                            animate={activeLineContainerMotion.animate}
                            exit={activeLineContainerMotion.exit}
                            className="flex flex-col items-center justify-center w-full max-w-[92vw]"
                            style={{
                                perspective: `${sequentialLayout.lineConfig.perspective}px`,
                                minHeight: '220px',
                            }}
                        >
                            <div
                                className="flex flex-row-reverse flex-wrap items-stretch justify-center w-full"
                                style={{ gap: sequentialLayout.lineConfig.columnGap }}
                            >
                                {sequentialLayout.columns.map((column) => {
                                    return (
                                        <div
                                            key={column.id}
                                            className="relative flex min-h-0 py-1 w-full max-w-full items-center justify-center px-2"
                                        >
                                            <div className="relative z-10 flex w-full max-w-full flex-col items-center justify-start">
                                                {column.words.map(({ chunkWords, displayWords, config, order, rowIndex }) => (
                                                    <PartitaChunk
                                                        key={`${config.id}`}
                                                        chunkWords={chunkWords}
                                                        displayWords={displayWords}
                                                        config={config}
                                                        guideIndex={rowIndex}
                                                        currentTime={currentTime}
                                                        theme={theme}
                                                        layoutVariants={layoutVariants}
                                                        bodyVariants={bodyVariants}
                                                        baseColor={theme.primaryColor}
                                                        renderProfile={activeLineRenderProfile}
                                                        isChorus={activeLine.isChorus}
                                                        showGuideLines={resolvedPartitaTuning.showGuideLines}
                                                        fontSize={mainFontSize}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {companionLines.length > 0 && (
                                <div
                                    data-lxmine-inline-translation="1"
                                    className="mt-5 flex w-full max-w-[90vw] flex-col items-center justify-center gap-2 px-2"
                                >
                                    {companionLines.map((subLine, sIdx) => {
                                        const isCalm = theme.animationIntensity === 'calm';
                                        const isChaotic = theme.animationIntensity === 'chaotic';
                                        const subSpread = isChaotic ? 6 : isCalm ? 0 : 2.5;
                                        const subRotate = isChaotic ? 3.5 : isCalm ? 0 : 1.4;
                                        return (
                                            <div
                                                key={subLine.id}
                                                className="flex flex-wrap items-center justify-center"
                                                style={{ rowGap: '0.26rem' }}
                                            >
                                                {subLine.words.map((w, wIdx) => {
                                                    const seedVal = subLine.startTime + sIdx * 13.7 + wIdx * 5.31;
                                                    const rand = (off: number) => {
                                                        const v = Math.sin(seedVal + off) * 10000;
                                                        return v - Math.floor(v);
                                                    };
                                                    const subConfig = {
                                                        id: `${subLine.id}-w${wIdx}`,
                                                        x: (rand(1) - 0.5) * subSpread * 2,
                                                        y: (rand(2) - 0.5) * subSpread * 0.6,
                                                        rotate: (rand(3) - 0.5) * subRotate * 2,
                                                        scale: 1,
                                                        marginBottom: '0',
                                                        alignSelf: 'auto',
                                                        passedRotate: (rand(8) - 0.5) * 8,
                                                    };
                                                    const hasTrailingSpace = /\s$/.test(w.text);
                                                    return (
                                                        <GlowWord
                                                            key={`${subConfig.id}-${w.text}`}
                                                            word={{ ...w, text: w.text.trimEnd() || w.text }}
                                                            config={subConfig}
                                                            currentTime={currentTime}
                                                            theme={theme}
                                                            layoutVariants={layoutVariants}
                                                            bodyVariants={bodyVariants}
                                                            baseColor={theme.primaryColor}
                                                            activeColor={theme.accentColor}
                                                            renderProfile={activeLineRenderProfile}
                                                            isChorus={activeLine.isChorus}
                                                            fontSize={subFontSize}
                                                            layoutStyle={{ marginRight: hasTrailingSpace ? '0.32em' : '0.04em' }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {showText && !activeLine && (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-2xl opacity-50 absolute"
                            style={{
                                color: theme.secondaryColor,
                                fontSize: emptyFontSize,
                            }}
                        >
                            {t('ui.waitingForMusic')}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </VisualizerShell>
    );
};

export default VisualizerPartita;
