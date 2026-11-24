import type { Theme } from '../types';

export const MIN_FONT_WEIGHT = 100;
export const MAX_FONT_WEIGHT = 900;
export const FONT_WEIGHT_STEP = 10;

export const normalizeFontWeight = (fontWeight: unknown): number | null => {
    if (typeof fontWeight !== 'number' || !Number.isFinite(fontWeight)) return null;

    const clamped = Math.min(MAX_FONT_WEIGHT, Math.max(MIN_FONT_WEIGHT, fontWeight));
    return Math.round(clamped / FONT_WEIGHT_STEP) * FONT_WEIGHT_STEP;
};

export const resolveThemeFontWeight = (
    theme: Pick<Theme, 'fontWeight'> | null | undefined,
    fallback: number,
) => normalizeFontWeight(theme?.fontWeight) ?? fallback;

export const LXMINE_UNIFIED_FONT_STACK = '"Segoe UI", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", "Source Han Sans SC", "Helvetica Neue", Arial, sans-serif';

export const BUILTIN_FONT_STACKS: Record<Theme['fontStyle'], string> = {
    sans: LXMINE_UNIFIED_FONT_STACK,
    serif: LXMINE_UNIFIED_FONT_STACK,
    mono: LXMINE_UNIFIED_FONT_STACK,
};

const TRANSLATION_FONT_STACKS: Record<Theme['fontStyle'], string> = {
    sans: LXMINE_UNIFIED_FONT_STACK,
    serif: LXMINE_UNIFIED_FONT_STACK,
    mono: LXMINE_UNIFIED_FONT_STACK,
};

const CSS_GENERIC_FONT_FAMILIES = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
]);

const quoteFontFamily = (fontFamily: string) => `"${fontFamily.replace(/["\\]/g, '\\$&')}"`;

const normalizeFontFamilyName = (fontFamily: string) => fontFamily.trim().replace(/^['"]|['"]$/g, '').trim();

const formatFontFamily = (fontFamily: string) => {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized) return null;

    return CSS_GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())
        ? normalized
        : quoteFontFamily(normalized);
};

export const normalizeFontFamilyStack = (fontFamilies: Array<string | null | undefined> | null | undefined) => {
    const seen = new Set<string>();
    const stack: string[] = [];

    fontFamilies?.forEach(fontFamily => {
        const normalized = normalizeFontFamilyName(fontFamily ?? '');
        if (!normalized) return;

        const key = normalized.toLocaleLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        stack.push(normalized);
    });

    return stack;
};

const buildCustomFontFamilyStack = (theme: Pick<Theme, 'fontFamily' | 'fontFamilyStack'>) => {
    const familiesToNormalize: (string | null | undefined)[] = [
        ...(theme.fontFamily ? [theme.fontFamily] : []),
        ...(theme.fontFamilyStack ?? []),
    ];

    if (familiesToNormalize.length === 0) {
        return [];
    }

    return normalizeFontFamilyStack(familiesToNormalize)
        .map(formatFontFamily)
        .filter((fontFamily): fontFamily is string => Boolean(fontFamily));
};

export const getBuiltinThemeFontStack = (fontStyle: Theme['fontStyle']) => {
    return BUILTIN_FONT_STACKS[fontStyle] ?? BUILTIN_FONT_STACKS.sans;
};

export const resolveThemeFontStack = (theme: Pick<Theme, 'fontStyle' | 'fontFamily' | 'fontFamilyStack'>) => {
    const fallbackStack = getBuiltinThemeFontStack(theme.fontStyle);
    const customFontStack = buildCustomFontFamilyStack(theme);

    if (customFontStack.length === 0) {
        return fallbackStack;
    }

    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};

export const resolveThemeTranslationFontStack = (theme: Pick<Theme, 'fontStyle' | 'fontFamily' | 'fontFamilyStack'>) => {
    const fallbackStack = TRANSLATION_FONT_STACKS[theme.fontStyle] ?? TRANSLATION_FONT_STACKS.sans;
    const customFontStack = buildCustomFontFamilyStack(theme);

    if (customFontStack.length === 0) {
        return fallbackStack;
    }

    return `${customFontStack.join(', ')}, ${fallbackStack}`;
};
