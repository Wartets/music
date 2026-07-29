import React, { useRef, useState } from 'react';
import { persistenceService, Playlist } from '../../services/persistence';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import { useTranslation } from '../../i18n/I18nContext';
import { TrackItem } from '../../types/music';
import { Play, ListMinus, Trash2, FolderPlus, ListMusic, ScanSearch, Pencil, Edit3, Clock, Database, Copy, Download, Upload } from 'lucide-react';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { ArtworkImage } from '../shared/ArtworkImage';
import { SmartPlaylistBuilder } from './SmartPlaylistBuilder';
import { PlaylistEditor } from './PlaylistEditor';
import { evaluateSmartPlaylist, SmartPlaylistDefinition } from '../../utils/smartPlaylistEvaluator';
import { createPlaylistTrackContextMenu } from '../../utils/contextMenuPresets';
import { getBestArtwork } from '../../utils/artworkResolver';
import { EmptyState } from '../shared/EmptyState';
import { getTrackDisplayName } from '../../utils/trackUtils';
import { exportPlaylistFile, inferPlaylistFileFormat, parsePlaylistFile, resolveImportedPlaylistTracks, type PlaylistFileFormat } from '../../utils/playlistFormats';

interface PlaylistsViewProps {
    onNavigate?: (view: any, data?: any) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({ onNavigate }) => {
    const { state, setEditingTracks, refresh } = useLibrary();
    const { playTrack, addToQueue } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();
    const importInputRef = useRef<HTMLInputElement>(null);
    const [playlists, setPlaylists] = useState<Playlist[]>(persistenceService.getPlaylists());
    const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylistDefinition[]>(persistenceService.getSmartPlaylists());
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | SmartPlaylistDefinition | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isCreatingSmart, setIsCreatingSmart] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPlaylistName.trim()) return;
        const newPl = persistenceService.createPlaylist(newPlaylistName.trim());
        setPlaylists(persistenceService.getPlaylists());
        setNewPlaylistName('');
        setIsCreating(false);
        setSelectedPlaylist(newPl);
        showToast(t('playlists.created', { name: newPl.name }), 'success');
    };

    const syncPlaylistState = (playlistId?: string) => {
        const updatedPlaylists = persistenceService.getPlaylists();
        setPlaylists(updatedPlaylists);
        if (playlistId) {
            const refreshed = updatedPlaylists.find(playlist => playlist.id === playlistId);
            if (refreshed) setSelectedPlaylist(refreshed);
        }
    };

    const getResolvedTracksForPlaylist = (playlist: Playlist | SmartPlaylistDefinition): TrackItem[] => {
        const hashes = isSmartPlaylist(playlist) ? activeTrackIds : playlist.trackIds;
        return hashes
            .map(hash => state.tracks.find(track => track.logic.hash_sha256 === hash))
            .filter((track): track is TrackItem => Boolean(track));
    };

    const exportPlaylist = (name: string, tracks: TrackItem[], format: PlaylistFileFormat) => {
        const { content, mimeType, extension } = exportPlaylistFile(tracks, format);
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('playlists.exportedNamed', { name: `${name}.${extension}` }), 'success');
    };

    const showPlaylistExportMenu = (event: React.MouseEvent, playlist: Playlist | SmartPlaylistDefinition) => {
        event.preventDefault();
        event.stopPropagation();

        const tracks = getResolvedTracksForPlaylist(playlist);
        if (tracks.length === 0) {
            showToast(t('playlists.exportedEmpty'), 'warning');
            return;
        }

        showContextMenu(event.clientX, event.clientY, [
            {
                label: t('playlists.exportM3u'),
                icon: <Download size={14} />,
                onClick: () => exportPlaylist(playlist.name, tracks, 'm3u')
            },
            {
                label: t('playlists.exportM3u8'),
                icon: <Download size={14} />,
                onClick: () => exportPlaylist(playlist.name, tracks, 'm3u8')
            },
            {
                label: t('playlists.exportPls'),
                icon: <Download size={14} />,
                onClick: () => exportPlaylist(playlist.name, tracks, 'pls')
            },
        ]);
    };

    const handleImportPlaylistFile = async (file: File) => {
        try {
            const text = await file.text();
            const format = inferPlaylistFileFormat(file.name, text);
            const entries = parsePlaylistFile(text, format);
            const { tracks, matchedEntries, unmatchedEntries } = resolveImportedPlaylistTracks(entries, state.tracks);

            if (tracks.length === 0) {
                showToast(t('playlists.importedPlaylistEmpty', { name: file.name }), 'warning');
                return;
            }

            const playlistName = file.name.replace(/\.(m3u8|m3u|pls)$/i, '') || t('playlists.title');
            const newPlaylist = persistenceService.createPlaylist(playlistName);
            persistenceService.updatePlaylist(newPlaylist.id, { trackIds: tracks.map(track => track.logic.hash_sha256) });
            syncPlaylistState(newPlaylist.id);

            if (unmatchedEntries > 0) {
                showToast(
                    t('playlists.importedPlaylistPartial', { name: playlistName, matched: matchedEntries, unmatched: unmatchedEntries }),
                    'warning'
                );
            } else {
                showToast(t('playlists.importedPlaylist', { name: playlistName, count: tracks.length }), 'success');
            }
        } catch (error) {
            console.error('Failed to import playlist file:', error);
            showToast(t('playlists.importFailed', { name: file.name }), 'error');
        } finally {
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    const triggerImport = () => {
        importInputRef.current?.click();
    };

    const onRightClickTrack = (e: React.MouseEvent, track: TrackItem, playlist: Playlist) => {
        openItemContextMenu(
            e,
            track,
            state.tracks,
            onNavigate,
            createPlaylistTrackContextMenu({
                isSmart: false,
                track,
                playTrack,
                addToQueue,
                showToast,
                t,
                onRemoveFromPlaylist: () => {
                    persistenceService.removeFromPlaylist(playlist.id, track.logic.hash_sha256);
                    const updated = persistenceService.getPlaylists();
                    setPlaylists(updated);
                    const refreshed = updated.find(p => p.id === playlist.id);
                    if (refreshed) setSelectedPlaylist(refreshed);
                        showToast(t('playlists.trackRemoved'));
                    refresh();
                }
            })
        );
    };

    const onRightClickPlaylist = (e: React.MouseEvent, pl: Playlist) => {
        e.preventDefault();
        e.stopPropagation();

        showContextMenu(e.clientX, e.clientY, [
            {
                label: t('playlists.playPlaylist', { name: pl.name }),
                icon: <Play size={14} fill="currentColor" />,
                onClick: () => {
                    const tracks = pl.trackIds.map(h => state.tracks.find(t => t.logic.hash_sha256 === h)).filter(Boolean) as TrackItem[];
                    if (tracks.length > 0) playTrack(tracks[0], tracks);
                }
            },
            { divider: true, label: '', onClick: () => { } },
            {
                label: t('playlists.exportPlaylist'),
                icon: <ListMusic size={14} />,
                onClick: () => { },
                subItems: [
                    {
                        label: t('playlists.exportM3u'),
                        onClick: () => exportPlaylist(pl.name, getResolvedTracksForPlaylist(pl), 'm3u')
                    },
                    {
                        label: t('playlists.exportM3u8'),
                        onClick: () => exportPlaylist(pl.name, getResolvedTracksForPlaylist(pl), 'm3u8')
                    },
                    {
                        label: t('playlists.exportPls'),
                        onClick: () => exportPlaylist(pl.name, getResolvedTracksForPlaylist(pl), 'pls')
                    },
                ]
            },
            { divider: true, label: '', onClick: () => { } },
            {
                label: t('playlists.editPlaylist'),
                icon: <Pencil size={14} />,
                onClick: () => setEditingPlaylist(pl)
            },
            {
                label: t('playlists.duplicatePlaylist'),
                icon: <Copy size={14} />,
                onClick: () => {
                    const clone = persistenceService.createPlaylist(`${pl.name} (Copy)`, pl.description);
                    pl.trackIds.forEach(hash => persistenceService.addTrackToPlaylist(clone.id, hash));
                    if (pl.customImage) {
                        persistenceService.updatePlaylist(clone.id, { customImage: pl.customImage });
                    }
                    syncPlaylistState();
                    showToast(t('playlists.playlistDuplicated'), 'success');
                }
            },
            {
                label: t('playlists.clearTracks'),
                icon: <ListMinus size={14} />,
                onClick: () => {
                    if (!confirm(t('playlists.clearConfirm', { name: pl.name }))) return;
                    persistenceService.updatePlaylist(pl.id, { trackIds: [] });
                    syncPlaylistState(pl.id);
                    const refreshed = persistenceService.getPlaylists().find(p => p.id === pl.id);
                    if (refreshed) setSelectedPlaylist(refreshed);
                    showToast(t('playlists.playlistCleared'), 'success');
                }
            },
            {
                label: t('playlists.exportJson'),
                icon: <Download size={14} />,
                onClick: () => {
                    const payload = JSON.stringify(pl, null, 2);
                    const blob = new Blob([payload], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${pl.name}.playlist.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast(t('playlists.exportedNamed', { name: `${pl.name}.playlist.json` }), 'success');
                }
            },
            {
                label: t('playlists.deletePlaylist'),
                icon: <Trash2 size={14} />,
                danger: true,
                onClick: () => {
                    if (confirm(t('playlists.deleteConfirmDynamic', { name: pl.name }))) {
                        persistenceService.deletePlaylist(pl.id);
                        setPlaylists(persistenceService.getPlaylists());
                        if (selectedPlaylist?.id === pl.id) setSelectedPlaylist(null);
                        showToast(t('playlists.playlistDeleted'));
                    }
                }
            }
        ]);
    };

    const togglePlaylist = (pl: Playlist | SmartPlaylistDefinition) => {
        setSelectedPlaylist(selectedPlaylist?.id === pl.id ? null : pl);
    };

    const reorderSelectedPlaylist = (mode: 'shuffle' | 'alpha' | 'dedupe') => {
        if (!selectedPlaylist || isSmartPlaylist(selectedPlaylist)) return;
        const current = selectedPlaylist as Playlist;
        const resolvedTracks = current.trackIds
            .map(hash => state.tracks.find(t => t.logic.hash_sha256 === hash))
            .filter((track): track is TrackItem => Boolean(track));

        let nextTrackIds = [...current.trackIds];
        if (mode === 'shuffle') {
            nextTrackIds = [...current.trackIds].sort(() => Math.random() - 0.5);
        } else if (mode === 'alpha') {
            nextTrackIds = resolvedTracks
                .slice()
                .sort((a, b) => (a.metadata?.title || a.logic.track_name).localeCompare(b.metadata?.title || b.logic.track_name))
                .map(track => track.logic.hash_sha256);
        } else {
            nextTrackIds = Array.from(new Set(current.trackIds));
        }

        persistenceService.updatePlaylist(current.id, { trackIds: nextTrackIds });
        const updated = persistenceService.getPlaylists().find(p => p.id === current.id);
        if (updated) setSelectedPlaylist(updated);
        setPlaylists(persistenceService.getPlaylists());
        showToast(
            mode === 'shuffle'
                ? t('playlists.playlistShuffled')
                : mode === 'alpha'
                    ? t('playlists.playlistSortedAZ')
                    : t('playlists.duplicatesRemoved'),
            'success'
        );
    };

    const isSmartPlaylist = (pl: any): pl is SmartPlaylistDefinition => {
        return 'group' in pl;
    };

    const getActiveTrackIds = (): string[] => {
        if (!selectedPlaylist) return [];
        if (isSmartPlaylist(selectedPlaylist)) {
            const evaluated = evaluateSmartPlaylist(state.tracks, selectedPlaylist);
            return evaluated.map(t => t.logic.hash_sha256);
        }
        return selectedPlaylist.trackIds;
    };

    const activeTrackIds = getActiveTrackIds();

    const getTrackByHash = (hash: string): TrackItem | undefined => {
        return state.tracks.find(t => t.logic.hash_sha256 === hash);
    };

    return (
        <div className="h-full flex flex-col p-3 md:p-6 pt-0 md:pt-24 overflow-hidden relative z-10 bg-surface-primary">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4 md:mb-10">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white">{t('playlists.title')}</h1>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1">{playlists.length + smartPlaylists.length} {t('playlists.userCollections')}</p>
                </div>
                <div className="flex gap-2 md:gap-4">
                    <button
                        onClick={triggerImport}
                        className="bg-white/5 border border-white/10 text-white px-3 md:px-6 py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-lg flex items-center gap-2"
                    >
                        <Upload size={16} /> {t('playlists.importPlaylist')}
                    </button>
                    {selectedPlaylist && (
                        <button
                            onClick={(e) => showPlaylistExportMenu(e, selectedPlaylist)}
                            className="bg-white/5 border border-white/10 text-white px-3 md:px-6 py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-lg flex items-center gap-2"
                        >
                            <Download size={16} /> {t('playlists.exportPlaylist')}
                        </button>
                    )}
                    <button
                        onClick={() => { setIsCreating(false); setIsCreatingSmart(true); }}
                        className="bg-white/5 border border-white/10 text-white px-3 md:px-6 py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-lg flex items-center gap-2"
                    >
                        <ScanSearch size={16} /> {t('playlists.smartPlaylist')}
                    </button>
                    <button
                        onClick={() => { setIsCreatingSmart(false); setIsCreating(true); }}
                        className="bg-dominant text-on-dominant px-3 md:px-6 py-2.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-dominant-light transition-all shadow-lg"
                    >
                        {t('playlists.createNew')}
                    </button>
                </div>
            </div>

            {isCreatingSmart && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                    <SmartPlaylistBuilder
                        tracks={state.tracks}
                        onSave={(def) => {
                            setSmartPlaylists(persistenceService.getSmartPlaylists());
                            setIsCreatingSmart(false);
                            setSelectedPlaylist(def);
                            showToast(t('playlists.smartCreated', { name: def.name }), 'success');
                        }}
                        onCancel={() => setIsCreatingSmart(false)}
                    />
                </div>
            )}

            {editingPlaylist && (
                <PlaylistEditor
                    playlist={editingPlaylist}
                    onSave={(updated) => {
                        setPlaylists(persistenceService.getPlaylists());
                        if (selectedPlaylist?.id === updated.id) setSelectedPlaylist(updated);
                        setEditingPlaylist(null);
                        showToast(t('playlists.playlistUpdated'), 'success');
                    }}
                    onCancel={() => setEditingPlaylist(null)}
                    onDelete={(id) => {
                        persistenceService.deletePlaylist(id);
                        setPlaylists(persistenceService.getPlaylists());
                        if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
                        setEditingPlaylist(null);
                        showToast(t('playlists.playlistDeleted'), 'success');
                    }}
                />
            )}

            <input
                ref={importInputRef}
                type="file"
                accept=".m3u,.m3u8,.pls,audio/x-mpegurl,audio/x-scpls,application/vnd.apple.mpegurl"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        void handleImportPlaylistFile(file);
                    }
                }}
            />

            {isCreating && (
                <form onSubmit={handleCreate} className="mb-6 sm:mb-8 bg-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white/5 flex items-center justify-center text-dominant flex-shrink-0">
                        <FolderPlus size={20} className="sm:hidden" />
                        <FolderPlus size={24} className="hidden sm:block" />
                    </div>
                    <input
                        type="text"
                        value={newPlaylistName}
                        onChange={e => setNewPlaylistName(e.target.value)}
                        placeholder={t('playlists.namePlaceholder')}
                        className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 sm:py-3 text-white flex-1 outline-none focus:border-dominant transition-all font-bold text-base min-h-12"
                        autoFocus
                    />
                    <div className="flex gap-2 sm:gap-3">
                        <button type="submit" className="bg-dominant text-on-dominant font-black px-4 sm:px-6 py-3 rounded-xl hover:bg-dominant-light transition-all uppercase tracking-widest text-[10px] sm:text-xs flex-1 sm:flex-none min-h-11">
                            {t('playlists.create')}
                        </button>
                        <button type="button" onClick={() => setIsCreating(false)} className="text-gray-400 font-bold hover:text-white px-3 sm:px-4 py-3 transition-colors text-[10px] sm:text-xs uppercase tracking-widest min-h-11">
                            {t('playlists.cancel')}
                        </button>
                    </div>
                </form>
            )}

            <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-10 overflow-hidden">
                {/* Left: List of Playlists */}
                <div className="w-full lg:w-80 max-h-[32vh] lg:max-h-none flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1 md:pr-2 pb-4 md:pb-8">
                    {playlists.length === 0 && smartPlaylists.length === 0 && !isCreating ? (
                        <EmptyState
                            icon={<FolderPlus size={32} />}
                            title={t('playlists.noPlaylistsYet')}
                            subtitle={t('playlists.noPlaylistsDesc')}
                            className="h-48 border-2 border-dashed border-white/5 rounded-3xl"
                            iconClassName="opacity-20 mb-2"
                            titleClassName="text-xs font-black uppercase tracking-[0.2em] text-white/30 mb-2"
                            subtitleClassName="text-xs text-gray-500"
                        />
                    ) : (
                        <>
                            {smartPlaylists.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() => togglePlaylist(pl)}
                                    className={`text-left p-5 rounded-2xl transition-all border block w-full group ${selectedPlaylist?.id === pl.id ? 'bg-dominant border-dominant shadow-2xl shadow-dominant/20' : 'bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10 text-dominant">
                                            <ScanSearch size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`font-black truncate text-base ${selectedPlaylist?.id === pl.id ? 'text-on-dominant' : 'text-white'}`}>{pl.name}</h3>
                                            <div className="flex items-center justify-between mt-1">
                                                <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedPlaylist?.id === pl.id ? 'text-on-dominant/70' : 'text-gray-500'}`}>{t('playlists.smartCollection')}</p>
                                                <Play size={12} className={`${selectedPlaylist?.id === pl.id ? 'text-on-dominant' : 'text-transparent group-hover:text-dominant'} transition-colors`} fill="currentColor" />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {playlists.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() => togglePlaylist(pl)}
                                    onContextMenu={(e) => onRightClickPlaylist(e, pl)}
                                    className={`text-left p-5 rounded-2xl transition-all border block w-full group ${selectedPlaylist?.id === pl.id ? 'bg-dominant border-dominant shadow-2xl shadow-dominant/20' : 'bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        {pl.customImage ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 border border-white/10">
                                                <ArtworkImage src={pl.customImage} alt={pl.name} className="w-full h-full object-cover" />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10 text-white/20">
                                                <ListMusic size={20} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`font-black truncate text-base ${selectedPlaylist?.id === pl.id ? 'text-on-dominant' : 'text-white'}`}>{pl.name}</h3>
                                            <div className="flex items-center justify-between mt-1">
                                                <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedPlaylist?.id === pl.id ? 'text-on-dominant/70' : 'text-gray-500'}`}>{pl.trackIds.length} {t('playlists.tracks')}</p>
                                                <Play size={12} className={`${selectedPlaylist?.id === pl.id ? 'text-on-dominant' : 'text-transparent group-hover:text-dominant'} transition-colors`} fill="currentColor" />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>

                {/* Right: Selected Playlist Details */}
                <div className="flex-1 overflow-hidden relative min-h-0">
                    <AnimatePresence mode="wait">
                        {selectedPlaylist ? (
                            <div key={selectedPlaylist.id} className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="mb-4 md:mb-8 flex flex-col sm:flex-row items-start sm:items-end gap-4 md:gap-8 pb-4 md:pb-8 border-b border-white/5 relative group">
                                    <div className="w-24 h-24 md:w-44 md:h-44 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-white/5 flex-shrink-0 relative">
                                        {(selectedPlaylist as Playlist).customImage || isSmartPlaylist(selectedPlaylist) ? (
                                            <ArtworkImage
                                                src={isSmartPlaylist(selectedPlaylist) ? undefined : (selectedPlaylist as Playlist).customImage}
                                                alt={selectedPlaylist.name}
                                                className={`w-full h-full object-cover ${isSmartPlaylist(selectedPlaylist) ? 'opacity-0' : ''}`}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/10">
                                                <ListMusic size={64} />
                                            </div>
                                        )}
                                        {isSmartPlaylist(selectedPlaylist) && (
                                            <div className="absolute inset-0 flex items-center justify-center text-dominant">
                                                <ScanSearch size={64} />
                                            </div>
                                        )}
                                        {!isSmartPlaylist(selectedPlaylist) && (
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button
                                                    onClick={() => setEditingPlaylist(selectedPlaylist as Playlist)}
                                                    className="bg-white/20 hover:bg-white/30 p-3 rounded-full text-white backdrop-blur-md transition-transform hover:scale-110"
                                                    aria-label={t('playlists.editDetails')}
                                                >
                                                    <Edit3 size={24} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="px-2 py-0.5 bg-dominant/20 text-dominant text-[10px] font-black uppercase tracking-widest rounded-md">
                                                {isSmartPlaylist(selectedPlaylist) ? t('playlists.smartCollection') : t('playlists.curatedPlaylist')}
                                            </span>
                                            {isSmartPlaylist(selectedPlaylist) && (
                                                <span className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                                    <Clock size={10} /> {t('playlists.liveEvaluation')}
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-2xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-4 truncate leading-none">{selectedPlaylist.name}</h2>

                                        {!isSmartPlaylist(selectedPlaylist) && (selectedPlaylist as Playlist).description && (
                                            <p className="text-gray-400 font-medium text-sm max-w-2xl mb-6 line-clamp-2 italic">
                                                "{(selectedPlaylist as Playlist).description}"
                                            </p>
                                        )}

                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-2 text-gray-500 font-bold uppercase tracking-[0.2em] text-[10px]">
                                                <Database size={12} className="text-dominant" />
                                                <span>{activeTrackIds.length} {t('playlists.tracks')}</span>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => {
                                                        const tracks = activeTrackIds.map(h => state.tracks.find(t => t.logic.hash_sha256 === h)).filter(Boolean) as TrackItem[];
                                                        if (tracks.length > 0) playTrack(tracks[0], tracks);
                                                    }}
                                                    className="flex items-center gap-2 px-4 md:px-8 py-2.5 md:py-3 bg-dominant text-on-dominant rounded-xl text-[10px] md:text-xs font-black hover:bg-dominant-light transition-all shadow-xl shadow-dominant/20 uppercase tracking-widest"
                                                >
                                                    <Play size={14} fill="currentColor" /> {t('playlists.playMix')}
                                                </button>
                                                {!isSmartPlaylist(selectedPlaylist) && (
                                                    <>
                                                        <button onClick={() => setEditingPlaylist(selectedPlaylist as Playlist)} className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest text-white transition-all border border-white/10">
                                                            <Pencil size={14} /> {t('playlists.editDetails')}
                                                        </button>
                                                        <button onClick={() => reorderSelectedPlaylist('alpha')} className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest text-white transition-all border border-white/10">
                                                            <ListMusic size={14} /> {t('playlists.sortAZ')}
                                                        </button>
                                                        <button onClick={() => reorderSelectedPlaylist('shuffle')} className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest text-white transition-all border border-white/10">
                                                            <ScanSearch size={14} /> {t('playlists.shuffleBtn')}
                                                        </button>
                                                        <button onClick={() => reorderSelectedPlaylist('dedupe')} className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest text-white transition-all border border-white/10">
                                                            <Copy size={14} /> {t('playlists.deduplicate')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                    {activeTrackIds.length === 0 ? (
                                        <EmptyState
                                            icon={<ListMusic size={32} />}
                                            title={t('playlists.emptyCollection')}
                                            className="h-full"
                                            iconClassName="opacity-20 mb-3"
                                            titleClassName="font-black uppercase tracking-[0.2em] text-xs text-white/30"
                                        />
                                    ) : (
                                        <div className="space-y-2 pb-20">
                                            {activeTrackIds.map((hash, idx) => {
                                                const track = getTrackByHash(hash);
                                                if (!track) return null;
                                                const handleRemove = () => {
                                                    if (isSmartPlaylist(selectedPlaylist)) return;
                                                    persistenceService.removeFromPlaylist((selectedPlaylist as Playlist).id, track.logic.hash_sha256);
                                                    const updated = persistenceService.getPlaylists();
                                                    setPlaylists(updated);
                                                    const refreshed = updated.find(p => p.id === (selectedPlaylist as Playlist).id);
                                                    if (refreshed) setSelectedPlaylist(refreshed);
                                                    showToast(t('playlists.trackRemoved'));
                                                    refresh();
                                                };
                                                return (
                                                    <div
                                                        key={`${hash}-${idx}`}
                                                        className="flex items-center justify-between p-3 sm:p-4 bg-white/2 border border-transparent rounded-xl sm:rounded-2xl group hover:bg-white/5 hover:border-white/5 transition-all cursor-pointer relative"
                                                        onClick={() => playTrack(track, state.tracks)}
                                                        onContextMenu={(e) => {
                                                            if (!isSmartPlaylist(selectedPlaylist)) {
                                                                onRightClickTrack(e, track, selectedPlaylist as Playlist);
                                                            } else {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                showContextMenu(
                                                                    e.clientX,
                                                                    e.clientY,
                                                                    createPlaylistTrackContextMenu({
                                                                        isSmart: true,
                                                                        track,
                                                                        playTrack: (selectedTrack) => playTrack(selectedTrack, state.tracks),
                                                                        addToQueue,
                                                                        showToast,
                                                                        t,
                                                                        onEditMetadata: () => setEditingTracks([track])
                                                                    })
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 sm:h-8 bg-dominant rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                        <div className="flex items-center min-w-0 flex-1 gap-3 sm:gap-5">
                                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-black/50 overflow-hidden flex items-center justify-center text-xs text-white/30 flex-shrink-0 border border-white/10 group-hover:border-white/20 transition-all">
                                                                <ArtworkImage details={getBestArtwork(track)} alt={getTrackDisplayName(track)} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="text-white font-black text-sm truncate group-hover:text-dominant-light transition-colors">{getTrackDisplayName(track)}</h4>
                                                                <p className="text-gray-500 font-bold text-[10px] uppercase tracking-tighter truncate mt-1">{track.metadata?.artists?.join(', ')}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-4">
                                                            <span className="text-xs font-bold text-gray-600 font-mono hidden sm:block">{track.audio_specs?.duration}</span>
                                                            {!isSmartPlaylist(selectedPlaylist) && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                                                                    className="p-2 min-w-10 min-h-10 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                                    aria-label={t('playlists.removeFromPlaylist')}
                                                                >
                                                                    <ListMinus size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <EmptyState
                                icon={<ListMusic size={40} />}
                                title={t('playlists.selectCollection')}
                                subtitle={t('playlists.selectCollectionDesc')}
                                className="h-full animate-in fade-in duration-700"
                                iconClassName="opacity-10 mb-6"
                                titleClassName="text-xl font-black text-white/20 uppercase tracking-[0.4em] mb-4"
                                subtitleClassName="text-xs font-bold uppercase tracking-widest text-gray-600"
                            />
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

const AnimatePresence: React.FC<{ children: React.ReactNode, mode?: string }> = ({ children }) => <>{children}</>;
