import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import type { TrackItem, ImageDetails } from '../../types/music';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from '../../utils/colorUtils';
import { getImmersiveTuning, type ImmersiveTuning } from './immersiveTuning';

interface ImmersiveVisualizerProps {
    track?: TrackItem | null;
    className?: string;
}

/* ── Deterministic RNG ─────────────────────────────────────────────── */

const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

const mulberry32 = (seed: number) => {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6D2B79F5) >>> 0;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

/* ── Color helpers ─────────────────────────────────────────────────── */

const HEX_RE = /^#([0-9a-f]{6})$/i;
const normalizeHex = (v?: string | null): string | null => {
    if (!v) return null;
    const s = v.trim();
    if (!HEX_RE.test(s)) return null;
    return s.toLowerCase();
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const shiftLightness = (hex: string, delta: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const l = clamp(hsl.l + delta, 4, 96);
    const out = hslToRgb(hsl.h, hsl.s, l);
    return rgbToHex(out.r, out.g, out.b);
};

const rotateHue = (hex: string, deg: number, lightnessDelta = 0): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const h = ((hsl.h + deg) % 360 + 360) % 360;
    const l = clamp(hsl.l + lightnessDelta, 4, 96);
    const out = hslToRgb(h, hsl.s, l);
    return rgbToHex(out.r, out.g, out.b);
};

const relativeLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
};

/* ── Palette extraction ────────────────────────────────────────────── */

const extractArtworkPalette = (track: TrackItem): string[] => {
    const colors: string[] = [];
    const seen = new Set<string>();

    const addColor = (hex: string | undefined | null) => {
        const normalized = normalizeHex(hex);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        colors.push(normalized);
    };

    const extractFromArt = (art: ImageDetails) => {
        // Only use colors directly sampled from the artwork pixels.
        // color_palette entries are real quantized clusters from the image.
        // Exclude average_color and other computed/derived values that may
        // not correspond to any actual color present in the artwork.
        if (art.color_palette && art.color_palette.length > 0) {
            for (const entry of art.color_palette) addColor(entry.hex);
        }
        addColor(art.dominant_color);
    };

    const processArtworks = (arr?: ImageDetails[]) => {
        if (!arr) return;
        for (const art of arr) extractFromArt(art);
    };

    processArtworks(track.artworks?.track_artwork);
    processArtworks(track.artworks?.album_artwork);
    (track.versions || []).forEach(v => {
        processArtworks(v.artworks?.track_artwork);
        processArtworks(v.artworks?.album_artwork);
    });

    return colors;
};

// If artwork yields too few colors, synthesize additional palette entries
// deterministically from the track identity so clients render the same set.
const synthesizePaletteFromSeed = (baseHex: string, seedText: string, count: number): string[] => {
    const out: string[] = [];
    const seed = hashString(seedText || 'track-seed');
    const baseHueShift = seed % 24; // small offset to vary rotations
    for (let i = 0; i < count; i++) {
        const hueDelta = ((i + 1) * 28 + baseHueShift) % 360;
        const lightDelta = (i % 2 === 0) ? 6 : -6;
        out.push(rotateHue(baseHex, hueDelta, lightDelta));
    }
    return out;
};

const themeFallbackColor = (): string | null => {
    if (typeof window === 'undefined') return null;
    const css = window.getComputedStyle(document.documentElement)
        .getPropertyValue('--color-dominant')?.trim();
    return normalizeHex(css);
};

const ensurePaletteSize = (
    palette: string[],
    { minColors, maxColors, synthesizeHueStep, synthesizeLightnessStep }: ImmersiveTuning['palette']
): string[] => {
    const out = palette.slice(0, maxColors);
    if (out.length >= minColors) return out;
    let i = 0;
    while (out.length < minColors && out.length > 0) {
        const source = out[i % Math.min(out.length, palette.length)];
        const sign = i % 2 === 0 ? 1 : -1;
        const hueStep = synthesizeHueStep * sign * (1 + Math.floor(i / 2));
        const lStep = synthesizeLightnessStep * sign;
        out.push(rotateHue(source, hueStep, lStep));
        i++;
    }
    return out.slice(0, maxColors);
};

