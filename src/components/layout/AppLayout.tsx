import React, { useState, useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { Sidebar } from './Sidebar';
import { MainView } from './MainView';
import { PlayerBar } from './PlayerBar';
import { MetadataEditor } from '../shared/MetadataEditor';
import { ContextPanel } from './ContextPanel';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ContextMenu } from '../shared/ContextMenu';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MobileTabBar } from './MobileTabBar';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useLibrary } from '../../contexts/LibraryContext';
import { useTranslation } from '../../i18n/I18nContext';
import { parseAppRoute, routeForAlbum, routeForArtist, routeForTrack, slugify } from '../../utils/urlRoutes';
import {
    DEFAULT_VIEW,
    NavigationEntry,
    ViewType,
    isViewType,
    normalizeHistoryEntries,
    resolveViewType
} from './viewRouting';
import { resolvePreferredAssetUrl } from '../../services/assetResolver';
import { persistenceService } from '../../services/persistence';

export type { ViewType } from './viewRouting';

const getInitialHistory = (): NavigationEntry[] => {
    try {
        // Use persistenceService to centralize UI storage
        const saved = persistenceService.get('nav_history');
        if (!saved) return [{ view: DEFAULT_VIEW, data: null }];
        return normalizeHistoryEntries(saved);
    } catch {
        return [{ view: DEFAULT_VIEW, data: null }];
    }
};

const getInitialHistoryIndex = (historyLength: number): number => {
    try {
        const saved = persistenceService.get('nav_history_index');
        const parsed = typeof saved === 'number' ? saved : (saved ? parseInt(String(saved), 10) : 0);
        if (Number.isNaN(parsed)) return 0;
        return Math.min(Math.max(parsed, 0), Math.max(historyLength - 1, 0));
    } catch {
        return 0;
    }
};

export const AppLayout: React.FC = () => {
    const initialHistory = getInitialHistory();
    const [history, setHistory] = useState<NavigationEntry[]>(initialHistory);
    const [historyIndex, setHistoryIndex] = useState(() => getInitialHistoryIndex(initialHistory.length));
    const [showContext, setShowContext] = useState(false);

    const safeHistoryIndex = Math.min(Math.max(historyIndex, 0), Math.max(history.length - 1, 0));
    const currentEntry = history[safeHistoryIndex] ?? { view: DEFAULT_VIEW, data: null };
    const currentView = resolveViewType(currentEntry.view);
    const viewData = currentEntry.data;
    const showShellChrome = currentView !== 'BigScreen';

    useEffect(() => {
        // Persist navigation history via persistenceService to centralize storage
        try {
            persistenceService.set('nav_history', history);
            persistenceService.set('nav_history_index', safeHistoryIndex);
        } catch (e) {
            // Fallback: ignore persistence errors to avoid breaking navigation
            console.warn('Failed to persist navigation history', e);
        }
    }, [history, safeHistoryIndex]);

    const navigate = (view: ViewType, data: unknown = null) => {
        const safeView = resolveViewType(view);
        if (!isViewType(view)) {
            console.warn(`Invalid view requested: ${String(view)}. Falling back to ${DEFAULT_VIEW}.`);
        }

        const newHistory = history.slice(0, safeHistoryIndex + 1);
        newHistory.push({ view: safeView, data });
        const newIndex = newHistory.length - 1;
        setHistory(newHistory);
        setHistoryIndex(newIndex);

        // Push a browser history entry so native back/forward works
        try {
            let nextPath = '/';
            if (safeView === 'SongDetail' && data && typeof data === 'object' && (data as any).logic?.hash_sha256) {
                nextPath = routeForTrack(data as any);
            } else if (safeView === 'ArtistDetail' && typeof data === 'string') {
                nextPath = routeForArtist(data);
            } else if (safeView === 'AlbumDetail' && typeof data === 'string') {
                nextPath = routeForAlbum(data);
            } else {
                const viewPaths: Partial<Record<ViewType, string>> = {
                    Dashboard: '/',
                    AllTracks: '/tracks',
                    Albums: '/albums',
                    Artists: '/artists',
                    Playlists: '/playlists',
                    Favorites: '/favorites',
                    Settings: '/settings',
                    Queue: '/queue'
                };
                nextPath = viewPaths[safeView] || '/';
            }

            window.history.pushState({ navIndex: newIndex }, '', nextPath);
        } catch (e) {
            // ignore
        }
    };

    const goBack = () => {
        if (safeHistoryIndex > 0) setHistoryIndex(safeHistoryIndex - 1);
    };

    const goForward = () => {
        if (safeHistoryIndex < history.length - 1) setHistoryIndex(safeHistoryIndex + 1);
    };
    // (popstate listener moved to AppContent where libraryState is available)

    return (
        <AppContent
            history={history}
            historyIndex={safeHistoryIndex}
            currentView={currentView}
            viewData={viewData}
            navigate={navigate}
            goBack={goBack}
            goForward={goForward}
            setHistory={setHistory}
            setHistoryIndex={setHistoryIndex}
            showContext={showContext}
            setShowContext={setShowContext}
            showShellChrome={showShellChrome}
        />
    );
};

