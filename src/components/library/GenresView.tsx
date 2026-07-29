import React, { useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import {
    Filter, Hash, AudioWaveform,
    Disc3, Film, Mic2, Music, Radio, Waves, Zap
} from 'lucide-react';
import { CollectionGridView, GridItem } from './CollectionGridView';
import { getMutedVisualStyle, seedFromText } from '../../utils/collectionVisuals';
import { groupTracks, sortGroupsAlphabeticallyWithUnknownLast, sortGroupsByCountWithUnknownLast } from '../../utils/grouping';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import { parseGenres } from '../../utils/genreUtils';
import type { TrackItem } from '../../types/music';
import type { GroupedTracks } from '../../utils/grouping';
import { useTranslation } from '../../i18n/I18nContext';

interface GenresViewProps {
    onNavigate: (view: any, data: any) => void;
}

const getGenreSymbol = (genreName: string, accentColor: string): React.ReactNode => {
    const normalized = (genreName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s_-]+/g, ' ')
        .trim();

    const sharedStyle = { color: accentColor };

    if (normalized === 'unknown genre') {
        return <Music size={44} style={sharedStyle} />;
    }

    if (normalized.includes('rock') || normalized.includes('metal') || normalized.includes('punk')) {
        return <Zap size={44} style={sharedStyle} />;
    }
    if (normalized.includes('hip hop') || normalized.includes('hip-hop') || normalized.includes('rap') || normalized.includes('r&b')) {
        return <Mic2 size={44} style={sharedStyle} />;
    }
    if (normalized.includes('electro') || normalized.includes('edm') || normalized.includes('techno') || normalized.includes('house') || normalized.includes('dance')) {
        return <Radio size={44} style={sharedStyle} />;
    }
    if (normalized.includes('jazz') || normalized.includes('blues') || normalized.includes('soul')) {
        return <Disc3 size={44} style={sharedStyle} />;
    }
    if (normalized.includes('classical') || normalized.includes('orchestra') || normalized.includes('opera')) {
        return <Music size={44} style={sharedStyle} />;
    }
    if (normalized.includes('ambient') || normalized.includes('chill') || normalized.includes('new age')) {
        return <Waves size={44} style={sharedStyle} />;
    }
    if (normalized.includes('soundtrack') || normalized.includes('score') || normalized.includes('cinematic')) {
        return <Film size={44} style={sharedStyle} />;
    }
    if (normalized.includes('pop')) {
        return <AudioWaveform size={44} style={sharedStyle} />;
    }

    return <Music size={44} style={sharedStyle} />;
};

const isUnknownGenre = (value: string): boolean => {
    const normalized = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    return normalized.length === 0 || normalized === '-' || normalized === 'unknown' || normalized === 'unknown genre' || normalized === 'n/a' || normalized === 'na';
};

export const GenresView: React.FC<GenresViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    // Default to sorting by count (largest to smallest), then alphabetically as a tie-breaker
    const [sortBy, setSortBy] = useState<'name' | 'count'>('count');

    const genres = useMemo(() => {
        const { groups } = groupTracks(libraryState.filteredTracks, {
            keyExtractor: (track) => parseGenres(track.metadata?.genre),
            unknownLabel: t('library.unknown'),
            isUnknownValue: isUnknownGenre
        });

        if (sortBy === 'name') {
            return sortGroupsAlphabeticallyWithUnknownLast(groups.values());
        }

        return sortGroupsByCountWithUnknownLast(groups.values());
    }, [libraryState.filteredTracks, sortBy]);

    const onRightClick = (e: React.MouseEvent, genreGroup: GroupedTracks<TrackItem>) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: genreGroup.name,
            tracks: genreGroup.tracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: `${t('genres.playGenre')} ${genreGroup.name}`
        }));
    };

    const gridItems: GridItem[] = genres.map(genre => {
        const palette = getMutedVisualStyle(seedFromText(genre.name));
        return {
            id: genre.name,
            title: genre.name,
            subtitle: `${genre.tracks.length} tracks`,
            visualToken: {
                style: {
                    background: palette.background,
                    borderColor: palette.borderColor
                },
                symbol: getGenreSymbol(genre.name, palette.accentColor),
                // Use the genre name as the label rather than the generic 'genres' title
                label: genre.name,
                labelClassName: 'text-[10px] font-bold uppercase tracking-[0.18em]',
            },
            onClick: () => onNavigate('AllTracks', { filter: { type: 'genre', value: genre.name } }),
            onContextMenu: (e) => onRightClick(e, genre)
        };
    });

    return (
        <CollectionGridView
            title={t('genres.title')}
            subtitle={`${genres.length} ${t('genres.categories')}`}
            items={gridItems}
            sortOptions={[
                { id: 'name', label: t('genres.sortName'), icon: <Filter size={14} /> },
                { id: 'count', label: t('genres.sortTrackCount'), icon: <Hash size={14} /> }
            ]}
            currentSort={sortBy}
            onSortChange={(id) => setSortBy(id as 'name' | 'count')}
        />
    );
};
