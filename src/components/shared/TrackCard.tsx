import React from 'react';
import { Play } from 'lucide-react';
import { TrackItem } from '../../types/music';
import { ArtworkImage } from './ArtworkImage';
import { HighlightText } from './HighlightText';
import { getBestArtwork } from '../../utils/artworkResolver';
import { getArtistsDisplayName } from '../../utils/artistUtils';
import { getTrackDisplayName } from '../../utils/trackUtils';

interface TrackCardProps {
    track: TrackItem;
    list?: TrackItem[];
    query?: string;
    isPlaying?: boolean;
    onPlay?: (track: TrackItem, list?: TrackItem[]) => void;
    onContextMenu?: (e: React.MouseEvent, track: TrackItem, list?: TrackItem[]) => void;
    className?: string;
}

export const TrackCard: React.FC<TrackCardProps> = ({
    track,
    list,
    query,
    isPlaying = false,
    onPlay,
    onContextMenu,
    className,
}) => {
    const title = getTrackDisplayName(track);
    const artist = getArtistsDisplayName(track.metadata?.artists);

    return (
        <div
            className={`flex-shrink-0 w-40 group cursor-pointer ${className || ''}`}
            onClick={() => onPlay?.(track, list)}
            onContextMenu={(e) => onContextMenu?.(e, track, list)}
        >
            <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-xl group-hover:shadow-dominant/20 transition-all duration-500 bg-white/5 border border-white/5 group-hover:border-dominant/20">
                <ArtworkImage
                    details={getBestArtwork(track)}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    loading="lazy"
                    isPlaying={isPlaying}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-12 h-12 rounded-full bg-dominant text-black flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 shadow-xl">
                        <Play size={20} fill="currentColor" />
                    </div>
                </div>
            </div>
            <h3 className={`text-xs font-bold line-clamp-3 leading-tight ${isPlaying ? 'text-dominant-light' : 'text-white'}`}>
                <HighlightText text={title} query={query} />
            </h3>
            <p className="text-[11px] text-gray-500 line-clamp-3 leading-tight mt-1 font-medium">
                <HighlightText text={artist} query={query} />
            </p>
        </div>
    );
};