interface AppContentProps {
    history: NavigationEntry[];
    historyIndex: number;
    currentView: ViewType;
    viewData: unknown;
    navigate: (view: ViewType, data?: unknown) => void;
    goBack: () => void;
    goForward: () => void;
    setHistory: React.Dispatch<React.SetStateAction<NavigationEntry[]>>;
    setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
    showContext: boolean;
    setShowContext: React.Dispatch<React.SetStateAction<boolean>>;
    showShellChrome: boolean;
}

const AppContent: React.FC<AppContentProps> = ({
    history, historyIndex, currentView, viewData, navigate, goBack, goForward, setHistory, setHistoryIndex, showContext, setShowContext, showShellChrome
}) => {
    const { contextMenu, closeContextMenu, showToast } = useUI();
    const { t } = useTranslation();
    const { togglePlay, playNext, playPrevious, playTrack, state: playerState } = usePlayer();
    const { state: libraryState } = useLibrary();
    const { applyArtworkColors } = useTheme();
    const isMobile = useIsMobile();

    useEffect(() => {
        // Trigger theme update when track changes or component mounts
        const currentArtworks = playerState.currentTrack?.artworks?.track_artwork;
        if (currentArtworks && currentArtworks.length > 0) {
            const resolved = resolvePreferredAssetUrl(currentArtworks[0].path);
            applyArtworkColors(resolved || null);
        } else {
            applyArtworkColors(null);
        }
    }, [playerState.currentTrack?.logic.hash_sha256]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

            // Spacebar: ONLY play/pause, always
            if (e.code === 'Space') {
                if (!isInput) {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePlay();
                }
                return;
            }

            // Other shortcuts only if not in input
            if (isInput) return;

            switch (e.code) {
                case 'KeyN':
                    e.preventDefault();
                    playNext();
                    showToast(t('player.next'));
                    break;
                case 'KeyP':
                    e.preventDefault();
                    playPrevious();
                    showToast(t('player.previous'));
                    break;
                case 'KeyQ':
                    e.preventDefault();
                    navigate('Queue');
                    break;
                case 'KeyF':
                    e.preventDefault();
                    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                    if (searchInput) searchInput.focus();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, playNext, playPrevious, navigate, showToast, t]);

    const initialRouteHandledRef = React.useRef(false);

    useEffect(() => {
        if (initialRouteHandledRef.current || libraryState.isLoading) return;

        const parsed = parseAppRoute(window.location.pathname, window.location.search);
        if (parsed.kind === 'none') {
            initialRouteHandledRef.current = true;
            return;
        }

        if (parsed.kind === 'track') {
            const track = libraryState.tracks.find(t => t.logic.hash_sha256.toLowerCase().startsWith(parsed.shortHash));
            if (track) {
                navigate('SongDetail', track);
                playTrack(track, [track]);
            }
            initialRouteHandledRef.current = true;
            return;
        }

        if (parsed.kind === 'artist') {
            const artists = Array.from(new Set(libraryState.tracks.flatMap(t => t.metadata?.artists || [])));
            const artist = artists.find(a => slugify(a) === parsed.slug);
            if (artist) {
                navigate('ArtistDetail', artist);
            }
            initialRouteHandledRef.current = true;
            return;
        }

        if (parsed.kind === 'album') {
            const albums = Array.from(new Set(libraryState.tracks.map(t => t.metadata?.album).filter(Boolean) as string[]));
            const album = albums.find(a => slugify(a) === parsed.slug);
            if (album) {
                navigate('AlbumDetail', album);
            }
            initialRouteHandledRef.current = true;
            return;
        }

        if (parsed.kind === 'view') {
            const viewMap: Record<typeof parsed.viewPath, ViewType> = {
                dashboard: 'Dashboard',
                tracks: 'AllTracks',
                albums: 'Albums',
                artists: 'Artists',
                playlists: 'Playlists',
                favorites: 'Favorites',
                settings: 'Settings',
                queue: 'Queue'
            };
            navigate(viewMap[parsed.viewPath], null);
            initialRouteHandledRef.current = true;
            return;
        }

        initialRouteHandledRef.current = true;
    }, [libraryState.isLoading, libraryState.tracks, navigate, playTrack]);

    // Keep URL concise and shareable based on current context
    useEffect(() => {
        let nextPath = '/';

        if (currentView === 'SongDetail' && viewData && typeof viewData === 'object' && (viewData as any).logic?.hash_sha256) {
            nextPath = routeForTrack(viewData as any);
        } else if (currentView === 'ArtistDetail' && typeof viewData === 'string') {
            nextPath = routeForArtist(viewData);
        } else if (currentView === 'AlbumDetail' && typeof viewData === 'string') {
            nextPath = routeForAlbum(viewData);
        } else {
                const viewPaths: Partial<Record<ViewType, string>> = {
                Dashboard: '/',
                AllTracks: '/tracks',
                Albums: '/albums',
                Artists: '/artists',
                Playlists: '/playlists',
                Favorites: '/favorites',
                Settings: '/settings',
                Queue: '/queue'
            };
            nextPath = viewPaths[currentView] || '/';
        }

        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== nextPath) {
            window.history.replaceState({}, '', nextPath);
        }
    }, [currentView, viewData, playerState.currentTrack?.logic.hash_sha256]);

    // Keep internal navigation state in sync with browser back/forward buttons
    useEffect(() => {
        const onPopState = (_ev: PopStateEvent) => {
            try {
                const parsed = parseAppRoute(window.location.pathname, window.location.search);

                if (parsed.kind === 'track') {
                    const track = libraryState.tracks.find(t => t.logic.hash_sha256.toLowerCase().startsWith(parsed.shortHash));
                    if (track) {
                        const matchIndex = history.findIndex(h => h.view === 'SongDetail' && (h.data as any)?.logic?.hash_sha256 === track.logic.hash_sha256);
                        if (matchIndex >= 0) {
                            setHistoryIndex(matchIndex);
                            return;
                        }

                        const newHistory = history.slice(0, historyIndex + 1);
                        newHistory.push({ view: 'SongDetail', data: track });
                        const newIndex = newHistory.length - 1;
                        setHistory(newHistory);
                        setHistoryIndex(newIndex);
                        return;
                    }
                }

                if (parsed.kind === 'artist') {
                    const artists = Array.from(new Set(libraryState.tracks.flatMap(t => t.metadata?.artists || [])));
                    const artist = artists.find(a => slugify(a) === parsed.slug);
                    if (artist) {
                        const matchIndex = history.findIndex(h => h.view === 'ArtistDetail' && h.data === artist);
                        if (matchIndex >= 0) {
                            setHistoryIndex(matchIndex);
                            return;
                        }
                        const newHistory = history.slice(0, historyIndex + 1);
                        newHistory.push({ view: 'ArtistDetail', data: artist });
                        const newIndex = newHistory.length - 1;
                        setHistory(newHistory);
                        setHistoryIndex(newIndex);
                        return;
                    }
                }

                if (parsed.kind === 'album') {
                    const albums = Array.from(new Set(libraryState.tracks.map(t => t.metadata?.album).filter(Boolean) as string[]));
                    const album = albums.find(a => slugify(a) === parsed.slug);
                    if (album) {
                        const matchIndex = history.findIndex(h => h.view === 'AlbumDetail' && h.data === album);
                        if (matchIndex >= 0) {
                            setHistoryIndex(matchIndex);
                            return;
                        }
                        const newHistory = history.slice(0, historyIndex + 1);
                        newHistory.push({ view: 'AlbumDetail', data: album });
                        const newIndex = newHistory.length - 1;
                        setHistory(newHistory);
                        setHistoryIndex(newIndex);
                        return;
                    }
                }

                const idx = history.findIndex(h => {
                    try {
                        let p = '/';
                        if (h.view === 'SongDetail' && h.data && (h.data as any).logic?.hash_sha256) p = routeForTrack(h.data as any);
                        else if (h.view === 'ArtistDetail' && typeof h.data === 'string') p = routeForArtist(h.data as string);
                        else if (h.view === 'AlbumDetail' && typeof h.data === 'string') p = routeForAlbum(h.data as string);
                        else {
                            const viewPaths: Partial<Record<ViewType, string>> = {
                                Dashboard: '/',
                                AllTracks: '/tracks',
                                Albums: '/albums',
                                Artists: '/artists',
                                Playlists: '/playlists',
                                Favorites: '/favorites',
                                Settings: '/settings',
                                Queue: '/queue'
                            };
                            p = viewPaths[h.view] || '/';
                        }
                        return p === window.location.pathname + window.location.search;
                    } catch { return false; }
                });

                if (idx >= 0) {
                    setHistoryIndex(idx);
                }
            } catch (e) {
                // ignore parse failures
            }
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [history, historyIndex, libraryState.tracks, playerState.currentTrack, setHistory, setHistoryIndex]);


    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-dominant-dark text-white selection:bg-dominant-light selection:text-white">
            <div className="flex flex-1 overflow-hidden relative">
                <Sidebar currentView={currentView} onNavigate={navigate} />
                <div className={`flex-1 flex flex-col overflow-hidden relative ${showShellChrome && isMobile ? 'pb-[10.25rem]' : 'pb-0'}`}>
                    {/* Navigation Bar - Superimposed inside content area */}
                    {showShellChrome && !isMobile && (
                        <div className="flex absolute top-4 left-4 z-40 items-center gap-2 pointer-events-none">
                            <button
                                onClick={goBack}
                                disabled={historyIndex === 0}
                                className={`p-2 rounded-full transition-all pointer-events-auto ${historyIndex === 0 ? 'opacity-20 cursor-not-allowed text-gray-400' : 'hover:bg-white/10 active:scale-95 text-white'}`}
                                title={t('common.back')}
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={goForward}
                                disabled={historyIndex === history.length - 1}
                                className={`p-2 rounded-full transition-all pointer-events-auto ${historyIndex === history.length - 1 ? 'opacity-20 cursor-not-allowed text-gray-400' : 'hover:bg-white/10 active:scale-95 text-white'}`}
                                title={t('common.forward')}
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    )}
                    <MainView currentView={currentView} viewData={viewData} onNavigate={navigate} onGoBack={goBack} />
                </div>
                {showContext && <ContextPanel isOpen={showContext} onClose={() => setShowContext(false)} />}
            </div>
            {showShellChrome && (
                <>
                    <PlayerBar onNavigate={navigate} onToggleContext={() => setShowContext(!showContext)} />
                    <MobileTabBar currentView={currentView} onNavigate={(view, data) => navigate(view, data ?? null)} />
                </>
            )}
            <MetadataEditor />

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={contextMenu.items}
                    onClose={closeContextMenu}
                />
            )}
        </div>
    );
};

