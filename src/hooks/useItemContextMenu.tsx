import React from 'react';
import { useUI } from '../contexts/UIContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import { persistenceService } from '../services/persistence';
import { dbService } from '../services/db';
import { TrackItem } from '../types/music';
import { RepeatMode } from '../types/playback';
import { parseDuration } from '../utils/formatters';
import { getArtistsDisplayName } from '../utils/artistUtils';
import { getTrackDisplayName } from '../utils/trackUtils';
import { sanitizeExportPath } from '../utils/exportSanitizer';
import { useTranslation } from '../i18n/I18nContext';
import {
    Play, ListPlus, User, Disc, Heart, Star, Pencil, Copy, Share, FolderPlus, Zap, Plus,
    Download, Eye, Repeat, FastForward, Info, RefreshCw, Tag, SlidersHorizontal, Trash2, EyeOff, ListMinus
} from 'lucide-react';
import { tabSync } from '../services/tabSync';
import { ContextMenuItem } from '../components/shared/ContextMenu';

interface NavigationHandler {
    (view: any, data?: any): void;
}

export interface UseItemContextMenuOptions<T> {
    getItems?: (args: {
        item: T;
        list: T[];
        onNavigate?: NavigationHandler;
        additionalItems?: ContextMenuItem[];
    }) => ContextMenuItem[];
}

const isTrackItem = (item: unknown): item is TrackItem => {
    if (!item || typeof item !== 'object') return false;
    const maybeTrack = item as Partial<TrackItem>;
    return Boolean(maybeTrack.logic?.hash_sha256);
};

