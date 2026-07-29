import { TrackItem } from '../types/music';
import { dbService } from './db';
import { createDefaultParametricEqBands, supportsEqBandGain, type EqFilterType, type ParametricEqBand } from './parametricEq';

// Crossfade bounds exported so UI and persistence can use the same canonical limits
export const CROSSFADE_MIN = 0.5;
export const CROSSFADE_MAX = 12;
export const CROSSFADE_DEFAULT = 3;

export type AudioPlaybackErrorCode =
    | 'media_aborted'
    | 'media_network'
    | 'media_decode'
    | 'format_unsupported'
    | 'autoplay_blocked'
    | 'playback_interrupted'
    | 'unknown';

export class AudioPlaybackError extends Error {
    public readonly code: AudioPlaybackErrorCode;

    constructor(code: AudioPlaybackErrorCode, message: string) {
        super(message);
        this.name = 'AudioPlaybackError';
        this.code = code;
    }
}

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private audioElement: HTMLAudioElement;
    private secondaryAudioElement: HTMLAudioElement;
    private sourceNode1: MediaElementAudioSourceNode | null = null;
    private sourceNode2: MediaElementAudioSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private secondaryGainNode: GainNode | null = null;
    private masterGainNode: GainNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    private spectrumAnalyserNode: AnalyserNode | null = null;
    private eqInputNode: GainNode | null = null;
    private eqOutputNode: GainNode | null = null;
    private eqBands: Array<{
        input: GainNode;
        filter: BiquadFilterNode;
        dryGain: GainNode;
        wetGain: GainNode;
        output: GainNode;
    }> = [];
    private eqEnabled: boolean = false;
    private eqSettings: ParametricEqBand[] = createDefaultParametricEqBands();
    private auditionBandIndex: number | null = null;
    private auditionDryGainNode: GainNode | null = null;
    private auditionWetGainNode: GainNode | null = null;
    private auditionFilterNode: BiquadFilterNode | null = null;
    private currentTrack: TrackItem | null = null;
    private nextTrackPreloaded: TrackItem | null = null;
    private activeAudioElement: 1 | 2 = 1;
    private normalizationEnabled: boolean = false;
    private normalizationStrength: number = 45;
    private normalizationMultiplier: number = 1;
    private normalizationBuffer: Uint8Array | null = null;
    private lastNormalizationAt: number = 0;
    private userVolume: number = 1;
    private userPlaybackRate: number = 1;
    private djBurstTimer: number | null = null;
    private crossfadeTimer: number | null = null;
    private crossfadeAnimationFrame: number | null = null;
    private playInvocationDepth: number = 0;

    // Crossfade configuration
    private crossfadeEnabled: boolean = false;
    private crossfadeDuration: number = 3;

    public getAnalyser(): AnalyserNode | null {
        return this.analyserNode;
    }

    public getSpectrumAnalyser(): AnalyserNode | null {
        return this.spectrumAnalyserNode;
    }

    public ensureContext(): void {
        if (!this.audioContext) {
            this.initAudioContext();
        }
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    public onTimeUpdate?: (currentTime: number, duration: number) => void;
    public onEnded?: () => void;
    public onPlay?: () => void;
    public onPause?: () => void;
    public onError?: (error: Error) => void;

    constructor() {
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        this.audioElement.volume = 1;
        this.applyPitchPreservation(this.audioElement);

        this.secondaryAudioElement = new Audio();
        this.secondaryAudioElement.crossOrigin = "anonymous";
        this.secondaryAudioElement.volume = 1;
        this.applyPitchPreservation(this.secondaryAudioElement);

        this.setupListeners();
    }

    private applyPitchPreservation(el: HTMLAudioElement): void {
        // Browser support varies (`preservesPitch`, `webkitPreservesPitch`, etc.).
        // Keep all of them aligned to maximize the chance of smooth, less noisy
        // time-stretching when playback speed is changed.
        try {
            (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
            (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
            (el as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
            (el as HTMLAudioElement & { msPreservesPitch?: boolean }).msPreservesPitch = true;
        } catch {
            // best effort
        }
    }

    private applyPlaybackRateToElement(el: HTMLAudioElement, rate: number): void {
        const clampedRate = this.clamp(rate, 0.25, 4);
        el.defaultPlaybackRate = clampedRate;
        el.playbackRate = clampedRate;
        this.applyPitchPreservation(el);
    }

    private setupListeners() {
        const setupForElement = (el: HTMLAudioElement) => {
            el.addEventListener('timeupdate', () => {
                if (this.getActiveElement() === el) {
                    this.updateNormalization();
                    if (this.onTimeUpdate) {
                        this.onTimeUpdate(el.currentTime, el.duration || 0);
                    }
                }
            });

            el.addEventListener('ended', () => {
                if (this.getActiveElement() === el && this.onEnded) {
                    this.onEnded();
                }
            });

            el.addEventListener('play', () => {
                if (this.getActiveElement() === el && this.onPlay) this.onPlay();
            });

            el.addEventListener('pause', () => {
                if (this.getActiveElement() === el && this.onPause) this.onPause();
            });

            el.addEventListener('error', () => {
                if (this.getActiveElement() === el && this.onError) {
                    if (this.playInvocationDepth > 0) return;
                    this.onError(this.createMediaError(el.error));
                }
            });
        };

        setupForElement(this.audioElement);
        setupForElement(this.secondaryAudioElement);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private mapEqFilterType(type: EqFilterType): BiquadFilterType {
        return type;
    }

    private smoothParam(param: AudioParam, value: number, timeConstant: number = 0.008): void {
        if (!this.audioContext) {
            param.value = value;
            return;
        }

        const now = this.audioContext.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, timeConstant);
    }

    private createEqBandUnit(ctx: AudioContext) {
        const input = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();
        const output = ctx.createGain();

        input.connect(dryGain);
        input.connect(filter);
        filter.connect(wetGain);
        dryGain.connect(output);
        wetGain.connect(output);

        dryGain.gain.value = 1;
        wetGain.gain.value = 0;

        return {
            input,
            filter,
            dryGain,
            wetGain,
            output
        };
    }

    private applyEqBand(index: number): void {
        if (!this.audioContext) return;

        const bandState = this.eqSettings[index];
        const bandUnit = this.eqBands[index];
        if (!bandState || !bandUnit) return;

        bandUnit.filter.type = this.mapEqFilterType(bandState.type);
        this.smoothParam(bandUnit.filter.frequency, this.clamp(bandState.frequency, 20, 20_000));
        this.smoothParam(bandUnit.filter.Q, this.clamp(bandState.q, 0.1, 18));
        this.smoothParam(bandUnit.filter.gain, supportsEqBandGain(bandState.type) ? this.clamp(bandState.gain, -24, 24) : 0);

        const active = this.eqEnabled && bandState.enabled;
        this.smoothParam(bandUnit.dryGain.gain, active ? 0 : 1, 0.012);
        this.smoothParam(bandUnit.wetGain.gain, active ? 1 : 0, 0.012);
    }

    private applyAuditionState(): void {
        if (!this.audioContext || !this.auditionDryGainNode || !this.auditionWetGainNode || !this.auditionFilterNode) {
            return;
        }

        const band = this.auditionBandIndex === null ? null : this.eqSettings[this.auditionBandIndex] || null;
        if (!band) {
            this.smoothParam(this.auditionDryGainNode.gain, 1, 0.012);
            this.smoothParam(this.auditionWetGainNode.gain, 0, 0.012);
            return;
        }

        if (band.type === 'highpass' || band.type === 'lowpass') {
            this.auditionFilterNode.type = this.mapEqFilterType(band.type);
        } else if (band.type === 'lowshelf') {
            this.auditionFilterNode.type = 'lowpass';
        } else if (band.type === 'highshelf') {
            this.auditionFilterNode.type = 'highpass';
        } else {
            this.auditionFilterNode.type = 'bandpass';
        }

        this.smoothParam(this.auditionFilterNode.frequency, this.clamp(band.frequency, 20, 20_000));
        this.smoothParam(this.auditionFilterNode.Q, this.clamp(band.q, 0.1, 18));
        this.smoothParam(this.auditionFilterNode.gain, 0);
        this.smoothParam(this.auditionDryGainNode.gain, 0, 0.012);
        this.smoothParam(this.auditionWetGainNode.gain, 1, 0.012);
    }

    private applyEqState(): void {
        this.eqBands.forEach((_, index) => this.applyEqBand(index));
        this.applyAuditionState();
    }

    private getEffectiveVolume(): number {
        const normalization = this.normalizationEnabled ? this.normalizationMultiplier : 1;
        return this.clamp(this.userVolume * normalization, 0, 1);
    }

    private applyMasterVolume(): void {
        const effective = this.getEffectiveVolume();
        if (this.masterGainNode && this.audioContext) {
            this.masterGainNode.gain.setTargetAtTime(effective, this.audioContext.currentTime, 0.02);
        } else {
            this.audioElement.volume = effective;
            this.secondaryAudioElement.volume = effective;
        }
    }

    private applyPlaybackRate(): void {
        const rate = this.clamp(this.userPlaybackRate, 0.25, 4);
        this.applyPlaybackRateToElement(this.audioElement, rate);
        this.applyPlaybackRateToElement(this.secondaryAudioElement, rate);
    }

    private updateNormalization(): void {
        if (!this.normalizationEnabled) {
            if (this.normalizationMultiplier !== 1) {
                this.normalizationMultiplier = 1;
                this.applyMasterVolume();
            }
            return;
        }

        const now = Date.now();
        if (now - this.lastNormalizationAt < 200) return;
        this.lastNormalizationAt = now;

        if (!this.analyserNode) return;
        if (!this.normalizationBuffer || this.normalizationBuffer.length !== this.analyserNode.fftSize) {
            this.normalizationBuffer = new Uint8Array(this.analyserNode.fftSize);
        }

        this.analyserNode.getByteTimeDomainData(this.normalizationBuffer as unknown as Uint8Array<ArrayBuffer>);

        let sumSquares = 0;
        for (let i = 0; i < this.normalizationBuffer.length; i++) {
            const normalized = (this.normalizationBuffer[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / this.normalizationBuffer.length);
        if (!Number.isFinite(rms)) return;

        const targetRms = 0.13;
        const desired = rms > 0.01 ? this.clamp(targetRms / rms, 0.65, 1.5) : 1;
        const strengthFactor = this.clamp(this.normalizationStrength / 100, 0, 1);
        const weightedDesired = 1 + (desired - 1) * strengthFactor;
        const smoothing = 0.08;
        this.normalizationMultiplier = this.clamp(
            this.normalizationMultiplier + (weightedDesired - this.normalizationMultiplier) * smoothing,
            0.55,
            1.6
        );

        this.applyMasterVolume();
    }

    private getActiveElement(): HTMLAudioElement {
        return this.activeAudioElement === 1 ? this.audioElement : this.secondaryAudioElement;
    }

    private getInactiveElement(): HTMLAudioElement {
        return this.activeAudioElement === 1 ? this.secondaryAudioElement : this.audioElement;
    }

    private getActiveGainNode(): GainNode | null {
        return this.activeAudioElement === 1 ? this.gainNode : this.secondaryGainNode;
    }

    private cancelCrossfade(): void {
        if (this.crossfadeTimer !== null) {
            window.clearTimeout(this.crossfadeTimer);
            this.crossfadeTimer = null;
        }
        if (this.crossfadeAnimationFrame !== null) {
            cancelAnimationFrame(this.crossfadeAnimationFrame);
            this.crossfadeAnimationFrame = null;
        }
    }

    private performCrossfade(
        fadeOutEl: HTMLAudioElement,
        fadeOutGain: GainNode,
        fadeInGain: GainNode,
        durationSeconds: number
    ): void {
        this.cancelCrossfade();

        const duration = Math.max(0.3, durationSeconds);

        if (!this.audioContext) {
            fadeOutEl.pause();
            return;
        }

        const now = this.audioContext.currentTime;

        // Fade out: current volume → 0 using exponential ramp for natural feel
        fadeOutGain.gain.cancelScheduledValues(now);
        fadeOutGain.gain.setValueAtTime(fadeOutGain.gain.value || 1, now);
        fadeOutGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Fade in: 0 → 1 using exponential ramp
        fadeInGain.gain.cancelScheduledValues(now);
        fadeInGain.gain.setValueAtTime(0.001, now);
        fadeInGain.gain.exponentialRampToValueAtTime(1, now + duration);

        // Pause the faded-out element after the crossfade completes
        this.crossfadeTimer = window.setTimeout(() => {
            fadeOutEl.pause();
            fadeOutEl.currentTime = 0;
            fadeOutGain.gain.cancelScheduledValues(0);
            fadeOutGain.gain.setValueAtTime(0, this.audioContext?.currentTime || 0);
            this.crossfadeTimer = null;
        }, duration * 1000 + 50);
    }

    triggerDjBurst(options?: { intensity?: number; holdMs?: number }): void {
        const el = this.getActiveElement();
        if (!this.currentTrack || el.paused) return;

        if (this.djBurstTimer) {
            window.clearTimeout(this.djBurstTimer);
            this.djBurstTimer = null;
        }

        const intensity = this.clamp(options?.intensity ?? 0.4, 0.1, 1);
        const holdFactor = this.clamp((options?.holdMs ?? 120) / 900, 0, 1);
        const originalRate = this.clamp(this.userPlaybackRate, 0.25, 4);
        const burstRate = this.clamp(originalRate * (1 + 0.02 + intensity * 0.03), originalRate, originalRate * 1.055);
        const burstDurationMs = Math.round(this.clamp(95 + intensity * 130 + holdFactor * 90, 95, 320));
        const gainBoost = this.clamp(1 + 0.01 + intensity * 0.02, 1.01, 1.03);
        const gainNode = this.getActiveGainNode();
        const now = this.audioContext?.currentTime || 0;

        el.playbackRate = burstRate;

        if (this.audioContext && gainNode) {
            const currentGain = gainNode.gain.value;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(currentGain, now);
            gainNode.gain.linearRampToValueAtTime(this.clamp(currentGain * gainBoost, 0, 1.5), now + 0.035);
            gainNode.gain.linearRampToValueAtTime(currentGain, now + burstDurationMs / 1000);
        }

        this.djBurstTimer = window.setTimeout(() => {
            this.applyPlaybackRateToElement(el, originalRate);
            this.djBurstTimer = null;
        }, burstDurationMs);
    }

    private buildTrackSourceCandidates(track: TrackItem): string[] {
        const path = track.file?.path || '';
        if (!path) return [];

        const candidates = new Set<string>(dbService.getAssetCandidates(path));
        const ext = (track.file?.ext || '').toLowerCase();

        if (ext === 'm4a' && !/_compatible_aac\.m4a$/i.test(path)) {
            const compatiblePath = path.replace(/\.m4a$/i, '_compatible_aac.m4a');
            dbService.getAssetCandidates(compatiblePath).forEach(candidate => candidates.add(candidate));
        }

        return Array.from(candidates);
    }

    private shouldRetryWithAlternateSource(error: AudioPlaybackError): boolean {
        return error.code === 'media_network' || error.code === 'media_decode' || error.code === 'format_unsupported';
    }

    private async playElement(el: HTMLAudioElement, track?: TrackItem): Promise<void> {
        const sourceCandidates = track ? this.buildTrackSourceCandidates(track) : [];
        const playCandidates = sourceCandidates.length > 0 ? sourceCandidates : [el.src].filter(Boolean);

        let lastError: AudioPlaybackError | null = null;
        this.playInvocationDepth += 1;

        try {
            for (const candidate of playCandidates) {
                if (!candidate) continue;

                const resolvedCandidate = new URL(candidate, window.location.href).href;
                if (el.src !== resolvedCandidate) {
                    this.applyPlaybackRateToElement(el, this.userPlaybackRate);
                    el.src = candidate;
                    el.load();
                }

                // Ensure rate/pitch settings survive load() and are in place before play().
                this.applyPlaybackRateToElement(el, this.userPlaybackRate);

                try {
                    await el.play();
                    this.applyPlaybackRateToElement(el, this.userPlaybackRate);
                    return;
                } catch (error) {
                    const playbackError = this.normalizePlaybackException(error);
                    lastError = playbackError;

                    if (!this.shouldRetryWithAlternateSource(playbackError)) {
                        break;
                    }
                }
            }

            const finalError = lastError || new AudioPlaybackError('unknown', 'Unknown playback failure.');
            throw finalError;
        } finally {
            this.playInvocationDepth = Math.max(0, this.playInvocationDepth - 1);
        }
    }

    private initAudioContext() {
        if (!this.audioContext && typeof window !== 'undefined') {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.audioContext = ctx;

            this.sourceNode1 = ctx.createMediaElementSource(this.audioElement);
            this.sourceNode2 = ctx.createMediaElementSource(this.secondaryAudioElement);

            // Per-element gain nodes — used for crossfade control
            this.gainNode = ctx.createGain();
            this.gainNode.gain.value = 1;

            this.secondaryGainNode = ctx.createGain();
            this.secondaryGainNode.gain.value = 0;

            // Master gain — used for volume control and normalization
            this.masterGainNode = ctx.createGain();
            this.masterGainNode.gain.value = this.getEffectiveVolume();

            this.analyserNode = ctx.createAnalyser();
            this.analyserNode.fftSize = 256;

            this.spectrumAnalyserNode = ctx.createAnalyser();
            this.spectrumAnalyserNode.fftSize = 4096;
            this.spectrumAnalyserNode.smoothingTimeConstant = 0.75;

            this.eqInputNode = ctx.createGain();
            this.eqOutputNode = ctx.createGain();
            this.eqBands = this.eqSettings.map(() => this.createEqBandUnit(ctx));
            this.auditionDryGainNode = ctx.createGain();
            this.auditionWetGainNode = ctx.createGain();
            this.auditionFilterNode = ctx.createBiquadFilter();
            this.auditionDryGainNode.gain.value = 1;
            this.auditionWetGainNode.gain.value = 0;

            // Signal chain:
            // source1 → gainNode (crossfade) ─┐
            //                                  ├→ EQ chain → masterGain → analyser → destination
            // source2 → secondaryGainNode ────┘
            this.sourceNode1.connect(this.gainNode);
            this.sourceNode2.connect(this.secondaryGainNode);

            this.gainNode.connect(this.eqInputNode);
            this.secondaryGainNode.connect(this.eqInputNode);

            let previousNode: AudioNode = this.eqInputNode;
            this.eqBands.forEach((bandUnit) => {
                previousNode.connect(bandUnit.input);
                previousNode = bandUnit.output;
            });
            previousNode.connect(this.eqOutputNode);

            this.eqOutputNode.connect(this.auditionDryGainNode);
            this.eqOutputNode.connect(this.auditionFilterNode);
            this.auditionFilterNode.connect(this.auditionWetGainNode);
            this.auditionDryGainNode.connect(this.masterGainNode);
            this.auditionWetGainNode.connect(this.masterGainNode);
            this.masterGainNode.connect(this.analyserNode);
            this.masterGainNode.connect(this.spectrumAnalyserNode);
            this.analyserNode.connect(ctx.destination);

            // HTMLAudioElement volume must be 1 — all volume control through Web Audio
            this.audioElement.volume = 1;
            this.secondaryAudioElement.volume = 1;
            this.applyEqState();
        }
    }

    private createMediaError(error: MediaError | null): AudioPlaybackError {
        if (!error) {
            return new AudioPlaybackError('unknown', 'Unknown audio error.');
        }

        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                return new AudioPlaybackError('media_aborted', 'Playback was interrupted before completion.');
            case error.MEDIA_ERR_NETWORK:
                return new AudioPlaybackError('media_network', 'Network or file access error while loading audio.');
            case error.MEDIA_ERR_DECODE:
                return new AudioPlaybackError('media_decode', 'This file could not be decoded by the audio engine.');
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                return new AudioPlaybackError('format_unsupported', 'This audio format is not supported in your browser.');
            default:
                return new AudioPlaybackError('unknown', 'Unknown audio error.');
        }
    }

    private normalizePlaybackException(error: unknown): AudioPlaybackError {
        if (error instanceof AudioPlaybackError) return error;
        if (error instanceof DOMException) {
            if (error.name === 'NotAllowedError') {
                return new AudioPlaybackError('autoplay_blocked', 'Playback is blocked by browser autoplay policy.');
            }
            if (error.name === 'AbortError') {
                return new AudioPlaybackError('playback_interrupted', 'Playback request was interrupted.');
            }
            if (error.name === 'NotSupportedError') {
                return new AudioPlaybackError('format_unsupported', 'This file format is not supported.');
            }
        }
        if (error instanceof Error) {
            return new AudioPlaybackError('unknown', error.message || 'Unknown playback failure.');
        }
        return new AudioPlaybackError('unknown', 'Unknown playback failure.');
    }

    private switchActiveElement(): void {
        this.activeAudioElement = this.activeAudioElement === 1 ? 2 : 1;
    }

    setCrossfade(enabled: boolean, duration: number): void {
        this.crossfadeEnabled = enabled;
        this.crossfadeDuration = this.clamp(duration, CROSSFADE_MIN, CROSSFADE_MAX);
    }

    setEqState(enabled: boolean, bands: ParametricEqBand[], auditionBandIndex: number | null): void {
        this.eqEnabled = enabled;
        this.eqSettings = bands.map((band) => ({ ...band }));
        this.auditionBandIndex = typeof auditionBandIndex === 'number' ? auditionBandIndex : null;
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
        this.applyEqState();
    }

    getSampleRate(): number {
        return this.audioContext?.sampleRate || 48_000;
    }

    async play(track?: TrackItem, isEndOfTrackTransition: boolean = false): Promise<void> {
        if (track) {
            const isDifferentTrack = this.currentTrack?.logic.hash_sha256 !== track.logic.hash_sha256;
            const isPreloaded = this.nextTrackPreloaded?.logic.hash_sha256 === track.logic.hash_sha256;

            if (isDifferentTrack) {
                if (!this.audioContext) {
                    this.initAudioContext();
                }

                const shouldCrossfade = this.crossfadeEnabled
                    && this.currentTrack !== null
                    && (isEndOfTrackTransition || !this.getActiveElement().paused);

                if (isPreloaded) {
                    const fadeOutEl = this.getActiveElement();
                    const fadeOutGain = this.getActiveGainNode()!;

                    this.switchActiveElement();
                    const fadeInEl = this.getActiveElement();
                    const fadeInGain = this.getActiveGainNode()!;

                    this.currentTrack = track;
                    this.nextTrackPreloaded = null;

                    if (shouldCrossfade && fadeOutGain && fadeInGain) {
                        this.performCrossfade(fadeOutEl, fadeOutGain, fadeInGain, this.crossfadeDuration);
                    } else {
                        this.cancelCrossfade();
                        fadeOutEl.pause();
                        if (fadeInGain && this.audioContext) {
                            fadeInGain.gain.cancelScheduledValues(this.audioContext.currentTime);
                            fadeInGain.gain.setValueAtTime(1, this.audioContext.currentTime);
                        }
                    }

                    await this.playElement(fadeInEl, track);
                } else {
                    const relativePath = this.buildTrackSourceCandidates(track)[0]
                        || dbService.getRelativePath(track.file.path);

                    if (shouldCrossfade) {
                        const fadeOutEl = this.getActiveElement();
                        const fadeOutGain = this.getActiveGainNode()!;

                        this.switchActiveElement();
                        const fadeInEl = this.getActiveElement();
                        const fadeInGain = this.getActiveGainNode()!;

                        fadeInEl.src = relativePath;
                        this.currentTrack = track;

                        if (fadeOutGain && fadeInGain) {
                            this.performCrossfade(fadeOutEl, fadeOutGain, fadeInGain, this.crossfadeDuration);
                        }

                        await this.playElement(fadeInEl, track);
                    } else {
                        this.cancelCrossfade();
                        const activeEl = this.getActiveElement();
                        const activeGain = this.getActiveGainNode();
                        activeEl.src = relativePath;
                        this.currentTrack = track;

                        if (activeGain && this.audioContext) {
                            activeGain.gain.cancelScheduledValues(this.audioContext.currentTime);
                            activeGain.gain.setValueAtTime(1, this.audioContext.currentTime);
                        }

                        await this.playElement(activeEl, track);
                    }
                }
            } else {
                await this.playElement(this.getActiveElement(), track);
            }
        } else {
            await this.playElement(this.getActiveElement(), this.currentTrack || undefined);
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    load(track: TrackItem, position: number = 0): void {
        this.currentTrack = track;
        const relativePath = this.buildTrackSourceCandidates(track)[0] || dbService.getRelativePath(track.file.path);
        const activeEl = this.getActiveElement();
        this.applyPlaybackRateToElement(activeEl, this.userPlaybackRate);
        activeEl.src = relativePath;
        activeEl.currentTime = position;
        this.applyPlaybackRate();
    }

    pause(): void {
        this.cancelCrossfade();
        this.getActiveElement().pause();
    }

    setVolume(level: number): void {
        this.userVolume = this.clamp(level, 0, 1);
        this.applyMasterVolume();
    }

    setPlaybackRate(rate: number): void {
        this.userPlaybackRate = this.clamp(rate, 0.25, 4);
        this.applyPlaybackRate();
    }

    getPlaybackRate(): number {
        return this.userPlaybackRate;
    }

    setVolumeNormalization(enabled: boolean, strength: number): void {
        this.normalizationEnabled = enabled;
        this.normalizationStrength = this.clamp(strength, 0, 100);
        if (!enabled) {
            this.normalizationMultiplier = 1;
        }
        this.applyMasterVolume();
    }

    seek(time: number): void {
        this.getActiveElement().currentTime = time;
    }

    getCurrentTime(): number {
        const time = Number(this.getActiveElement().currentTime);
        return Number.isFinite(time) ? Math.max(0, time) : 0;
    }

    stop(): void {
        this.cancelCrossfade();
        const el = this.getActiveElement();
        el.pause();
        el.currentTime = 0;
    }

    cleanup(): void {
        this.cancelCrossfade();
        if (this.djBurstTimer) {
            window.clearTimeout(this.djBurstTimer);
            this.djBurstTimer = null;
        }
    }

    seekRelative(seconds: number): void {
        const el = this.getActiveElement();
        const target = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
        el.currentTime = target;
    }

    prepareGapless(nextTrack: TrackItem): void {
        if (!nextTrack) return;
        this.nextTrackPreloaded = nextTrack;
        const relativePath = this.buildTrackSourceCandidates(nextTrack)[0]
            || dbService.getRelativePath(nextTrack.file.path);

        const inactiveEl = this.getInactiveElement();
        this.applyPlaybackRateToElement(inactiveEl, this.userPlaybackRate);
        inactiveEl.src = relativePath;
        inactiveEl.preload = 'auto';
        inactiveEl.load();
        this.applyPlaybackRate();
    }

    shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

export const audioEngine = new AudioEngine();

