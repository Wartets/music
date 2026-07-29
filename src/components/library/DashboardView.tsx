import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { persistenceService } from '../../services/persistence';
import { TrackItem } from '../../types/music';
import { Play } from 'lucide-react';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { ViewType } from '../layout/AppLayout';
import { TrackRow } from '../shared/TrackRow';
import { TrackCard } from '../shared/TrackCard';
import { ArtworkImage } from '../shared/ArtworkImage';
import { resolveHistoryTracks } from '../../utils/historyUtils';
import { resolveTrackVersion } from '../../utils/trackUtils';
import { EmptyState } from '../shared/EmptyState';
import { useTranslation } from '../../i18n/I18nContext';
import { getBestAlbumArtwork } from '../../utils/artworkResolver';

interface DashboardViewProps {
    onNavigate: (view: ViewType, data?: any) => void;
}

interface RecentAlbumEntry {
    id: string;
    name: string;
    artist: string;
    tracks: TrackItem[];
    latestYear: number;
    latestCreatedAt: number;
    coverTrack: TrackItem;
}

const normalizeEpochToSeconds = (value?: number | null): number => {
    if (!value || !Number.isFinite(value) || value <= 0) return 0;
    // Support either seconds or milliseconds inputs.
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
};

const getTrackCreatedEpochSeconds = (track: TrackItem): number => {
    const epochCreated = normalizeEpochToSeconds(track.file?.epoch_created);
    if (epochCreated > 0) return epochCreated;

    const createdRaw = track.file?.created;
    if (!createdRaw) return 0;

    const parsed = Date.parse(createdRaw);
    return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
};

