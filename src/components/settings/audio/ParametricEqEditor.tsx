import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ear, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';
import { audioEngine } from '../../../services/audioEngine';
import {
    areEqBandsEqual,
    clampEqBand,
    createDefaultParametricEqBands,
    createEqFrequencySamples,
    EQ_GRAPH_GAIN_RANGE,
    EQ_MAX_FREQUENCY,
    EQ_MIN_FREQUENCY,
    getEqResponseDb,
    getSingleBandResponseDb,
    supportsEqBandGain,
    supportsEqBandQ,
    type EqFilterType,
    type ParametricEqBand
} from '../../../services/parametricEq';
import { useSettingsView } from '../SettingsViewContext';
import { SpectrumAnalyser } from './SpectrumAnalyser';

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 500;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 20;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 13;
const INNER_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const INNER_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM - 17;
const FREQUENCY_SAMPLES = createEqFrequencySamples(256);
const GRID_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const GRID_GAINS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
const DRAFT_COMMIT_DELAY_MS = 120;
const FREQ_RANGE_MAX = 1000;
type EqFilterLabelKey =
    | 'settings.audio.filterHighpass'
    | 'settings.audio.filterLowshelf'
    | 'settings.audio.filterPeaking'
    | 'settings.audio.filterNotch'
    | 'settings.audio.filterHighshelf'
    | 'settings.audio.filterLowpass';

const FILTER_OPTIONS: Array<{ value: EqFilterType; key: EqFilterLabelKey }> = [
    { value: 'highpass', key: 'settings.audio.filterHighpass' },
    { value: 'lowshelf', key: 'settings.audio.filterLowshelf' },
    { value: 'peaking', key: 'settings.audio.filterPeaking' },
    { value: 'notch', key: 'settings.audio.filterNotch' },
    { value: 'highshelf', key: 'settings.audio.filterHighshelf' },
    { value: 'lowpass', key: 'settings.audio.filterLowpass' }
];

const EQ_BAND_COLORS = [
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#eab308',
    '#f97316',
    '#ef4444',
    '#ec4899'
] as const;

