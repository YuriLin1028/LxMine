import React from 'react';
import { motion } from 'framer-motion';
import type { Theme } from '../../types';
import { resolveThemeTranslationFontStack } from '../../utils/fontStacks';

export interface InlineLyricTranslationProps {
    text?: string | null;
    theme: Theme;
    visible?: boolean;
    scale?: number;
    align?: 'center' | 'left' | 'right';
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Shared inline translation / romaji block anchored directly beneath the active lyric line
 * (identical typography & `\n` multi-line stacking to LxMine plain-stage and MineRadio).
 */
export const InlineLyricTranslation: React.FC<InlineLyricTranslationProps> = ({
    text,
    theme,
    visible = true,
    scale = 1,
    align = 'center',
    className = '',
    style,
}) => {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (!visible || !clean) return null;

    const safeScale = Math.max(0.55, Math.min(1.5, Number(scale) || 1));
    const fontSize = `clamp(${(0.86 * safeScale).toFixed(3)}rem, ${(1.75 * safeScale).toFixed(3)}vw, ${(1.18 * safeScale).toFixed(3)}rem)`;

    return (
        <motion.div
            data-lxmine-inline-translation="1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.88, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-none select-none max-w-full ${className}`}
            style={{
                fontFamily: resolveThemeTranslationFontStack(theme),
                fontSize,
                fontWeight: 500,
                lineHeight: 1.32,
                letterSpacing: '0.01em',
                color: theme.secondaryColor,
                textAlign: align,
                whiteSpace: 'pre-line',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                ...style,
            }}
        >
            {clean}
        </motion.div>
    );
};

export default InlineLyricTranslation;
