import React, { useMemo, useState, useCallback } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import {
    FolderOpen, Folder, Hash, Grid3X3, List, Columns3,
    ChevronRight, Play, CornerLeftUp, FileAudio, Music,
} from 'lucide-react';
import { getMutedVisualStyle, seedFromText } from '../../utils/collectionVisuals';
import { groupTracks } from '../../utils/grouping';
import {
    getDirectChildPath,
    getParentPath,
    isPathWithin,
    normalizePath,
    getPathBasename,
    splitPathSegments,
    joinPathSegments,
} from '../../utils/pathUtils';
import { TrackItem, ImageDetails } from '../../types/music';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import { useTranslation } from '../../i18n/I18nContext';
import { getBestArtwork, getBestAlbumArtwork } from '../../utils/artworkResolver';
import { ArtworkImage } from '../shared/ArtworkImage';
import { persistenceService } from '../../services/persistence';
import type { GroupedTracks } from '../../utils/grouping';

type FolderViewMode = 'grid' | 'list' | 'columns';
type FolderSortBy = 'name' | 'count';

interface FolderNode {
    path: string;
    name: string;
    tracks: TrackItem[];
    hasChildren: boolean;
    directTrackCount: number;
}

const getFolderArtwork = (tracks: TrackItem[]): ImageDetails | undefined => {
    for (const track of tracks) {
        const art = getBestAlbumArtwork(track);
        if (art) return art;
    }
    return undefined;
};

const shouldShowFolderArtwork = (folder: FolderNode): boolean => {
    if (folder.tracks.length === 0) return false;
    // Top-level container folders (depth 1) like "assets" don't represent albums
    if (splitPathSegments(folder.path).length <= 1) return false;
    // A singles *container* folder: has children (subfolders for each single) and all tracks are singles
    if (folder.hasChildren && folder.tracks.every(t => t.logic?.is_single)) return false;
    return true;
};

interface FoldersViewProps {
    onNavigate: (view: any, data?: any) => void;
    initialPath?: string;
}

