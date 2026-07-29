export type EqFilterType = 'highpass' | 'lowshelf' | 'peaking' | 'notch' | 'highshelf' | 'lowpass';
export type EqPresetLabelKey =
    | 'settings.eqPresets.flat'
    | 'settings.eqPresets.bassLift'
    | 'settings.eqPresets.vocalPresence'
    | 'settings.eqPresets.clubSmile'
    | 'settings.eqPresets.acousticDetail'
    | 'settings.eqPresets.deEssAndAir'
    | 'settings.eqPresets.electronic'
    | 'settings.eqPresets.party'
    | 'settings.eqPresets.bassReducer'
    | 'settings.eqPresets.trebleBoost'
    | 'settings.eqPresets.trebleReducer';

export interface ParametricEqBand {
    id: string;
    label: string;
    enabled: boolean;
    type: EqFilterType;
    frequency: number;
    gain: number;
    q: number;
}

export interface ParametricEqPreset {
    id: string;
    labelKey: EqPresetLabelKey;
    bands: ParametricEqBand[];
}

export const EQ_MIN_FREQUENCY = 20;
export const EQ_MAX_FREQUENCY = 20_000;
export const EQ_MIN_GAIN_DB = -24;
export const EQ_MAX_GAIN_DB = 24;
export const EQ_MIN_Q = 0.1;
export const EQ_MAX_Q = 18;
export const EQ_GRAPH_GAIN_RANGE = 24;
export const EQ_DEFAULT_SAMPLE_RATE = 48_000;

const DEFAULT_Q = 1;
const DEFAULT_SHELF_Q = 0.71;

const DEFAULT_BANDS: ParametricEqBand[] = [
    { id: 'band-1', label: '1', enabled: false, type: 'highpass', frequency: 30, gain: 0, q: DEFAULT_SHELF_Q },
    { id: 'band-2', label: '2', enabled: true, type: 'lowshelf', frequency: 90, gain: 0, q: DEFAULT_SHELF_Q },
    { id: 'band-3', label: '3', enabled: true, type: 'peaking', frequency: 180, gain: 0, q: DEFAULT_Q },
    { id: 'band-4', label: '4', enabled: true, type: 'peaking', frequency: 540, gain: 0, q: DEFAULT_Q },
    { id: 'band-5', label: '5', enabled: true, type: 'peaking', frequency: 1_600, gain: 0, q: DEFAULT_Q },
    { id: 'band-6', label: '6', enabled: true, type: 'peaking', frequency: 4_800, gain: 0, q: DEFAULT_Q },
    { id: 'band-7', label: '7', enabled: true, type: 'highshelf', frequency: 10_000, gain: 0, q: DEFAULT_SHELF_Q },
    { id: 'band-8', label: '8', enabled: false, type: 'lowpass', frequency: 18_000, gain: 0, q: DEFAULT_SHELF_Q }
];

const cloneBands = (bands: ParametricEqBand[]): ParametricEqBand[] => bands.map(band => ({ ...band }));

export const createDefaultParametricEqBands = (): ParametricEqBand[] => cloneBands(DEFAULT_BANDS);

export const supportsEqBandGain = (type: EqFilterType): boolean => (
    type === 'lowshelf' || type === 'peaking' || type === 'highshelf'
);

export const supportsEqBandQ = (type: EqFilterType): boolean => (
    type === 'highpass' || type === 'peaking' || type === 'notch' || type === 'lowpass'
);

export const clampEqFrequency = (value: number): number => {
    if (!Number.isFinite(value)) return EQ_MIN_FREQUENCY;
    return Math.min(EQ_MAX_FREQUENCY, Math.max(EQ_MIN_FREQUENCY, value));
};

export const clampEqGain = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(EQ_MAX_GAIN_DB, Math.max(EQ_MIN_GAIN_DB, value));
};

export const clampEqQ = (value: number): number => {
    if (!Number.isFinite(value)) return DEFAULT_Q;
    return Math.min(EQ_MAX_Q, Math.max(EQ_MIN_Q, value));
};