export const useItemContextMenu = <T = TrackItem>(options?: UseItemContextMenuOptions<T>) => {
    const { showContextMenu, showToast } = useUI();
    const { playTrack, addToQueue, addToNext, seek, setRepeat, stop } = usePlayer();
    const { state: libraryState, setEditingTracks, refresh } = useLibrary();
    const { t } = useTranslation();
    const previewTimerRef = React.useRef<number | null>(null);

    const clearPreviewTimer = React.useCallback(() => {
        if (previewTimerRef.current !== null) {
            window.clearTimeout(previewTimerRef.current);
            previewTimerRef.current = null;
        }
    }, []);

    React.useEffect(() => {
        return () => {
            clearPreviewTimer();
        };
    }, [clearPreviewTimer]);

    const exportM3U = React.useCallback((name: string, tracks: TrackItem[]) => {
        let m3u = '#EXTM3U\n';
        tracks.forEach((t) => {
            const secs = parseDuration(t.audio_specs?.duration || '0:00');
            m3u += `#EXTINF:${Math.round(secs)},${getArtistsDisplayName(t.metadata?.artists, 'Unknown')} - ${t.metadata?.title || t.logic.track_name}\n`;
            m3u += `${sanitizeExportPath(t.file?.path) || ''}\n`;
        });
        const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.m3u`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const createTrackContextMenu = React.useCallback((args: {
        item: TrackItem;
        list: TrackItem[];
        onNavigate?: NavigationHandler;
        additionalItems?: ContextMenuItem[];
    }): ContextMenuItem[] => {
        const { item: track, list, onNavigate, additionalItems = [] } = args;
        const playlists = persistenceService.getPlaylists();
        const isFavorite = persistenceService.isFavorite(track.logic.hash_sha256);
        const containingPlaylists = playlists.filter(pl => pl.trackIds.includes(track.logic.hash_sha256));
        const hasPlaylists = playlists.length > 0;

        const playbackActions: ContextMenuItem[] = [
            {
                label: t('contextMenu.play'),
                icon: <Play size={14} fill="currentColor" />,
                onClick: () => {
                    clearPreviewTimer();
                    playTrack(track, list.length > 0 ? list : [track]);
                    showToast(t('contextMenu.playNow'));
                }
            },
            {
                label: t('contextMenu.preview'),
                icon: <Eye size={14} />,
                onClick: () => {
                    clearPreviewTimer();
                    playTrack(track, [track]);
                    showToast(t('contextMenu.previewStarted'), 'info', { subtle: true, durationMs: 1400 });
                    previewTimerRef.current = window.setTimeout(() => {
                        stop();
                        showToast(t('contextMenu.previewEnded'), 'info', { subtle: true, durationMs: 1400 });
                        previewTimerRef.current = null;
                    }, 15000);
                }
            },
            {
                label: t('contextMenu.playNext'),
                icon: <Zap size={14} className="text-dominant-light" />,
                onClick: () => {
                    addToNext(track);
                    showToast(t('contextMenu.addedToPlayNext', { title: getTrackDisplayName(track, 'Track') }), 'success');
                }
            },
            {
                label: t('contextMenu.addToQueue'),
                icon: <ListPlus size={14} />,
                onClick: () => {
                    addToQueue(track);
                    showToast(t('contextMenu.addedToQueue', { title: getTrackDisplayName(track, 'Track') }));
                }
            },
            {
                label: t('contextMenu.skipToEnd'),
                icon: <FastForward size={14} />,
                onClick: () => {
                    const duration = parseDuration(track.audio_specs?.duration || '0:00');
                    if (duration > 1) {
                        seek(Math.max(0, duration - 0.5));
                        showToast(t('contextMenu.jumpedNearEnd'), 'info', { subtle: true });
                    }
                }
            },
            {
                label: t('contextMenu.loopPlayback'),
                icon: <Repeat size={14} />,
                onClick: () => {
                    setRepeat(RepeatMode.One);
                    playTrack(track, [track]);
                    showToast(t('contextMenu.repeatOneEnabled'), 'success');
                }
            },
        ];

        const navigateActions: ContextMenuItem[] = [
            ...((onNavigate && track.metadata?.artists?.[0]) ? [{
                label: t('contextMenu.goToArtist'),
                icon: <User size={14} />,
                onClick: () => onNavigate('ArtistDetail', track.metadata.artists[0])
            }] : []),
            ...((track.metadata?.artists?.[0]) ? [{
                label: t('contextMenu.openArtistInNewTab'),
                icon: <Share size={14} />,
                onClick: () => tabSync.openInNewTab('openArtist', { artist: track.metadata.artists[0] })
            }] : []),
            ...((onNavigate && track.metadata?.album) ? [{
                label: t('contextMenu.goToAlbum'),
                icon: <Disc size={14} />,
                onClick: () => onNavigate('AlbumDetail', track.metadata.album)
            }] : []),
            ...((track.metadata?.album) ? [{
                label: t('contextMenu.openAlbumInNewTab'),
                icon: <Share size={14} />,
                onClick: () => tabSync.openInNewTab('openAlbum', { album: track.metadata.album })
            }] : []),
            {
                label: t('contextMenu.showDetailedInformation'),
                icon: <Info size={14} />,
                onClick: () => onNavigate?.('SongDetail', track)
            },
            {
                label: t('contextMenu.viewSimilarAlbums'),
                icon: <Disc size={14} />,
                onClick: () => { },
                lazySubItems: () => {
                    const similarAlbums = Array.from(new Set(
                        libraryState.tracks
                            .filter(t => t.logic.hash_sha256 !== track.logic.hash_sha256)
                            .filter(t => {
                                const sameArtist = (t.metadata?.artists || []).some(a => (track.metadata?.artists || []).includes(a));
                                const sameGenre = t.metadata?.genre && track.metadata?.genre && t.metadata.genre === track.metadata.genre;
                                return Boolean(sameArtist || sameGenre);
                            })
                            .map(t => t.metadata?.album)
                            .filter((album): album is string => Boolean(album) && album !== track.metadata?.album)
                    )).slice(0, 8);

                    return similarAlbums.map(album => ({
                        label: album,
                        onClick: () => onNavigate?.('AlbumDetail', album)
                    }));
                }
            }
        ];

        const playlistActions: ContextMenuItem[] = [
            {
                label: t('contextMenu.addToPlaylist'),
                icon: <Plus size={14} />,
                onClick: () => { },
                disabled: !hasPlaylists,
                subItems: playlists.map(pl => ({
                    label: pl.name,
                    onClick: () => {
                        persistenceService.addTrackToPlaylist(pl.id, track.logic.hash_sha256);
                        showToast(t('contextMenu.addedToPlaylist', { name: pl.name }), 'success');
                    }
                }))
            },
            {
                label: t('contextMenu.removeFromPlaylist'),
                icon: <ListMinus size={14} />,
                onClick: () => { },
                disabled: containingPlaylists.length === 0,
                subItems: containingPlaylists.map(pl => ({
                    label: pl.name,
                    onClick: () => {
                        persistenceService.removeFromPlaylist(pl.id, track.logic.hash_sha256);
                        showToast(t('contextMenu.removedFromPlaylist', { name: pl.name }), 'success');
                        refresh();
                    }
                }))
            },
            {
                label: t('contextMenu.saveAsNewPlaylist'),
                icon: <FolderPlus size={14} />,
                onClick: () => {
                    const plName = getTrackDisplayName(track, 'New Playlist');
                    const newPl = persistenceService.createPlaylist(plName);
                    persistenceService.addTrackToPlaylist(newPl.id, track.logic.hash_sha256);
                    showToast(t('playlists.created', { name: plName }), 'success');
                }
            },
            {
                label: t('contextMenu.exportTrackPlaylistM3u'),
                icon: <Share size={14} />,
                onClick: () => {
                    exportM3U(getTrackDisplayName(track, 'track'), [track]);
                    showToast(t('contextMenu.m3uExported'), 'success');
                }
            }
        ];

        const libraryActions: ContextMenuItem[] = [
            {
                label: isFavorite ? t('contextMenu.removeFromFavorites') : t('contextMenu.addToFavorites'),
                icon: <Heart size={14} className={isFavorite ? 'text-red-400 fill-red-400' : ''} />,
                onClick: () => {
                    const nowFav = persistenceService.toggleFavorite(track.logic.hash_sha256);
                    showToast(nowFav ? t('contextMenu.addedToFavorites') : t('contextMenu.removedFromFavorites'), 'success');
                    refresh();
                }
            },
            {
                label: t('contextMenu.rate'),
                icon: <Star size={14} />,
                onClick: () => { },
                subItems: [0, 1, 2, 3, 4, 5].map(r => ({
                    label: r === 0 ? t('contextMenu.clearRating') : `${r}/5`,
                    onClick: () => {
                        persistenceService.setRating(track.logic.hash_sha256, r);
                        showToast(r === 0 ? t('contextMenu.ratingCleared') : t('contextMenu.ratedStars', { count: r, suffix: r > 1 ? 's' : '' }), 'success');
                        refresh();
                    }
                }))
            },
            {
                label: t('contextMenu.addCustomTags'),
                icon: <Tag size={14} />,
                onClick: () => setEditingTracks([track])
            },
            {
                label: t('contextMenu.editMetadata'),
                icon: <Pencil size={14} />,
                onClick: () => setEditingTracks([track])
            },
            {
                label: t('contextMenu.enableEqualizer'),
                icon: <SlidersHorizontal size={14} />,
                onClick: () => onNavigate?.('Settings', { tab: 'audio' })
            },
        ];

        const utilityActions: ContextMenuItem[] = [
            {
                label: t('contextMenu.download'),
                icon: <Download size={14} />,
                onClick: () => {
                    const href = dbService.getRelativePath(track.file.path);
                    const a = document.createElement('a');
                    a.href = href;
                    a.download = track.file?.name || `${track.logic.track_name}.${track.file?.ext || 'audio'}`;
                    a.click();
                    showToast(t('contextMenu.downloadStarted'), 'success');
                }
            },
            {
                label: t('contextMenu.openInNewTab'),
                icon: <Share size={14} />,
                onClick: () => {
                    // only expose when tab-sync like features exist
                    const canOpen = typeof window !== 'undefined' && ('SharedWorker' in window || 'BroadcastChannel' in window);
                    if (!canOpen) return;
                    tabSync.openInNewTab('openTrack', { trackId: track.logic.hash_sha256 });
                }
            },
            {
                label: t('contextMenu.copyFilePath'),
                icon: <Copy size={14} />,
                onClick: () => {
                    navigator.clipboard.writeText(track.file.path);
                    showToast(t('contextMenu.filePathCopied'));
                }
            },
            {
                label: t('common.copySha256Hash' as any),
                icon: <Share size={14} />,
                onClick: () => {
                    navigator.clipboard.writeText(track.logic.hash_sha256);
                    showToast(t('common.hashCopied' as any));
                }
            }
        ];

        const maintenanceActions: ContextMenuItem[] = [
            {
                label: t('common.refreshLibrary' as any),
                icon: <RefreshCw size={14} />,
                onClick: () => {
                    window.location.reload();
                }
            },
            {
                label: t('settings.maintenance.clearHistory' as any),
                icon: <Trash2 size={14} />,
                onClick: () => {
                    persistenceService.clearHistory();
                    showToast(t('queue.playbackHistoryCleared' as any), 'success');
                    refresh();
                }
            },
            {
                label: t('common.hideItem' as any),
                icon: <EyeOff size={14} />,
                onClick: () => {
                    persistenceService.hideTrack(track.logic.hash_sha256);
                    showToast(t('common.trackHidden' as any), 'warning');
                    window.setTimeout(() => window.location.reload(), 250);
                }
            }
        ];

        const groupedMenus: ContextMenuItem[] = [
            {
                label: t('contextMenu.playbackActions'),
                icon: <Play size={14} />,
                onClick: () => { },
                subItems: playbackActions,
            },
            ...(navigateActions.length > 0 ? [{
                label: t('contextMenu.goToExplore'),
                icon: <Info size={14} />,
                onClick: () => { },
                subItems: navigateActions,
            }] : []),
            {
                label: t('contextMenu.playlists'),
                icon: <FolderPlus size={14} />,
                onClick: () => { },
                subItems: playlistActions,
            },
            {
                label: t('contextMenu.libraryMetadata'),
                icon: <Tag size={14} />,
                onClick: () => { },
                subItems: libraryActions,
            },
            {
                label: t('contextMenu.utilities'),
                icon: <Copy size={14} />,
                onClick: () => { },
                subItems: utilityActions,
            },
            {
                label: t('contextMenu.maintenance'),
                icon: <RefreshCw size={14} />,
                onClick: () => { },
                subItems: maintenanceActions,
            },
        ];

        return [
            {
                label: t('contextMenu.playNow'),
                icon: <Play size={14} fill="currentColor" />,
                onClick: () => {
                    playTrack(track, list.length > 0 ? list : [track]);
                    showToast(t('contextMenu.playNow'));
                }
            },
            {
                label: t('contextMenu.playNext'),
                icon: <Zap size={14} className="text-dominant-light" />,
                onClick: () => {
                    addToNext(track);
                    showToast(t('contextMenu.addedToPlayNext', { title: getTrackDisplayName(track, t('library.unknown')) }), 'success');
                }
            },
            {
                label: t('contextMenu.addToQueue'),
                icon: <ListPlus size={14} />,
                onClick: () => {
                    addToQueue(track);
                    showToast(t('contextMenu.addedToQueue', { title: getTrackDisplayName(track, t('library.unknown')) }));
                }
            },
            { divider: true, label: '', onClick: () => { } },
            ...groupedMenus,
            ...additionalItems,
        ];
    }, [
        addToNext,
        addToQueue,
        clearPreviewTimer,
        exportM3U,
        libraryState.tracks,
        playTrack,
        refresh,
        seek,
        setEditingTracks,
        setRepeat,
        showToast,
        stop,
    ]);

    const openItemContextMenu = React.useCallback((
        e: React.MouseEvent,
        item: T,
        list: T[] = [],
        onNavigate?: NavigationHandler,
        additionalItems: ContextMenuItem[] = [],
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const items = options?.getItems
            ? options.getItems({ item, list, onNavigate, additionalItems })
            : isTrackItem(item)
                ? createTrackContextMenu({
                    item,
                    list: (list as unknown as TrackItem[]),
                    onNavigate,
                    additionalItems,
                })
                : additionalItems;

        showContextMenu(e.clientX, e.clientY, items);
    }, [createTrackContextMenu, options, showContextMenu]);

    return {
        openItemContextMenu,
        createTrackContextMenu,
    };
};

export const useTrackContextMenu = () => {
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();

    return {
        openTrackContextMenu: openItemContextMenu,
    };
};
