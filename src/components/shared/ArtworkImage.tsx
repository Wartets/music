import React from 'react';
import { ImageDetails } from '../../types/music';
import { dbService } from '../../services/db';
import { NowPlayingIndicator } from './NowPlayingIndicator';

interface ArtworkImageProps {
    details?: ImageDetails;
    src?: string;
    alt?: string;
    className?: string;
    fallback?: React.ReactNode;
    loading?: 'lazy' | 'eager';
    isPlaying?: boolean;
}

const resolvedArtworkCache = new Map<string, string>();
const failedArtworkCandidates = new Set<string>();
const ABSOLUTE_OR_EMBEDDED_SRC_REGEX = /^(?:[a-z][a-z0-9+.-]*:\/\/|data:|blob:)/i;

const hashText = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

// Procedural SVG pattern generators for fallback artwork variety.
// Each returns an SVG snippet to be inlined as a data URI overlay.
// The pattern index is deterministically chosen from the seed.
const PATTERN_GENERATORS: ((hue: number, seed: number) => string)[] = [
    // 0: Diagonal lines
    (hue, seed) => {
        const spacing = 10 + (seed % 6);
        const opacity = 0.1 + (seed % 5) * 0.06;
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${spacing * 2}' height='${spacing * 2}'><line x1='0' y1='0' x2='${spacing * 2}' y2='${spacing * 2}' stroke='hsla(${hue},60%,75%,${opacity})' stroke-width='1'/></svg>`;
    },
    // 1: Dot grid
    (hue, seed) => {
        const gap = 12 + (seed % 8);
        const radius = 1 + (seed % 3) * 0.4;
        const opacity = 0.1 + (seed % 4) * 0.07;
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${gap}' height='${gap}'><circle cx='${gap / 2}' cy='${gap / 2}' r='${radius}' fill='hsla(${hue},50%,70%,${opacity})'/></svg>`;
    },
    // 2: Concentric ring fragment
    (hue, seed) => {
        const size = 40 + (seed % 20);
        const opacity = 0.1 + (seed % 5) * 0.05;
        const stroke = 0.4 + (seed % 5) * 0.2;
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${size / 2}' cy='${size / 2}' r='${size * 0.35}' fill='none' stroke='hsla(${hue},45%,65%,${opacity})' stroke-width='${stroke}'/><circle cx='${size / 2}' cy='${size / 2}' r='${size * 0.18}' fill='none' stroke='hsla(${hue},45%,65%,${opacity * 0.7})' stroke-width='${stroke * 0.7}'/></svg>`;
    },
    // 3: Chevrons
    (hue, seed) => {
        const size = 16 + (seed % 8);
        const opacity = 0.1 + (seed % 4) * 0.06;
        const stroke = 0.4 + (seed % 4) * 0.1;
        const mid = size / 2;
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><polyline points='0,${mid} ${mid},${mid * 0.4} ${size},${mid}' fill='none' stroke='hsla(${hue},50%,70%,${opacity})' stroke-width='${stroke}'/></svg>`;
    },
    // 4: Cross-hatch
    (hue, seed) => {
        const spacing = 14 + (seed % 6);
        const opacity = 0.1 + (seed % 5) * 0.05;
        const stroke = 0.4 + (seed % 3) * 0.1;
        return `<svg xmlns='http://www.w3.org/2000/svg' width='${spacing}' height='${spacing}'><line x1='0' y1='0' x2='${spacing}' y2='${spacing}' stroke='hsla(${hue},55%,72%,${opacity})' stroke-width='${stroke}'/><line x1='${spacing}' y1='0' x2='0' y2='${spacing}' stroke='hsla(${hue},55%,72%,${opacity * 0.7})' stroke-width='${stroke}'/></svg>`;
    },
];

const createFallbackVisual = (seedText: string) => {
    const seed = hashText(seedText || 'track');
    const hue = seed % 360;

    // Vary gradient angle procedurally (range 115–175deg for subtle tilt variation)
    const gradientAngle = 115 + (seed % 61);
    const background = `linear-gradient(${gradientAngle}deg, hsla(${hue}, 38%, 38%, 0.9), hsla(${(hue + 28) % 360}, 32%, 24%, 0.92))`;

    const letter = (seedText.match(/[\p{L}\p{N}]/u)?.[0] || '?').toUpperCase();

    // Select a pattern overlay deterministically
    const patternIndex = seed % PATTERN_GENERATORS.length;
    const patternSvg = PATTERN_GENERATORS[patternIndex](hue, seed);
    const patternDataUri = `url("data:image/svg+xml,${encodeURIComponent(patternSvg)}")`;

    // Accent radial glow — position varies per seed
    const glowX = 20 + (seed % 60);
    const glowY = 20 + ((seed >> 4) % 60);
    const glowOpacity = 0.06 + (seed % 8) * 0.008;
    const accentGlow = `radial-gradient(ellipse at ${glowX}% ${glowY}%, hsla(${(hue + 40) % 360}, 45%, 55%, ${glowOpacity}), transparent 65%)`;

    // Subtle letter size variation (1.3rem – 1.7rem) for visual diversity
    const letterSize = 1.3 + (seed % 5) * 0.1;

    return { background, letter, patternDataUri, accentGlow, letterSize };
};

const buildSrcCandidates = (pathValue: string): string[] => dbService.getAssetCandidates(pathValue);

const buildInputCandidates = (rawSrc?: string, detailsPath?: string): string[] => {
    if (rawSrc) {
        const normalizedSrc = rawSrc.trim();
        if (!normalizedSrc) return [];
        if (ABSOLUTE_OR_EMBEDDED_SRC_REGEX.test(normalizedSrc)) {
            return [normalizedSrc];
        }
        return buildSrcCandidates(normalizedSrc);
    }

    if (detailsPath) {
        return buildSrcCandidates(detailsPath);
    }

    return [];
};

// Parse dimensions string (e.g., "1920 x 1080") to get width and height numbers.
// Returns null if parsing fails.
const parseDimensions = (dimensions?: string): { width: number; height: number } | null => {
    if (!dimensions) return null;
    const match = dimensions.match(/(\d+)\s*x\s*(\d+)/i);
    if (match) {
        const width = parseInt(match[1], 10);
        const height = parseInt(match[2], 10);
        if (width > 0 && height > 0) {
            return { width, height };
        }
    }
    return null;
};

// Get aspect ratio CSS value from aspect_ratio field.
const getAspectRatioCSS = (aspectRatio: string | undefined): string | undefined => {
    if (!aspectRatio) return undefined;
    switch (aspectRatio) {
        case 'Square': return '1 / 1';
        case 'Landscape': return '16 / 9';
        case 'Portrait': return '3 / 4';
        default: return undefined;
    }
};

export const ArtworkImage: React.FC<ArtworkImageProps> = ({ details, src, alt = 'Artwork', className = 'w-full h-full', fallback, loading = 'lazy', isPlaying }) => {
    const [hasError, setHasError] = React.useState(false);
    const [candidateIndex, setCandidateIndex] = React.useState(0);
    const cacheKey = src || details?.path || '';

    const srcCandidates = React.useMemo(() => {
        const rawCandidates = buildInputCandidates(src, details?.path);

        const availableCandidates = rawCandidates.filter(candidate => !failedArtworkCandidates.has(candidate));
        const cachedCandidate = cacheKey ? resolvedArtworkCache.get(cacheKey) : undefined;

        if (cachedCandidate && availableCandidates.includes(cachedCandidate)) {
            return [cachedCandidate, ...availableCandidates.filter(candidate => candidate !== cachedCandidate)];
        }

        return availableCandidates;
    }, [src, details?.path, cacheKey]);

    const displaySrc = srcCandidates[candidateIndex] ?? null;

// Parse dimensions and aspect ratio for responsive images and layout
const dimensions = React.useMemo(() => parseDimensions(details?.dimensions), [details?.dimensions]);
    const aspectRatioCSS = React.useMemo(() => 
        getAspectRatioCSS(details?.aspect_ratio), 
        [details?.aspect_ratio]
    ) as string | undefined;

    React.useEffect(() => {
        setHasError(false);
        setCandidateIndex(0);
    }, [cacheKey]);


    const playingIndicator = isPlaying ? (
        <NowPlayingIndicator variant="dot" className="absolute bottom-1 right-1 z-10 pointer-events-none" />
    ) : null;

    if (!displaySrc || hasError) {
        const fallbackSeed = (alt && alt !== 'Artwork')
            ? alt
            : (details?.name || 'Track');
        const fallbackVisual = createFallbackVisual(fallbackSeed);

        const fallbackStyle: React.CSSProperties = {
            background: `${fallbackVisual.accentGlow}, ${fallbackVisual.patternDataUri} repeat, ${fallbackVisual.background}`,
        };
        if (aspectRatioCSS) {
            fallbackStyle.aspectRatio = aspectRatioCSS as any;
        }

        return (
            <div
                className={`relative flex items-center justify-center text-white/90 overflow-hidden ${className}`}
                style={fallbackStyle}
            >
                {fallback || (
                    <span
                        className="font-black tracking-tight select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                        style={{ fontSize: `${fallbackVisual.letterSize}rem` }}
                    >
                        {fallbackVisual.letter}
                    </span>
                )}
                {playingIndicator}
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden ${className}`}>
            <img
                src={displaySrc}
                alt={alt}
                width={dimensions?.width}
                height={dimensions?.height}
                className="object-cover w-full h-full"
                loading={loading}
                decoding="async"
                style={aspectRatioCSS ? { aspectRatio: aspectRatioCSS as any } : undefined}
                onLoad={() => {
                    if (cacheKey) {
                        resolvedArtworkCache.set(cacheKey, displaySrc);
                    }
                }}
                onError={() => {
                    failedArtworkCandidates.add(displaySrc);
                    if (candidateIndex < srcCandidates.length - 1) {
                        setCandidateIndex(prev => prev + 1);
                        return;
                    }
                    if (cacheKey) {
                        resolvedArtworkCache.delete(cacheKey);
                    }
                    setHasError(true);
                }}
            />
            {playingIndicator}
        </div>
    );
};