export const clampEqBand = (band: ParametricEqBand, fallback?: ParametricEqBand): ParametricEqBand => {
    const base = fallback || DEFAULT_BANDS.find(candidate => candidate.id === band.id) || DEFAULT_BANDS[0];
    const type = band.type || base.type;

    return {
        ...base,
        ...band,
        enabled: band.enabled ?? base.enabled,
        type,
        frequency: clampEqFrequency(band.frequency),
        gain: supportsEqBandGain(type) ? clampEqGain(band.gain) : 0,
        q: supportsEqBandQ(type) ? clampEqQ(band.q) : base.q
    };
};

const isEqFilterType = (value: unknown): value is EqFilterType => (
    value === 'highpass'
    || value === 'lowshelf'
    || value === 'peaking'
    || value === 'notch'
    || value === 'highshelf'
    || value === 'lowpass'
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const createPresetBands = (overrides: Array<Partial<ParametricEqBand>>): ParametricEqBand[] => (
    DEFAULT_BANDS.map((band, index) => clampEqBand({ ...band, ...(overrides[index] || {}) }, band))
);

export const PARAMETRIC_EQ_PRESETS: ParametricEqPreset[] = [
    {
        id: 'flat',
        labelKey: 'settings.eqPresets.flat',
        bands: createDefaultParametricEqBands()
    },
    {
        id: 'bass-lift',
        labelKey: 'settings.eqPresets.bassLift',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 28, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 95, gain: 3.6 },
            { enabled: true, type: 'peaking', frequency: 180, gain: 1.8, q: 0.95 },
            { enabled: true, type: 'peaking', frequency: 520, gain: -0.8, q: 1.15 },
            { enabled: true, type: 'peaking', frequency: 1_500, gain: -0.4, q: 1.1 },
            { enabled: true, type: 'peaking', frequency: 4_200, gain: 0.6, q: 0.9 },
            { enabled: true, type: 'highshelf', frequency: 9_000, gain: 1.2 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'vocal-presence',
        labelKey: 'settings.eqPresets.vocalPresence',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 55, q: 0.82 },
            { enabled: true, type: 'lowshelf', frequency: 120, gain: -1.5 },
            { enabled: true, type: 'peaking', frequency: 280, gain: -1.2, q: 1.2 },
            { enabled: true, type: 'peaking', frequency: 1_200, gain: 1.7, q: 0.95 },
            { enabled: true, type: 'peaking', frequency: 3_100, gain: 2.8, q: 1.2 },
            { enabled: true, type: 'peaking', frequency: 6_000, gain: 1.4, q: 0.9 },
            { enabled: true, type: 'highshelf', frequency: 11_500, gain: 1.8 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'club-smile',
        labelKey: 'settings.eqPresets.clubSmile',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 26, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 100, gain: 3.8 },
            { enabled: true, type: 'peaking', frequency: 250, gain: 1.4, q: 0.85 },
            { enabled: true, type: 'peaking', frequency: 850, gain: -2.4, q: 1.1 },
            { enabled: true, type: 'peaking', frequency: 2_700, gain: 1.6, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 6_500, gain: 2.2, q: 0.9 },
            { enabled: true, type: 'highshelf', frequency: 12_000, gain: 3.1 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'acoustic-detail',
        labelKey: 'settings.eqPresets.acousticDetail',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 38, q: 0.74 },
            { enabled: true, type: 'lowshelf', frequency: 130, gain: -0.8 },
            { enabled: true, type: 'peaking', frequency: 240, gain: -0.6, q: 0.9 },
            { enabled: true, type: 'peaking', frequency: 1_000, gain: 0.8, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 3_200, gain: 1.6, q: 1.2 },
            { enabled: true, type: 'peaking', frequency: 7_200, gain: 1.4, q: 0.85 },
            { enabled: true, type: 'highshelf', frequency: 12_500, gain: 1.9 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'de-ess-and-air',
        labelKey: 'settings.eqPresets.deEssAndAir',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 60, q: 0.85 },
            { enabled: true, type: 'lowshelf', frequency: 140, gain: -1.4 },
            { enabled: true, type: 'peaking', frequency: 350, gain: -0.8, q: 1.1 },
            { enabled: true, type: 'peaking', frequency: 1_800, gain: 0.9, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 5_800, gain: -2.1, q: 2.4 },
            { enabled: true, type: 'peaking', frequency: 8_500, gain: -0.7, q: 1.6 },
            { enabled: true, type: 'highshelf', frequency: 12_000, gain: 2.3 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'electronic',
        labelKey: 'settings.eqPresets.electronic',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 25, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 80, gain: 4.2 },
            { enabled: true, type: 'peaking', frequency: 200, gain: -1.2, q: 1.3 },
            { enabled: true, type: 'peaking', frequency: 600, gain: -1.8, q: 0.9 },
            { enabled: true, type: 'peaking', frequency: 2_500, gain: 1.4, q: 1.1 },
            { enabled: true, type: 'peaking', frequency: 5_500, gain: 2.6, q: 0.85 },
            { enabled: true, type: 'highshelf', frequency: 11_000, gain: 3.4 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'party',
        labelKey: 'settings.eqPresets.party',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 22, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 100, gain: 5.0 },
            { enabled: true, type: 'peaking', frequency: 250, gain: 2.0, q: 0.8 },
            { enabled: true, type: 'peaking', frequency: 700, gain: -2.0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 2_000, gain: 1.2, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 5_000, gain: 3.0, q: 0.75 },
            { enabled: true, type: 'highshelf', frequency: 10_000, gain: 4.5 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'bass-reducer',
        labelKey: 'settings.eqPresets.bassReducer',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 45, q: 0.9 },
            { enabled: true, type: 'lowshelf', frequency: 120, gain: -4.5 },
            { enabled: true, type: 'peaking', frequency: 250, gain: -2.0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 600, gain: 0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 1_800, gain: 0.5, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 5_000, gain: 0.8, q: 0.9 },
            { enabled: true, type: 'highshelf', frequency: 10_000, gain: 1.2 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'treble-boost',
        labelKey: 'settings.eqPresets.trebleBoost',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 30, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 90, gain: -1.0 },
            { enabled: true, type: 'peaking', frequency: 200, gain: 0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 800, gain: 0.5, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 2_500, gain: 2.0, q: 0.9 },
            { enabled: true, type: 'peaking', frequency: 6_000, gain: 3.5, q: 0.8 },
            { enabled: true, type: 'highshelf', frequency: 11_000, gain: 4.8 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    },
    {
        id: 'treble-reducer',
        labelKey: 'settings.eqPresets.trebleReducer',
        bands: createPresetBands([
            { enabled: true, type: 'highpass', frequency: 30, q: 0.71 },
            { enabled: true, type: 'lowshelf', frequency: 90, gain: 1.0 },
            { enabled: true, type: 'peaking', frequency: 200, gain: 0.5, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 600, gain: 0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 2_000, gain: -1.0, q: 1.0 },
            { enabled: true, type: 'peaking', frequency: 5_500, gain: -3.0, q: 0.9 },
            { enabled: true, type: 'highshelf', frequency: 10_000, gain: -4.5 },
            { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
        ])
    }
];

export const getEqPresetById = (presetId: string): ParametricEqPreset | undefined => (
    PARAMETRIC_EQ_PRESETS.find(preset => preset.id === presetId)
);

export const applyEqPreset = (presetId: string): ParametricEqBand[] => (
    cloneBands(getEqPresetById(presetId)?.bands || createDefaultParametricEqBands())
);

export const areEqBandsEqual = (left: ParametricEqBand[], right: ParametricEqBand[]): boolean => {
    if (left.length !== right.length) return false;

    return left.every((band, index) => {
        const other = right[index];
        return (
            band.id === other.id
            && band.enabled === other.enabled
            && band.type === other.type
            && Math.abs(band.frequency - other.frequency) < 0.01
            && Math.abs(band.gain - other.gain) < 0.01
            && Math.abs(band.q - other.q) < 0.01
        );
    });
};

const migrateLegacyGraphicEqBands = (bands: number[]): ParametricEqBand[] => {
    const safe = [...bands];
    while (safe.length < 10) safe.push(0);

    return createPresetBands([
        { enabled: false, type: 'highpass', frequency: 30, q: 0.71 },
        { enabled: true, type: 'lowshelf', frequency: 90, gain: (safe[0] + safe[1]) / 2 },
        { enabled: true, type: 'peaking', frequency: 180, gain: safe[2], q: 1.0 },
        { enabled: true, type: 'peaking', frequency: 540, gain: (safe[3] + safe[4]) / 2, q: 1.0 },
        { enabled: true, type: 'peaking', frequency: 1_600, gain: safe[5], q: 1.0 },
        { enabled: true, type: 'peaking', frequency: 4_800, gain: (safe[6] + safe[7]) / 2, q: 1.0 },
        { enabled: true, type: 'highshelf', frequency: 10_000, gain: (safe[8] + safe[9]) / 2 },
        { enabled: false, type: 'lowpass', frequency: 18_000, q: 0.71 }
    ]);
};

export const coerceParametricEqBands = (value: unknown): ParametricEqBand[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    if (value.every(item => typeof item === 'number' && Number.isFinite(item))) {
        return migrateLegacyGraphicEqBands(value as number[]);
    }

    const defaults = createDefaultParametricEqBands();
    const nextBands = defaults.map((fallback, index) => {
        const raw = value[index];
        if (!isRecord(raw)) return fallback;

        return clampEqBand({
            id: typeof raw.id === 'string' ? raw.id : fallback.id,
            label: typeof raw.label === 'string' ? raw.label : fallback.label,
            enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
            type: isEqFilterType(raw.type) ? raw.type : fallback.type,
            frequency: typeof raw.frequency === 'number' ? raw.frequency : fallback.frequency,
            gain: typeof raw.gain === 'number' ? raw.gain : fallback.gain,
            q: typeof raw.q === 'number' ? raw.q : fallback.q
        }, fallback);
    });

    return nextBands;
};

interface BiquadCoefficients {
    b0: number;
    b1: number;
    b2: number;
    a0: number;
    a1: number;
    a2: number;
}

const getBiquadCoefficients = (band: ParametricEqBand, sampleRate: number): BiquadCoefficients | null => {
    const frequency = clampEqFrequency(band.frequency);
    const q = clampEqQ(band.q);
    const omega = (2 * Math.PI * frequency) / Math.max(1, sampleRate);
    const sin = Math.sin(omega);
    const cos = Math.cos(omega);
    const alpha = sin / (2 * q);
    const A = Math.pow(10, clampEqGain(band.gain) / 40);

    switch (band.type) {
        case 'highpass':
            return {
                b0: (1 + cos) / 2,
                b1: -(1 + cos),
                b2: (1 + cos) / 2,
                a0: 1 + alpha,
                a1: -2 * cos,
                a2: 1 - alpha
            };
        case 'lowshelf': {
            const alphaShelf = sin / Math.SQRT2;
            const beta = 2 * Math.sqrt(A) * alphaShelf;
            return {
                b0: A * ((A + 1) - (A - 1) * cos + beta),
                b1: 2 * A * ((A - 1) - (A + 1) * cos),
                b2: A * ((A + 1) - (A - 1) * cos - beta),
                a0: (A + 1) + (A - 1) * cos + beta,
                a1: -2 * ((A - 1) + (A + 1) * cos),
                a2: (A + 1) + (A - 1) * cos - beta
            };
        }
        case 'peaking':
            return {
                b0: 1 + alpha * A,
                b1: -2 * cos,
                b2: 1 - alpha * A,
                a0: 1 + alpha / A,
                a1: -2 * cos,
                a2: 1 - alpha / A
            };
        case 'notch':
            return {
                b0: 1,
                b1: -2 * cos,
                b2: 1,
                a0: 1 + alpha,
                a1: -2 * cos,
                a2: 1 - alpha
            };
        case 'highshelf': {
            const alphaShelf = sin / Math.SQRT2;
            const beta = 2 * Math.sqrt(A) * alphaShelf;
            return {
                b0: A * ((A + 1) + (A - 1) * cos + beta),
                b1: -2 * A * ((A - 1) + (A + 1) * cos),
                b2: A * ((A + 1) + (A - 1) * cos - beta),
                a0: (A + 1) - (A - 1) * cos + beta,
                a1: 2 * ((A - 1) - (A + 1) * cos),
                a2: (A + 1) - (A - 1) * cos - beta
            };
        }
        case 'lowpass':
            return {
                b0: (1 - cos) / 2,
                b1: 1 - cos,
                b2: (1 - cos) / 2,
                a0: 1 + alpha,
                a1: -2 * cos,
                a2: 1 - alpha
            };
        default:
            return null;
    }
};

const getBiquadMagnitude = (coeffs: BiquadCoefficients, frequency: number, sampleRate: number): number => {
    const omega = (2 * Math.PI * frequency) / Math.max(1, sampleRate);
    const cos = Math.cos(omega);
    const sin = Math.sin(omega);
    const cos2 = Math.cos(omega * 2);
    const sin2 = Math.sin(omega * 2);

    const numeratorReal = coeffs.b0 + coeffs.b1 * cos + coeffs.b2 * cos2;
    const numeratorImag = -(coeffs.b1 * sin + coeffs.b2 * sin2);
    const denominatorReal = coeffs.a0 + coeffs.a1 * cos + coeffs.a2 * cos2;
    const denominatorImag = -(coeffs.a1 * sin + coeffs.a2 * sin2);

    const numerator = numeratorReal * numeratorReal + numeratorImag * numeratorImag;
    const denominator = denominatorReal * denominatorReal + denominatorImag * denominatorImag;

    if (denominator <= 0) return 1;
    return Math.sqrt(Math.max(0, numerator / denominator));
};

export const createEqFrequencySamples = (pointCount: number): number[] => {
    const samples: number[] = [];
    const min = Math.log10(EQ_MIN_FREQUENCY);
    const max = Math.log10(EQ_MAX_FREQUENCY);

    for (let index = 0; index < pointCount; index++) {
        const ratio = pointCount <= 1 ? 0 : index / (pointCount - 1);
        samples.push(Math.pow(10, min + ratio * (max - min)));
    }

    return samples;
};

export const getEqResponseDb = (
    bands: ParametricEqBand[],
    frequencySamples: number[],
    sampleRate: number = EQ_DEFAULT_SAMPLE_RATE,
    eqEnabled: boolean = true
): number[] => {
    if (!eqEnabled) {
        return frequencySamples.map(() => 0);
    }

    return frequencySamples.map(frequency => {
        let magnitude = 1;

        for (const band of bands) {
            if (!band.enabled) continue;
            const coeffs = getBiquadCoefficients(band, sampleRate);
            if (!coeffs) continue;
            magnitude *= getBiquadMagnitude(coeffs, frequency, sampleRate);
        }

        return 20 * Math.log10(Math.max(magnitude, 1e-8));
    });
};

export const getSingleBandResponseDb = (
    band: ParametricEqBand,
    frequencySamples: number[],
    sampleRate: number = EQ_DEFAULT_SAMPLE_RATE
): number[] => {
    if (!band.enabled) {
        return frequencySamples.map(() => 0);
    }

    const coeffs = getBiquadCoefficients(band, sampleRate);
    if (!coeffs) {
        return frequencySamples.map(() => 0);
    }

    return frequencySamples.map(frequency => (
        20 * Math.log10(Math.max(getBiquadMagnitude(coeffs, frequency, sampleRate), 1e-8))
    ));
};
