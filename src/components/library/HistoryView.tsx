import React from 'react';
import { ViewType } from '../layout/AppLayout';
import { Clock, Play, ArrowUpDown } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { TrackItem } from '../../types/music';
import { VirtualList } from '../shared/VirtualList';
import { TrackRow } from '../shared/TrackRow';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { resolveHistoryTracks } from '../../utils/historyUtils';
import { EmptyState } from '../shared/EmptyState';
import { useTranslation } from '../../i18n/I18nContext';
import { ArtworkImage } from '../shared/ArtworkImage';
import { getBestArtwork } from '../../utils/artworkResolver';
import { HighlightText } from '../shared/HighlightText';
import { formatSizeMb } from '../../utils/formatters';
import { getTrackDisplayName } from '../../utils/trackUtils';
import { parseGenres } from '../../utils/genreUtils';


interface HistoryViewProps {
    onNavigate: (view: ViewType, data?: any) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onNavigate: _onNavigate }) => {
    const { state: libState } = useLibrary();
    const { state: playerState, playTrack } = usePlayer();
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();
    const isMobile = useIsMobile();
    const { t } = useTranslation();
    const visibleColumns = React.useMemo(() => libState.columnConfig.filter(column => column.visible), [libState.columnConfig]);

    const getColumnLabel = React.useCallback((id: string) => {
        switch (id) {
            case 'number': return t('libraryBrowser.columns.number');
            case 'artwork': return t('libraryBrowser.columns.artwork');
            case 'title': return t('libraryBrowser.columns.title');
            case 'album': return t('libraryBrowser.columns.album');
            case 'genre': return t('libraryBrowser.columns.genre');
            case 'year': return t('libraryBrowser.columns.year');
            case 'bpm': return t('libraryBrowser.columns.bpm');
            case 'duration': return t('libraryBrowser.columns.duration');
            case 'bitrate': return t('libraryBrowser.columns.bitrate');
            case 'size': return t('libraryBrowser.columns.size');
            default: return id;
        }
    }, [t]);

    // Map history IDs to actual tracks
    const historyTracks = React.useMemo(() => (
        resolveHistoryTracks(libState.tracks, libState.versionToPrimaryMap)
    ), [libState.tracks, libState.versionToPrimaryMap, playerState.history]);

    const handlePlay = (track: TrackItem) => {
        playTrack(track, historyTracks);
    };

    const renderHeader = () => (
        <div className="flex items-center px-4 py-2 border-b border-white/5 bg-white/5 backdrop-blur-md rounded-t-xl">
            {visibleColumns.map(col => (
                <div
                    key={col.id}
                    className={`text-[10px] font-black uppercase tracking-widest text-gray-500 ${col.width === 0 ? 'flex-1 min-w-0' : ''} ${['album', 'genre', 'year', 'bpm', 'bitrate', 'size'].includes(col.id) ? 'hidden md:block' : ''}`}
                    style={col.width !== 0 ? { width: col.width } : undefined}
                >
                    {getColumnLabel(col.id)}
                </div>
            ))}
            <div className="w-10 flex-shrink-0" />
        </div>
    );

    const renderCell = (track: TrackItem, colId: string, index: number) => {
        switch (colId) {
            case 'number':
                return <span className="text-gray-500 text-[10px] font-mono">{index + 1}</span>;
            case 'artwork':
                return (
                    <div className="w-10 h-10 rounded-md bg-white/5 overflow-hidden border border-white/5 group-hover:border-white/20 transition-all flex-shrink-0">
                        <ArtworkImage
                            details={getBestArtwork(track)}
                            alt={getTrackDisplayName(track, t('library.unknown'))}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                    </div>
                );
            case 'title':
                return (
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className={`truncate font-bold text-sm ${track.logic.hash_sha256 === playerState.currentTrack?.logic.hash_sha256 ? 'text-dominant-light' : 'text-white'}`}>
                                <HighlightText text={getTrackDisplayName(track, t('library.unknown'))} query={undefined} />
                            </div>
                            <div className="truncate text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors">
                                {track.metadata?.artists?.length ? track.metadata.artists.join(', ') : t('library.unknownArtist')}
                            </div>
                        </div>
                    </div>
                );
            case 'album':
                return <span className="truncate text-xs text-gray-500">{track.metadata?.album?.trim() || '-'}</span>;
            case 'genre': {
                const genres = parseGenres(track.metadata?.genre);
                return <span className="truncate text-[11px] text-gray-400 italic">{genres.length > 0 ? genres.join(' / ') : '-'}</span>;
            }
            case 'year':
                return <span className="text-xs text-gray-400 font-mono">{track.metadata?.year || '-'}</span>;
            case 'bpm':
                return <span className="text-xs text-gray-400 font-mono">{track.metadata?.bpm || '-'}</span>;
            case 'duration':
                return <span className="text-xs text-gray-300 font-mono font-bold">{track.audio_specs?.duration || '0:00'}</span>;
            case 'bitrate':
                return <span className="text-[10px] text-gray-600 font-mono group-hover:text-gray-400 transition-colors">{track.audio_specs?.bitrate?.replace(' Kbits/s', '') || '-'}</span>;
            case 'size':
                return <span className="text-[10px] text-gray-600 font-mono group-hover:text-gray-400 transition-colors">{formatSizeMb(track.file?.size_bytes)}</span>;
            default:
                return null;
        }
    };

    const renderRow = (track: TrackItem, index: number) => {
        const isPlaying = playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256;

        return (
            <div
                key={`${track.logic.hash_sha256}-${index}`}
                className={`group flex items-stretch px-4 py-2 border-b border-white/[0.02] last:border-0 rounded-none cursor-pointer transition-colors ${isPlaying ? 'bg-dominant/10' : 'hover:bg-white/5'}`}
                onClick={() => handlePlay(track)}
                onContextMenu={(e) => openItemContextMenu(e, track, historyTracks, undefined)}
            >
                {visibleColumns.map(col => (
                    <div
                        key={col.id}
                        className={`px-2 py-1 align-middle overflow-hidden flex items-center ${col.id === 'number' ? 'justify-center text-center' : ''} ${col.width === 0 ? 'flex-1 min-w-0' : ''} ${['album', 'genre', 'year', 'bpm', 'bitrate', 'size'].includes(col.id) ? 'hidden md:flex' : 'flex'} ${col.id === 'title' ? 'min-w-0' : ''}`}
                        style={col.width !== 0 ? { width: col.width } : undefined}
                    >
                        {renderCell(track, col.id, index)}
                    </div>
                ))}
                <div className="w-10 flex-shrink-0" />
            </div>
        );
    };

    if (isMobile) {
        return (
            <div className="h-full overflow-y-auto custom-scrollbar pt-0 px-2 pb-28 bg-surface-primary">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                        <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
                            <Clock size={18} className="text-dominant" /> {t('historyView.title')}
                        </h1>
                        <p className="text-gray-500 text-[11px] mt-1">{t('historyView.description')}</p>
                    </div>

                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider text-gray-300 transition-all border border-white/10">
                        <ArrowUpDown size={12} /> {t('historyView.sort')}
                    </button>
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{historyTracks.length} {t('historyView.tracks')}</span>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-dominant text-on-dominant rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-dominant-light transition-all">
                        <Play size={12} /> {t('historyView.clear')}
                    </button>
                </div>

                {historyTracks.length === 0 ? (
                    <EmptyState
                        icon={<Clock size={40} />}
                        title={t('historyView.noHistoryYet')}
                        subtitle={t('historyView.noHistoryDesc')}
                        className="min-h-[40vh] rounded-3xl border border-dashed border-white/10"
                        titleClassName="text-sm font-bold text-white/40 mb-2"
                        subtitleClassName="text-xs text-gray-500"
                    />
                ) : (
                    <div className="space-y-1.5">
                        {historyTracks.map((track, index) => {
                            const isPlaying = playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256;
                            return (
                                <TrackRow
                                    key={`${track.logic.hash_sha256}-${index}`}
                                    track={track}
                                    index={index}
                                    isPlaying={isPlaying}
                                    list={historyTracks}
                                    showIndex={false}
                                    showArtwork={true}
                                    showCollection={false}
                                    showRating={false}
                                    showDuration
                                    onPlay={(t: TrackItem) => handlePlay(t)}
                                    onContextMenu={(e: React.MouseEvent, t: TrackItem) => openItemContextMenu(e, t, historyTracks, undefined)}
                                    className={`rounded-xl border border-white/10 transition-colors ${isPlaying ? 'ring-1 ring-dominant/60 bg-dominant/10' : 'bg-white/[0.02] hover:bg-white/5'}`}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
            <div className="h-full flex flex-col pt-0 md:pt-20 px-3 md:px-6 pb-0 overflow-hidden">
            <div className="mb-4 md:mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Clock className="text-dominant" /> {t('historyView.title')}
                    </h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">{t('historyView.description')}</p>
                </div>

                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all border border-white/5">
                        <ArrowUpDown size={14} /> {t('historyView.sort')}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-dominant text-on-dominant rounded-xl text-xs font-black uppercase tracking-widest hover:bg-dominant-light transition-all shadow-lg shadow-dominant/10">
                        <Play size={14} /> {t('historyView.clearConfirm')}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-[#111]/40 rounded-t-2xl border-x border-t border-white/5">
                {renderHeader()}
                <div className="flex-1 overflow-hidden">
                    {historyTracks.length === 0 ? (
                        <EmptyState
                            icon={<Clock size={48} />}
                            title={t('historyView.noHistoryYet')}
                            subtitle={t('historyView.noHistoryDesc')}
                            className="h-full"
                            titleClassName="text-base font-bold text-white/40 mb-2"
                            subtitleClassName="text-sm text-gray-500"
                        />
                    ) : (
                        <VirtualList
                            items={historyTracks}
                            rowHeight={isMobile ? 54 : 60}
                            renderRow={(track: TrackItem, idx: number) => renderRow(track, idx)}
                            overscan={isMobile ? 3 : 5}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

