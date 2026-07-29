import { FolderPlus, ListMinus, ListPlus, Play, Plus, Share, Zap } from 'lucide-react';
import { persistenceService } from '../services/persistence';
import { tabSync } from '../services/tabSync';
import type { Playlist } from '../services/persistence';
import type { TrackItem } from '../types/music';
import type { ContextMenuItem } from '../components/shared/ContextMenu';

interface CreateGroupContextMenuOptions {
    name: string;
    tracks: TrackItem[];
    playTrack: (track: TrackItem, queue?: TrackItem[]) => void;
    addToNext: (track: TrackItem) => void;
    addToQueue: (track: TrackItem) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    playLabel?: string;
    playNextLabel?: string;
    addToQueueLabel?: string;
    addToPlaylistLabel?: string;
    createPlaylistLabel?: string;
    createPlaylistName?: string;
    t?: (key: any, params?: Record<string, any>) => string;
    extraItems?: ContextMenuItem[];
}

export const createGroupContextMenu = ({
    name,
    tracks,
    playTrack,
    addToNext,
    addToQueue,
    showToast,
    playLabel = `Play ${name}`,
    playNextLabel = 'Play Next',
    addToQueueLabel = 'Add to Queue',
    addToPlaylistLabel = 'Add to Playlist',
    createPlaylistLabel = 'Save as New Playlist',
    createPlaylistName,
    t,
    extraItems = []
}: CreateGroupContextMenuOptions): ContextMenuItem[] => {
    const playlists = persistenceService.getPlaylists();
    const tr = (key: string, fallback: string, params?: Record<string, any>) => {
        const translated = t?.(key, params);
        return translated || fallback;
    };

    return [
        {
            label: playLabel,
            icon: <Play size={14} fill="currentColor" />,
            onClick: () => {
                if (tracks.length === 0) {
                    showToast(tr('contextMenu.noTracksAvailableFor', `No tracks available for ${name}`, { name }), 'error');
                    return;
                }

                playTrack(tracks[0], tracks);
                showToast(tr('contextMenu.playing', `Playing ${name}`, { name }));
            }
        },
        {
            label: playNextLabel,
            icon: <Zap size={14} className="text-dominant-light" />,
            onClick: () => {
                [...tracks].reverse().forEach(track => addToNext(track));
                showToast(tr('contextMenu.willPlayNext', `${name} will play next`, { name }), 'success');
            }
        },
        {
            label: addToQueueLabel,
            icon: <ListPlus size={14} />,
            onClick: () => {
                tracks.forEach(track => addToQueue(track));
                showToast(tr('contextMenu.addedTracksToQueue', `Added ${tracks.length} tracks to queue`, { count: tracks.length }), 'success');
            }
        },
        {
            label: tr('contextMenu.openInNewTab', 'Open in New Tab'),
            icon: <Share size={14} />, 
            onClick: () => {
                try {
                    if (typeof window === 'undefined') return;
                    if ('SharedWorker' in window || 'BroadcastChannel' in window) {
                        const ids = tracks.map(t => t.logic.hash_sha256);
                        tabSync.openInNewTab('openTracks', { trackIds: ids, name });
                    }
                } catch {
                    // noop
                }
            }
        },
        { divider: true, label: '', onClick: () => { } },
        {
            label: addToPlaylistLabel,
            icon: <Plus size={14} />,
            onClick: () => { },
            subItems: playlists.map(playlist => ({
                label: playlist.name,
                onClick: () => {
                    tracks.forEach(track => persistenceService.addTrackToPlaylist(playlist.id, track.logic.hash_sha256));
                    showToast(tr('contextMenu.addedToPlaylist', `Added to ${playlist.name}`, { name: playlist.name }), 'success');
                }
            }))
        },
        ...extraItems,
        { divider: true, label: '', onClick: () => { } },
        {
            label: createPlaylistLabel,
            icon: <FolderPlus size={14} />,
            onClick: () => {
                const playlist = persistenceService.createPlaylist(createPlaylistName || name);
                tracks.forEach(track => persistenceService.addTrackToPlaylist(playlist.id, track.logic.hash_sha256));
                showToast(tr('playlists.created', `Created playlist "${playlist.name}"`, { name: playlist.name }), 'success');
            }
        }
    ];
};

interface CreatePlaylistTrackContextMenuOptions {
    isSmart: boolean;
    track: TrackItem;
    playTrack: (track: TrackItem, queue?: TrackItem[]) => void;
    addToQueue: (track: TrackItem) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    t?: (key: any, params?: Record<string, any>) => string;
    playlist?: Playlist;
    onRemoveFromPlaylist?: () => void;
    onEditMetadata?: () => void;
}

export const createPlaylistTrackContextMenu = ({
    isSmart,
    track,
    playTrack,
    addToQueue,
    showToast,
    t,
    onRemoveFromPlaylist,
    onEditMetadata
}: CreatePlaylistTrackContextMenuOptions): ContextMenuItem[] => {
    const tr = (key: string, fallback: string, params?: Record<string, any>) => {
        const translated = t?.(key, params);
        return translated || fallback;
    };

    if (isSmart) {
        return [
            {
                label: tr('contextMenu.playNow', 'Play Now'),
                icon: <Play size={14} fill="currentColor" />,
                onClick: () => playTrack(track, [track])
            },
            {
                label: tr('contextMenu.addToQueue', 'Add to Queue'),
                icon: <ListPlus size={14} />,
                onClick: () => {
                    addToQueue(track);
                    showToast(tr('contextMenu.addedToQueueSimple', 'Added to queue'), 'success');
                }
            },
            { divider: true, label: '', onClick: () => { } },
            {
                label: tr('contextMenu.editMetadata', 'Edit Metadata'),
                icon: <FolderPlus size={14} />,
                onClick: () => onEditMetadata?.()
            }
        ];
    }

    return [
        { divider: true, label: '', onClick: () => { } },
        {
            label: tr('contextMenu.removeFromPlaylist', 'Remove from Playlist'),
            icon: <ListMinus size={14} />,
            danger: true,
            onClick: () => {
                onRemoveFromPlaylist?.();
            }
        }
    ];
};
