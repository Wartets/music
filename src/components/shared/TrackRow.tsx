import React from 'react';
import { Star } from 'lucide-react';
import { TrackItem } from '../../types/music';
import { ArtworkImage } from './ArtworkImage';
import { HighlightText } from './HighlightText';
import { getBestArtwork } from '../../utils/artworkResolver';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName } from '../../utils/trackUtils';

interface TrackRowProps {
    track: TrackItem;
    index?: number;
    isPlaying?: boolean;
    query?: string;
    list?: TrackItem[];
    rating?: number;
    duration?: string;
    collectionLabel?: string;
    showIndex?: boolean;
    showArtwork?: boolean;
    showRating?: boolean;
    showCollection?: boolean;
    showDuration?: boolean;
    interactionMode?: 'hover' | 'always';
    actions?: React.ReactNode;
    onPlay?: (track: TrackItem, list?: TrackItem[]) => void;
    onContextMenu?: (e: React.MouseEvent, track: TrackItem, list?: TrackItem[]) => void;
    className?: string;
    artworkClassName?: string;
    titleClassName?: string;
    subtitleClassName?: string;
}

export const TrackRow: React.FC<TrackRowProps> = ({
    track,
    index,
    isPlaying = false,
    query,
    list,
    rating,
    duration,
    collectionLabel,
    showIndex = true,
    showArtwork = true,
    showRating = false,
    showCollection = false,
    showDuration = true,
    interactionMode = 'hover',
    actions,
    onPlay,
    onContextMenu,
    className,
    artworkClassName,
    titleClassName,
    subtitleClassName,
}) => {
    const { t } = useTranslation();
    const title = getTrackDisplayName(track);
    const artists = track.metadata?.artists?.join(', ') || t('library.unknownArtist');
    const onClick = () => onPlay?.(track, list);

    return (
        <div
            className={`flex items-center gap-4 p-3 min-h-[56px] md:min-h-[52px] rounded-xl hover:bg-white/5 transition-all group cursor-pointer ${isPlaying ? 'bg-dominant/5' : ''} ${className || ''}`}
            onClick={onClick}
            onContextMenu={(e) => onContextMenu?.(e, track, list)}
        >
            {showIndex && typeof index === 'number' && (
                <span className="text-[10px] font-mono text-gray-600 w-4 text-right">{index + 1}</span>
            )}

            {showArtwork && (
                <div className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 border border-white/5 ${artworkClassName || ''}`}>
                    <ArtworkImage
                        details={getBestArtwork(track)}
                        alt={title}
                        className="w-full h-full object-cover"
                        isPlaying={isPlaying}
                    />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className={`truncate text-sm font-bold ${isPlaying ? 'text-dominant-light' : 'text-white'} ${titleClassName || ''}`}>
                    <HighlightText text={title} query={query} />
                </div>
                <div className={`truncate text-xs text-gray-500 ${subtitleClassName || ''}`}>
                    <HighlightText text={artists} query={query} />
                </div>
            </div>

            {showCollection && collectionLabel && (
                <div className="hidden md:block text-xs text-gray-500 truncate w-32">
                    {collectionLabel}
                </div>
            )}

            {showRating && rating && rating > 0 && (
                <div className="flex gap-0.5 text-yellow-500/80">
                    {Array.from({ length: rating }).map((_, i) => <Star key={i} size={8} fill="currentColor" />)}
                </div>
            )}

            {showDuration && (
                <span className="text-[11px] font-mono text-gray-500">{duration || track.audio_specs?.duration || '0:00'}</span>
            )}

            {actions && (
                <div
                    className={`flex items-center gap-2 ${interactionMode === 'hover' ? 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto md:group-hover:opacity-100 md:group-hover:pointer-events-auto' : 'opacity-100 pointer-events-auto'}`}
                >
                    {actions}
                </div>
            )}
        </div>
    );
};

