import React, { useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import { Calendar, Hash, CalendarRange } from 'lucide-react';
import { CollectionGridView, GridItem } from './CollectionGridView';
import { getMutedVisualStyle, seedFromYear } from '../../utils/collectionVisuals';
import { groupTracks, sortGroupsByCountWithUnknownLast, sortGroupsAlphabeticallyWithUnknownLast } from '../../utils/grouping';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import type { TrackItem } from '../../types/music';
import type { GroupedTracks } from '../../utils/grouping';
import { useTranslation } from '../../i18n/I18nContext';

interface YearsViewProps {
    onNavigate: (view: any, data: any) => void;
}

export const YearsView: React.FC<YearsViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const [groupBy, setGroupBy] = useState<'year' | 'decade'>('year');
    const [sortBy, setSortBy] = useState<'year' | 'count'>('year');

    const parseGroupStartYear = (value: string): number => {
        const normalized = value.trim().toLowerCase();
        const cleaned = normalized === t('years.unknownYear').toLowerCase()
            ? ''
            : value.replace(/s$/i, '');

        const parsed = parseInt(cleaned, 10);
        return Number.isNaN(parsed) ? -Infinity : parsed;
    };

    const parseYear = (value: string | null | undefined): number | null => {
        const year = parseInt(String(value || '').trim(), 10);
        if (Number.isNaN(year) || year < 1900 || year > 2100) {
            return null;
        }
        return year;
    };

    const getYearBadgeSymbol = (label: string): string => {
        if (label === t('years.unknownYear')) {
            return '?';
        }

        const parsed = parseGroupStartYear(label);
        if (!Number.isFinite(parsed)) {
            return label;
        }

        if (groupBy === 'decade') {
            return `${parsed}`;
        }

        return `${parsed}`;
    };

    const years = useMemo(() => {
        const { groups } = groupTracks(libraryState.filteredTracks, {
            keyExtractor: (track) => {
                const parsedYear = parseYear(track.metadata?.year);
                if (parsedYear === null) {
                    return null;
                }

                if (groupBy === 'decade') {
                    const decade = Math.floor(parsedYear / 10) * 10;
                    return `${decade}s`;
                }

                return String(parsedYear);
            },
            unknownLabel: t('years.unknownYear')
        });

        if (sortBy === 'year') {
            return sortGroupsAlphabeticallyWithUnknownLast(groups.values(), (a, b) => {
                const yearA = parseGroupStartYear(a.name);
                const yearB = parseGroupStartYear(b.name);
                return yearB - yearA || a.name.localeCompare(b.name);
            });
        }

        return sortGroupsByCountWithUnknownLast(groups.values(), (a, b) => {
            const yearA = parseGroupStartYear(a.name);
            const yearB = parseGroupStartYear(b.name);
            return yearB - yearA;
        });
    }, [groupBy, libraryState.filteredTracks, sortBy]);

    const onRightClick = (e: React.MouseEvent, yearGroup: GroupedTracks<TrackItem>) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: yearGroup.name,
            tracks: yearGroup.tracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: `${t('years.playYear')} ${yearGroup.name}`
        }));
    };

    const gridItems: GridItem[] = years.map(yearGroup => {
        const palette = getMutedVisualStyle(seedFromYear(yearGroup.name));
        const filterValue = yearGroup.name;
        const badgeSymbol = getYearBadgeSymbol(yearGroup.name);
        return {
            id: yearGroup.name,
            title: yearGroup.name,
            subtitle: `${yearGroup.tracks.length} tracks`,
            visualToken: {
                style: {
                    background: palette.background,
                    borderColor: palette.borderColor
                },
                symbol: (
                    <span className="font-black tracking-tight" style={{ color: palette.accentColor }}>
                        {badgeSymbol}
                    </span>
                ),
                symbolClassName: groupBy === 'decade' ? 'text-4xl leading-none' : 'text-5xl leading-none'
            },
            onClick: () => onNavigate('AllTracks', { filter: { type: 'year', value: filterValue } }),
            onContextMenu: (e) => onRightClick(e, yearGroup)
        };
    });

    return (
        <CollectionGridView
            title={t('years.title')}
            subtitle={groupBy === 'decade' ? `${years.length} ${t('years.releaseDecadesLabel')}` : `${years.length} ${t('years.releaseYearsLabel')}`}
            items={gridItems}
            sortOptions={[
                { id: 'group-year', label: t('years.byYear'), icon: <Calendar size={14} /> },
                { id: 'group-decade', label: t('years.byDecade'), icon: <CalendarRange size={14} /> },
                { id: 'count', label: t('common.count'), icon: <Hash size={14} /> }
            ]}
            currentSort={sortBy === 'count' ? 'count' : `group-${groupBy}`}
            onSortChange={(id) => {
                if (id === 'group-year') {
                    setGroupBy('year');
                    setSortBy('year');
                    return;
                }
                if (id === 'group-decade') {
                    setGroupBy('decade');
                    setSortBy('year');
                    return;
                }
                if (id === 'count') {
                    setSortBy('count');
                }
            }}
        />
    );
};