const buildPalette = (track: TrackItem | null | undefined, tuning: ImmersiveTuning): string[] | null => {
    if (!track) return null;
    const fromArt = extractArtworkPalette(track);
    let palette = fromArt.slice();

    // If artwork palette is empty, fall back to theme color
    if (palette.length === 0) {
        const fallback = themeFallbackColor();
        if (!fallback) return null;
        palette = [fallback];
    }

    // If palette is too small, synthesize deterministic variations from the first color
    if (palette.length < Math.max(2, tuning.palette.minColors)) {
        const base = palette[0];
        const synth = synthesizePaletteFromSeed(base, track.logic?.hash_sha256 || track.metadata?.title || 'track', Math.max(2, tuning.palette.minColors) - palette.length);
        palette = [...palette, ...synth];
    }

    return ensurePaletteSize(palette, tuning.palette);
};

/* ── Blob state for morphing ───────────────────────────────────────── */

interface BlobState {
    cx: number;  // % position 0-100
    cy: number;
    r: number;   // radius in viewBox units
    color: string;
    opacity: number;
}

const generateBlobStates = (palette: string[], seed: number, tuning: ImmersiveTuning['gradient']): BlobState[] => {
    const rng = mulberry32(seed);
    const { blobCount, blobMinRadius, blobMaxRadius, blobOpacity } = tuning;
    const blobs: BlobState[] = [];

    for (let i = 0; i < blobCount; i++) {
        const color = palette[i % palette.length];
        const col = i % 3;
        const row = Math.floor(i / 3) % 3;
        const cx = (col + 0.5) * (100 / 3) + (rng() - 0.5) * 30;
        const cy = (row + 0.5) * (100 / 3) + (rng() - 0.5) * 30;
        const r = blobMinRadius + rng() * (blobMaxRadius - blobMinRadius);
        blobs.push({ cx, cy, r, color, opacity: blobOpacity });
    }
    return blobs;
};

/* ── Canvas-based morphing renderer ────────────────────────────────── */

