import React, { useMemo } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { Heart } from 'lucide-react';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { persistenceService } from '../../services/persistence';
import { TrackItem } from '../../types/music';
import { getTrackCollectionLabel } from '../../utils/collectionLabels';
import { TrackRow } from '../shared/TrackRow';
import { resolveTrackVersion } from '../../utils/trackUtils';
import { EmptyState } from '../shared/EmptyState';
import { PlaybackControls } from './PlaybackControls';
import { useTranslation } from '../../i18n/I18nContext';

interface FavoritesViewProps {
    onNavigate?: (view: any, data?: any) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, state: playerState } = usePlayer();
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();
    const { t } = useTranslation();

    const favoriteTracks = useMemo(() => {
        const favIds = persistenceService.getFavorites();
        return favIds
            .map(id => resolveTrackVersion(id, libraryState.tracks, libraryState.versionToPrimaryMap))
            .filter((t): t is TrackItem => !!t);
    }, [libraryState.tracks, libraryState.versionToPrimaryMap]);

    const onRightClick = (e: React.MouseEvent, track: TrackItem) => {
        openItemContextMenu(e, track, favoriteTracks, onNavigate);
    };

    return (
        <div className="h-full flex flex-col p-3 md:p-6 pt-0 md:pt-24 overflow-y-auto custom-scrollbar bg-surface-primary">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4 md:mb-10">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white flex items-center gap-3">
                        <Heart size={24} className="text-red-400 fill-red-400 md:w-8 md:h-8" /> {t('favorites.title')}
                    </h1>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1">{favoriteTracks.length} {t('favorites.tracks')}</p>
                </div>
                {favoriteTracks.length > 0 && (
                    <PlaybackControls
                        trackCount={favoriteTracks.length}
                        onPlayAll={() => playTrack(favoriteTracks[0], favoriteTracks)}
                        variant="compact"
                    />
                )}
            </div>

            {favoriteTracks.length === 0 && (
                <EmptyState
                    icon={<Heart size={48} className="text-gray-600" />}
                    title={t('favorites.noFavoritesYet')}
                    subtitle={t('favorites.noFavoritesDesc')}
                    className="flex-1"
                    titleClassName="font-bold text-white/40 mb-1"
                    subtitleClassName="text-xs text-gray-500"
                />
            )}

            <div className="space-y-1 pb-32">
                {favoriteTracks.map((track, idx) => {
                    const rating = persistenceService.getRating(track.logic.hash_sha256);
                    const isPlaying = playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256;

                    return (
                        <TrackRow
                            key={track.logic.hash_sha256}
                            index={idx}
                            track={track}
                            isPlaying={isPlaying}
                            query={libraryState.searchQuery}
                            list={favoriteTracks}
                            rating={rating}
                            collectionLabel={getTrackCollectionLabel(track)}
                            showCollection
                            onPlay={(t) => playTrack(t, favoriteTracks)}
                            onContextMenu={(e, t) => onRightClick(e, t)}
                        />
                    );
                })}
            </div>
        </div>
    );
};
