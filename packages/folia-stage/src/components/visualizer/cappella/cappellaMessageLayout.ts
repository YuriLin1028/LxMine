import { type Line, type Theme } from '../../../types';
import { mixColors } from '../colorMix';
import { splitTranslationSubLines } from '../companionTranslation';
import { type CappellaIntensityConfig, type CappellaMessage, type CappellaTimedMessage, isTimedMessage } from './cappellaTypes';
import { AVATAR_GRID_SIZE, MAX_VISIBLE_MESSAGES } from './cappellaConstants';
import { measureBubbleText } from './cappellaBubbleMetrics';

// src/components/visualizer/cappella/cappellaMessageLayout.ts
// 消息列表的视口取舍与展示派生：头像位置、高度估算、可见消息筛选、消息状态、气泡配色、时间戳格式。

export const getAvatarPosition = (avatarIndex: number) => {
    const safeIndex = ((avatarIndex % 9) + 9) % 9;
    const col = safeIndex % AVATAR_GRID_SIZE;
    const row = Math.floor(safeIndex / AVATAR_GRID_SIZE);

    return {
        backgroundPosition: `${col * 50}% ${row * 50}%`,
        backgroundSize: `${AVATAR_GRID_SIZE * 100}% ${AVATAR_GRID_SIZE * 100}%`,
    };
};

/**
 * 估算特定消息渲染后的高度，用于动态控制可见消息列表的行数，避免超出视口或被底部播控栏遮挡。
 */
const getEstimatedMessageHeight = (
    message: CappellaMessage,
    isActive: boolean,
    motionConfig: CappellaIntensityConfig['motion'],
    theme: Theme,
    baseFontSize: number,
    maxTextWidth: number,
    showTranslation: boolean,
    rowGapPx: number,
): number => {
    if (message.kind === 'emo') {
        const imageSize = isActive ? motionConfig.emoActiveSize : motionConfig.emoInactiveSize;
        const scaleOverflow = isActive && motionConfig.activeScale > 1
            ? Math.ceil(imageSize * (motionConfig.activeScale - 1))
            : 0;
        return imageSize + scaleOverflow + 48 + rowGapPx;
    }

    const fontSize = message.kind === 'title'
        ? baseFontSize
        : baseFontSize * (isActive ? motionConfig.activeFontMultiplier : motionConfig.inactiveFontMultiplier);
    const paddingX = isActive ? motionConfig.activePaddingX : motionConfig.inactivePaddingX;
    const paddingY = isActive ? motionConfig.activePaddingY : motionConfig.inactivePaddingY;
    const lineHeightPx = fontSize * 1.45;
    const measuredHeight = measureBubbleText({
        text: message.kind === 'title' ? message.text : message.line.fullText,
        theme,
        fontSize,
        lineHeightPx,
        maxTextWidth,
        paddingX,
        paddingY,
    }).height;

    let translationHeight = 0;
    if (message.kind === 'lyric' && showTranslation) {
        const subRows = splitTranslationSubLines(message.line.translation, true);
        if (subRows.length > 0) {
            const subFontSize = Math.max(12, Math.round(fontSize * 0.56));
            const subLineHeightPx = subFontSize * 1.36;
            for (let idx = 0; idx < subRows.length; idx += 1) {
                const subBox = measureBubbleText({
                    text: subRows[idx],
                    theme,
                    fontSize: subFontSize,
                    lineHeightPx: subLineHeightPx,
                    maxTextWidth,
                    paddingX,
                    paddingY: 0,
                });
                translationHeight += subBox.height + (idx === 0 ? 8 : 4);
            }
        }
    }

    const minHeight = Math.max(
        isActive ? motionConfig.activeMinHeight : motionConfig.inactiveMinHeight,
        lineHeightPx + paddingY * 2
    );
    const renderedHeight = Math.max(measuredHeight + translationHeight, minHeight);
    const scaleOverflow = isActive && motionConfig.activeScale > 1
        ? Math.ceil(renderedHeight * (motionConfig.activeScale - 1))
        : 0;

    return renderedHeight + scaleOverflow + rowGapPx;
};

/**
 * 根据视口高度、顶底净空以及所有消息（含翻译/音译）的累积高度，动态筛选可见消息列表，确保底部永不被播控栏挡住。
 */
