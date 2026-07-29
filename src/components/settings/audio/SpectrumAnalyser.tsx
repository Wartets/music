import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../../services/audioEngine';

const BAR_COUNT = 160;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;

const logScale = (index: number, total: number): number => {
    const minLog = Math.log10(MIN_FREQ);
    const maxLog = Math.log10(MAX_FREQ);
    return Math.pow(10, minLog + (index / total) * (maxLog - minLog));
};

interface SpectrumAnalyserProps {
    enabled: boolean;
    accentColor?: string;
}

export const SpectrumAnalyser: React.FC<SpectrumAnalyserProps> = ({ enabled, accentColor = '#3b82f6' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const prevBarsRef = useRef<Float32Array | null>(null);
    const accentRef = useRef(accentColor);
    accentRef.current = accentColor;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        if (!enabled) {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = 0;
            }
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const draw = () => {
            const analyser = audioEngine.getSpectrumAnalyser();
            if (!analyser) {
                animFrameRef.current = requestAnimationFrame(draw);
                return;
            }

            const bufferLength = analyser.frequencyBinCount;
            if (!dataArrayRef.current || dataArrayRef.current.length !== bufferLength) {
                dataArrayRef.current = new Uint8Array(bufferLength);
            }
            if (!prevBarsRef.current || prevBarsRef.current.length !== BAR_COUNT) {
                prevBarsRef.current = new Float32Array(BAR_COUNT);
            }

            analyser.getByteFrequencyData(dataArrayRef.current as unknown as Uint8Array<ArrayBuffer>);

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;

            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
                canvas.width = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const sampleRate = audioEngine.getSampleRate();
            const nyquist = sampleRate / 2;
            const binWidth = nyquist / bufferLength;
            const barWidth = w / BAR_COUNT;
            const gap = Math.max(0.5, barWidth * 0.08);
            const barNetWidth = barWidth - gap;
            const color = accentRef.current;

            for (let i = 0; i < BAR_COUNT; i++) {
                const freqLow = logScale(i, BAR_COUNT);
                const freqHigh = logScale(i + 1, BAR_COUNT);

                const binLow = Math.max(0, Math.floor(freqLow / binWidth));
                const binHigh = Math.min(bufferLength - 1, Math.ceil(freqHigh / binWidth));

                let sum = 0;
                let count = 0;
                for (let bin = binLow; bin <= binHigh; bin++) {
                    sum += dataArrayRef.current[bin];
                    count++;
                }
                const avg = count > 0 ? sum / count : 0;

                const normalized = avg / 255;
                const dbScale = normalized > 0 ? 1 + Math.log10(Math.max(normalized, 0.001)) / 3 : 0;
                const raw = Math.max(0, Math.min(1, dbScale));

                const prev = prevBarsRef.current[i];
                const smoothed = raw > prev
                    ? prev + (raw - prev) * 0.55
                    : prev + (raw - prev) * 0.1;
                prevBarsRef.current[i] = smoothed;

                const barHeight = Math.max(0.5, smoothed * h * 0.82);
                const x = i * barWidth + gap / 2;
                const y = h - barHeight;

                const gradient = ctx.createLinearGradient(x, h, x, y);
                gradient.addColorStop(0, color + '05');
                gradient.addColorStop(0.6, color + '22');
                gradient.addColorStop(1, color + '55');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                const radius = Math.min(1, barNetWidth / 3);
                ctx.roundRect(x, y, barNetWidth, barHeight, [radius, radius, 0, 0]);
                ctx.fill();
            }

            animFrameRef.current = requestAnimationFrame(draw);
        };

        animFrameRef.current = requestAnimationFrame(draw);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = 0;
        };
    }, [enabled]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full pointer-events-none"
            style={{ display: 'block' }}
        />
    );
};
