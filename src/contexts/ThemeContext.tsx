import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { extractDominantColors, limitSaturation, ensureContrast, lightenColor, darkenColor, hexWithAlpha, hslToRgb, rgbToHex, hexToRgb, rgbToHsl } from '../utils/colorUtils';
import { useTranslation } from '../i18n/I18nContext';
export type ThemeMode = 'adaptive' | 'fixed' | 'genre' | 'neutral';

export interface ThemeSettings {
    mode: ThemeMode;
    applyToNonEssentialsOnly: boolean;
    limitAggressiveColors: boolean;
    enforceContrast: boolean;
    manualHueOverride: number | null;
}

export interface Palette {
    dominant: string;
    dominantLight: string;
    dominantDark: string;
    onDominant: string;

    surfacePrimary: string;
    surfaceSecondary: string;
    surfaceElevated: string;
    surfaceHover: string;
    surfaceActive: string;

    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textAccent: string;

    borderSubtle: string;
    borderDefault: string;
    borderAccent: string;

    badgeBg: string;
    badgeText: string;
    scrollbar: string;
}

interface ThemeContextProps {
    settings: ThemeSettings;
    updateSettings: (newSettings: Partial<ThemeSettings>) => void;
    applyArtworkColors: (artworkUrl: string | null) => Promise<void>;
    currentPalette: Palette;
    reportBadPalette: () => void;
}

const defaultSettings: ThemeSettings = {
    mode: 'adaptive',
    applyToNonEssentialsOnly: false,
    limitAggressiveColors: true,
    enforceContrast: true,
    manualHueOverride: null,
};

const DEFAULT_PALETTE: Palette = {
    dominant: '#444444',
    dominantLight: '#666666',
    dominantDark: '#222222',
    onDominant: '#ffffff',

    surfacePrimary: '#000000',
    surfaceSecondary: '#0a0a0a',
    surfaceElevated: '#141414',
    surfaceHover: 'rgba(255,255,255,0.05)',
    surfaceActive: 'rgba(255,255,255,0.1)',

    textPrimary: '#ffffff',
    textSecondary: '#a1a1aa', // zinc-400
    textMuted: '#52525b', // zinc-600
    textAccent: '#ffffff',

    borderSubtle: 'rgba(255,255,255,0.05)',
    borderDefault: 'rgba(255,255,255,0.1)',
    borderAccent: 'rgba(255,255,255,0.2)',

    badgeBg: 'rgba(255,255,255,0.1)',
    badgeText: '#ffffff',
    scrollbar: 'rgba(255,255,255,0.1)',
};

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

const MAX_PALETTE_CACHE_SIZE = 250;
const MAX_EXTRACTION_CACHE_SIZE = 200;