interface DragState {
    index: number;
    mode: 'main' | 'q';
    startY: number;
    startQ: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const cloneBands = (bands: ParametricEqBand[]): ParametricEqBand[] => bands.map(band => ({ ...band }));

const toRgba = (hex: string, alpha: number): string => {
    const clean = hex.replace('#', '');
    const value = clean.length === 3
        ? clean.split('').map(char => char + char).join('')
        : clean;

    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatFrequencyLabel = (value: number): string => (
    value >= 1000
        ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
        : `${Math.round(value)}`
);


const xToFrequency = (x: number): number => {
    const min = Math.log10(EQ_MIN_FREQUENCY);
    const max = Math.log10(EQ_MAX_FREQUENCY);
    return Math.pow(10, min + (x / INNER_WIDTH) * (max - min));
};

const frequencyToX = (frequency: number): number => {
    const min = Math.log10(EQ_MIN_FREQUENCY);
    const max = Math.log10(EQ_MAX_FREQUENCY);
    return ((Math.log10(frequency) - min) / (max - min)) * INNER_WIDTH;
};

const frequencyToSlider = (frequency: number): number => {
    const min = Math.log10(EQ_MIN_FREQUENCY);
    const max = Math.log10(EQ_MAX_FREQUENCY);
    return (((Math.log10(frequency) - min) / (max - min)) * FREQ_RANGE_MAX);
};

const sliderToFrequency = (sliderValue: number): number => {
    const min = Math.log10(EQ_MIN_FREQUENCY);
    const max = Math.log10(EQ_MAX_FREQUENCY);
    return Math.pow(10, min + (sliderValue / FREQ_RANGE_MAX) * (max - min));
};

const yToGain = (y: number): number => {
    const normalized = 1 - (y / INNER_HEIGHT);
    return ((normalized * 2) - 1) * EQ_GRAPH_GAIN_RANGE;
};

const gainToY = (gain: number): number => {
    const normalized = (gain + EQ_GRAPH_GAIN_RANGE) / (EQ_GRAPH_GAIN_RANGE * 2);
    return (1 - normalized) * INNER_HEIGHT;
};

const buildResponsePath = (values: number[]): string => values.map((value, index) => {
    const x = PADDING_LEFT + (index / Math.max(1, values.length - 1)) * INNER_WIDTH;
    const y = PADDING_TOP + gainToY(clamp(value, -EQ_GRAPH_GAIN_RANGE, EQ_GRAPH_GAIN_RANGE));
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
}).join(' ');

const getBandNodeY = (band: ParametricEqBand): number => (
    supportsEqBandGain(band.type)
        ? PADDING_TOP + gainToY(band.gain)
        : PADDING_TOP + INNER_HEIGHT - 12
);

export const ParametricEqEditor: React.FC = () => {
    const { t } = useTranslation();
    const {
        applyEqPreset,
        auditionBandIndex,
        eqBands,
        eqEnabled,
        eqPresets,
        resetEqBand,
        resetEqBands,
        setAuditionBandIndex,
        setEqBands,
        setEqEnabled
    } = useSettingsView();

    const [selectedBandIndex, setSelectedBandIndex] = useState(3);
    const [dragging, setDragging] = useState<DragState | null>(null);
    const [draftBands, setDraftBands] = useState<ParametricEqBand[]>(() => cloneBands(eqBands));
    const [hasLocalChanges, setHasLocalChanges] = useState(false);
    const [hasPendingCommit, setHasPendingCommit] = useState(false);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const commitTimerRef = useRef<number | null>(null);
    const draftBandsRef = useRef<ParametricEqBand[]>(cloneBands(eqBands));
    const selectedBand = draftBands[selectedBandIndex] || draftBands[0];
    const sampleRate = audioEngine.getSampleRate();

    const clearCommitTimer = useCallback(() => {
        if (commitTimerRef.current !== null) {
            window.clearTimeout(commitTimerRef.current);
            commitTimerRef.current = null;
        }
    }, []);

    const applyToAudio = useCallback((bands: ParametricEqBand[]) => {
        audioEngine.setEqState(eqEnabled, bands, auditionBandIndex);
    }, [auditionBandIndex, eqEnabled]);

    const commitDraftBands = useCallback((bands: ParametricEqBand[]) => {
        clearCommitTimer();
        const committed = cloneBands(bands);
        setHasPendingCommit(true);
        setEqBands(committed);
    }, [clearCommitTimer, setEqBands]);

    const updateDraftBands = useCallback((
        updater: (previous: ParametricEqBand[]) => ParametricEqBand[],
        options?: { commit?: boolean }
    ) => {
        const nextBands = updater(draftBandsRef.current);
        draftBandsRef.current = nextBands;
        setDraftBands(nextBands);
        setHasLocalChanges(true);
        applyToAudio(nextBands);

        if (options?.commit) {
            commitDraftBands(nextBands);
            return;
        }

        clearCommitTimer();
        commitTimerRef.current = window.setTimeout(() => {
            commitDraftBands(nextBands);
        }, DRAFT_COMMIT_DELAY_MS);
    }, [clearCommitTimer, commitDraftBands, applyToAudio]);

    useEffect(() => {
        audioEngine.ensureContext();
        return () => {
            clearCommitTimer();
        };
    }, [clearCommitTimer]);

    useEffect(() => {
        draftBandsRef.current = draftBands;
    }, [draftBands]);

    useEffect(() => {
        if (selectedBandIndex < draftBands.length) return;
        setSelectedBandIndex(Math.max(0, draftBands.length - 1));
    }, [draftBands.length, selectedBandIndex]);

    useEffect(() => {
        if (!hasPendingCommit && !hasLocalChanges && !areEqBandsEqual(draftBands, eqBands)) {
            const cloned = cloneBands(eqBands);
            draftBandsRef.current = cloned;
            setDraftBands(cloned);
        }

        if (hasPendingCommit && areEqBandsEqual(draftBands, eqBands)) {
            setHasPendingCommit(false);
            setHasLocalChanges(false);
        }
    }, [draftBands, eqBands, hasLocalChanges, hasPendingCommit]);

    const applyDraftPatch = useCallback((index: number, patch: Partial<ParametricEqBand>, options?: { commit?: boolean }) => {
        updateDraftBands(previous => {
            const next = [...previous];
            const currentBand = next[index];
            if (!currentBand) return previous;
            next[index] = clampEqBand({ ...currentBand, ...patch }, currentBand);
            return next;
        }, options);
    }, [updateDraftBands]);

    const handlePresetChange = useCallback((presetId: string) => {
        if (presetId === 'custom') return;
        const nextBands = eqPresets.find(preset => preset.id === presetId)?.bands;
        if (!nextBands) return;
        const cloned = cloneBands(nextBands);
        draftBandsRef.current = cloned;
        setDraftBands(cloned);
        setHasLocalChanges(true);
        applyToAudio(cloned);
        applyEqPreset(presetId);
    }, [applyEqPreset, applyToAudio, eqPresets]);

    const handleResetEq = useCallback(() => {
        const reset = cloneBands(eqPresets[0]?.bands || createDefaultParametricEqBands());
        draftBandsRef.current = reset;
        setDraftBands(reset);
        setHasLocalChanges(true);
        applyToAudio(reset);
        resetEqBands();
    }, [applyToAudio, eqPresets, resetEqBands]);

    const handleResetBand = useCallback((index: number) => {
        const fallback = createDefaultParametricEqBands()[index];
        const current = draftBandsRef.current[index];
        if (!fallback || !current) return;
        resetEqBand(index);
        const nextBands = cloneBands(draftBandsRef.current);
        nextBands[index] = { ...fallback, id: current.id, label: current.label };
        draftBandsRef.current = nextBands;
        setDraftBands(nextBands);
        setHasLocalChanges(true);
        applyToAudio(nextBands);
        commitDraftBands(nextBands);
    }, [applyToAudio, commitDraftBands, resetEqBand]);

    const selectedPresetId = useMemo(() => (
        eqPresets.find(preset => areEqBandsEqual(draftBands, preset.bands))?.id || 'custom'
    ), [draftBands, eqPresets]);

    const combinedResponse = useMemo(() => (
        getEqResponseDb(draftBands, FREQUENCY_SAMPLES, sampleRate, eqEnabled)
    ), [draftBands, eqEnabled, sampleRate]);

    const bandCurves = useMemo(() => (
        draftBands.map((band, index) => {
            const color = EQ_BAND_COLORS[index % EQ_BAND_COLORS.length];
            const response = getSingleBandResponseDb(band, FREQUENCY_SAMPLES, sampleRate);
            return {
                band,
                color,
                glow: toRgba(color, 0.28),
                path: buildResponsePath(response)
            };
        })
    ), [draftBands, sampleRate]);

    const combinedResponsePath = useMemo(() => buildResponsePath(combinedResponse), [combinedResponse]);

    const getLocalCoordinates = useCallback((event: PointerEvent | React.PointerEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const viewBoxX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
        const viewBoxY = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;

        return {
            x: clamp(viewBoxX - PADDING_LEFT, 0, INNER_WIDTH),
            y: clamp(viewBoxY - PADDING_TOP, 0, INNER_HEIGHT)
        };
    }, []);

    const updateFromPointer = useCallback((event: PointerEvent | React.PointerEvent, state: DragState) => {
        const coords = getLocalCoordinates(event);
        if (!coords) return;

        const band = draftBandsRef.current[state.index];
        if (!band) return;

        const patch: Partial<ParametricEqBand> = {
            frequency: xToFrequency(coords.x)
        };

        if (state.mode === 'main' && supportsEqBandGain(band.type)) {
            patch.gain = yToGain(coords.y);
        } else if (supportsEqBandQ(band.type)) {
            const deltaY = state.startY - event.clientY;
            patch.q = state.startQ * Math.pow(1.0125, deltaY);
        }

        applyDraftPatch(state.index, patch);
    }, [applyDraftPatch, getLocalCoordinates]);

    useEffect(() => {
        if (!dragging) return;

        const handlePointerMove = (event: PointerEvent) => {
            event.preventDefault();
            updateFromPointer(event, dragging);
        };

        const handlePointerUp = () => {
            setDragging(null);
            commitDraftBands(draftBandsRef.current);
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [commitDraftBands, dragging, updateFromPointer]);

    const selectedColor = EQ_BAND_COLORS[selectedBandIndex % EQ_BAND_COLORS.length];

    return (
        <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
                <div>
                    <h2 className="flex items-center gap-3 text-2xl font-black text-white">
                        <SlidersHorizontal className="text-dominant" size={24} />
                        {t('settings.audio.parametricEq')}
                    </h2>
                    <p className="mt-1 text-sm text-gray-400">{t('settings.audio.parametricEqDesc')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        className="min-w-36 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-dominant"
                        onChange={(event) => handlePresetChange(event.target.value)}
                        value={selectedPresetId}
                    >
                        <option value="custom">{t('settings.audio.custom')}</option>
                        {eqPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {t(preset.labelKey)}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={handleResetEq}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/20 hover:bg-white/10"
                    >
                        {t('settings.audio.resetEq')}
                    </button>

                    <button
                        onClick={() => setEqEnabled(previous => !previous)}
                        className={`rounded-xl px-4 py-2 text-sm font-black tracking-[0.18em] transition ${eqEnabled ? 'bg-dominant text-on-dominant shadow-[0_12px_32px_rgba(var(--color-dominant-rgb),0.24)]' : 'bg-white/5 text-gray-400'}`}
                    >
                        {eqEnabled ? t('settings.audio.active') : t('settings.audio.bypass')}
                    </button>
                </div>
            </div>

            {/* Graph + Band Panel */}
            <div className="grid gap-5 xl:grid-cols-[1fr_18rem]">
                {/* Response graph with spectrum visualiser */}
                <div className={`relative rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(var(--color-dominant-rgb),0.10),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.2))] overflow-hidden transition min-h-[320px] ${eqEnabled ? '' : 'opacity-70'}`}>
                    {/* Spectrum analyser canvas (behind SVG) */}
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: `${(PADDING_LEFT / VIEWBOX_WIDTH) * 100}%`,
                            right: `${(PADDING_RIGHT / VIEWBOX_WIDTH) * 100}%`,
                            top: `${(PADDING_TOP / VIEWBOX_HEIGHT) * 100}%`,
                            bottom: `${((PADDING_BOTTOM + 17) / VIEWBOX_HEIGHT) * 100}%`
                        }}
                    >
                        <SpectrumAnalyser enabled={eqEnabled} accentColor={selectedColor} />
                    </div>

                    {/* Band selector pills */}
                    <div className="relative z-10 flex flex-wrap gap-1.5 p-4 pb-0">
                        {bandCurves.map(({ band, color }, index) => (
                            <button
                                key={band.id}
                                onClick={() => setSelectedBandIndex(index)}
                                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${selectedBandIndex === index ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                                style={{
                                    borderColor: selectedBandIndex === index ? color : toRgba(color, 0.3),
                                    backgroundColor: selectedBandIndex === index ? toRgba(color, 0.2) : 'transparent',
                                    boxShadow: selectedBandIndex === index ? `0 0 16px ${toRgba(color, 0.15)}` : undefined
                                }}
                            >
                                {band.label}
                            </button>
                        ))}
                    </div>

                    {/* SVG overlay */}
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                        className="relative z-10 w-full"
                        style={{ display: 'block' }}
                    >
                        <rect
                            x={PADDING_LEFT}
                            y={PADDING_TOP}
                            width={INNER_WIDTH}
                            height={INNER_HEIGHT}
                            fill="rgba(0,0,0,0.12)"
                            stroke="rgba(255,255,255,0.04)"
                        />

                        {GRID_GAINS.map((gain) => {
                            const y = PADDING_TOP + gainToY(gain);
                            return (
                                <g key={gain}>
                                    <line
                                        x1={PADDING_LEFT}
                                        x2={PADDING_LEFT + INNER_WIDTH}
                                        y1={y}
                                        y2={y}
                                        stroke={gain === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)'}
                                        strokeDasharray={gain === 0 ? undefined : '4 8'}
                                    />
                                    <text x={18} y={y + 4} fill="rgba(255,255,255,0.3)" fontSize="10" fontWeight="700">
                                        {gain > 0 ? `+${gain}` : gain}
                                    </text>
                                </g>
                            );
                        })}

                        {GRID_FREQUENCIES.map((frequency) => {
                            const x = PADDING_LEFT + frequencyToX(frequency);
                            return (
                                <g key={frequency}>
                                    <line
                                        x1={x}
                                        x2={x}
                                        y1={PADDING_TOP}
                                        y2={PADDING_TOP + INNER_HEIGHT}
                                        stroke="rgba(255,255,255,0.04)"
                                        strokeDasharray="4 8"
                                    />
                                    <text
                                        x={x}
                                        y={VIEWBOX_HEIGHT - 10}
                                        textAnchor="middle"
                                        fill="rgba(255,255,255,0.3)"
                                        fontSize="10"
                                        fontWeight="700"
                                    >
                                        {formatFrequencyLabel(frequency)}
                                    </text>
                                </g>
                            );
                        })}

                        {selectedBand && (
                            <>
                                <line
                                    x1={PADDING_LEFT + frequencyToX(selectedBand.frequency)}
                                    x2={PADDING_LEFT + frequencyToX(selectedBand.frequency)}
                                    y1={PADDING_TOP}
                                    y2={PADDING_TOP + INNER_HEIGHT}
                                    stroke={toRgba(selectedColor, 0.45)}
                                    strokeWidth="1.5"
                                />
                                {supportsEqBandGain(selectedBand.type) && (
                                    <line
                                        x1={PADDING_LEFT}
                                        x2={PADDING_LEFT + INNER_WIDTH}
                                        y1={PADDING_TOP + gainToY(selectedBand.gain)}
                                        y2={PADDING_TOP + gainToY(selectedBand.gain)}
                                        stroke={toRgba(selectedColor, 0.3)}
                                        strokeWidth="1.5"
                                    />
                                )}
                            </>
                        )}

                        {bandCurves.map(({ band, color, glow, path }, index) => {
                            const emphasized = index === selectedBandIndex;
                            return (
                                <g key={band.id} opacity={band.enabled ? (emphasized ? 0.95 : 0.5) : 0.15}>
                                    <path
                                        d={path}
                                        fill="none"
                                        stroke={glow}
                                        strokeWidth={emphasized ? 7 : 4}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d={path}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={emphasized ? 3 : 1.8}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </g>
                            );
                        })}

                        <path
                            d={`${combinedResponsePath} L ${PADDING_LEFT + INNER_WIDTH} ${PADDING_TOP + INNER_HEIGHT} L ${PADDING_LEFT} ${PADDING_TOP + INNER_HEIGHT} Z`}
                            fill="rgba(255,255,255,0.025)"
                            opacity={eqEnabled ? 1 : 0.4}
                        />
                        <path
                            d={combinedResponsePath}
                            fill="none"
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={eqEnabled ? 1 : 0.5}
                        />

                        {draftBands.map((band, index) => {
                            const color = EQ_BAND_COLORS[index % EQ_BAND_COLORS.length];
                            const x = PADDING_LEFT + frequencyToX(band.frequency);
                            const y = getBandNodeY(band);
                            const selected = index === selectedBandIndex;
                            const solo = auditionBandIndex === index;

                            return (
                                <g key={band.id} transform={`translate(${x}, ${y})`}>
                                    <circle
                                        r={selected ? 18 : 14}
                                        fill={selected ? toRgba(color, 0.22) : 'rgba(8, 10, 14, 0.88)'}
                                        stroke={band.enabled ? color : 'rgba(255,255,255,0.18)'}
                                        strokeWidth={selected ? 3.5 : 2}
                                        className="cursor-pointer"
                                        style={{
                                            filter: selected || solo ? `drop-shadow(0 0 10px ${toRgba(color, 0.35)})` : undefined
                                        }}
                                        onPointerDown={(event) => {
                                            event.preventDefault();
                                            setSelectedBandIndex(index);
                                            const mode = event.altKey || !supportsEqBandGain(band.type) ? 'q' : 'main';
                                            const nextState: DragState = {
                                                index,
                                                mode,
                                                startY: event.clientY,
                                                startQ: band.q
                                            };
                                            setDragging(nextState);
                                            updateFromPointer(event, nextState);
                                        }}
                                        onDoubleClick={() => handleResetBand(index)}
                                        onWheel={(event) => {
                                            event.preventDefault();
                                            if (!supportsEqBandQ(band.type)) return;
                                            setSelectedBandIndex(index);
                                            applyDraftPatch(index, { q: band.q * (event.deltaY > 0 ? 0.93 : 1.075) });
                                        }}
                                    />
                                    <circle
                                        r={selected ? 6 : 4.5}
                                        fill={band.enabled ? color : 'rgba(255,255,255,0.25)'}
                                        pointerEvents="none"
                                    />
                                    <text
                                        x="0"
                                        y={selected ? -26 : -20}
                                        textAnchor="middle"
                                        fill={color}
                                        fontSize={selected ? '11' : '10'}
                                        fontWeight="900"
                                        pointerEvents="none"
                                    >
                                        {band.label}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* Selected band controls */}
                {selectedBand && (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.02] backdrop-blur-sm p-5 flex flex-col justify-between self-stretch">
                        {/* Band header */}
                        <div className="space-y-5 flex-1">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-black text-white tracking-tight">
                                    <span style={{ color: selectedColor }}>{t('settings.audio.band')} {selectedBand.label}</span>
                                </h3>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setAuditionBandIndex(previous => previous === selectedBandIndex ? null : selectedBandIndex)}
                                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${auditionBandIndex === selectedBandIndex ? 'bg-dominant text-on-dominant shadow-lg shadow-dominant/20' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
                                        title={t('settings.audio.audition')}
                                    >
                                        <Ear size={14} />
                                    </button>
                                    <button
                                        onClick={() => applyDraftPatch(selectedBandIndex, { enabled: !selectedBand.enabled }, { commit: true })}
                                        className={`h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${selectedBand.enabled ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-500 border border-white/5'}`}
                                    >
                                        {selectedBand.enabled ? 'ON' : 'OFF'}
                                    </button>
                                    <button
                                        onClick={() => handleResetBand(selectedBandIndex)}
                                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition"
                                        title={t('settings.audio.resetBand')}
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* Filter type */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{t('settings.audio.filterType')}</span>
                                <select
                                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-dominant hover:bg-white/[0.08]"
                                    value={selectedBand.type}
                                    onChange={(event) => applyDraftPatch(selectedBandIndex, { type: event.target.value as EqFilterType }, { commit: true })}
                                >
                                    {FILTER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {t(option.key)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Frequency */}
                            <div className="space-y-2">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{t('settings.audio.frequency')}</span>
                                    <div className="flex items-baseline gap-1">
                                        <input
                                            type="number"
                                            min={EQ_MIN_FREQUENCY}
                                            max={EQ_MAX_FREQUENCY}
                                            step="1"
                                            value={Math.round(selectedBand.frequency)}
                                            onChange={(event) => applyDraftPatch(selectedBandIndex, { frequency: Number(event.target.value) })}
                                            className="w-16 text-right bg-transparent text-sm font-black text-white outline-none border-b border-transparent focus:border-dominant tabular-nums"
                                        />
                                        <span className="text-[10px] text-gray-500 font-semibold">Hz</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max={String(FREQ_RANGE_MAX)}
                                    step="1"
                                    value={frequencyToSlider(selectedBand.frequency)}
                                    onChange={(event) => applyDraftPatch(selectedBandIndex, { frequency: sliderToFrequency(Number(event.target.value)) })}
                                    className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                                />
                            </div>

                            {/* Gain */}
                            <div className={`space-y-2 transition-opacity ${supportsEqBandGain(selectedBand.type) ? '' : 'opacity-20 pointer-events-none'}`}>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{t('settings.audio.gain')}</span>
                                    <div className="flex items-baseline gap-1">
                                        <input
                                            type="number"
                                            min="-24"
                                            max="24"
                                            step="0.5"
                                            disabled={!supportsEqBandGain(selectedBand.type)}
                                            value={supportsEqBandGain(selectedBand.type) ? selectedBand.gain.toFixed(1) : '0.0'}
                                            onChange={(event) => applyDraftPatch(selectedBandIndex, { gain: Number(event.target.value) })}
                                            className="w-14 text-right bg-transparent text-sm font-black text-white outline-none border-b border-transparent focus:border-dominant tabular-nums disabled:text-gray-600"
                                        />
                                        <span className="text-[10px] text-gray-500 font-semibold">dB</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="-24"
                                    max="24"
                                    step="0.5"
                                    disabled={!supportsEqBandGain(selectedBand.type)}
                                    value={supportsEqBandGain(selectedBand.type) ? selectedBand.gain : 0}
                                    onChange={(event) => applyDraftPatch(selectedBandIndex, { gain: Number(event.target.value) })}
                                    className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                                />
                            </div>

                            {/* Q */}
                            <div className={`space-y-2 transition-opacity ${supportsEqBandQ(selectedBand.type) ? '' : 'opacity-20 pointer-events-none'}`}>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Q</span>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="18"
                                        step="0.1"
                                        disabled={!supportsEqBandQ(selectedBand.type)}
                                        value={supportsEqBandQ(selectedBand.type) ? selectedBand.q.toFixed(2) : '0.71'}
                                        onChange={(event) => applyDraftPatch(selectedBandIndex, { q: Number(event.target.value) })}
                                        className="w-14 text-right bg-transparent text-sm font-black text-white outline-none border-b border-transparent focus:border-dominant tabular-nums disabled:text-gray-600"
                                    />
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="18"
                                    step="0.05"
                                    disabled={!supportsEqBandQ(selectedBand.type)}
                                    value={supportsEqBandQ(selectedBand.type) ? selectedBand.q : 0.71}
                                    onChange={(event) => applyDraftPatch(selectedBandIndex, { q: Number(event.target.value) })}
                                    className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Band navigation strip */}
                        <div className="flex gap-1.5 pt-5 mt-5 border-t border-white/5">
                            {draftBands.map((band, idx) => {
                                const c = EQ_BAND_COLORS[idx % EQ_BAND_COLORS.length];
                                const active = idx === selectedBandIndex;
                                return (
                                    <button
                                        key={band.id}
                                        onClick={() => setSelectedBandIndex(idx)}
                                        className={`flex-1 h-8 rounded-lg text-[10px] font-black transition-all ${active ? 'text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                        style={{
                                            backgroundColor: active ? toRgba(c, 0.2) : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${active ? toRgba(c, 0.4) : 'rgba(255,255,255,0.05)'}`,
                                            boxShadow: active ? `0 4px 12px ${toRgba(c, 0.15)}` : undefined
                                        }}
                                    >
                                        <span style={{ color: band.enabled ? c : undefined }}>{band.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

