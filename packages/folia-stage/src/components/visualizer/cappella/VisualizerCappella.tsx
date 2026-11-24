import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { playerBottomBarLiveOffset } from '../../../stores/motionSignals';
import { DEFAULT_CAPPELLA_TUNING, type CappellaTuning } from '../../../types';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import { shouldPreheatLine, useVisualizerRuntime } from '../runtime';
import { type VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import { builtinEmoImages } from './emoImages';
import type { PreparedBubbleMetrics } from './cappellaTypes';
import { CAPPELLA_PREHEAT_WINDOW } from './cappellaConstants';
import { getCappellaIntensityConfig } from './cappellaIntensity';
import { buildCappellaMessages } from './cappellaMessages';
import { getVisibleLineIndexAtTime, getVisibleMessages } from './cappellaMessageLayout';
import { getOrBuildBubbleMetrics } from './cappellaBubbleMetrics';
import { CappellaMessageRow } from './CappellaMessageRow';

// src/components/visualizer/cappella/VisualizerCappella.tsx
// Renders parsercore-timed lyrics as a chat-style cappella conversation.
type VisualizerCappellaProps = VisualizerSharedProps;

const VisualizerCappella: React.FC<VisualizerCappellaProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        subtitleTheme,
        audioPower,
        audioBands,
        showText = true,
        songTitle,
        coverUrl,
        seed,
        lyricsFontScale = 1,
        lyricLineSpacing = 1.2,
        lyricMaxLines = 0,
        subtitleFontScale = 1,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        showSubtitleTranslation = true,
        subtitleContentMode,
        cappellaTuning = DEFAULT_CAPPELLA_TUNING,
        cappellaCustomEmojiImages = [],
        cappellaCustomAvatarImages = [],
        isPreviewMode = false,
    } = props;
    const { t } = useTranslation();
    const [viewportSize, setViewportSize] = useState(() => (
        typeof window === 'undefined'
            ? { width: 1280, height: 900 }
            : { width: window.innerWidth, height: window.innerHeight }
    ));
    const bubbleMetricsCacheRef = useRef(new Map<string, PreparedBubbleMetrics>());
    const [visibleLineIndex, setVisibleLineIndex] = useState(() => getVisibleLineIndexAtTime(lines, currentTime.get()));
    const visibleLineIndexRef = useRef(visibleLineIndex);
    const titleText = songTitle?.trim() || t('ui.noTrack');
    const avatarSeed = seed ?? titleText;
    const intensityConfig = useMemo(() => getCappellaIntensityConfig(theme.animationIntensity), [theme.animationIntensity]);
    const resolvedCappellaTuning = useMemo<CappellaTuning>(() => ({
        showEmoMessages: cappellaTuning.showEmoMessages ?? DEFAULT_CAPPELLA_TUNING.showEmoMessages,
        emojiPackSource: (
            cappellaTuning.emojiPackSource === 'custom' && cappellaCustomEmojiImages.length > 0
                ? 'custom'
                : DEFAULT_CAPPELLA_TUNING.emojiPackSource
        ),
        avatarSource: (
            cappellaTuning.avatarSource === 'builtin' || cappellaTuning.avatarSource === 'color' || cappellaTuning.avatarSource === 'cover' || (cappellaTuning.avatarSource === 'custom' && cappellaCustomAvatarImages.length > 0)
                ? cappellaTuning.avatarSource
                : DEFAULT_CAPPELLA_TUNING.avatarSource
        ),
    }), [cappellaCustomEmojiImages.length, cappellaCustomAvatarImages.length, cappellaTuning.avatarSource, cappellaTuning.emojiPackSource, cappellaTuning.showEmoMessages]);
    const activeEmoImages = useMemo(
        () => resolvedCappellaTuning.emojiPackSource === 'custom' && cappellaCustomEmojiImages.length > 0
            ? cappellaCustomEmojiImages
            : builtinEmoImages,
        [cappellaCustomEmojiImages, resolvedCappellaTuning.emojiPackSource]
    );
    const customAvatarImages = useMemo(
        () => resolvedCappellaTuning.avatarSource === 'custom' ? cappellaCustomAvatarImages : [],
        [cappellaCustomAvatarImages, resolvedCappellaTuning.avatarSource]
    );
    const messages = useMemo(
        () => buildCappellaMessages(lines, titleText, intensityConfig, resolvedCappellaTuning, activeEmoImages, isPreviewMode),
        [activeEmoImages, intensityConfig, isPreviewMode, lines, resolvedCappellaTuning, titleText]
    );
    const isNarrowCappella = viewportSize.width < 680;
    const rawCappellaBase = isNarrowCappella
        ? Math.max(18, viewportSize.width * 0.045)
        : Math.max(22, Math.min(32, 15.5 + viewportSize.width * 0.0078));
    const baseFontSize = Math.max(16, Math.min(44, rawCappellaBase * lyricsFontScale));
    const maxPanelWidth = Math.max(Math.round(viewportSize.width * 0.92) - 24, 240);
    const bubbleGroupRatio = viewportSize.width >= 640 ? 0.76 : 0.85;
    const maxTextWidth = Math.max(120, Math.floor(maxPanelWidth * bubbleGroupRatio - 56));
    const showTranslationResolved = showSubtitleTranslation && !hideTranslationSubtitle;
    const rowGapPx = Math.max(6, Math.round(12 * (Math.max(0.85, Math.min(1.8, lyricLineSpacing || 1.2)) / 1.2)));
    const [liveBottomOffset, setLiveBottomOffset] = useState(() => playerBottomBarLiveOffset.get());
    useMotionValueEvent(playerBottomBarLiveOffset, 'change', latest => {
        const rounded = Math.round(latest);
        setLiveBottomOffset(prev => (Math.abs(prev - rounded) >= 4 ? rounded : prev));
    });
    const topClearance = isPlayerChromeHidden
        ? 36
        : (viewportSize.width >= 1024 ? 76 : viewportSize.width >= 640 ? 68 : 56);
    const bottomClearance = isPlayerChromeHidden
        ? 40
        : Math.max(isNarrowCappella ? 204 : 216, liveBottomOffset + 44);
    const visibleMessages = useMemo(() => {
        const list = getVisibleMessages(
            messages,
            visibleLineIndex,
            viewportSize.height,
            currentLineIndex,
            currentTime.get(),
            intensityConfig.motion,
            theme,
            baseFontSize,
            maxTextWidth,
            showTranslationResolved,
            rowGapPx,
            topClearance,
            bottomClearance,
        );
        return lyricMaxLines > 0 ? list.slice(-lyricMaxLines) : list;
    }, [
        baseFontSize,
        bottomClearance,
        currentLineIndex,
        currentTime,
        intensityConfig.motion,
        lyricMaxLines,
        maxTextWidth,
        messages,
        rowGapPx,
        showTranslationResolved,
        theme,
        topClearance,
        viewportSize.height,
        visibleLineIndex,
    ]);
    const { activeLine, recentCompletedLine, upcomingLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const commitResize = () => {
            timer = null;
            const w = window.innerWidth;
            const h = window.innerHeight;
            React.startTransition(() => {
                setViewportSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
            });
        };
        const handleResize = () => {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(commitResize, 76);
        };

        window.addEventListener('resize', handleResize, { passive: true });
        return () => {
            if (timer !== null) clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const nextVisibleLineIndex = getVisibleLineIndexAtTime(lines, currentTime.get());

        visibleLineIndexRef.current = nextVisibleLineIndex;
        setVisibleLineIndex(nextVisibleLineIndex);
    }, [currentTime, lines]);

    useMotionValueEvent(currentTime, 'change', latest => {
        const nextVisibleLineIndex = getVisibleLineIndexAtTime(lines, latest);

        if (nextVisibleLineIndex !== visibleLineIndexRef.current) {
            visibleLineIndexRef.current = nextVisibleLineIndex;
            setVisibleLineIndex(nextVisibleLineIndex);
        }

        if (!upcomingLine || !shouldPreheatLine(upcomingLine, latest, CAPPELLA_PREHEAT_WINDOW)) {
            return;
        }

        getOrBuildBubbleMetrics(bubbleMetricsCacheRef.current, {
            line: upcomingLine,
            theme,
            fontSize: baseFontSize * intensityConfig.motion.activeFontMultiplier,
            lineHeightPx: baseFontSize * intensityConfig.motion.activeFontMultiplier * 1.45,
            maxTextWidth,
            paddingX: intensityConfig.motion.activePaddingX,
            paddingY: intensityConfig.motion.activePaddingY,
        });
    });

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            {showText && (
                <div
                    className="relative z-10 flex h-full w-full flex-col items-center justify-start overflow-hidden px-3 sm:px-6 lg:px-10"
                    style={{
                        paddingTop: `${topClearance}px`,
                        paddingBottom: `${bottomClearance}px`,
                    }}
                >
                    <div
                        className="relative flex max-h-full w-full max-w-[92vw] flex-col justify-end overflow-visible"
                        style={{ gap: `${rowGapPx}px` }}
                    >
                        <AnimatePresence initial={false} mode="popLayout">
                            {visibleMessages.map((message) => (
                                <CappellaMessageRow
                                    key={message.id}
                                    message={message}
                                    currentTime={currentTime}
                                    currentLineIndex={currentLineIndex}
                                    theme={theme}
                                    coverUrl={coverUrl}
                                    cappellaTuning={resolvedCappellaTuning}
                                    avatarSeed={avatarSeed}
                                    baseFontSize={baseFontSize}
                                    maxTextWidth={maxTextWidth}
                                    metricsCache={bubbleMetricsCacheRef}
                                    intensityConfig={intensityConfig}
                                    customAvatarImages={customAvatarImages}
                                    showTranslation={showTranslationResolved}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes cappella-char-fade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes cappella-bubble-glow-pan {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }

                @keyframes cappella-emo-wiggle {
                    0%, 100% { transform: rotate(-1.6deg); }
                    50% { transform: rotate(1.6deg); }
                }
            `}</style>
        </VisualizerShell>
    );
};

export default VisualizerCappella;
