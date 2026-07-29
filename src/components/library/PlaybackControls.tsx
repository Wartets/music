import React from 'react';
import { Play, Shuffle } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface PlaybackControlsProps {
    trackCount: number;
    onPlayAll: () => void;
    onShuffle?: () => void;
    showShuffle?: boolean;
    variant?: 'default' | 'compact' | 'hero';
    summary?: string;
    className?: string;
    playLabel?: string;
    shuffleLabel?: string;
}

const variantClasses: Record<NonNullable<PlaybackControlsProps['variant']>, { wrapper: string; play: string; shuffle: string; summary: string }> = {
    default: {
        wrapper: 'flex items-center gap-2 flex-wrap',
        play: 'flex items-center gap-2 px-5 py-3 min-h-[48px] bg-dominant text-on-dominant rounded-xl text-sm font-black uppercase tracking-[0.14em] active:scale-95 transition-transform',
        shuffle: 'flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white/10 text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] active:scale-95 hover:bg-white/15',
        summary: 'text-[10px] text-gray-500 font-mono uppercase tracking-wider'
    },
    compact: {
        wrapper: 'flex items-center gap-2 flex-wrap',
        play: 'flex items-center gap-2 px-3 py-2 min-h-[40px] bg-dominant text-on-dominant rounded-xl text-[10px] font-black uppercase tracking-[0.14em] active:scale-95 transition-transform',
        shuffle: 'flex items-center gap-2 px-3 py-2 min-h-[40px] bg-white/10 text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] active:scale-95 hover:bg-white/15',
        summary: 'text-[10px] text-gray-500 font-mono uppercase tracking-wider'
    },
    hero: {
        wrapper: 'flex items-center gap-3 flex-wrap',
        play: 'flex items-center gap-3 px-8 py-4 min-h-[56px] bg-dominant text-on-dominant rounded-xl text-sm font-black uppercase tracking-[0.16em] hover:bg-dominant-light active:scale-95 transition-transform',
        shuffle: 'flex items-center gap-2 px-5 py-3 min-h-[48px] bg-white/10 text-gray-300 rounded-xl text-sm font-black uppercase tracking-[0.14em] active:scale-95 hover:bg-white/15',
        summary: 'text-xs text-gray-600 font-mono uppercase tracking-widest'
    }
};

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
    trackCount,
    onPlayAll,
    onShuffle,
    showShuffle = false,
    variant = 'default',
    summary,
    className,
    playLabel,
    shuffleLabel
}) => {
    const { t } = useTranslation();
    const classes = variantClasses[variant];
    const resolvedPlayLabel = playLabel || t('common.playAll');
    const resolvedShuffleLabel = shuffleLabel || t('player.shuffle');

    if (trackCount === 0) {
        return null;
    }

    return (
        <div className={`${classes.wrapper} ${className || ''}`}>
            {showShuffle && onShuffle && (
                <button onClick={onShuffle} className={classes.shuffle} aria-label={t('player.shuffle')}>
                    <Shuffle size={14} />
                    {resolvedShuffleLabel}
                </button>
            )}
            <button onClick={onPlayAll} className={classes.play} aria-label={t('common.playAll')}>
                <Play size={variant === 'hero' ? 16 : 14} fill="currentColor" />
                {resolvedPlayLabel}
            </button>
            {summary && (
                <span className={classes.summary}>
                    {summary}
                </span>
            )}
        </div>
    );
};