export const getVisibleMessages = (
    messages: CappellaMessage[],
    visibleLineIndex: number,
    viewportHeight: number,
    currentLineIndex: number,
    currentTime: number,
    motionConfig: CappellaIntensityConfig['motion'],
    theme: Theme,
    baseFontSize: number,
    maxTextWidth: number,
    showTranslation = true,
    rowGapPx = 12,
    topClearance = 76,
    bottomClearance = 216,
) => {
    const visible = messages.filter(message => {
        if (message.kind === 'title') {
            return true;
        }

        if (message.kind === 'emo') {
            return currentTime >= message.activationStartTime;
        }

        return message.lineIndex <= visibleLineIndex;
    });

    const usableHeight = Math.max(160, viewportHeight - topClearance - bottomClearance - 16);
    let accumulatedHeight = 0;
    const result: CappellaMessage[] = [];

    for (let i = visible.length - 1; i >= 0; i--) {
        const message = visible[i];
        const timedData = isTimedMessage(message) ? message : null;
        const isActive = timedData ? getTimedMessageState(timedData, currentTime, currentLineIndex).isActive : false;
        const estHeight = getEstimatedMessageHeight(
            message,
            isActive,
            motionConfig,
            theme,
            baseFontSize,
            maxTextWidth,
            showTranslation,
            rowGapPx,
        );

        if (accumulatedHeight + estHeight > usableHeight && result.length >= 1) {
            break;
        }

        accumulatedHeight += estHeight;
        result.unshift(message);

        if (result.length >= MAX_VISIBLE_MESSAGES) {
            break;
        }
    }

    return result;
};

export const getVisibleLineIndexAtTime = (lines: Line[], currentTime: number) => {
    for (let index = lines.length - 1; index >= 0; index--) {
        if (currentTime >= lines[index].startTime) {
            return index;
        }
    }

    return -1;
};

export const getTimedMessageState = (message: CappellaTimedMessage, currentTime: number, currentLineIndex: number) => {
    if (message.kind === 'emo') {
        return {
            isActive: currentTime >= message.activationStartTime && currentTime < message.activationEndTime,
            isPassed: currentTime >= message.activationEndTime,
        };
    }

    return {
        isActive: message.lineIndex === currentLineIndex,
        isPassed: message.lineIndex < currentLineIndex,
    };
};

const perceivedLum = (cssColor: string): number => {
    const clean = String(cssColor || '').trim();
    const hexMatch = clean.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const raw = hexMatch[1];
        const r = raw.length === 3 ? parseInt(raw[0] + raw[0], 16) : parseInt(raw.slice(0, 2), 16);
        const g = raw.length === 3 ? parseInt(raw[1] + raw[1], 16) : parseInt(raw.slice(2, 4), 16);
        const b = raw.length === 3 ? parseInt(raw[2] + raw[2], 16) : parseInt(raw.slice(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    const rgbMatch = clean.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgbMatch) {
        const r = Number(rgbMatch[1]) || 0;
        const g = Number(rgbMatch[2]) || 0;
        const b = Number(rgbMatch[3]) || 0;
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return 0.5;
};

const resolveReadableBubbleInk = (bgCss: string, preferredCss: string): string => {
    const bgLum = perceivedLum(bgCss);
    const prefLum = perceivedLum(preferredCss);
    if (Math.abs(bgLum - prefLum) >= 0.55) return preferredCss;
    return bgLum < 0.54 ? '#f8fafc' : '#111827';
};

export const getBubbleColors = (message: CappellaMessage, theme: Theme) => {
    if (message.side === 'right') {
        const backgroundColor = mixColors(theme.accentColor, theme.primaryColor, 0.18, 0.94);
        return {
            backgroundColor,
            borderColor: mixColors(theme.accentColor, theme.primaryColor, 0.34, 0.3),
            textColor: resolveReadableBubbleInk(backgroundColor, theme.backgroundColor),
        };
    }

    const avatarTone = (message.avatarIndex % (AVATAR_GRID_SIZE * AVATAR_GRID_SIZE)) / (AVATAR_GRID_SIZE * AVATAR_GRID_SIZE - 1);
    const accentMix = 0.18 + avatarTone * 0.62;
    const backgroundColor = mixColors(theme.secondaryColor, theme.accentColor, accentMix, 1);

    return {
        backgroundColor,
        borderColor: mixColors(theme.secondaryColor, theme.accentColor, Math.min(accentMix + 0.18, 1), 0.26),
        textColor: resolveReadableBubbleInk(backgroundColor, theme.primaryColor),
    };
};

export const formatTimestamp = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
