import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Play, Trash2, GripVertical } from 'lucide-react';
import { ArtworkImage } from '../shared/ArtworkImage';
import { TrackItem } from '../../types/music';
import { getBestArtwork } from '../../utils/artworkResolver';
import { formatDuration } from '../../utils/formatters';
import { getArtistsDisplayName } from '../../utils/artistUtils';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName } from '../../utils/trackUtils';

export interface QueueDisplayItem extends Omit<TrackItem, 'id'> {
    originalIndex: number;
    id: string;
    startTimeSeconds: number;
}

interface QueueTrackItemProps {
    track: QueueDisplayItem | TrackItem;
    index: number;
    isCurrent?: boolean;
    isHistory?: boolean;
    isDraggable?: boolean;
    sortableId?: string;
    layout: 'full-desktop' | 'full-mobile' | 'drawer';
    onPlay: (track: TrackItem) => void;
    onRemove: (index: number) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    originalIndex?: number;
}

const trackTitle = (track: TrackItem | QueueDisplayItem, fallback = '') => getTrackDisplayName(track as TrackItem, fallback);

export const QueueTrackItem: React.FC<QueueTrackItemProps> = React.memo(({
    track,
    index,
    isCurrent = false,
    isHistory = false,
    isDraggable = true,
    sortableId,
    layout,
    onPlay,
    onRemove,
    onContextMenu,
    originalIndex = index,
}) => {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: sortableId ?? track.logic.hash_sha256 + '-' + index,
        disabled: isHistory || !isDraggable
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
    };

    const artwork = getBestArtwork(track as TrackItem);
    const title = trackTitle(track, t('player.unknownTrack'));
    
    // Calculate start time if available
    const displayTrack = track as QueueDisplayItem;
    const startTime = displayTrack.startTimeSeconds !== undefined ? displayTrack.startTimeSeconds : 0;

    // Desktop layout with hover actions
    if (layout === 'full-desktop') {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className={`group flex items-center gap-5 p-3 rounded-2xl bg-white/2 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 relative ${isDragging ? 'opacity-50 shadow-2xl bg-white/10' : ''}`}
                onContextMenu={onContextMenu}
            >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-dominant rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="text-[10px] font-black text-white/10 w-6 text-center group-hover:hidden font-mono">
                    {(index + 1).toString().padStart(2, '0')}
                </div>

                <button
                    onClick={() => onPlay(track as TrackItem)}
                    className="hidden group-hover:flex w-10 h-10 items-center justify-center text-dominant bg-dominant/10 rounded-lg hover:bg-dominant/20 transition-colors active:scale-95"
                    aria-label={t('player.playTrack')}
                >
                    <Play size={16} fill="currentColor" />
                </button>

                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/5 group-hover:border-white/10 transition-colors shadow-lg">
                    <ArtworkImage details={artwork} alt={title} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate group-hover:text-dominant-light transition-colors">{title}</div>
                    <div className="text-[10px] font-bold text-gray-500 truncate uppercase tracking-tighter mt-0.5">{getArtistsDisplayName(track.metadata?.artists, t('player.unknownArtist'))}</div>
                </div>

                <div className="flex flex-col items-end gap-1 min-w-[80px]">
                    <div className="text-[10px] font-black text-gray-600 font-mono">+{formatDuration(startTime)}</div>
                    <div className="text-xs font-bold text-white/40">{track.audio_specs?.duration}</div>
                </div>

                <div className="hidden group-hover:flex items-center gap-1 border-l border-white/5 pl-3 ml-2">
                    <button
                        onClick={() => onRemove(originalIndex)}
                        className="p-2 min-w-10 min-h-10 text-gray-500 hover:text-red-400 transition-colors hover:bg-red-500/10 rounded-lg active:scale-95"
                        title={t('player.removeFromQueue')}
                        aria-label={t('player.removeFromQueue')}
                    >
                        <Trash2 size={16} />
                    </button>
                    <div
                        {...attributes}
                        {...listeners}
                        className="p-2 min-w-10 min-h-10 text-gray-600 cursor-grab active:cursor-grabbing hover:text-white transition-colors flex items-center justify-center"
                    >
                        <GripVertical size={16} />
                    </div>
                </div>
            </div>
        );
    }

    // Mobile layout with always-visible actions
    if (layout === 'full-mobile') {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className={`group flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 min-h-[56px] ${isHistory ? 'cursor-pointer' : ''} ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
                onClick={isHistory ? () => onPlay(track as TrackItem) : undefined}
                onContextMenu={onContextMenu}
            >
                <button
                    onClick={() => onPlay(track as TrackItem)}
                    className="w-10 h-10 rounded-lg bg-dominant/20 text-dominant flex items-center justify-center hover:bg-dominant/30 transition-colors active:scale-95 flex-shrink-0"
                    aria-label={t('player.playTrack')}
                >
                    <Play size={14} fill="currentColor" />
                </button>

                <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex-shrink-0">
                    <ArtworkImage details={artwork} alt={title} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">{title}</div>
                    <div className="text-[10px] text-gray-500 truncate">{getArtistsDisplayName(track.metadata?.artists, t('player.unknownArtist'))}</div>
                </div>

                <div className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                    {!isHistory && displayTrack.startTimeSeconds !== undefined ? `+${formatDuration(startTime)}` : track.audio_specs?.duration}
                </div>

                {!isHistory && (
                    <button
                        onClick={() => onRemove(originalIndex)}
                        className="p-2 min-w-10 min-h-10 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95 flex-shrink-0"
                        aria-label={t('player.removeFromQueue')}
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        );
    }

    // Drawer layout with compact design
    if (layout === 'drawer') {
        return (
            <div
                ref={setNodeRef}
                style={{
                    ...style,
                    backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#fff',
                    minHeight: '56px',
                    padding: '12px',
                    margin: '6px 0',
                }}
                onContextMenu={onContextMenu}
            >
                <div
                    {...attributes}
                    {...listeners}
                    style={{
                        cursor: 'grab',
                        opacity: 0.5,
                        userSelect: 'none',
                        padding: '8px',
                        minWidth: '36px',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                    title={t('player.dragToReorder')}
                >
                    ☰
                </div>

                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        minWidth: 0
                    }}
                    onClick={() => onPlay(track as TrackItem)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            flexShrink: 0
                        }}>
                            <ArtworkImage
                                details={artwork}
                                alt={trackTitle(track)}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: isCurrent ? 'bold' : 'normal' }}>
                                {title}
                            </div>
                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                                {getArtistsDisplayName(track.metadata?.artists, t('player.unknownArtist'))}
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(originalIndex);
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff4444',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '4px',
                        minWidth: '36px',
                        minHeight: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                    title={t('player.removeFromQueue')}
                    aria-label={t('player.removeFromQueue')}
                >
                    ✕
                </button>
            </div>
        );
    }

    return null;
});

QueueTrackItem.displayName = 'QueueTrackItem';

