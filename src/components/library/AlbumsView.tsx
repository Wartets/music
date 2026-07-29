import React, { useMemo } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import { Filter, User, Pencil } from 'lucide-react';
import { CollectionGridView, GridItem } from './CollectionGridView';
import { formatDuration, parseDuration } from '../../utils/formatters';
import { TrackItem } from '../../types/music';
import { getCollectionArtwork } from '../../utils/artworkResolver';
import { groupTracks, sortGroupsAlphabeticallyWithUnknownLast } from '../../utils/grouping';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import { sortTracksByTrackNumber } from '../../utils/trackSorting';
import { useTranslation } from '../../i18n/I18nContext';

interface AlbumGroup {
    id: string;
    name: string;
    artist: string;
    tracks: TrackItem[];
    sortedTracks: TrackItem[];
    artwork?: TrackItem['artworks']['album_artwork'][0] | TrackItem['artworks']['track_artwork'][0];
    durationSeconds: number;
    durationLabel: string;
}

const getAlbumDurationSeconds = (tracks: TrackItem[]) => {
    return tracks.reduce((total, track) => total + parseDuration(track.audio_specs?.duration || '0:00'), 0);
};

const groupAlbums = (tracks: TrackItem[], sortBy: 'name' | 'artist', unknownAlbumLabel: string, unknownArtistLabel: string): AlbumGroup[] => {
    const { groups } = groupTracks(tracks, {
        keyExtractor: track => track.metadata?.album ? track.metadata.album.trim() : null,
        unknownLabel: unknownAlbumLabel
    });

    const albums = sortGroupsAlphabeticallyWithUnknownLast(groups.values()).map(group => {
        const sortedTracks = sortTracksByTrackNumber(group.tracks);
        const durationSeconds = getAlbumDurationSeconds(sortedTracks);

        return {
            id: group.key,
            name: group.name,
            artist: sortedTracks[0]?.metadata?.album_artist || sortedTracks[0]?.metadata?.artists?.[0] || unknownArtistLabel,
            tracks: group.tracks,
            sortedTracks,
            artwork: getCollectionArtwork(sortedTracks),
            durationSeconds,
            durationLabel: formatDuration(durationSeconds),
        } as AlbumGroup;
    });

    return albums.sort((a, b) => {
        if (a.id === '__unknown__') return 1;
        if (b.id === '__unknown__') return -1;

        if (sortBy === 'name') {
            return a.name.localeCompare(b.name);
        }

        const artistCmp = a.artist.localeCompare(b.artist);
        if (artistCmp !== 0) return artistCmp;
        return a.name.localeCompare(b.name);
    });
};


interface AlbumsViewProps {
    onNavigate: (view: any, data: any) => void;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({ onNavigate }) => {
    const { state: libraryState, setEditingTracks } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const [sortBy, setSortBy] = React.useState<'name' | 'artist'>('artist');

    const albums = useMemo(() => {
        return groupAlbums(libraryState.filteredTracks, sortBy, t('library.unknownAlbum'), t('library.unknownArtist')).map(album => {
            // Prevent artwork for Unknown Album
            if (album.id === '__unknown__') {
                return { ...album, artwork: undefined };
            }
            return album;
        });
    }, [libraryState.filteredTracks, sortBy, t]);

    const onRightClick = React.useCallback((e: React.MouseEvent, album: any) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: album.name,
            tracks: album.sortedTracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: `${t('albums.playAlbum')} ${album.name}`,
            extraItems: [
                {
                    label: t('albums.goToArtist'),
                    icon: <User size={14} />,
                    onClick: () => onNavigate('ArtistDetail', album.artist)
                },
                { divider: true, label: '', onClick: () => { } },
                {
                    label: t('albums.editMetadata'),
                    icon: <Pencil size={14} />,
                    onClick: () => {
                        if (album.tracks.length > 0) {
                            setEditingTracks(album.tracks);
                        }
                    }
                }
            ]
        }));
    }, [addToNext, addToQueue, onNavigate, playTrack, setEditingTracks, showContextMenu, showToast, t]);

    const gridItems: GridItem[] = albums.map(album => ({
        id: album.id,
        title: album.name,
        subtitle: `${album.artist} • ${album.tracks.length} ${t('common.tracks')} • ${album.durationLabel}`,
        imageDetails: album.artwork,
        onClick: () => onNavigate('AlbumDetail', album),
        onContextMenu: (e) => onRightClick(e, album)
    }));

    return (
        <CollectionGridView
            title={t('albums.title')}
            subtitle={`${albums.length} ${t('albums.collections')}`}
            items={gridItems}
            sortOptions={[
                { id: 'name', label: t('albums.titleHeader'), icon: <Filter size={14} /> },
                { id: 'artist', label: t('albums.artistHeader'), icon: <User size={14} /> }
            ]}
            currentSort={sortBy}
            onSortChange={(id) => setSortBy(id as 'name' | 'artist')}
        />
    );
};