export const FoldersView: React.FC<FoldersViewProps> = ({ onNavigate, initialPath = '' }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();

    const currentPath = initialPath;
    const [sortBy, setSortBy] = useState<FolderSortBy>('name');
    const [viewMode, setViewMode] = useState<FolderViewMode>(
        () => (persistenceService.get('foldersViewMode') as FolderViewMode) || 'grid'
    );
    const [columnSelections, setColumnSelections] = useState<string[]>([]);

    const normalizedCurrentPath = useMemo(() => normalizePath(currentPath), [currentPath]);

    const handleViewModeChange = useCallback((mode: FolderViewMode) => {
        setViewMode(mode);
        persistenceService.set('foldersViewMode', mode);
        if (mode === 'columns') {
            const segments = splitPathSegments(normalizedCurrentPath);
            setColumnSelections(segments.map((_, i) => joinPathSegments(segments.slice(0, i + 1))));
        }
    }, [normalizedCurrentPath]);

    const allGroups = useMemo(() => {
        return groupTracks(libraryState.filteredTracks, {
            keyExtractor: (track) => track.file?.dir,
            unknownLabel: 'Unknown Folder',
            normalizeKey: (value) => normalizePath(value).toLowerCase(),
            nameResolver: (value) => normalizePath(value),
            isUnknownValue: (value) => normalizePath(value).length === 0,
        }).groups;
    }, [libraryState.filteredTracks]);

    const getFoldersAtPath = useCallback((basePath: string): FolderNode[] => {
        const nodes = new Map<string, FolderNode>();

        for (const group of allGroups.values() as Iterable<GroupedTracks<TrackItem>>) {
            if (group.isUnknown) continue;
            const normalizedGroupPath = group.name;
            const childPath = getDirectChildPath(basePath, normalizedGroupPath);
            if (!childPath) continue;

            if (!nodes.has(childPath)) {
                nodes.set(childPath, { path: childPath, name: getPathBasename(childPath), tracks: [], hasChildren: false, directTrackCount: 0 });
            }

            const node = nodes.get(childPath)!;
            node.tracks.push(...group.tracks);
            if (normalizedGroupPath === childPath) node.directTrackCount += group.tracks.length;
            if (normalizedGroupPath !== childPath && isPathWithin(childPath, normalizedGroupPath)) node.hasChildren = true;
        }

        const sorted = Array.from(nodes.values());
        return sortBy === 'name'
            ? sorted.sort((a, b) => a.name.localeCompare(b.name))
            : sorted.sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name));
    }, [allGroups, sortBy]);

    const folders = useMemo(() => getFoldersAtPath(normalizedCurrentPath), [getFoldersAtPath, normalizedCurrentPath]);

    // Get tracks directly in the current folder (not in subfolders)
    const directTracks = useMemo((): TrackItem[] => {
        const tracks: TrackItem[] = [];
        for (const group of allGroups.values() as Iterable<GroupedTracks<TrackItem>>) {
            if (group.isUnknown) continue;
            if (group.name === normalizedCurrentPath) {
                tracks.push(...group.tracks);
            }
        }
        return tracks;
    }, [allGroups, normalizedCurrentPath]);

    const onRightClick = useCallback((e: React.MouseEvent, folder: FolderNode) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: folder.name,
            tracks: folder.tracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: t('folders.playFolder'),
            extraItems: [{
                label: t('folders.openFolderTracks'),
                icon: <FolderOpen size={14} />,
                onClick: () => onNavigate('AllTracks', { filter: { type: 'folder', value: folder.path } })
            }]
        }));
    }, [showContextMenu, playTrack, addToNext, addToQueue, showToast, t, onNavigate]);

    const handleFolderClick = useCallback((folder: FolderNode) => {
        onNavigate('Folders', folder.path);
    }, [onNavigate]);

    const navigateToPath = useCallback((path: string) => {
        onNavigate('Folders', path);
    }, [onNavigate]);

    const breadcrumbSegments = useMemo(() => {
        const segments = splitPathSegments(normalizedCurrentPath);
        return segments.map((seg, i) => ({
            label: seg,
            path: joinPathSegments(segments.slice(0, i + 1)),
        }));
    }, [normalizedCurrentPath]);

    // Column view data
    const columnData = useMemo(() => {
        if (viewMode !== 'columns') return [];
        const columns: { path: string; folders: FolderNode[]; selectedPath: string | null }[] = [];
        const rootFolders = getFoldersAtPath('');
        columns.push({ path: '', folders: rootFolders, selectedPath: columnSelections[0] || null });
        for (let i = 0; i < columnSelections.length; i++) {
            const childFolders = getFoldersAtPath(columnSelections[i]);
            if (childFolders.length === 0) break;
            columns.push({ path: columnSelections[i], folders: childFolders, selectedPath: columnSelections[i + 1] || null });
        }
        return columns;
    }, [viewMode, getFoldersAtPath, columnSelections]);

    const handleColumnSelect = useCallback((columnIndex: number, folder: FolderNode) => {
        setColumnSelections(prev => [...prev.slice(0, columnIndex), folder.path]);
    }, []);

    const viewModes: { mode: FolderViewMode; icon: React.ReactNode; label: string }[] = [
        { mode: 'grid', icon: <Grid3X3 size={15} />, label: t('folders.viewGrid') },
        { mode: 'list', icon: <List size={15} />, label: t('folders.viewList') },
        { mode: 'columns', icon: <Columns3 size={15} />, label: t('folders.viewColumns') },
    ];

    // --- Shared track row renderer ---
    const renderTrackRow = (track: TrackItem, idx: number, queue: TrackItem[]) => {
        const trackArt = getBestArtwork(track);
        return (
            <button
                key={track.logic.hash_sha256}
                onClick={() => playTrack(track, queue)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors group text-left rounded-lg"
            >
                <span className="text-[11px] text-gray-600 w-5 text-right tabular-nums flex-shrink-0">{idx + 1}</span>
                {trackArt ? (
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
                        <ArtworkImage details={trackArt} alt={track.metadata?.title || ''} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <FileAudio size={14} className="text-gray-500" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <span className="text-sm text-white/90 truncate block group-hover:text-dominant-light transition-colors">
                        {track.metadata?.title || track.file?.name || 'Untitled'}
                    </span>
                    {track.metadata?.artists?.[0] && (
                        <span className="text-[11px] text-gray-500 truncate block">{track.metadata.artists.join(', ')}</span>
                    )}
                </div>
                <span className="text-[11px] text-gray-600 flex-shrink-0">{track.audio_specs?.duration || ''}</span>
            </button>
        );
    };

    // --- GRID MODE ---
    if (viewMode === 'grid') {
        return (
            <div className="h-full flex flex-col p-3 md:p-6 pt-2 md:pt-20 bg-surface-primary">
                <Toolbar
                    breadcrumbs={breadcrumbSegments}
                    onBreadcrumbClick={navigateToPath}
                    viewModes={viewModes}
                    currentViewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    t={t}
                    folderCount={folders.length}
                    trackCount={directTracks.length}
                />

                <div className="mt-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {/* Parent nav */}
                    {currentPath && (
                        <button
                            onClick={() => onNavigate('Folders', getParentPath(normalizedCurrentPath))}
                            className="inline-flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all text-sm text-white/60 hover:text-white"
                        >
                            <CornerLeftUp size={14} />
                            ..
                        </button>
                    )}

                    {/* Folder grid */}
                    {folders.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                            {folders.map(folder => {
                                const palette = getMutedVisualStyle(seedFromText(folder.path));
                                const artworkDetails = shouldShowFolderArtwork(folder) ? getFolderArtwork(folder.tracks) : undefined;

                                return (
                                    <button
                                        key={folder.path}
                                        onClick={() => handleFolderClick(folder)}
                                        onContextMenu={(e) => onRightClick(e, folder)}
                                        className="group flex flex-col text-left"
                                    >
                                        <div
                                            className="aspect-square rounded-2xl overflow-hidden mb-2 flex items-center justify-center border border-white/5 group-hover:border-white/15 transition-all shadow-lg group-hover:shadow-xl relative"
                                            style={artworkDetails ? {} : { background: palette.background, borderColor: palette.borderColor }}
                                        >
                                            {artworkDetails ? (
                                                <ArtworkImage details={artworkDetails} alt={folder.name} className="w-full h-full object-cover group-hover:brightness-110 transition-[filter]" loading="lazy" />
                                            ) : (
                                                <FolderOpen size={40} style={{ color: palette.accentColor }} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Play size={28} fill="currentColor" className="text-white drop-shadow-lg" />
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-white truncate group-hover:text-dominant-light transition-colors px-0.5">{folder.name}</h3>
                                        <p className="text-[11px] text-gray-500 truncate px-0.5">
                                            {folder.tracks.length} {t('folders.tracks')}
                                            {folder.hasChildren && ` · ${folder.directTrackCount} ${t('folders.here')}`}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Direct tracks in this folder */}
                    {directTracks.length > 0 && (
                        <div className="border-t border-white/5 pt-4">
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <Music size={14} className="text-gray-500" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                    {directTracks.length} {t('folders.tracks')}
                                </span>
                            </div>
                            {directTracks.map((track, i) => renderTrackRow(track, i, directTracks))}
                        </div>
                    )}

                    <div className="h-24" />
                </div>
            </div>
        );
    }

    // --- LIST MODE ---
    if (viewMode === 'list') {
        return (
            <div className="h-full flex flex-col p-3 md:p-6 pt-2 md:pt-20 bg-surface-primary">
                <Toolbar
                    breadcrumbs={breadcrumbSegments}
                    onBreadcrumbClick={navigateToPath}
                    viewModes={viewModes}
                    currentViewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    t={t}
                    folderCount={folders.length}
                    trackCount={directTracks.length}
                />

                <div className="mt-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {/* Column headers */}
                    <div className="sticky top-0 z-10 grid grid-cols-[1fr_70px_70px_40px] gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 border-b border-white/5 bg-surface-primary/95 backdrop-blur-sm">
                        <span>{t('folders.columnName')}</span>
                        <span className="text-right">{t('folders.columnTracks')}</span>
                        <span className="text-right">{t('folders.columnDirect')}</span>
                        <span />
                    </div>

                    {/* Parent row */}
                    {currentPath && (
                        <button
                            onClick={() => onNavigate('Folders', getParentPath(normalizedCurrentPath))}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors border-b border-white/[0.02]"
                        >
                            <CornerLeftUp size={15} className="text-white/40 flex-shrink-0" />
                            <span className="text-sm text-white/50">..</span>
                        </button>
                    )}

                    {/* Folder rows */}
                    {folders.map(folder => {
                        const palette = getMutedVisualStyle(seedFromText(folder.path));
                        return (
                            <button
                                key={folder.path}
                                onClick={() => handleFolderClick(folder)}
                                onContextMenu={(e) => onRightClick(e, folder)}
                                className="w-full grid grid-cols-[1fr_70px_70px_40px] gap-3 items-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors group border-b border-white/[0.02] text-left"
                            >
                                <span className="flex items-center gap-3 min-w-0">
                                    <FolderOpen size={16} style={{ color: palette.accentColor }} className="flex-shrink-0" />
                                    <span className="text-sm font-medium text-white truncate group-hover:text-dominant-light transition-colors">
                                        {folder.name}
                                    </span>
                                </span>
                                <span className="text-xs text-gray-400 text-right tabular-nums">{folder.tracks.length}</span>
                                <span className="text-xs text-gray-500 text-right tabular-nums">{folder.directTrackCount}</span>
                                <span className="flex justify-end">
                                    {folder.hasChildren
                                        ? <Folder size={13} className="text-gray-600" />
                                        : <FileAudio size={13} className="text-gray-600" />
                                    }
                                </span>
                            </button>
                        );
                    })}

                    {/* Direct tracks */}
                    {directTracks.length > 0 && (
                        <div className="mt-4 border-t border-white/5 pt-3">
                            {directTracks.map((track, i) => renderTrackRow(track, i, directTracks))}
                        </div>
                    )}

                    <div className="h-24" />
                </div>
            </div>
        );
    }

    // --- COLUMN VIEW ---
    return (
        <div className="h-full flex flex-col p-3 md:p-6 pt-2 md:pt-20 bg-surface-primary">
            <Toolbar
                breadcrumbs={breadcrumbSegments}
                onBreadcrumbClick={navigateToPath}
                viewModes={viewModes}
                currentViewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                sortBy={sortBy}
                onSortChange={setSortBy}
                t={t}
                folderCount={folders.length}
                trackCount={directTracks.length}
            />

            <div className="mt-3 flex-1 min-h-0 flex overflow-x-auto custom-scrollbar gap-0">
                {columnData.map((col, colIdx) => (
                    <div
                        key={col.path || '__root__'}
                        className="flex-shrink-0 w-60 h-full flex flex-col border-r border-white/5 last:border-r-0"
                    >
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 border-b border-white/5">
                            {col.path ? getPathBasename(col.path) : t('folders.libraryRoot')}
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {col.folders.map(folder => {
                                const isSelected = col.selectedPath === folder.path;
                                const palette = getMutedVisualStyle(seedFromText(folder.path));
                                return (
                                    <button
                                        key={folder.path}
                                        onClick={() => handleColumnSelect(colIdx, folder)}
                                        onContextMenu={(e) => onRightClick(e, folder)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                            isSelected ? 'bg-dominant/10 border-l-2 border-dominant' : 'hover:bg-white/[0.04] border-l-2 border-transparent'
                                        }`}
                                    >
                                        <FolderOpen size={13} style={{ color: palette.accentColor }} className="flex-shrink-0" />
                                        <span className={`text-xs font-medium truncate flex-1 ${isSelected ? 'text-dominant-light' : 'text-white/80'}`}>
                                            {folder.name}
                                        </span>
                                        <span className="text-[10px] text-gray-600 flex-shrink-0 tabular-nums">{folder.tracks.length}</span>
                                        {folder.hasChildren && <ChevronRight size={10} className="text-gray-600 flex-shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Preview panel for last selected path */}
                {columnSelections.length > 0 && (() => {
                    const lastSelection = columnSelections[columnSelections.length - 1];
                    const lastFolders = getFoldersAtPath(lastSelection);
                    if (lastFolders.length > 0) return null;

                    const leafTracks: TrackItem[] = [];
                    for (const group of allGroups.values() as Iterable<GroupedTracks<TrackItem>>) {
                        if (group.isUnknown) continue;
                        if (isPathWithin(lastSelection, group.name)) leafTracks.push(...group.tracks);
                    }
                    const artworkDetails = getFolderArtwork(leafTracks);

                    return (
                        <div className="flex-shrink-0 w-72 h-full flex flex-col bg-white/[0.01]">
                            <div className="px-4 py-3 border-b border-white/5">
                                {artworkDetails && (
                                    <div className="w-full aspect-square rounded-xl overflow-hidden mb-3">
                                        <ArtworkImage details={artworkDetails} alt={getPathBasename(lastSelection)} className="w-full h-full object-cover" loading="eager" />
                                    </div>
                                )}
                                <h3 className="text-sm font-bold text-white">{getPathBasename(lastSelection)}</h3>
                                <p className="text-xs text-gray-500 mt-1">{leafTracks.length} {t('folders.tracks')}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {leafTracks.map((track, i) => (
                                    <button
                                        key={track.logic.hash_sha256}
                                        onClick={() => playTrack(track, leafTracks)}
                                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                                    >
                                        <span className="text-[10px] text-gray-600 w-4 text-right flex-shrink-0 tabular-nums">{i + 1}</span>
                                        <span className="text-xs text-white/80 truncate">{track.metadata?.title || 'Untitled'}</span>
                                        <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{track.audio_specs?.duration || ''}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                <div className="w-16 flex-shrink-0" />
            </div>
        </div>
    );
};

// --- Toolbar ---
interface ToolbarProps {
    breadcrumbs: { label: string; path: string }[];
    onBreadcrumbClick: (path: string) => void;
    viewModes: { mode: FolderViewMode; icon: React.ReactNode; label: string }[];
    currentViewMode: FolderViewMode;
    onViewModeChange: (mode: FolderViewMode) => void;
    sortBy: FolderSortBy;
    onSortChange: (sort: FolderSortBy) => void;
    t: ReturnType<typeof useTranslation>['t'];
    folderCount: number;
    trackCount: number;
}

const Toolbar: React.FC<ToolbarProps> = ({
    breadcrumbs, onBreadcrumbClick, viewModes, currentViewMode, onViewModeChange, sortBy, onSortChange, t, folderCount, trackCount,
}) => (
    <div className="flex flex-col gap-2">
        {/* Top row: breadcrumbs + controls */}
        <div className="flex items-center justify-between gap-3">
            {/* Breadcrumb */}
            <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
                <button
                    onClick={() => onBreadcrumbClick('')}
                    className={`flex-shrink-0 px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                        breadcrumbs.length === 0 ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                    {t('folders.libraryRoot')}
                </button>
                {breadcrumbs.map((seg, i) => (
                    <React.Fragment key={seg.path}>
                        <ChevronRight size={11} className="text-gray-700 flex-shrink-0" />
                        <button
                            onClick={() => onBreadcrumbClick(seg.path)}
                            className={`flex-shrink-0 px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                                i === breadcrumbs.length - 1 ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {seg.label}
                        </button>
                    </React.Fragment>
                ))}
                {/* Counts */}
                <span className="text-[10px] text-gray-600 ml-3 flex-shrink-0">
                    {folderCount > 0 && `${folderCount} folders`}
                    {folderCount > 0 && trackCount > 0 && ' · '}
                    {trackCount > 0 && `${trackCount} files`}
                </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="flex bg-white/5 rounded-lg border border-white/5 p-0.5">
                    <button
                        onClick={() => onSortChange('name')}
                        className={`px-2 py-1 rounded-md transition-all ${sortBy === 'name' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        title={t('folders.sortName')}
                    >
                        <FolderOpen size={13} />
                    </button>
                    <button
                        onClick={() => onSortChange('count')}
                        className={`px-2 py-1 rounded-md transition-all ${sortBy === 'count' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        title={t('folders.sortCount')}
                    >
                        <Hash size={13} />
                    </button>
                </div>
                <div className="flex bg-white/5 rounded-lg border border-white/5 p-0.5">
                    {viewModes.map(v => (
                        <button
                            key={v.mode}
                            onClick={() => onViewModeChange(v.mode)}
                            className={`px-2 py-1 rounded-md transition-all ${currentViewMode === v.mode ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            title={v.label}
                        >
                            {v.icon}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    </div>
);
