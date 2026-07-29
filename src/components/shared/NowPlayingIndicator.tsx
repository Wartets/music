import React from 'react';

type Variant = 'dot' | 'bars';

interface NowPlayingIndicatorProps {
    variant?: Variant;
    isAnimating?: boolean;
    className?: string;
}

const PULSE_ANIMATION = 'animate-[nowPlayingPulse_2.4s_ease-in-out_infinite]';

const Dot: React.FC<{ isAnimating: boolean }> = ({ isAnimating }) => (
    <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] ${isAnimating ? PULSE_ANIMATION : ''}`} />
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