interface MorphState {
    blobs: BlobState[];
    baseColor: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpColor = (hexA: string, hexB: string, t: number): string => {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return hexB;
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bVal = Math.round(lerp(a.b, b.b, t));
    return rgbToHex(r, g, bVal);
};

const easeInOutCubic = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const ImmersiveVisualizer: React.FC<ImmersiveVisualizerProps> = React.memo(({ track, className }) => {
    const tuning = useMemo(() => getImmersiveTuning(), []);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number | null>(null);
    const morphRef = useRef<{
        from: MorphState | null;
        to: MorphState | null;
        startTime: number;
        duration: number;
        settled: MorphState | null;
    }>({ from: null, to: null, startTime: 0, duration: 0, settled: null });

    const grainSeedRef = useRef<number>(0);
    const lastTrackKeyRef = useRef<string | null>(null);

    const buildMorphState = useCallback((t: TrackItem | null | undefined): MorphState | null => {
        if (!t) return null;
        const palette = buildPalette(t, tuning);
        if (!palette || palette.length === 0) return null;
        const key = t.logic?.hash_sha256 || t.logic?.track_name || t.metadata?.title || 'no-track';
        const seed = hashString(key);
        const sorted = [...palette].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
        const baseColor = shiftLightness(sorted[0], tuning.gradient.baseLightnessBias);
        return {
            blobs: generateBlobStates(palette, seed, tuning.gradient),
            baseColor
        };
    }, [tuning]);

    // When the track changes, set up a morph transition
    useEffect(() => {
        const trackKey = track?.logic?.hash_sha256 || track?.logic?.track_name || track?.metadata?.title || null;

        if (trackKey === lastTrackKeyRef.current) return;
        lastTrackKeyRef.current = trackKey;

        const newState = buildMorphState(track);
        if (!newState) {
            morphRef.current = { from: null, to: null, startTime: 0, duration: 0, settled: null };
            return;
        }

        grainSeedRef.current = hashString(trackKey || 'x');

        const currentSettled = morphRef.current.settled;
        if (!currentSettled) {
            // First track — appear immediately
            morphRef.current = { from: null, to: null, startTime: 0, duration: 0, settled: newState };
        } else {
            // Morph from current to new
            morphRef.current = {
                from: currentSettled,
                to: newState,
                startTime: performance.now(),
                duration: tuning.transition.crossfadeMs,
                settled: null
            };
        }
    }, [track, buildMorphState, tuning.transition.crossfadeMs]);

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let running = true;

        const draw = (now: number) => {
            if (!running) return;
            const { width, height } = canvas;
            const morph = morphRef.current;

            let state: MorphState | null = null;

            if (morph.settled) {
                state = morph.settled;
            } else if (morph.from && morph.to) {
                const elapsed = now - morph.startTime;
                const rawT = morph.duration > 0 ? clamp(elapsed / morph.duration, 0, 1) : 1;
                const t = easeInOutCubic(rawT);

                // Interpolate blob states
                const blobs: BlobState[] = [];
                const count = Math.max(morph.from.blobs.length, morph.to.blobs.length);
                for (let i = 0; i < count; i++) {
                    const fromBlob = morph.from.blobs[i % morph.from.blobs.length];
                    const toBlob = morph.to.blobs[i % morph.to.blobs.length];
                    blobs.push({
                        cx: lerp(fromBlob.cx, toBlob.cx, t),
                        cy: lerp(fromBlob.cy, toBlob.cy, t),
                        r: lerp(fromBlob.r, toBlob.r, t),
                        color: lerpColor(fromBlob.color, toBlob.color, t),
                        opacity: lerp(fromBlob.opacity, toBlob.opacity, t),
                    });
                }

                state = {
                    blobs,
                    baseColor: lerpColor(morph.from.baseColor, morph.to.baseColor, t),
                };

                if (rawT >= 1) {
                    morphRef.current = { from: null, to: null, startTime: 0, duration: 0, settled: morph.to };
                }
            }

            if (!state) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, width, height);
                animRef.current = requestAnimationFrame(draw);
                return;
            }

            // Draw base
            ctx.fillStyle = state.baseColor;
            ctx.fillRect(0, 0, width, height);

            // Draw blobs with radial gradients
            for (const blob of state.blobs) {
                const x = (blob.cx / 100) * width;
                const y = (blob.cy / 100) * height;
                const radius = (blob.r / 100) * Math.max(width, height);

                const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
                const rgb = hexToRgb(blob.color);
                if (rgb) {
                    grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${blob.opacity})`);
                    grad.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},${blob.opacity * 0.4})`);
                    grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                } else {
                    grad.addColorStop(0, blob.color);
                    grad.addColorStop(1, 'transparent');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, width, height);
            }

            // Vignette
            if (tuning.gradient.vignetteStrength > 0) {
                const vGrad = ctx.createRadialGradient(
                    width / 2, height / 2, Math.min(width, height) * 0.2,
                    width / 2, height / 2, Math.max(width, height) * 0.75
                );
                vGrad.addColorStop(0, 'rgba(0,0,0,0)');
                vGrad.addColorStop(1, `rgba(0,0,0,${tuning.gradient.vignetteStrength})`);
                ctx.fillStyle = vGrad;
                ctx.fillRect(0, 0, width, height);
            }

            animRef.current = requestAnimationFrame(draw);
        };

        animRef.current = requestAnimationFrame(draw);

        return () => {
            running = false;
            if (animRef.current !== null) {
                cancelAnimationFrame(animRef.current);
                animRef.current = null;
            }
        };
    }, [tuning]);

    // Resize canvas to fill container
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    // Build grain SVG for overlay
    const grainUrl = useMemo(() => {
        const size = tuning.grain.tileSize;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency="${tuning.grain.baseFrequency}" numOctaves="${tuning.grain.numOctaves}" seed="${grainSeedRef.current % 2147483647}" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#n)"/>
</svg>`;
        return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    }, [tuning.grain, track]);

    return (
        <div
            className={`absolute inset-0 overflow-hidden pointer-events-none isolate bg-black ${className || ''}`}
            aria-hidden="true"
        >
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ transform: 'translateZ(0)' }}
            />
            {/* Grain overlay */}
            <div
                className="absolute inset-0 immersive-grain"
                style={{
                    backgroundImage: grainUrl,
                    backgroundSize: `${tuning.grain.tileSize}px ${tuning.grain.tileSize}px`,
                    backgroundRepeat: 'repeat',
                    mixBlendMode: tuning.grain.blendMode,
                    opacity: tuning.grain.opacity,
                    filter: `contrast(${tuning.grain.contrast}%) brightness(${tuning.grain.brightness}%)`,
                    animationDuration: `${Math.max(200, tuning.grain.animationMs)}ms`,
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                }}
            />
        </div>
    );
});

ImmersiveVisualizer.displayName = 'ImmersiveVisualizer';