const getTrackYearValue = (track: TrackItem): number => {
    const yearCandidates = [track.metadata?.year, track.metadata?.recording_year];

    for (const candidate of yearCandidates) {
        if (!candidate) continue;
        const match = String(candidate).match(/\d{4}/);
        if (!match) continue;

        const parsed = parseInt(match[0], 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return 0;
};

const hasNavigatedAwayFromDashboard = (): boolean => {
    try {
        const raw = persistenceService.get('nav_history');
        if (!raw || !Array.isArray(raw)) return false;

        return raw.some((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return false;
            const candidateView = (entry as { view?: unknown }).view;
            return typeof candidateView === 'string' && candidateView !== 'Dashboard';
        });
    } catch {
        return false;
    }
};

const getTrackRenderKey = (prefix: string, track: TrackItem, index: number): string => {
    const hash = track.logic?.hash_sha256;
    if (hash && hash !== 'null' && hash !== 'undefined') {
        return `${prefix}-${hash}`;
    }

    const fallbackIdentity = track.file?.path || `${track.logic?.track_name || 'track'}-${track.metadata?.title || 'untitled'}`;
    return `${prefix}-${fallbackIdentity}-${index}`;
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack, state: playerState } = usePlayer();
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();
    const { t } = useTranslation();
    const [visibleCounts, setVisibleCounts] = useState({ recentlyPlayed: 8, newArrivals: 8, recentAlbums: 8 });
    const [isIntroDismissed, setIsIntroDismissed] = useState<boolean>(() => Boolean(persistenceService.get('dashboard_intro_hidden')));

    const handleContextMenu = useCallback((e: React.MouseEvent, track: TrackItem, list: TrackItem[]) => {
        openItemContextMenu(e, track, list, onNavigate);
    }, [onNavigate, openItemContextMenu]);

    const {
        recentlyPlayed,
        mostPlayed,
        newArrivals,
        recentAlbums,
        favorites,
        totalTracks,
        ratings,
        hasPlaybackActivity
    } = useMemo(() => {
        const tracks = libraryState.tracks;
        const favs = persistenceService.getFavorites();
        const playCounts = persistenceService.getAllPlayCounts();
        const ratings = persistenceService.getAllRatings();
        const { versionToPrimaryMap } = libraryState;
        const recentlyPlayedTracks = resolveHistoryTracks(tracks, versionToPrimaryMap).slice(0, 10);

        const mostPlayedTracks = Object.entries(playCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(entry => resolveTrackVersion(entry[0], tracks, versionToPrimaryMap))
            .filter((t): t is TrackItem => !!t);

        const newArrivalsTracks = tracks
            .filter(t => getTrackYearValue(t) > 0 || getTrackCreatedEpochSeconds(t) > 0)
            .sort((a, b) => {
                const yearDiff = getTrackYearValue(b) - getTrackYearValue(a);
                if (yearDiff !== 0) return yearDiff;

                return getTrackCreatedEpochSeconds(b) - getTrackCreatedEpochSeconds(a);
            })
            .slice(0, 20);

        const albumsMap = new Map<string, RecentAlbumEntry>();

        tracks.forEach(track => {
            const albumName = track.metadata?.album?.trim();
            if (!albumName) {
                return;
            }

            const albumArtist = track.metadata?.album_artist?.trim()
                || track.metadata?.artists?.[0]?.trim()
                || t('library.unknownArtist');

            const key = `${albumArtist.toLowerCase()}::${albumName.toLowerCase()}`;
            const year = getTrackYearValue(track);
            const createdAt = getTrackCreatedEpochSeconds(track);

            if (!albumsMap.has(key)) {
                albumsMap.set(key, {
                    id: key,
                    name: albumName,
                    artist: albumArtist,
                    tracks: [track],
                    latestYear: year,
                    latestCreatedAt: createdAt,
                    coverTrack: track
                });
                return;
            }

            const existing = albumsMap.get(key)!;
            existing.tracks.push(track);

            if (
                year > existing.latestYear ||
                (year === existing.latestYear && createdAt > existing.latestCreatedAt)
            ) {
                existing.latestYear = year;
                existing.latestCreatedAt = createdAt;
            }

            const hasAlbumArt = track.artworks?.album_artwork?.length > 0;
            const existingHasAlbumArt = existing.coverTrack.artworks?.album_artwork?.length > 0;
            if (hasAlbumArt && !existingHasAlbumArt) {
                existing.coverTrack = track;
            }
        });

        const recentAlbumEntries = Array.from(albumsMap.values())
            .filter(album => album.tracks.length >= 2)
            .filter(album => album.latestYear > 0 || album.latestCreatedAt > 0)
            .sort((a, b) => {
                const yearDiff = b.latestYear - a.latestYear;
                if (yearDiff !== 0) return yearDiff;

                const createdDiff = b.latestCreatedAt - a.latestCreatedAt;
                if (createdDiff !== 0) return createdDiff;

                return a.name.localeCompare(b.name);
            })
            .slice(0, 20);

        const favoriteTracks = favs
            .map(id => resolveTrackVersion(id, tracks, versionToPrimaryMap))
            .filter((t): t is TrackItem => !!t)
            .slice(0, 10);

        return {
            recentlyPlayed: recentlyPlayedTracks,
            mostPlayed: mostPlayedTracks,
            newArrivals: newArrivalsTracks,
            recentAlbums: recentAlbumEntries,
            favorites: favoriteTracks,
            totalTracks: tracks.length,
            ratings,
            hasPlaybackActivity: recentlyPlayedTracks.length > 0 || Object.values(playCounts).some(count => count > 0)
        };
    }, [libraryState.tracks, libraryState.versionToPrimaryMap, t]);

    useEffect(() => {
        if (isIntroDismissed) return;
        const maybeDismissIntro = () => {
            if (isIntroDismissed) return;
            const hasChangedViews = hasNavigatedAwayFromDashboard();
            const shouldDismissIntro = hasPlaybackActivity && hasChangedViews;
            if (!shouldDismissIntro) return;

            setIsIntroDismissed(true);
            persistenceService.set('dashboard_intro_hidden', true);
        };

        // Run once immediately
        maybeDismissIntro();

        // Listen for UI changes (same-tab) and storage events (cross-tab)
        const onUiChanged = (e: Event) => {
            try {
                const detail = (e as CustomEvent).detail || {};
                if (detail.key === 'nav_history' || detail.key === 'dashboard_intro_hidden') {
                    maybeDismissIntro();
                }
            } catch { }
        };

        const onStorage = (e: StorageEvent) => {
            try {
                if (e.key && e.key.indexOf('music_library_ui_') === 0) {
                    const uiKey = e.key.replace('music_library_ui_', '');
                    if (uiKey === 'nav_history' || uiKey === 'dashboard_intro_hidden') {
                        maybeDismissIntro();
                    }
                }
            } catch { }
        };

        window.addEventListener('music-ui-changed', onUiChanged as EventListener);
        window.addEventListener('storage', onStorage as EventListener);

        return () => {
            window.removeEventListener('music-ui-changed', onUiChanged as EventListener);
            window.removeEventListener('storage', onStorage as EventListener);
        };
    }, [hasPlaybackActivity, isIntroDismissed]);

    const shouldShowIntroCard = totalTracks > 0 && !isIntroDismissed;

    const visibleRecentlyPlayed = useMemo(
        () => recentlyPlayed.slice(0, visibleCounts.recentlyPlayed),
        [recentlyPlayed, visibleCounts.recentlyPlayed]
    );

    const visibleNewArrivals = useMemo(
        () => newArrivals.slice(0, visibleCounts.newArrivals),
        [newArrivals, visibleCounts.newArrivals]
    );

    const visibleRecentAlbums = useMemo(
        () => recentAlbums.slice(0, visibleCounts.recentAlbums),
        [recentAlbums, visibleCounts.recentAlbums]
    );

    return (
        <div className="h-full overflow-y-auto custom-scrollbar bg-[#0a0a0a] pt-0 md:pt-24 px-3 md:px-8 pb-24 md:pb-32">
            {/* Welcome Header for New Users */}
            {totalTracks === 0 && (
                <div className="mb-8 p-6 md:p-8 rounded-3xl bg-gradient-to-br from-dominant/20 via-dominant/10 to-transparent border border-dominant/20">
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white mb-2">
                        {t('dashboard.welcome')}
                    </h1>
                    <p className="text-gray-400 text-sm md:text-base mb-6 max-w-xl">
                        {t('dashboard.welcomeDesc')}
                    </p>
                    <button 
                        onClick={() => onNavigate('Settings', { tab: 'maintenance' })}
                        className="px-6 py-3 bg-dominant text-on-dominant rounded-xl font-black uppercase tracking-widest text-xs hover:bg-dominant-light transition-colors"
                    >
                        {t('dashboard.addMusicFolder')}
                    </button>
                </div>
            )}

            {/* Quick Actions - Always Visible */}
            {totalTracks > 0 && (
                <div className="mb-6 flex flex-wrap gap-2">
                    <button 
                        onClick={() => onNavigate('AllTracks')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    >
                        {t('dashboard.allTracks')}
                    </button>
                    <button 
                        onClick={() => onNavigate('Albums')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    >
                        {t('dashboard.albums')}
                    </button>
                    <button 
                        onClick={() => onNavigate('Artists')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    >
                        {t('dashboard.artists')}
                    </button>
                    <button 
                        onClick={() => onNavigate('Playlists')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    >
                        {t('dashboard.playlists')}
                    </button>
                    <button 
                        onClick={() => onNavigate('Favorites')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                    >
                        {t('dashboard.favorites')}
                    </button>
                </div>
            )}

            {shouldShowIntroCard && (
                <div className="mb-8 p-5 md:p-6 rounded-3xl bg-gradient-to-br from-dominant/20 via-dominant/10 to-transparent border border-dominant/20">
                    <h2 className="text-lg md:text-2xl font-black tracking-tighter text-white mb-5">
                        {t('dashboard.quickStart')}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => onNavigate('AllTracks')}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                        >
                            {t('dashboard.browseTracks')}
                        </button>
                        <button
                            onClick={() => onNavigate('Albums')}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors"
                        >
                            {t('dashboard.exploreAlbums')}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-8 md:space-y-12">
                {/* Recently Played - Only show if there are tracks */}
                {recentlyPlayed.length > 0 && (
                    <section>
                        <div className="flex items-end justify-between mb-6">
                            <h2 className="text-xl md:text-2xl font-black tracking-tighter text-white">{t('dashboard.recentlyPlayed')}</h2>
                            <button onClick={() => onNavigate('DetailedHistory')} className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-dominant transition-colors">{t('dashboard.viewAllHistory')}</button>
                        </div>
                        <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 custom-scrollbar-horizontal no-scrollbar">
                            {visibleRecentlyPlayed.map((track, i) => (
                                <TrackCard
                                    key={getTrackRenderKey('recent', track, i)}
                                    track={track}
                                    list={recentlyPlayed}
                                    query={libraryState.searchQuery}
                                    isPlaying={playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256}
                                    onPlay={(t, list) => playTrack(t, list || recentlyPlayed)}
                                    onContextMenu={(e, t, list) => handleContextMenu(e, t, list || recentlyPlayed)}
                                />
                            ))}
                        </div>
                        {visibleRecentlyPlayed.length < recentlyPlayed.length && (
                            <button
                                onClick={() => setVisibleCounts(prev => ({ ...prev, recentlyPlayed: prev.recentlyPlayed + 8 }))}
                                className="mt-1 px-4 py-2 min-h-11 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-transform"
                            >
                                {t('dashboard.loadMore')}
                            </button>
                        )}
                    </section>
                )}

                {/* Most Played - Only show if there are tracks */}
                {mostPlayed.length > 0 && (
                    <section>
                        <div className="flex items-end justify-between mb-6">
                            <h2 className="text-xl md:text-2xl font-black tracking-tighter text-white">{t('dashboard.mostPlayed')}</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-10 gap-y-2">
                            {mostPlayed.map((track, i) => (
                                <TrackRow
                                    key={getTrackRenderKey('most', track, i)}
                                    track={track}
                                    list={mostPlayed}
                                    index={i}
                                    isPlaying={playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256}
                                    query={libraryState.searchQuery}
                                    onPlay={(t) => playTrack(t, mostPlayed)}
                                    onContextMenu={(e, t) => handleContextMenu(e, t, mostPlayed)}
                                    showRating={false}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Show New Arrivals if available, otherwise show recently added */}
                {newArrivals.length > 0 && (
                    <section>
                        <div className="flex items-end justify-between mb-6">
                            <h2 className="text-xl md:text-2xl font-black tracking-tighter text-white">{t('dashboard.recentlyAdded')}</h2>
                        </div>
                        <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 custom-scrollbar-horizontal no-scrollbar">
                            {visibleNewArrivals.map((track, i) => (
                                <TrackCard
                                    key={getTrackRenderKey('new', track, i)}
                                    track={track}
                                    list={newArrivals}
                                    query={libraryState.searchQuery}
                                    isPlaying={playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256}
                                    onPlay={(t, list) => playTrack(t, list || newArrivals)}
                                    onContextMenu={(e, t, list) => handleContextMenu(e, t, list || newArrivals)}
                                />
                            ))}
                        </div>
                        {visibleNewArrivals.length < newArrivals.length && (
                            <button
                                onClick={() => setVisibleCounts(prev => ({ ...prev, newArrivals: prev.newArrivals + 8 }))}
                                className="mt-1 px-4 py-2 min-h-11 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-transform"
                            >
                                {t('dashboard.loadMore')}
                            </button>
                        )}
                    </section>
                )}

                {recentAlbums.length > 0 && (
                    <section>
                        <div className="flex items-end justify-between mb-6">
                            <h2 className="text-xl md:text-2xl font-black tracking-tighter text-white">
                                {t('dashboard.recentlyAdded')} {t('dashboard.albums')}
                            </h2>
                            <button
                                onClick={() => onNavigate('Albums')}
                                className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-dominant transition-colors"
                            >
                                {t('dashboard.seeAll')}
                            </button>
                        </div>
                        <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 custom-scrollbar-horizontal no-scrollbar">
                            {visibleRecentAlbums.map((album) => (
                                <button
                                    key={album.id}
                                    type="button"
                                    onClick={() => onNavigate('AlbumDetail', album.name)}
                                    className="flex-shrink-0 w-40 text-left group"
                                >
                                    <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-xl group-hover:shadow-dominant/20 transition-all duration-500 bg-white/5 border border-white/5 group-hover:border-dominant/20">
                                        <ArtworkImage
                                            details={getBestAlbumArtwork(album.coverTrack)}
                                            alt={album.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                            loading="lazy"
                                        />
                                    </div>
                                    <h3 className="text-xs font-bold line-clamp-2 leading-tight text-white">
                                        {album.name}
                                    </h3>
                                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-tight mt-1 font-medium">
                                        {album.artist} • {album.tracks.length} {t('common.tracks')}
                                    </p>
                                </button>
                            ))}
                        </div>
                        {visibleRecentAlbums.length < recentAlbums.length && (
                            <button
                                onClick={() => setVisibleCounts(prev => ({ ...prev, recentAlbums: prev.recentAlbums + 8 }))}
                                className="mt-1 px-4 py-2 min-h-11 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-transform"
                            >
                                {t('dashboard.loadMore')}
                            </button>
                        )}
                    </section>
                )}

                {favorites.length > 0 && (
                    <section>
                        <div className="flex items-end justify-between mb-6">
                            <h2 className="text-xl md:text-2xl font-black tracking-tighter text-white">{t('dashboard.favorites')}</h2>
                            <button onClick={() => onNavigate('Favorites')} className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-dominant transition-colors">{t('dashboard.seeAll')}</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 md:gap-x-10 gap-y-2">
                            {favorites.map((track, i) => (
                                <TrackRow
                                    key={getTrackRenderKey('fav', track, i)}
                                    track={track}
                                    list={favorites}
                                    index={i}
                                    isPlaying={playerState.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256}
                                    query={libraryState.searchQuery}
                                    rating={ratings[track.logic.hash_sha256] || 0}
                                    showRating
                                    showCollection={false}
                                    onPlay={(t) => playTrack(t, favorites)}
                                    onContextMenu={(e, t) => handleContextMenu(e, t, favorites)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Empty State Content for Returning Users with No History */}
                {totalTracks > 0 && recentlyPlayed.length === 0 && mostPlayed.length === 0 && newArrivals.length === 0 && (
                    <section className="py-8">
                        <EmptyState
                            icon={<Play size={24} />}
                            title={t('dashboard.startListening')}
                            subtitle={t('dashboard.startListeningDesc')}
                            className="min-h-[18rem]"
                            titleClassName="text-xl font-black text-white mb-2"
                            subtitleClassName="text-sm text-gray-500"
                            action={
                                <button
                                    onClick={() => onNavigate('AllTracks')}
                                    className="px-6 py-3 bg-dominant text-on-dominant rounded-xl font-black uppercase tracking-widest text-xs"
                                >
                                    {t('dashboard.browseLibrary')}
                                </button>
                            }
                        />
                    </section>
                )}
            </div>
        </div>
    );
};

