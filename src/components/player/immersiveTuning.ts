export interface ImmersiveTuning {
    palette: {
        /** Max artwork colors to keep (after dedupe). */
        maxColors: number;
        /** Minimum colors required; synthesized via hue rotation if fewer. */
        minColors: number;
        /** Hue rotation (deg) applied when synthesizing missing colors. */
        synthesizeHueStep: number;
        /** Lightness variance applied when synthesizing missing colors. */
        synthesizeLightnessStep: number;
    };
    gradient: {
        /** Number of blurred color blobs painted on top of the base. */
        blobCount: number;
        /** Blob radius range, expressed in SVG viewBox units (0–100). */
        blobMinRadius: number;
        blobMaxRadius: number;
        /** Gaussian blur stdDeviation in viewBox units. */
        blurStdDeviation: number;
        /** Opacity of each blob (0–1). */
        blobOpacity: number;
        /** Opacity of the darkening vignette overlay (0–1). */
        vignetteStrength: number;
        /** Lightness bias for the base fill (negative = darker base). */
        baseLightnessBias: number;
    };
    grain: {
        /** feTurbulence baseFrequency. Higher = finer grain. */
        baseFrequency: number;
        /** feTurbulence numOctaves. */
        numOctaves: number;
        /** Opacity of grain overlay (0–1). */
        opacity: number;
        /** CSS contrast() filter percent applied to grain. */
        contrast: number;
        /** CSS brightness() filter percent applied to grain. */
        brightness: number;
        /** CSS mix-blend-mode for grain layer. */
        blendMode: 'overlay' | 'soft-light' | 'multiply' | 'screen';
        /** Tile size in px. */
        tileSize: number;
        /** Animation duration (ms) for grain shift. */
        animationMs: number;
    };
    transition: {
        /** Track-change crossfade duration (ms). */
        crossfadeMs: number;
    };
}

export const DEFAULT_IMMERSIVE_TUNING: ImmersiveTuning = {
    palette: {
        maxColors: 8,
        minColors: 5,
        synthesizeHueStep: 12,
        synthesizeLightnessStep: 6
    },
    gradient: {
        blobCount: 8,
        blobMinRadius: 18,
        blobMaxRadius: 60,
        blurStdDeviation: 22,
        blobOpacity: 0.85,
        vignetteStrength: 0.35,
        baseLightnessBias: -8
    },
    grain: {
        baseFrequency: 0.85,
        numOctaves: 3,
        opacity: 0.22,
        contrast: 220,
        brightness: 110,
        blendMode: 'overlay',
        tileSize: 200,
        animationMs: 480
    },
    transition: {
        crossfadeMs: 2400
    }
};

const STORAGE_KEY = 'music-library:immersive-tuning';

const mergeDeep = <T extends Record<string, any>>(base: T, incoming?: Partial<T>): T => {
    if (!incoming) return base;
    const out: Record<string, any> = { ...base };
    for (const k of Object.keys(incoming)) {
        const bv = (base as any)[k];
        const iv = (incoming as any)[k];
        if (iv === undefined) continue;
        if (bv && typeof bv === 'object' && !Array.isArray(bv) && typeof iv === 'object' && !Array.isArray(iv)) {
            out[k] = mergeDeep(bv, iv);
        } else {
            out[k] = iv;
        }
    }
    return out as T;
};

declare global {
    interface Window {
        __IMMERSIVE_TUNING__?: Partial<ImmersiveTuning>;
    }
}

export const getImmersiveTuning = (): ImmersiveTuning => {
    let stored: Partial<ImmersiveTuning> | undefined;
    if (typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) stored = JSON.parse(raw);
        } catch { /* ignore */ }
    }
    const withStored = mergeDeep(DEFAULT_IMMERSIVE_TUNING, stored);
    if (typeof window !== 'undefined' && window.__IMMERSIVE_TUNING__) {
        return mergeDeep(withStored, window.__IMMERSIVE_TUNING__);
    }
    return withStored;
};

export const IMMERSIVE_TUNING_STORAGE_KEY = STORAGE_KEY;
