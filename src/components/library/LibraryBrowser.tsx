import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { VirtualList } from '../shared/VirtualList';
import { TrackItem } from '../../types/music';
import { formatSizeMb, formatTotalDuration } from '../../utils/formatters';
import {
    ChevronDown, ChevronRight, Folder, Play, SlidersHorizontal, ChevronUp
} from 'lucide-react';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { getTrackCollectionLabel } from '../../utils/collectionLabels';
import { parseGenres } from '../../utils/genreUtils';
import { useLibraryBrowserColumns } from './useLibraryBrowserColumns';
import { useLibraryBrowserSort } from './useLibraryBrowserSort';
import { HighlightText } from '../shared/HighlightText';
import { getBestArtwork } from '../../utils/artworkResolver';
import { PlaybackControls } from './PlaybackControls';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName, getTrackVersionDisplayName } from '../../utils/trackUtils';

interface LibraryBrowserProps {
    title: string;
    tracks: TrackItem[];
    onNavigate: (view: any, data?: any) => void;
    headerIcon?: React.ReactNode;
    subtitle?: string;
    onShufflePlay?: () => void;
    artworkPath?: string;
    description?: string;
}

const ROW_HEIGHT = 52;
const RIGHT_ALIGNED_COLS = new Set(['year', 'bpm', 'duration', 'bitrate', 'size']);