const touchCacheEntry = <T,>(cache: Map<string, T>, key: string, value: T, maxSize: number) => {
    if (cache.has(key)) {
        cache.delete(key);
    }

    cache.set(key, value);

    if (cache.size > maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<ThemeSettings>(defaultSettings);
    const [currentPalette, setCurrentPalette] = useState<Palette>(DEFAULT_PALETTE);
    const paletteCacheRef = useRef<Map<string, Palette>>(new Map());
    const extractionCacheRef = useRef<Map<string, string[]>>(new Map());
    const inFlightExtractionRef = useRef<Map<string, Promise<string[]>>>(new Map());
    const lastRequestIdRef = useRef(0);
    const lastAppliedPaletteKeyRef = useRef<string>('default');

    useEffect(() => {
        const root = document.documentElement;

        root.style.setProperty('--color-dominant', currentPalette.dominant);
        root.style.setProperty('--color-dominant-light', currentPalette.dominantLight);
        root.style.setProperty('--color-dominant-dark', currentPalette.dominantDark);
        root.style.setProperty('--color-on-dominant', currentPalette.onDominant);

        root.style.setProperty('--color-surface-primary', currentPalette.surfacePrimary);
        root.style.setProperty('--color-surface-secondary', currentPalette.surfaceSecondary);
        root.style.setProperty('--color-surface-elevated', currentPalette.surfaceElevated);
        root.style.setProperty('--color-surface-hover', currentPalette.surfaceHover);
        root.style.setProperty('--color-surface-active', currentPalette.surfaceActive);

        root.style.setProperty('--color-text-primary', currentPalette.textPrimary);
        root.style.setProperty('--color-text-secondary', currentPalette.textSecondary);
        root.style.setProperty('--color-text-muted', currentPalette.textMuted);
        root.style.setProperty('--color-text-accent', currentPalette.textAccent);

        root.style.setProperty('--color-border-subtle', currentPalette.borderSubtle);
        root.style.setProperty('--color-border-default', currentPalette.borderDefault);
        root.style.setProperty('--color-border-accent', currentPalette.borderAccent);

        root.style.setProperty('--color-badge-bg', currentPalette.badgeBg);
        root.style.setProperty('--color-badge-text', currentPalette.badgeText);
        root.style.setProperty('--color-scrollbar', currentPalette.scrollbar);

    }, [currentPalette]);

    const updateSettings = (newSettings: Partial<ThemeSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const applyPalette = useCallback((paletteKey: string, palette: Palette) => {
        if (lastAppliedPaletteKeyRef.current === paletteKey) {
            return;
        }

        lastAppliedPaletteKeyRef.current = paletteKey;
        setCurrentPalette(palette);
    }, []);

    const getSettingsCacheKey = useCallback((themeSettings: ThemeSettings) => {
        return [
            themeSettings.mode,
            themeSettings.applyToNonEssentialsOnly ? '1' : '0',
            themeSettings.limitAggressiveColors ? '1' : '0',
            themeSettings.enforceContrast ? '1' : '0',
            themeSettings.manualHueOverride ?? 'none'
        ].join('|');
    }, []);

    const buildPaletteFromPrimary = useCallback((basePrimary: string, themeSettings: ThemeSettings): Palette => {
        let primary = basePrimary;

        // Clamp lightness to prevent washed-out/white themes on dark UI
        const primaryRgb = hexToRgb(primary);
        if (primaryRgb) {
            const hsl = rgbToHsl(primaryRgb.r, primaryRgb.g, primaryRgb.b);
            if (hsl.l > 55) {
                hsl.l = 55;
                const clamped = hslToRgb(hsl.h, hsl.s, hsl.l);
                primary = rgbToHex(clamped.r, clamped.g, clamped.b);
            }
        }

        if (themeSettings.limitAggressiveColors) {
            primary = limitSaturation(primary, 60);
        }

        let light = lightenColor(primary, 20);
        let dark = darkenColor(primary, 30);
        let textOnDom = '#ffffff';

        if (themeSettings.enforceContrast) {
            primary = ensureContrast('#000000', primary, 2.5);
            textOnDom = ensureContrast(primary, '#ffffff', 4.5);
            light = ensureContrast('#000000', light, 4.5);
        }

        const surfaceSecondary = themeSettings.applyToNonEssentialsOnly ? '#0a0a0a' : hexWithAlpha(dark, 0.3);
        const surfaceElevated = themeSettings.applyToNonEssentialsOnly ? '#141414' : hexWithAlpha(dark, 0.6);

        return {
            dominant: primary,
            dominantLight: light,
            dominantDark: dark,
            onDominant: textOnDom,

            surfacePrimary: '#000000',
            surfaceSecondary,
            surfaceElevated,
            surfaceHover: hexWithAlpha(primary, 0.15),
            surfaceActive: hexWithAlpha(primary, 0.25),

            textPrimary: '#ffffff',
            textSecondary: '#a1a1aa',
            textMuted: '#52525b',
            textAccent: light,

            borderSubtle: 'rgba(255,255,255,0.05)',
            borderDefault: 'rgba(255,255,255,0.1)',
            borderAccent: hexWithAlpha(primary, 0.4),

            badgeBg: hexWithAlpha(primary, 0.2),
            badgeText: light,
            scrollbar: 'rgba(255,255,255,0.1)'
        };
    }, []);

    const getExtractedColors = useCallback(async (artworkUrl: string): Promise<string[]> => {
        const cached = extractionCacheRef.current.get(artworkUrl);
        if (cached) {
            touchCacheEntry(extractionCacheRef.current, artworkUrl, cached, MAX_EXTRACTION_CACHE_SIZE);
            return cached;
        }

        const inFlight = inFlightExtractionRef.current.get(artworkUrl);
        if (inFlight) {
            return inFlight;
        }

        const extractionPromise = extractDominantColors(artworkUrl, 1)
            .then((colors) => {
                const normalized = colors.length > 0 ? colors : [DEFAULT_PALETTE.dominant];
                touchCacheEntry(extractionCacheRef.current, artworkUrl, normalized, MAX_EXTRACTION_CACHE_SIZE);
                return normalized;
            })
            .catch(() => [DEFAULT_PALETTE.dominant])
            .finally(() => {
                inFlightExtractionRef.current.delete(artworkUrl);
            });

        inFlightExtractionRef.current.set(artworkUrl, extractionPromise);
        return extractionPromise;
    }, []);

    const applyArtworkColors = useCallback(async (artworkUrl: string | null) => {
        const requestId = ++lastRequestIdRef.current;

        if (!artworkUrl || settings.mode === 'neutral') {
            if (requestId !== lastRequestIdRef.current) return;
            applyPalette('default', DEFAULT_PALETTE);
            return;
        }

        if (settings.mode === 'fixed') {
            if (settings.manualHueOverride === null) return;
        }

        try {
            const settingsKey = getSettingsCacheKey(settings);
            const paletteCacheKey = `${artworkUrl}::${settingsKey}`;
            const cachedPalette = paletteCacheRef.current.get(paletteCacheKey);

            if (cachedPalette) {
                touchCacheEntry(paletteCacheRef.current, paletteCacheKey, cachedPalette, MAX_PALETTE_CACHE_SIZE);
                if (requestId === lastRequestIdRef.current) {
                    applyPalette(paletteCacheKey, cachedPalette);
                }
                return;
            }

            let primary = DEFAULT_PALETTE.dominant;

            if (settings.mode === 'fixed' && settings.manualHueOverride !== null) {
                const normalizedHue = ((settings.manualHueOverride % 360) + 360) % 360;
                const fixedRgb = hslToRgb(normalizedHue, 55, 45);
                primary = rgbToHex(fixedRgb.r, fixedRgb.g, fixedRgb.b);
            } else {
                const colors = await getExtractedColors(artworkUrl);
                if (requestId !== lastRequestIdRef.current) return;
                primary = colors[0] || DEFAULT_PALETTE.dominant;
            }

            const palette = buildPaletteFromPrimary(primary, settings);
            touchCacheEntry(paletteCacheRef.current, paletteCacheKey, palette, MAX_PALETTE_CACHE_SIZE);

            if (requestId === lastRequestIdRef.current) {
                applyPalette(paletteCacheKey, palette);
            }

        } catch (e) {
            console.error(t('theme.extractionFailed'), e);
            if (requestId !== lastRequestIdRef.current) return;
            applyPalette('default', DEFAULT_PALETTE);
        }
    }, [settings, getSettingsCacheKey, getExtractedColors, buildPaletteFromPrimary, applyPalette, t]);

    const reportBadPalette = () => {
        console.warn(t('theme.badPaletteReported'), currentPalette);
        alert(t('theme.fallbackApplied'));
        lastAppliedPaletteKeyRef.current = 'default';
        setCurrentPalette(DEFAULT_PALETTE);
    };

    return (
        <ThemeContext.Provider value={{
            settings, updateSettings, applyArtworkColors, currentPalette, reportBadPalette
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
};

