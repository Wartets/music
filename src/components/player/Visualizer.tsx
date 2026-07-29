import React, { useCallback, useEffect, useRef } from 'react';
import { audioEngine } from '../../services/audioEngine';
import { usePlayer } from '../../contexts/PlayerContext';

const TARGET_FPS = 30;

export const Visualizer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const { state } = usePlayer();
    const rafRef = useRef<number | null>(null);
    const dataRef = useRef<Uint8Array | null>(null);
    const frameTimeRef = useRef(0);
    const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

    const cancelFrame = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const clearCanvas = useCallback(() => {
        const context = contextRef.current;
        const { width, height } = sizeRef.current;
        if (!context || width === 0 || height === 0) return;
        context.clearRect(0, 0, width, height);
    }, []);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = contextRef.current || canvas.getContext('2d');
        if (!context) return;

        contextRef.current = context;

        const width = Math.max(1, Math.floor(canvas.clientWidth));
        const height = Math.max(1, Math.floor(canvas.clientHeight));
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(dpr, dpr);

        sizeRef.current = { width, height, dpr };
        clearCanvas();
    }, [clearCanvas]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        contextRef.current = context;
        resizeCanvas();

        const observer = new ResizeObserver(() => {
            resizeCanvas();
        });
        observer.observe(canvas);

        return () => {
            observer.disconnect();
            cancelFrame();
            clearCanvas();
            contextRef.current = null;
        };
    }, [cancelFrame, clearCanvas, resizeCanvas]);

    useEffect(() => {
        if (!state.isPlaying) {
            cancelFrame();
            frameTimeRef.current = 0;
            clearCanvas();
            return;
        }

        const frameInterval = 1000 / TARGET_FPS;
        let cancelled = false;

        const draw = (timestamp: number) => {
            if (cancelled) return;

            rafRef.current = requestAnimationFrame(draw);

            if (document.visibilityState !== 'visible') {
                return;
            }

            if (timestamp - frameTimeRef.current < frameInterval) {
                return;
            }
            frameTimeRef.current = timestamp;

            const context = contextRef.current;
            const analyser = audioEngine.getAnalyser();
            const { width, height } = sizeRef.current;
            if (!context || !analyser || width === 0 || height === 0) {
                return;
            }

            context.clearRect(0, 0, width, height);

            const bufferLength = analyser.frequencyBinCount;
            if (!dataRef.current || dataRef.current.length !== bufferLength) {
                dataRef.current = new Uint8Array(bufferLength);
            }

            analyser.getByteFrequencyData(dataRef.current as any);

            const fillColor = getComputedStyle(document.documentElement).getPropertyValue('--color-dominant').trim() || 'rgba(255, 255, 255, 0.7)';
            const maxBars = Math.min(64, bufferLength);
            const step = Math.max(1, Math.floor(bufferLength / maxBars));
            const barWidth = width / maxBars;
            let x = 0;

            context.fillStyle = fillColor;

            for (let index = 0; index < bufferLength; index += step) {
                const value = dataRef.current[index];
                const barHeight = (value / 255) * height;

                context.globalAlpha = 0.4 + (value / 255) * 0.4;
                context.fillRect(x, height - barHeight, Math.max(1, barWidth - 1), barHeight);
                x += barWidth;
            }

            context.globalAlpha = 1;
        };

        cancelFrame();
        rafRef.current = requestAnimationFrame(draw);

        return () => {
            cancelled = true;
            cancelFrame();
        };
    }, [cancelFrame, clearCanvas, state.isPlaying]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-16 pointer-events-none opacity-80 block transition-opacity duration-300"
            style={{ width: '100%' }}
        />
    );
};
