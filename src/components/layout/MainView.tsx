import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import {
    AllTracksView, AlbumsView, ArtistsView, PlaylistsView, DashboardView,
    FavoritesView, GenresView, YearsView, FoldersView, FormatsView,
    AlbumContentsView, SongInfoView, ArtistInfoView,
    BigScreenView, HistoryView, QueueView
} from '../library';
import { SettingsView } from '../settings/SettingsView';
import { SearchResultsView } from '../library/SearchResultsView';
import { ViewType, isViewType, resolveViewType } from './viewRouting';
import { AlbumGroup, TrackItem } from '../../types/music';

interface AllTracksInitialFilter {
    type: 'year' | 'folder' | 'format' | 'genre' | 'artist';
    value: string;
}

interface MainViewProps {
    currentView: ViewType;
    viewData?: unknown;
    onNavigate: (view: ViewType, data?: unknown) => void;
    onGoBack?: () => void;
}

export const MainView: React.FC<MainViewProps> = ({ currentView, viewData, onNavigate, onGoBack }) => {
    const { currentPalette, settings: themeSettings } = useTheme();
    const safeView = React.useMemo(() => {
        if (!isViewType(currentView)) {
            console.warn(`MainView received unknown view: ${String(currentView)}. Falling back to Dashboard.`);
        }

        return resolveViewType(currentView);
    }, [currentView]);

    const viewDataRecord = React.useMemo(
        () => (typeof viewData === 'object' && viewData !== null ? viewData as Record<string, unknown> : null),
        [viewData]
    );

    const allTracksFilter = React.useMemo<AllTracksInitialFilter | undefined>(() => {
        const filter = viewDataRecord?.filter;
        if (typeof filter !== 'object' || filter === null) {
            return undefined;
        }

        const candidate = filter as Record<string, unknown>;
        const validTypes = new Set<AllTracksInitialFilter['type']>(['year', 'folder', 'format', 'genre', 'artist']);
        if (typeof candidate.type !== 'string' || !validTypes.has(candidate.type as AllTracksInitialFilter['type'])) {
            return undefined;
        }

        if (typeof candidate.value !== 'string') {
            return undefined;
        }

        return {
            type: candidate.type as AllTracksInitialFilter['type'],
            value: candidate.value
        };
    }, [viewDataRecord]);

    const albumViewData = React.useMemo<AlbumGroup | string | undefined>(() => {
        if (typeof viewData === 'string') {
            return viewData;
        }

        if (typeof viewData === 'object' && viewData !== null && 'tracks' in (viewData as Record<string, unknown>)) {
            return viewData as AlbumGroup;
        }

        return undefined;
    }, [viewData]);

    const songViewData = React.useMemo<TrackItem | undefined>(() => {
        if (typeof viewData !== 'object' || viewData === null) {
            return undefined;
        }

        const candidate = viewData as Record<string, unknown>;
        if (typeof candidate.logic !== 'object' || candidate.logic === null) {
            return undefined;
        }

        if (typeof candidate.file !== 'object' || candidate.file === null) {
            return undefined;
        }

        return viewData as TrackItem;
    }, [viewData]);

    const artistViewData = React.useMemo<string | undefined>(() => {
        return typeof viewData === 'string' ? viewData : undefined;
    }, [viewData]);

    const renderedView = React.useMemo(() => {
        switch (safeView) {
            case 'Dashboard':
                return <DashboardView onNavigate={onNavigate} />;
            case 'SearchResults':
                return (
                    <SearchResultsView
                        query={typeof viewDataRecord?.query === 'string' ? viewDataRecord.query : ''}
                        sourceView={isViewType(viewDataRecord?.sourceView) ? viewDataRecord.sourceView : undefined}
                        onNavigate={onNavigate}
                    />
                );
            case 'DetailedHistory':
                return <HistoryView onNavigate={onNavigate} />;
            case 'AllTracks':
                return <AllTracksView onNavigate={onNavigate} initialFilter={allTracksFilter} />;
            case 'Albums':
                return <AlbumsView onNavigate={onNavigate} />;
            case 'AlbumDetail':
                return albumViewData
                    ? <AlbumContentsView album={albumViewData} onNavigate={onNavigate} />
                    : <DashboardView onNavigate={onNavigate} />;
            case 'SongDetail':
                return songViewData
                    ? <SongInfoView track={songViewData} onNavigate={onNavigate} />
                    : <DashboardView onNavigate={onNavigate} />;
            case 'ArtistDetail':
                return artistViewData
                    ? <ArtistInfoView artistName={artistViewData} onNavigate={onNavigate} />
                    : <DashboardView onNavigate={onNavigate} />;
            case 'Artists':
                return <ArtistsView onNavigate={onNavigate} />;
            case 'Genres':
                return <GenresView onNavigate={onNavigate} />;
            case 'Years':
                return <YearsView onNavigate={onNavigate} />;
            case 'Folders':
                return <FoldersView onNavigate={onNavigate} initialPath={typeof viewData === 'string' ? viewData : ''} />;
            case 'Formats':
                return <FormatsView onNavigate={onNavigate} />;
            case 'Favorites':
                return <FavoritesView onNavigate={onNavigate} />;
            case 'Playlists':
                return <PlaylistsView onNavigate={onNavigate} />;
            case 'Settings':
                return <SettingsView initialTab={typeof viewDataRecord?.tab === 'string' ? viewDataRecord.tab : undefined} />;
            case 'BigScreen':
                return <BigScreenView onBack={onGoBack || (() => onNavigate('Dashboard'))} onNavigate={onNavigate} />;
            case 'Queue':
                return <QueueView />;
            default:
                console.warn(`Unhandled view in MainView: ${String(safeView)}. Using Dashboard fallback.`);
                return <DashboardView onNavigate={onNavigate} />;
        }
    }, [albumViewData, allTracksFilter, artistViewData, onNavigate, safeView, songViewData, viewDataRecord]);

    const mainBackground = React.useMemo(() => {
        return themeSettings.mode === 'adaptive' && !themeSettings.applyToNonEssentialsOnly
            ? `linear-gradient(to bottom, ${currentPalette.dominant}15 0%, #0a0a0a 40%, #0a0a0a 100%)`
            : 'linear-gradient(to bottom, #111 0%, #0a0a0a 100%)';
    }, [currentPalette.dominant, themeSettings.applyToNonEssentialsOnly, themeSettings.mode]);

    const mainStyle = React.useMemo(() => ({ background: mainBackground }), [mainBackground]);
    const glowStyle = React.useMemo(
        () => ({ background: `radial-gradient(circle at 50% 0%, ${currentPalette.dominant}30 0%, transparent 100%)` }),
        [currentPalette.dominant]
    );

    return (
        <main
            className="flex-1 overflow-y-auto transition-all duration-1000 relative custom-scrollbar overflow-x-hidden"
            style={mainStyle}
        >
            {/* Subtle top dominant color glow for native feel */}
            <div
                className="absolute top-0 left-0 right-0 h-[50vh] opacity-30 pointer-events-none blur-[120px] transition-all duration-1000"
                style={glowStyle}
            ></div>
            <div className="relative z-10 h-full">
                {renderedView}
            </div>
        </main>
    );
};