const TableCell = React.memo(({ col, item, index, isPlaying, searchQuery, toggleFolder, onNavigate }: {
    col: any;
    item: any;
    index: number;
    isPlaying: boolean;
    searchQuery: string;
    toggleFolder: (key: string, e: React.MouseEvent) => void;
    onNavigate: (view: any, data?: any) => void;
}) => {
    const { t } = useTranslation();
    switch (col.id) {
        case 'number':
            return <span className="text-gray-500 text-[10px] font-mono">{item._isVersion ? '' : index + 1}</span>;
        case 'artwork':
            if (item._isVersion) {
                return <div className="w-10 h-10" />;
            }
            return (
                <div className="w-10 h-10 rounded-md bg-white/5 overflow-hidden border border-white/5 group-hover:border-white/20 transition-all">
                    <ArtworkImage
                        details={getBestArtwork(item)}
                        alt={item.metadata?.title || item.logic?.track_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                </div>
            );
        case 'title':
            return (
                <div className={`flex min-w-0 items-center gap-2 ${item._isVersion ? 'pl-8' : ''}`}>
                    {item._hasVersions && (
                        <button
                            onClick={(e) => toggleFolder(item._folderKey, e)}
                            className="p-1.5 flex items-center justify-center hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white active:scale-95"
                            aria-label={item._isExpanded ? t('libraryBrowser.collapseVersions') : t('libraryBrowser.expandVersions')}
                        >
                            {item._isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className={`truncate font-bold text-sm flex items-center gap-2 ${isPlaying ? 'text-dominant-light' : 'text-white'}`}>
                            <span className="truncate">
                                {item._isVersion ? (
                                    <HighlightText text={getTrackVersionDisplayName(item)} query={searchQuery} />
                                ) : (
                                    <>
                                        <HighlightText text={getTrackDisplayName(item, t('library.unknown'))} query={searchQuery} />
                                        {getTrackVersionDisplayName(item) && (
                                            <span className="text-white/20 font-medium ml-1.5 text-[10px]">({getTrackVersionDisplayName(item)})</span>
                                        )}
                                    </>
                                )}
                            </span>
                            {item._hasVersions && !item._isExpanded && (
                                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-500 font-bold uppercase tracking-wider flex-shrink-0">
                                    {item._versionCount} {t('libraryBrowser.versions')}
                                </span>
                            )}
                        </div>
                        <div className="truncate text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors">
                            {item.metadata?.artists?.length ? (
                                item.metadata.artists.map((artist: string, i: number) => (
                                    <React.Fragment key={artist}>
                                        {i > 0 && <span>, </span>}
                                        <span
                                            className="hover:underline hover:text-gray-200 cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('ArtistDetail', artist); }}
                                        >
                                            <HighlightText text={artist} query={searchQuery} />
                                        </span>
                                    </React.Fragment>
                                ))
                            ) : (
                                <span>{t('library.unknownArtist')}</span>
                            )}
                        </div>
                    </div>
                </div>
            );
        case 'album': {
            const albumName = item.metadata?.album?.trim();
            const albumLabel = getTrackCollectionLabel(item);
            if (!albumName) {
                return (
                    <span className="truncate text-xs text-gray-500">
                        <HighlightText text={albumLabel} query={searchQuery} />
                    </span>
                );
            }
            return (
                <span
                    className="truncate text-xs text-gray-500 group-hover:text-gray-300 transition-colors hover:underline cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onNavigate('AlbumDetail', albumName); }}
                >
                    <HighlightText text={albumLabel} query={searchQuery} />
                </span>
            );
        }
        case 'genre': {
            const genres = parseGenres(item.metadata?.genre);
            if (genres.length === 0) return <span className="text-[11px] text-gray-400 italic">-</span>;
            return (
                <span className="truncate text-[11px] text-gray-400 italic">
                    {genres.map((g: string, i: number) => (
                        <React.Fragment key={g}>
                            {i > 0 && <span className="text-gray-600"> / </span>}
                            <span
                                className="hover:underline hover:text-gray-200 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onNavigate('AllTracks', { filter: { type: 'genre', value: g } }); }}
                            >
                                <HighlightText text={g} query={searchQuery} />
                            </span>
                        </React.Fragment>
                    ))}
                </span>
            );
        }
        case 'year':
            return (
                <span className="text-xs text-gray-400 font-mono">
                    <HighlightText text={item.metadata?.year || '-'} query={searchQuery} />
                </span>
            );
        case 'bpm':
            return <span className="text-xs text-gray-400 font-mono">{item.metadata?.bpm || '-'}</span>;
        case 'duration':
            return <span className="text-xs text-gray-300 font-mono font-bold">{item.audio_specs?.duration || '0:00'}</span>;
        case 'bitrate':
            return <span className="text-[10px] text-gray-600 font-mono group-hover:text-gray-400 transition-colors">{item.audio_specs?.bitrate?.replace(' Kbits/s', '') || '-'}</span>;
        case 'size':
            return <span className="text-[10px] text-gray-600 font-mono group-hover:text-gray-400 transition-colors">{formatSizeMb(item.file?.size_bytes)}</span>;
        default:
            return null;
    }
});

const TableRow = React.memo(({ item, index, isPlaying, visibleColumns, searchQuery, playTrack, tracks, onRightClick, toggleFolder, onNavigate }: {
    item: any;
    index: number;
    isPlaying: boolean;
    visibleColumns: any[];
    searchQuery: string;
    playTrack: (track: any, list: any[]) => void;
    tracks: any[];
    onRightClick: (e: React.MouseEvent, item: any) => void;
    toggleFolder: (key: string, e: React.MouseEvent) => void;
    onNavigate: (view: any, data?: any) => void;
}) => {
    return (
        <tr
            className={`group cursor-pointer hover:bg-white/5 ${isPlaying ? 'bg-dominant/10' : ''} ${item._isVersion ? 'bg-black/20' : ''}`}
            style={{ height: ROW_HEIGHT, boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.05)' }}
            onClick={() => playTrack(item, tracks)}
            onContextMenu={(e) => onRightClick(e, item)}
        >
            {visibleColumns.map(col => {
                const isRightAligned = RIGHT_ALIGNED_COLS.has(col.id);
                const align = col.id === 'number' ? 'text-center' : isRightAligned ? 'text-right' : 'text-left';
                return (
                    <td key={col.id} className={`px-2 py-1 ${align} align-middle overflow-hidden`}>
                        <TableCell col={col} item={item} index={index} isPlaying={isPlaying} searchQuery={searchQuery} toggleFolder={toggleFolder} onNavigate={onNavigate} />
                    </td>
                );
            })}
            <td className="w-8 px-0" />
        </tr>
    );
});

export const LibraryBrowser: React.FC<LibraryBrowserProps> = ({
    title,
    tracks,
    onNavigate,
    headerIcon,
    subtitle,
    onShufflePlay,
    artworkPath,
    description
}) => {
    const { state: libraryState, setSortBy, updateColumnConfig } = useLibrary();
    const { playTrack, state: playerState } = usePlayer();
    const { t } = useTranslation();
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [showColumnConfig, setShowColumnConfig] = useState(false);
    const [columnConfigMenuPosition, setColumnConfigMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const isMobile = useIsMobile();
    const columnConfigButtonRef = useRef<HTMLButtonElement>(null);
    const { visibleColumns, colWidths, measureRef } = useLibraryBrowserColumns(libraryState.columnConfig);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [headerCompact, setHeaderCompact] = useState(false);
    const { handleSortColumn, isColumnSorted, getSortDirection } = useLibraryBrowserSort(
        libraryState.sortBy,
        libraryState.sortOrder,
        setSortBy,
    );

    const getColumnLabel = useCallback((col: { id: string; label?: string }) => {
        switch (col.id) {
            case 'number': return t('libraryBrowser.columns.number');
            case 'artwork': return '';
            case 'title': return t('libraryBrowser.columns.title');
            case 'album': return t('libraryBrowser.columns.album');
            case 'genre': return t('libraryBrowser.columns.genre');
            case 'year': return t('libraryBrowser.columns.year');
            case 'bpm': return t('libraryBrowser.columns.bpm');
            case 'duration': return t('libraryBrowser.columns.duration');
            case 'bitrate': return t('libraryBrowser.columns.bitrate');
            case 'size': return t('libraryBrowser.columns.size');
            default: return col.label || col.id;
        }
    }, [t]);

    const combinedRef = useCallback((el: HTMLDivElement | null) => {
        scrollContainerRef.current = el;
        measureRef(el);
    }, [measureRef]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const top = el.scrollTop;
            setHeaderCompact(prev => {
                if (!prev && top > 80) return true;
                if (prev && top < 10) return false;
                return prev;
            });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const moveColumn = useCallback((index: number, direction: number) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= libraryState.columnConfig.length) return;
        const newConfig = [...libraryState.columnConfig];
        const [moved] = newConfig.splice(index, 1);
        newConfig.splice(newIndex, 0, moved);
        updateColumnConfig(newConfig);
    }, [libraryState.columnConfig, updateColumnConfig]);

    useEffect(() => {
        if (!showColumnConfig) return;
        const buttonEl = columnConfigButtonRef.current;
        if (!buttonEl) return;

        const updateMenuPosition = () => {
            const rect = buttonEl.getBoundingClientRect();
            const menuWidth = 224;
            const menuHeight = 420;
            const margin = 12;
            const gap = 8;

            const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
            const left = Math.min(Math.max(margin, rect.right - menuWidth), maxLeft);
            const wouldOverflowBottom = rect.bottom + gap + menuHeight > window.innerHeight - margin;
            const top = wouldOverflowBottom
                ? Math.max(margin, rect.top - gap - menuHeight)
                : rect.bottom + gap;

            setColumnConfigMenuPosition({ top, left });
        };

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [showColumnConfig]);

    const toggleFolder = useCallback((folderKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
    }, []);

    const flatList = useMemo(() => {
        const flat: any[] = [];
        tracks.forEach(track => {
            const hasVersions = track.versions && track.versions.length > 1;
            const groupKey = `${track.logic.hierarchy.folder || 'nofolder'}###${track.logic.track_name}`;
            const isExpanded = expandedFolders[groupKey] || false;

            flat.push({
                ...track,
                _isMain: true,
                _hasVersions: hasVersions,
                _isExpanded: isExpanded,
                _versionCount: track.versions?.length || 0,
                _folderKey: groupKey
            });

            if (hasVersions && isExpanded) {
                track.versions!.forEach((v, i) => {
                    flat.push({
                        ...v,
                        _isVersion: true,
                        _versionIndex: i + 1,
                        _folderKey: groupKey
                    });
                });
            }
        });
        return flat;
    }, [tracks, expandedFolders]);

    const currentTrackHash = playerState.currentTrack?.logic.hash_sha256;

    const { openItemContextMenu } = useItemContextMenu<TrackItem>();

    const onRightClick = useCallback((e: React.MouseEvent, item: TrackItem) => {
        openItemContextMenu(e, item, tracks, onNavigate);
    }, [openItemContextMenu, tracks, onNavigate]);

    // Mobile row
    const MobileRow = React.memo(({ item, isPlaying, libraryState: ls, playTrack: play, tracks: trks, onRightClick: rClick, toggleFolder: toggle }: any) => {
        const isVersion = item._isVersion;
        return (
            <div
                className={`flex items-center gap-3 px-3 py-2 min-h-[64px] hover:bg-white/5 cursor-pointer border-b border-white/5 group transition-all duration-200 ${isPlaying ? 'bg-dominant/10' : ''} ${isVersion ? 'bg-black/20 pl-10' : ''}`}
                onClick={() => play(item, trks)}
                onContextMenu={(e) => rClick(e, item)}
            >
                {isVersion ? (
                    <div className="w-11 h-11 flex-shrink-0" />
                ) : (
                    <div className="w-11 h-11 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden border border-white/5">
                        <ArtworkImage
                            details={getBestArtwork(item)}
                            alt={item.metadata?.title || item.logic?.track_name}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5">
                        {item._hasVersions && (
                            <button
                                onClick={(e) => toggle(item._folderKey, e)}
                                className="p-1 flex items-center justify-center hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                                aria-label={item._isExpanded ? t('libraryBrowser.collapseVersions') : t('libraryBrowser.expandVersions')}
                            >
                                {item._isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                        )}
                        <span className={`truncate font-bold text-sm ${isPlaying ? 'text-dominant-light' : 'text-white'}`}>
                            {isVersion ? (
                                <HighlightText text={getTrackVersionDisplayName(item)} query={ls.searchQuery} />
                            ) : (
                                <HighlightText text={getTrackDisplayName(item, t('library.unknown'))} query={ls.searchQuery} />
                            )}
                        </span>
                        {item._hasVersions && !item._isExpanded && (
                            <span className="text-[9px] bg-white/10 px-1 py-0.5 rounded text-gray-500 font-bold uppercase flex-shrink-0">
                                {item._versionCount}v
                            </span>
                        )}
                    </div>
                    <div className="truncate text-[11px] text-gray-500">
                        <HighlightText text={item.metadata?.artists?.join(', ') || t('library.unknownArtist')} query={ls.searchQuery} />
                    </div>
                </div>
                <div className="flex-shrink-0 text-right">
                    <div className="text-[11px] text-gray-400 font-mono">{item.audio_specs?.duration || '0:00'}</div>
                </div>
            </div>
        );
    });

    const renderMobileRow = useCallback((item: any, index: number) => {
        const hash = item.logic?.hash_sha256;
        const isPlaying = !!hash && playerState.currentTrack?.logic.hash_sha256 === hash;
        return (
            <MobileRow
                key={hash ? `${hash}${item._isVersion ? `-v${item._versionIndex}` : ''}` : `row-${index}`}
                item={item}
                index={index}
                isPlaying={isPlaying}
                libraryState={libraryState}
                playTrack={playTrack}
                tracks={tracks}
                onRightClick={onRightClick}
                toggleFolder={toggleFolder}
            />
        );
    }, [playerState.currentTrack?.logic.hash_sha256, libraryState, playTrack, tracks, onRightClick, toggleFolder]);

    if (isMobile) {
        return (
            <div className="h-full flex flex-col overflow-hidden pt-0 px-3 sm:px-4 pb-0 bg-surface-primary">
                <div className="mb-3 flex items-center gap-3">
                    {artworkPath ? (
                        <div className="w-14 h-14 rounded-xl overflow-hidden shadow-lg flex-shrink-0 border border-white/10 relative">
                            <ArtworkImage src={artworkPath} alt={title} className="w-full h-full object-cover" />
                        </div>
                    ) : headerIcon ? (
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-dominant border border-white/5 shadow-lg">
                            {headerIcon}
                        </div>
                    ) : (
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-dominant border border-white/5 shadow-lg">
                            <Folder size={18} />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-dominant/70 truncate">
                            {subtitle || t('libraryBrowser.collection')}
                        </span>
                        <h1 className="text-lg font-black tracking-tight text-white truncate">{title}</h1>
                    </div>
                </div>
                {description && (
                    <p className="text-gray-400 text-[11px] mb-3 font-medium leading-relaxed line-clamp-2">{description}</p>
                )}
                <div className="mb-3 flex items-center justify-between gap-2">
                    <PlaybackControls
                        trackCount={tracks.length}
                        onPlayAll={onShufflePlay || (() => playTrack(tracks[0], tracks))}
                        onShuffle={() => {
                            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                            playTrack(shuffled[0], shuffled);
                        }}
                        showShuffle
                        variant="default"
                            playLabel={t('libraryBrowser.playAll')}
                            shuffleLabel={t('player.shuffle')}
                    />
                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">{tracks.length} {t('nav.tracks')}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <VirtualList items={flatList} rowHeight={64} renderRow={renderMobileRow} overscan={4} />
                </div>
            </div>
        );
    }

    // Desktop
    return (
        <div className="h-full flex flex-col pt-0 md:pt-20 px-3 md:px-6 pb-0 bg-surface-primary">
            {/* Page Header */}
            <div className={`transition-all duration-300 ease-out overflow-hidden ${headerCompact ? 'mb-2 max-h-16' : `mb-4 md:mb-8 max-h-[500px] ${artworkPath ? 'md:mb-10' : 'md:mb-6'}`}`}>
                <div className={`flex items-center gap-4 ${headerCompact ? '' : 'flex-col sm:flex-row sm:items-end md:gap-8'}`}>
                    {!headerCompact && (
                        artworkPath ? (
                            <div className="w-20 h-20 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/10 group relative">
                                <ArtworkImage src={artworkPath} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                            </div>
                        ) : headerIcon ? (
                            <div className="w-12 h-12 md:w-20 md:h-20 bg-white/5 rounded-2xl flex items-center justify-center text-dominant border border-white/5 shadow-xl">
                                {headerIcon}
                            </div>
                        ) : (
                            <div className="w-12 h-12 md:w-20 md:h-20 bg-white/5 rounded-2xl flex items-center justify-center text-dominant border border-white/5 shadow-xl">
                                <Folder size={32} />
                            </div>
                        )
                    )}
                    <div className={`flex-1 flex items-center ${headerCompact ? 'gap-4' : 'flex-col items-center sm:items-start text-center sm:text-left'}`}>
                        {headerCompact ? (
                            <>
                                <h1 className="text-lg font-black tracking-tight text-white truncate">{title}</h1>
                                <button
                                    onClick={onShufflePlay || (() => playTrack(tracks[0], tracks))}
                                    className="flex items-center gap-2 px-4 py-2 bg-dominant text-on-dominant rounded-lg text-[10px] font-black uppercase tracking-[0.16em] hover:bg-dominant-light transition-all shadow-lg shadow-dominant/10 active:scale-95 flex-shrink-0"
                                >
                                    <Play size={12} fill="currentColor" /> {t('libraryBrowser.playAll')}
                                </button>
                                <span className="text-gray-600 font-mono text-[10px] uppercase tracking-widest flex-shrink-0">
                                    {tracks.length} tracks
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="text-xs font-black uppercase tracking-[0.3em] text-dominant mb-3 opacity-60">
                                    {subtitle || t('libraryBrowser.collection')}
                                </span>
                                <h1 className="text-2xl md:text-5xl font-black tracking-tighter text-white mb-2 md:mb-3">{title}</h1>
                                {description && (
                                    <p className="text-gray-400 text-xs md:text-base max-w-2xl mb-3 md:mb-5 font-medium leading-relaxed">{description}</p>
                                )}
                                <div className="flex items-center gap-2 md:gap-4">
                                    <button
                                        onClick={onShufflePlay || (() => playTrack(tracks[0], tracks))}
                                        className="flex items-center gap-2 md:gap-3 px-5 md:px-8 py-3 md:py-3 bg-dominant text-on-dominant rounded-xl text-sm md:text-xs font-black uppercase tracking-[0.16em] md:tracking-[0.2em] hover:bg-dominant-light transition-all shadow-xl shadow-dominant/10 active:scale-95 min-h-12 md:min-h-11"
                                    >
                                        <Play size={16} fill="currentColor" /> {t('libraryBrowser.playAll')}
                                    </button>
                                    <span className="hidden sm:block text-gray-600 font-mono text-xs uppercase tracking-widest pl-2">
                                        {tracks.length} tracks • {formatTotalDuration(tracks)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable table area */}
            <div ref={combinedRef} className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full" style={{ tableLayout: 'fixed', borderSpacing: 0 }}>
                    <colgroup>
                        {visibleColumns.map((col, i) => (
                            <col key={col.id} style={{ width: `${colWidths[i]}px` }} />
                        ))}
                        <col style={{ width: '32px' }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-surface-primary" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.1)' }}>
                            {visibleColumns.map(col => {
                                const isRightAligned = RIGHT_ALIGNED_COLS.has(col.id);
                                return (
                                    <th
                                        key={col.id}
                                        className={`px-2 py-3 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] select-none whitespace-nowrap ${isRightAligned ? 'text-right' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-white/50 transition-colors' : ''}`}
                                        onClick={() => handleSortColumn(col)}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {getColumnLabel(col)}
                                            {isColumnSorted(col.id) && getSortDirection(col.id) && (
                                                <span className="text-dominant/70">
                                                    {getSortDirection(col.id) === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                </span>
                                            )}
                                        </span>
                                    </th>
                                );
                            })}
                            <th className="px-0 py-3 bg-surface-primary">
                                <button
                                    ref={columnConfigButtonRef}
                                    onClick={() => setShowColumnConfig(!showColumnConfig)}
                                    className="flex items-center justify-center w-7 h-7 text-white/30 hover:text-white/80 transition-colors rounded hover:bg-white/5"
                                    title={t('libraryBrowser.configureColumns')}
                                    aria-label={t('libraryBrowser.visibleColumns')}
                                >
                                    <SlidersHorizontal size={12} />
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {flatList.map((item, index) => {
                            const hash = item.logic?.hash_sha256;
                            return (
                                <TableRow
                                    key={hash ? `${hash}${item._isVersion ? `-v${item._versionIndex}` : ''}` : `row-${index}`}
                                    item={item}
                                    index={index}
                                    isPlaying={!!hash && currentTrackHash === hash}
                                    visibleColumns={visibleColumns}
                                    searchQuery={libraryState.searchQuery}
                                    playTrack={playTrack}
                                    tracks={tracks}
                                    onRightClick={onRightClick}
                                    toggleFolder={toggleFolder}
                                    onNavigate={onNavigate}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Column config dropdown */}
            {showColumnConfig && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowColumnConfig(false)} />
                    <div
                        className="fixed w-56 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-2"
                        style={{ top: `${columnConfigMenuPosition.top}px`, left: `${columnConfigMenuPosition.left}px` }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 flex justify-between items-center">
                            <span>{t('libraryBrowser.visibleColumns')}</span>
                        </div>
                        <div className="max-h-96 overflow-y-auto custom-scrollbar">
                            {libraryState.columnConfig.map((col, idx) => (
                                <div key={col.id} className="flex items-center group px-2 py-0.5">
                                    <button
                                        onClick={() => {
                                            if (col.id === 'title') return;
                                            const newConfig = libraryState.columnConfig.map(c =>
                                                c.id === col.id ? { ...c, visible: !c.visible } : c
                                            );
                                            updateColumnConfig(newConfig);
                                        }}
                                        className={`flex flex-1 items-center justify-between px-2 py-2 text-xs transition-colors rounded-lg ${col.id === 'title' ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'} ${col.visible ? 'text-white font-bold' : 'text-gray-500'}`}
                                    >
                                        <span>{getColumnLabel(col)}</span>
                                        <div className={`w-8 h-4 rounded-full transition-all relative flex-shrink-0 ml-2 border border-black/20 ${col.visible ? 'bg-dominant' : 'bg-white/10'}`}>
                                            <div className={`absolute top-[1px] w-3 h-3 rounded-full bg-white shadow-sm transition-all ${col.visible ? 'left-[17px]' : 'left-[1px]'}`} />
                                        </div>
                                    </button>
                                    <div className="flex flex-col ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveColumn(idx, -1); }}
                                            disabled={idx === 0}
                                            className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                                            title={t('libraryBrowser.moveUp')}
                                            aria-label={t('libraryBrowser.moveColumnUp', { name: getColumnLabel(col) })}
                                        >
                                            <ChevronUp size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveColumn(idx, 1); }}
                                            disabled={idx === libraryState.columnConfig.length - 1}
                                            className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                                            title={t('libraryBrowser.moveDown')}
                                            aria-label={t('libraryBrowser.moveColumnDown', { name: getColumnLabel(col) })}
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

