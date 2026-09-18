import React from 'react';

type Variant = 'dot' | 'bars';

interface NowPlayingIndicatorProps {
    variant?: Variant;
    isAnimating?: boolean;
    className?: string;
}

const PULSE_ANIMATION = 'animate-[nowPlayingPulse_3.6s_ease-in-out_infinite]';

const Dot: React.FC<{ isAnimating: boolean }> = ({ isAnimating }) => (
    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-black/60 backdrop-blur-sm ring-1 ring-white/40 shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
        <div className={`w-2 h-2 rounded-full bg-dominant shadow-[0_0_8px_2px_rgba(var(--color-dominant-rgb),0.85)] ${isAnimating ? PULSE_ANIMATION : ''}`} />
    </div>
);

const BAR_HEIGHTS = [40, 100, 60, 90, 50];

const Bars: React.FC<{ isAnimating: boolean }> = ({ isAnimating }) => (
    <div className="flex items-end gap-1.5 h-8">
        {BAR_HEIGHTS.map((height, i) => (
            <div
                key={i}
                className={`w-1.5 bg-dominant rounded-full ${isAnimating ? PULSE_ANIMATION : ''}`}
                style={{ height: `${height}%`, animationDelay: `${i * 120}ms` }}
            />
        ))}
    </div>
);

export const NowPlayingIndicator: React.FC<NowPlayingIndicatorProps> = ({
    variant = 'dot',
    isAnimating = true,
    className = ''
}) => (
    <div className={className}>
        {variant === 'dot' ? <Dot isAnimating={isAnimating} /> : <Bars isAnimating={isAnimating} />}
    </div>
);

