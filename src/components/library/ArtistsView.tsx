import React, { useMemo } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import { TrackItem } from '../../types/music';
import { User, Filter } from 'lucide-react';
import { CollectionGridView, GridItem } from './CollectionGridView';
import { getInitials, getMutedVisualStyle, seedFromArtistName } from '../../utils/collectionVisuals';
import { groupTracks, sortGroupsAlphabeticallyWithUnknownLast } from '../../utils/grouping';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import type { GroupedTracks } from '../../utils/grouping';
import { useTranslation } from '../../i18n/I18nContext';


interface ArtistGroup {
    name: string;
    tracks: TrackItem[];
    albumCount: number;
}

interface ArtistsViewProps {
    onNavigate: (view: any, data: any) => void;
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const [sortBy, setSortBy] = React.useState<'tracks' | 'name'>('tracks');

    const isUnknownArtist = (value: string): boolean => {
        const localizedUnknownArtist = t('library.unknownArtist')
        const normalized = value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        const localizedNormalized = localizedUnknownArtist
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        return normalized.length === 0 || normalized === '-' || normalized === 'unknown' || normalized === 'unknown artist' || normalized === localizedNormalized || normalized === 'n/a' || normalized === 'na';
    };

    const getAlbumIdentity = (track: TrackItem): string | null => {
        const albumName = track.metadata?.album?.trim() || track.logic?.hierarchy?.album?.trim() || '';
        if (!albumName) {
            return null;
        }

        const albumArtist = track.metadata?.album_artist?.trim()
            || track.metadata?.artists?.[0]?.trim()
            || t('library.unknownArtist');

        return `${albumArtist.toLowerCase()}::${albumName.toLowerCase()}`;
    };

    const artists = useMemo(() => {
        const { groups } = groupTracks(libraryState.filteredTracks, {
            keyExtractor: track => track.metadata?.artists ?? [],
            unknownLabel: t('library.unknownArtist'),
            isUnknownValue: isUnknownArtist
        });

        const artistGroups = sortGroupsAlphabeticallyWithUnknownLast(groups.values()).map((group: GroupedTracks<TrackItem>) => {
            const albums = new Set<string>();
            group.tracks.forEach(track => {
                const albumId = getAlbumIdentity(track);
                if (albumId) {
                    albums.add(albumId);
                }
            });

            return {
                name: group.name,
                tracks: group.tracks,
                albumCount: albums.size
            };
        });

        // Sort based on selected sort option
        if (sortBy === 'tracks') {
            // Sort by track count descending, then alphabetically for ties
            return artistGroups.sort((a, b) => {
                // Unknown artist should stay at the end
                const aIsUnknown = isUnknownArtist(a.name);
                const bIsUnknown = isUnknownArtist(b.name);
                if (aIsUnknown && !bIsUnknown) return 1;
                if (!aIsUnknown && bIsUnknown) return -1;
                
                // Both unknown or both not unknown: sort by track count (desc) then name
                const trackDiff = b.tracks.length - a.tracks.length;
                if (trackDiff !== 0) return trackDiff;
                return a.name.localeCompare(b.name);
            });
        } else {
            // Sort by name, unknown artist at end
            return artistGroups.sort((a, b) => {
                const aIsUnknown = isUnknownArtist(a.name);
                const bIsUnknown = isUnknownArtist(b.name);
                if (aIsUnknown && !bIsUnknown) return 1;
                if (!aIsUnknown && bIsUnknown) return -1;
                return a.name.localeCompare(b.name);
            });
        }
    }, [libraryState.filteredTracks, t, sortBy, isUnknownArtist]);

    const onRightClick = (e: React.MouseEvent, artist: ArtistGroup) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: artist.name,
            tracks: artist.tracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: `${t('artists.playArtist')} ${artist.name}`,
            playNextLabel: t('artists.playNext'),
            addToQueueLabel: t('artists.addToQueue'),
            addToPlaylistLabel: t('artists.addToPlaylist'),
            createPlaylistLabel: t('artists.createPlaylist'),
            createPlaylistName: `${artist.name} ${t('artists.collection')}`
        }));
    };

    const gridItems: GridItem[] = artists.map(artist => {
        const palette = getMutedVisualStyle(seedFromArtistName(artist.name));
        const initials = getInitials(artist.name);
        const initialsSizeClass = initials.length > 4 ? 'text-2xl' : 'text-4xl';
        return {
            id: artist.name,
            title: artist.name,
            subtitle: `${artist.tracks.length} ${t('common.tracks')} • ${artist.albumCount} ${t('artists.albumsCount')}`,
            visualToken: {
                style: {
                    background: palette.background,
                    borderColor: palette.borderColor
                },
                symbol: (
                    <div className="flex flex-col items-center gap-2">
                        <span className={`${initialsSizeClass} font-black tracking-tight`} style={{ color: palette.accentColor }}>
                            {initials}
                        </span>
                        <User size={18} style={{ color: palette.mutedTextColor }} />
                    </div>
                ),
                label: t('artists.title'),
            },
            onClick: () => onNavigate('ArtistDetail', artist.name),
            onContextMenu: (e) => onRightClick(e, artist)
        };
    });

    return (
        <CollectionGridView
            title={t('artists.title')}
            subtitle={`${artists.length} ${t('artists.performers')}`}
            items={gridItems}
            sortOptions={[
                { id: 'tracks', label: t('common.tracks'), icon: <Filter size={14} /> },
                { id: 'name', label: t('albums.titleHeader'), icon: <User size={14} /> }
            ]}
            currentSort={sortBy}
            onSortChange={(id) => setSortBy(id as 'tracks' | 'name')}
        />
    );
};
