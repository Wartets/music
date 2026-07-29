import React, { useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useUI } from '../../contexts/UIContext';
import { FileAudio, Hash } from 'lucide-react';
import { CollectionGridView, GridItem } from './CollectionGridView';
import { getMutedVisualStyle, seedFromText } from '../../utils/collectionVisuals';
import { TrackItem } from '../../types/music';
import { groupTracks, sortGroupsAlphabeticallyWithUnknownLast, sortGroupsByCountWithUnknownLast } from '../../utils/grouping';
import { createGroupContextMenu } from '../../utils/contextMenuPresets';
import type { GroupedTracks } from '../../utils/grouping';
import { useTranslation } from '../../i18n/I18nContext';

interface FormatsViewProps {
    onNavigate: (view: any, data: any) => void;
}

interface FormatGroup {
    key: string;
    name: string;
    tracks: TrackItem[];
    losslessCount: number;
    lossyCount: number;
}

interface FormatStats {
    losslessCount: number;
    lossyCount: number;
}

export const FormatsView: React.FC<FormatsViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, addToQueue, addToNext } = usePlayer();
    const { showContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const [sortBy, setSortBy] = useState<'name' | 'count'>('count');

    const formats = useMemo(() => {
        const { groups } = groupTracks(libraryState.filteredTracks, {
            keyExtractor: track => {
                const rawExt = (track.file?.ext || '').trim();
                return rawExt ? rawExt.toUpperCase() : null;
            },
            unknownLabel: 'UNKNOWN'
        });

        const sortedGroups = sortBy === 'name'
            ? sortGroupsAlphabeticallyWithUnknownLast(groups.values())
            : sortGroupsByCountWithUnknownLast(groups.values());

        const statsByKey = new Map<string, FormatStats>();

        sortedGroups.forEach(group => {
            const stats: FormatStats = { losslessCount: 0, lossyCount: 0 };

            group.tracks.forEach(track => {
                if (track.audio_specs?.is_lossless) {
                    stats.losslessCount += 1;
                    return;
                }

                stats.lossyCount += 1;
            });

            statsByKey.set(group.key, stats);
        });

        return sortedGroups.map((group: GroupedTracks<TrackItem>) => ({
            key: group.key,
            name: group.name,
            tracks: group.tracks,
            losslessCount: statsByKey.get(group.key)?.losslessCount || 0,
            lossyCount: statsByKey.get(group.key)?.lossyCount || 0
        }));
    }, [libraryState.filteredTracks, sortBy]);

    const onRightClick = (e: React.MouseEvent, fmt: FormatGroup) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, createGroupContextMenu({
            name: fmt.name,
            tracks: fmt.tracks,
            playTrack,
            addToNext,
            addToQueue,
            showToast,
            t,
            playLabel: `${t('formats.playAll')} ${fmt.name}`
        }));
    };

    const gridItems: GridItem[] = formats.map(fmt => {
        const palette = getMutedVisualStyle(seedFromText(fmt.name));
        return {
            id: fmt.name,
            title: fmt.name,
            subtitle: `${fmt.tracks.length} tracks`,
            visualToken: {
                style: {
                    background: palette.background,
                    borderColor: palette.borderColor
                },
                symbol: (
                    <div className="flex flex-col items-center justify-center gap-2 max-w-full">
                        <span className="text-2xl sm:text-3xl font-black tracking-tight truncate" style={{ color: palette.accentColor }}>
                            {fmt.name}
                        </span>
                                {/* Hide lossless badge for WAV format since it's not useful here */}
                                {fmt.losslessCount > 0 && fmt.name?.toUpperCase() !== 'WAV' && (
                                    <span className="text-[10px] font-black bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-400/30 tracking-wider">
                                        {fmt.lossyCount > 0 ? t('formats.mixedLossless') : t('formats.lossless')}
                                    </span>
                                )}
                    </div>
                ),
                label: t('formats.format'),
                symbolClassName: 'text-white'
            },
            onClick: () => onNavigate('AllTracks', { filter: { type: 'format', value: fmt.name } }),
            onContextMenu: (e) => onRightClick(e, fmt)
        };
    });

    return (
        <CollectionGridView
            title={t('formats.title')}
            subtitle={`${formats.length} ${t('formats.audioFormats')}`}
            items={gridItems}
            sortOptions={[
                { id: 'name', label: t('common.name'), icon: <FileAudio size={14} className="inline mr-1" /> },
                { id: 'count', label: t('common.count'), icon: <Hash size={14} className="inline mr-1" /> }
            ]}
            currentSort={sortBy}
            onSortChange={(id) => setSortBy(id as 'name' | 'count')}
        />
    );
};
