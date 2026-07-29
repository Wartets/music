/**
 * Utility functions for color extraction, manipulation, and contrast checking.
 * Built to ensure WCAG accessibility standards are met dynamically.
 */

// --- Color Type Definitions ---
export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

// --- Conversion Utilities ---

export const hexToRgb = (hex: string): RGB | null => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

export const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
};

export const hexWithAlpha = (hex: string, alpha: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return rgbToHex(rgb.r, rgb.g, rgb.b) + a;
};

export const rgbToHsl = (r: number, g: number, b: number): HSL => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
};

export const hslToRgb = (h: number, s: number, l: number): RGB => {
    let r, g, b;
    h /= 360; s /= 100; l /= 100;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

// --- Luminance and Contrast (WCAG Standards) ---

// Relative luminance (WCAG 2.0)
export const getLuminance = (r: number, g: number, b: number): number => {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

// Contrast ratio (WCAG 2.0) - Returns 1 to 21
export const getContrastRatio = (hex1: string, hex2: string): number => {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;

    const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

    const bright = Math.max(lum1, lum2);
    const dark = Math.min(lum1, lum2);

    return (bright + 0.05) / (dark + 0.05);
};

export const isDark = (hex: string): boolean => {
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
};

// --- Color Manipulation (Requirements 3, 8, 14, 16) ---

export const limitSaturation = (hex: string, maxSaturation: number = 70): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (hsl.s > maxSaturation) {
        hsl.s = maxSaturation; // Cap saturation to avoid aggressive neon colors
    }
    const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
};

export const ensureContrast = (baseHex: string, targetHex: string, minRatio: number = 4.5): string => {
    const ratio = getContrastRatio(baseHex, targetHex);
    if (ratio >= minRatio) return targetHex;

    // Need to adjust targetHex to contrast against baseHex
    const baseIsDark = isDark(baseHex);
    const targetRgb = hexToRgb(targetHex);
    if (!targetRgb) return baseIsDark ? '#FFFFFF' : '#000000';

    let hsl = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);

    // Iteratively adjust lightness until contrast is met or limits reached
    let step = baseIsDark ? 5 : -5;
    let safeColor = targetHex;

    for (let i = 0; i < 10; i++) {
        hsl.l += step;
        if (hsl.l < 0) hsl.l = 0;
        if (hsl.l > 100) hsl.l = 100;

        const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        safeColor = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
        if (getContrastRatio(baseHex, safeColor) >= minRatio) {
            break;
        }
        if (hsl.l === 0 || hsl.l === 100) break; // Exceeded bounds
    }

    // Fallback if still totally failing (rare, but mathematically possible)
    if (getContrastRatio(baseHex, safeColor) < 3) {
        return baseIsDark ? '#FFFFFF' : '#111111';
    }

    return safeColor;
};

// Returns a lighter version of the color (for highlights, borders)
export const lightenColor = (hex: string, percent: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.l = Math.min(100, hsl.l + percent);
    const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
};

// Returns a darker version of the color (for depths, backgrounds)
export const darkenColor = (hex: string, percent: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.l = Math.max(0, hsl.l - percent);
    const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
};

// --- Image Extraction (Requirements 1, 15) ---

/**
 * Extracts dominant colors from an image URL using a canvas context.
 * Aims to find distinctly different dominant hues to avoid muddy mixes.
 */
export const extractDominantColors = async (imageUrl: string, colorCount: number = 3): Promise<string[]> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(['#1a1a1a']); // Fallback

            // Downsample image for performance
            const MAX_DIM = 100;
            const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Simple quantization / bucket clustering
            const colorCounts: Record<string, { r: number, g: number, b: number, count: number }> = {};

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const alpha = data[i + 3];

                if (alpha < 128) continue; // Skip highly transparent pixels

                // Bucket size (higher = fewer distinct colors)
                const bucketSize = 32;
                const rBucket = Math.round(r / bucketSize) * bucketSize;
                const gBucket = Math.round(g / bucketSize) * bucketSize;
                const bBucket = Math.round(b / bucketSize) * bucketSize;

                // Ignore near-whites, near-blacks, and low-saturation grays
                if ((rBucket < 30 && gBucket < 30 && bBucket < 30) ||
                    (rBucket > 200 && gBucket > 200 && bBucket > 200)) {
                    continue;
                }
                const maxC = Math.max(rBucket, gBucket, bBucket);
                const minC = Math.min(rBucket, gBucket, bBucket);
                if (maxC - minC < 20 && maxC > 160) {
                    continue;
                }

                const key = `${rBucket},${gBucket},${bBucket}`;

                if (colorCounts[key]) {
                    colorCounts[key].count++;
                } else {
                    colorCounts[key] = { r: rBucket, g: gBucket, b: bBucket, count: 1 };
                }
            }

            // Sort buckets by frequency
            const sortedCounts = Object.values(colorCounts).sort((a, b) => b.count - a.count);

            if (sortedCounts.length === 0) {
                return resolve(['#1a1a1a']); // Fallback if image was all black/white/transparent
            }

            // Extract the top distinct colors
            const topColors: string[] = [];
            for (const color of sortedCounts) {
                if (topColors.length >= colorCount) break;
                // Basic hue distance check could be added here to avoid picking 3 shades of the same color
                topColors.push(rgbToHex(color.r, color.g, color.b));
            }

            resolve(topColors);
        };

        img.onerror = () => {
            resolve(['#1a1a1a']); // Fallback on error
        };

        img.src = imageUrl;
    });
};
