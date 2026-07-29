import React, { useEffect, useRef, useState, useCallback } from 'react';
import { formatDuration } from '../../utils/formatters';
import { persistenceService } from '../../services/persistence';

interface SeekBarProps {
    duration: number;
    position: number;
    isPlaying?: boolean;
    isBuffering?: boolean;
    onSeek: (position: number) => void;
    disabled?: boolean;
}

export const SeekBar: React.FC<SeekBarProps> = ({
    duration,
    position,
    isPlaying = false,
    isBuffering = false,
    onSeek,
    disabled = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [localPosition, setLocalPosition] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    const [showRemaining, setShowRemaining] = useState(() => 
        persistenceService.get('player_time_display_mode') === 'remaining'
    );
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    const isGlowEnabled = persistenceService.get('ui_glow') !== false;

    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || (navigator.maxTouchPoints > 0));
    }, []);

    useEffect(() => {
        if (!isDragging) {
            setLocalPosition(position);
        }
    }, [position, isDragging]);

    const seekCommitRef = useRef(onSeek);

    useEffect(() => {
        seekCommitRef.current = onSeek;
    }, [onSeek]);

    const commitSeek = useCallback((nextPosition: number) => {
        if (disabled || isBuffering) {
            setIsDragging(false);
            return;
        }

        const clamped = Math.max(0, Math.min(duration, nextPosition));
        seekCommitRef.current(clamped);
        setIsDragging(false);

        if (isTouchDevice && 'vibrate' in navigator) {
            navigator.vibrate(5);
        }
    }, [disabled, duration, isBuffering, isTouchDevice]);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerUp = () => {
            commitSeek(localPosition);
        };

        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        return () => {
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [commitSeek, isDragging, localPosition]);

    useEffect(() => {
        return () => {
            setIsDragging(false);
        };
    }, []);

    const handleRangeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalPosition(Number(e.target.value));
    }, []);

    const handleRangePointerDown = useCallback(() => {
        if (disabled || isBuffering) return;
        setIsDragging(true);
        if (isTouchDevice && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
    }, [disabled, isBuffering, isTouchDevice]);

    const handleRangePointerUp = useCallback(() => {
        if (!isDragging) return;
        commitSeek(localPosition);
    }, [commitSeek, isDragging, localPosition]);

    const handleRangeKeyUp = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            commitSeek(localPosition);
        }
    }, [commitSeek, disabled, localPosition]);

    const toggleTimeDisplay = useCallback(() => {
        setShowRemaining(prev => {
            const next = !prev;
            persistenceService.set('player_time_display_mode', next ? 'remaining' : 'elapsed');
            return next;
        });
    }, []);

    const safeDuration = typeof duration === 'number' && !isNaN(duration) ? duration : 0;
    const safePosition = typeof position === 'number' && !isNaN(position) ? position : 0;
    
    const displayPosition = isDragging ? localPosition : safePosition;
    const remaining = safeDuration - displayPosition;
    const percent = safeDuration > 0 ? (displayPosition / safeDuration) * 100 : 0;

    const showThumb = isTouchDevice || isDragging || isHovering || isPlaying;
    const showTooltip = isDragging && !isTouchDevice;

    const shouldShowMarkers = isTouchDevice && duration > 120;
    const markerInterval = duration > 3600 ? 120 : 60;
    const markers = shouldShowMarkers
        ? Array.from({ length: Math.floor(duration / markerInterval) }, (_, i) => (i + 1) * markerInterval)
            .filter(t => t < duration)
        : [];

    const progressPercent = duration > 0 ? (localPosition / duration) * 100 : 0;

    return (
        <div className="relative w-full">
            <div
                ref={containerRef}
                role="slider"
                aria-label="Track progress, use arrow keys to seek"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={Math.round(displayPosition)}
                aria-valuetext={`${formatDuration(displayPosition)} of ${formatDuration(duration)}`}
                aria-orientation="horizontal"
                aria-disabled={disabled || isBuffering}
                tabIndex={disabled ? -1 : 0}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                className="relative h-6 md:h-2 py-2 md:py-0 -my-1 md:my-0 cursor-pointer touch-manipulation select-none"
                style={{ pointerEvents: disabled || isBuffering ? 'none' : 'auto' }}
            >
                <input
                    type="range"
                    min={0}
                    max={safeDuration}
                    step={0.1}
                    value={displayPosition}
                    onChange={handleRangeChange}
                    onPointerDown={handleRangePointerDown}
                    onPointerUp={handleRangePointerUp}
                    onTouchEnd={handleRangePointerUp}
                    onMouseUp={handleRangePointerUp}
                    onKeyUp={handleRangeKeyUp}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={disabled || isBuffering}
                    aria-label="Track progress"
                />

                <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[3px] md:h-[2px] bg-white/10 group-hover:h-[6px] md:group-hover:h-[4px] transition-all pointer-events-none rounded-full" />

                <div
                    className={`absolute inset-y-0 left-0 bg-dominant transition-all rounded-r-full pointer-events-none top-1/2 -translate-y-1/2 h-[3px] md:h-[2px] md:group-hover:h-[4px] ${isGlowEnabled ? 'shadow-[0_0_15px_rgba(var(--color-dominant-rgb),0.5)]' : ''}`}
                    style={{ width: `${isDragging ? progressPercent : percent}%` }}
                />

                <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 md:w-3 bg-white rounded-full shadow-lg transition-all duration-150 z-20 pointer-events-none ${showThumb ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
                    style={{ left: isDragging ? `${progressPercent}%` : `${percent}%` }}
                />

                {showTooltip && (
                    <div
                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded border border-white/10 whitespace-nowrap"
                        style={{ left: `${isDragging ? progressPercent : percent}%` }}
                    >
                        {formatDuration(localPosition)}
                    </div>
                )}
            </div>

            {isTouchDevice && markers.length > 0 && (
                <div className="absolute inset-x-0 top-full mt-0.5 flex justify-between text-[9px] text-white/40 pointer-events-none">
                    {markers.map(time => (
                        <span
                            key={time}
                            className="absolute -translate-x-1/2"
                            style={{ left: `${(time / duration) * 100}%` }}
                        >
                            {formatDuration(time)}
                        </span>
                    ))}
                </div>
            )}

            <div className="hidden md:flex items-center justify-end gap-2 mt-1">
                <button
                    onClick={toggleTimeDisplay}
                    className="text-xs text-white hover:text-dominant transition-colors cursor-pointer tabular-nums"
                    title="Toggle elapsed/remaining"
                >
                    {showRemaining ? `-${formatDuration(remaining)}` : formatDuration(displayPosition)}
                </button>
                <span className="text-xs text-gray-500 tabular-nums">/</span>
                <span className="text-xs text-gray-500 tabular-nums">{formatDuration(duration)}</span>
            </div>

            {isBuffering && (
                <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[6px] overflow-hidden pointer-events-none opacity-30">
                    <div className="absolute inset-y-0 left-0 bg-white/30 shimmer" style={{ width: `calc(${percent}% - 8px)` }} />
                </div>
            )}
        </div>
    );
};