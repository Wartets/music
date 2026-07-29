import React from 'react';
import { ViewType } from './viewRouting';
import { LayoutGrid, Library, Mic2, ListMusic, Settings, Search, History, Tags, Calendar, Heart, FolderOpen, Disc3 } from 'lucide-react';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n/I18nContext';
import { audioEngine } from '../../services/audioEngine';
import { persistenceService } from '../../services/persistence';
import { getArtistsDisplayName } from '../../utils/artistUtils';
import { getTrackDisplayName } from '../../utils/trackUtils';

interface NavItem {
    id: ViewType;
    label: string;
    icon: React.ReactNode;
}

interface SidebarProps {
    currentView: ViewType;
    onNavigate: (view: ViewType, data?: unknown) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
    const { state: libState, setSearchQuery } = useLibrary();
    const { playTrack, state: playerState } = usePlayer();
    const { currentPalette } = useTheme();
    const { t } = useTranslation();
    const [isFocused, setIsFocused] = React.useState(false);
    const [activeSearchIndex, setActiveSearchIndex] = React.useState(-1);
    const [discScratch, setDiscScratch] = React.useState(false);
    const [discScratchTiltDeg, setDiscScratchTiltDeg] = React.useState(0);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const blurTimeoutRef = React.useRef<number | null>(null);
    const discScratchTimeoutRef = React.useRef<number | null>(null);
    const discRotationFrameRef = React.useRef<number | null>(null);
    const lastRotationTickRef = React.useRef<number>(0);
    const discRotationRef = React.useRef<number>(0);
    const discSpinnerRef = React.useRef<HTMLDivElement>(null);
    const discSeedRef = React.useRef<number>(0.5);
    const lastTrackHashRef = React.useRef<string | null>(null);
    const lastPlaybackTrackHashRef = React.useRef<string | null>(null);
    const lastPlaybackTimeRef = React.useRef<number>(0);
    const discPressStartRef = React.useRef<number | null>(null);
    const lastScratchAtRef = React.useRef<number>(0);
    const scratchTimestampsRef = React.useRef<number[]>([]);
    const nextScratchDirectionRef = React.useRef<1 | -1>(1);
    const isDiscSpinning = Boolean(playerState.currentTrack && playerState.isPlaying);
    const visibleResults = React.useMemo(() => libState.filteredTracks.slice(0, 5), [libState.filteredTracks]);
    const hasMoreSearchResults = libState.filteredTracks.length > visibleResults.length;
    const maxKeyboardIndex = visibleResults.length > 0
        ? visibleResults.length - 1 + (hasMoreSearchResults ? 1 : 0)
        : -1;

    const MIN_SCRATCH_HOLD_MS = 40;
    const MAX_SCRATCH_HOLD_MS = 900;
    const SCRATCH_COOLDOWN_MS = 140;
    const SCRATCH_WINDOW_MS = 2200;
    const MAX_SCRATCHES_PER_WINDOW = 6;

    const clamp = React.useCallback((value: number, min: number, max: number) => {
        return Math.max(min, Math.min(max, value));
    }, []);

    const hashToUnitInterval = React.useCallback((value: string): number => {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967295;
    }, []);

    const getTrackBaseAngle = React.useCallback((trackHash: string): number => {
        const unit = hashToUnitInterval(`${discSeedRef.current}:${trackHash}`);
        return (unit * 360) % 360;
    }, [hashToUnitInterval]);

    const clearBlurTimeout = React.useCallback(() => {
        if (blurTimeoutRef.current) {
            window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
        }
    }, []);

    const cancelDiscFrame = React.useCallback(() => {
        if (discRotationFrameRef.current) {
            window.cancelAnimationFrame(discRotationFrameRef.current);
            discRotationFrameRef.current = null;
        }
    }, []);

    const trackHashes = React.useMemo(
        () => new Set(libState.tracks.map(track => track.logic.hash_sha256)),
        [libState.tracks]
    );

    React.useEffect(() => {
        const storedSeed = persistenceService.get('sidebar_disc_seed');
        const seedValue = typeof storedSeed === 'number' && Number.isFinite(storedSeed)
            ? clamp(storedSeed, 0, 1)
            : Math.random();

        if (storedSeed === null || typeof storedSeed !== 'number' || !Number.isFinite(storedSeed)) {
            persistenceService.set('sidebar_disc_seed', seedValue);
        }

        discSeedRef.current = seedValue;
        discRotationRef.current = (seedValue * 360) % 360;
        if (discSpinnerRef.current) {
            discSpinnerRef.current.style.transform = `rotate(${discRotationRef.current}deg)`;
        }
    }, [clamp]);

    React.useEffect(() => {
        const trackHash = playerState.currentTrack?.logic.hash_sha256 || null;
        if (!trackHash) {
            lastTrackHashRef.current = null;
            return;
        }

        if (lastTrackHashRef.current === trackHash) {
            return;
        }

        lastTrackHashRef.current = trackHash;

        let nextAngle = getTrackBaseAngle(trackHash);

        if (Math.abs(nextAngle - discRotationRef.current) < 16) {
            nextAngle = (nextAngle + 47) % 360;
        }

        discRotationRef.current = nextAngle;
        lastRotationTickRef.current = 0;

        if (discSpinnerRef.current) {
            discSpinnerRef.current.style.transform = `rotate(${discRotationRef.current}deg)`;
        }
    }, [getTrackBaseAngle, playerState.currentTrack?.logic.hash_sha256]);

    React.useEffect(() => {
        return () => {
            clearBlurTimeout();
            if (discScratchTimeoutRef.current) {
                window.clearTimeout(discScratchTimeoutRef.current);
            }
            cancelDiscFrame();
        };
    }, [cancelDiscFrame, clearBlurTimeout]);

    React.useEffect(() => {
        cancelDiscFrame();

        if (!isDiscSpinning) {
            lastRotationTickRef.current = 0;
            return;
        }

        const spinMsPerRevolution = 16000;
        let disposed = false;
        const trackHash = playerState.currentTrack?.logic.hash_sha256 || null;

        const tick = (timestamp: number) => {
            if (disposed) {
                return;
            }

            if (!lastRotationTickRef.current) {
                lastRotationTickRef.current = timestamp;
            }

            const delta = timestamp - lastRotationTickRef.current;
            lastRotationTickRef.current = timestamp;

            // Detect true restart of the same track (time jump from meaningful value back near zero).
            const playbackTime = audioEngine.getCurrentTime();
            if (trackHash) {
                const prevTrackHash = lastPlaybackTrackHashRef.current;
                const prevTime = lastPlaybackTimeRef.current;
                const sameTrack = prevTrackHash === trackHash;
                const restartedSameTrack =
                    sameTrack &&
                    prevTime > 1.2 &&
                    playbackTime <= 0.35 &&
                    (prevTime - playbackTime) > 0.9;

                if (restartedSameTrack) {
                    discRotationRef.current = getTrackBaseAngle(trackHash);
                }

                lastPlaybackTrackHashRef.current = trackHash;
                lastPlaybackTimeRef.current = playbackTime;
            }

            discRotationRef.current = (discRotationRef.current + (360 * delta / spinMsPerRevolution)) % 360;
            if (discSpinnerRef.current) {
                discSpinnerRef.current.style.transform = `rotate(${discRotationRef.current}deg)`;
            }
            discRotationFrameRef.current = window.requestAnimationFrame(tick);
        };

        discRotationFrameRef.current = window.requestAnimationFrame(tick);

        return () => {
            disposed = true;
            cancelDiscFrame();
            lastRotationTickRef.current = 0;
        };
    }, [cancelDiscFrame, getTrackBaseAngle, isDiscSpinning, playerState.currentTrack?.logic.hash_sha256]);

    const triggerDiscScratch = React.useCallback((durationMs: number, tiltDeg: number) => {
        setDiscScratch(true);
        setDiscScratchTiltDeg(tiltDeg);
        if (discScratchTimeoutRef.current) {
            window.clearTimeout(discScratchTimeoutRef.current);
        }
        discScratchTimeoutRef.current = window.setTimeout(() => {
            setDiscScratch(false);
            setDiscScratchTiltDeg(0);
            discScratchTimeoutRef.current = null;
        }, durationMs);
    }, []);

    const handleDiscPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDiscSpinning) {
            return;
        }

        discPressStartRef.current = performance.now();
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // No-op: pointer capture can fail on some devices, interaction still works.
        }
    }, [isDiscSpinning]);

    const handleDiscPointerCancel = React.useCallback(() => {
        discPressStartRef.current = null;
    }, []);

    const handleDiscPointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDiscSpinning) return;

        const now = performance.now();
        const startedAt = discPressStartRef.current ?? now;
        discPressStartRef.current = null;

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // No-op on devices without pointer capture.
        }

        if (now - lastScratchAtRef.current < SCRATCH_COOLDOWN_MS) {
            return;
        }

        const recent = scratchTimestampsRef.current.filter(ts => now - ts <= SCRATCH_WINDOW_MS);
        if (recent.length >= MAX_SCRATCHES_PER_WINDOW) {
            scratchTimestampsRef.current = recent;
            return;
        }

        const holdMs = clamp(now - startedAt, MIN_SCRATCH_HOLD_MS, MAX_SCRATCH_HOLD_MS);
        const normalizedHold = (holdMs - MIN_SCRATCH_HOLD_MS) / (MAX_SCRATCH_HOLD_MS - MIN_SCRATCH_HOLD_MS);
        const intensity = clamp(0.25 + normalizedHold * 0.75, 0.25, 1);

        const scratchVisualDurationMs = Math.round(120 + normalizedHold * 280);
        const direction = nextScratchDirectionRef.current;
        nextScratchDirectionRef.current = direction === 1 ? -1 : 1;
        const scratchTiltDeg = direction * (10 + normalizedHold * 24);

        triggerDiscScratch(scratchVisualDurationMs, scratchTiltDeg);
        audioEngine.triggerDjBurst({ intensity, holdMs });

        lastScratchAtRef.current = now;
        scratchTimestampsRef.current = [...recent, now];
    }, [
        MAX_SCRATCHES_PER_WINDOW,
        MAX_SCRATCH_HOLD_MS,
        MIN_SCRATCH_HOLD_MS,
        SCRATCH_COOLDOWN_MS,
        SCRATCH_WINDOW_MS,
        clamp,
        isDiscSpinning,
        triggerDiscScratch
    ]);

    const hasFavorites = React.useMemo(() => {
        return persistenceService.getFavorites().some(id => {
            const primaryId = libState.versionToPrimaryMap[id] || id;
            return trackHashes.has(primaryId);
        });
    }, [libState.versionToPrimaryMap, trackHashes]);

    const hasHistory = React.useMemo(
        () => playerState.history.length > 0 || persistenceService.getHistoryIds().length > 0,
        [playerState.history.length]
    );

        const navItems = React.useMemo<NavItem[]>(() => [
        { id: 'Dashboard', label: t('nav.home'), icon: <Library size={20} /> },
        { id: 'AllTracks', label: t('nav.allTracks'), icon: <ListMusic size={20} /> },
        { id: 'Albums', label: t('nav.albums'), icon: <LayoutGrid size={20} /> },
        { id: 'Artists', label: t('nav.artists'), icon: <Mic2 size={20} /> },
        { id: 'Genres', label: t('nav.genres'), icon: <Tags size={20} /> },
        { id: 'Years', label: t('nav.years'), icon: <Calendar size={20} /> },
        { id: 'Folders', label: t('nav.folders'), icon: <FolderOpen size={20} /> },
        // Formats view intentionally removed from sidebar (view remains but is not directly accessible)
        ...(hasFavorites ? [{ id: 'Favorites', label: t('nav.favorites'), icon: <Heart size={20} /> } as NavItem] : []),
        ...(hasHistory ? [{ id: 'DetailedHistory', label: t('nav.history'), icon: <History size={20} /> } as NavItem] : []),
        { id: 'Playlists', label: t('nav.playlists'), icon: <ListMusic size={20} /> },
        { id: 'Queue', label: t('nav.queue'), icon: <ListMusic size={20} /> },
    ], [hasFavorites, hasHistory, t]);

    const bottomItems = React.useMemo<NavItem[]>(() => [
        { id: 'Settings', label: t('nav.settings'), icon: <Settings size={20} /> },
    ], [t]);

    const openSearchResults = React.useCallback((query: string) => {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            return;
        }

        onNavigate('SearchResults', { query: normalizedQuery, sourceView: currentView });
        setSearchQuery('');
        setActiveSearchIndex(-1);
        setIsFocused(false);
    }, [currentView, onNavigate, setSearchQuery]);

    const playSearchResult = React.useCallback((track: typeof visibleResults[number]) => {
        playTrack(track, libState.filteredTracks);
        setSearchQuery('');
        setActiveSearchIndex(-1);
        setIsFocused(false);
    }, [libState.filteredTracks, playTrack, setSearchQuery]);

    const handleInputFocus = React.useCallback(() => {
        clearBlurTimeout();
        setIsFocused(true);
    }, [clearBlurTimeout]);

    const handleInputBlur = React.useCallback(() => {
        clearBlurTimeout();
        blurTimeoutRef.current = window.setTimeout(() => {
            setIsFocused(false);
            setActiveSearchIndex(-1);
            blurTimeoutRef.current = null;
        }, 150);
    }, [clearBlurTimeout]);

    React.useEffect(() => {
        if (!isFocused || !libState.searchQuery.trim()) {
            setActiveSearchIndex(-1);
        }
    }, [isFocused, libState.searchQuery]);

    const NavButton = ({ item }: { item: any }) => {
        const isActive = currentView === item.id;

        const handleNavClick = () => {
            if (isActive && libState.searchQuery) {
                setSearchQuery('');
            }
            onNavigate(item.id as ViewType);
        };

        return (
            <button
                onClick={handleNavClick}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-colors duration-300 ${isActive
                    ? 'bg-dominant/30 text-white font-bold border-l-4 border-dominant-light'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border-l-4 border-transparent'
                    }`}
            >
                <div className={`${isActive ? 'text-dominant-light' : 'text-gray-400'}`}>
                    {item.icon}
                </div>
                <span className="hidden lg:block">{item.label}</span>
            </button>
        );
    };

    return (
        <aside
            className="hidden md:flex w-20 lg:w-64 flex-shrink-0 backdrop-blur-3xl border-r border-white/5 flex-col z-10 transition-all duration-1000 relative overflow-hidden"
            style={{ backgroundColor: `${currentPalette.dominantDark}22` }}
        >
            {/* Subtle side glow */}
            <div
                className="absolute top-0 left-0 w-1 h-full opacity-30 transition-colors duration-1000"
                style={{ backgroundColor: currentPalette.dominant }}
            ></div>

            <div className="p-4 lg:p-6 pb-2 relative z-10">
                <div className="flex flex-col items-center gap-4 mb-10">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden flex-shrink-0 transition-all duration-700 group cursor-pointer active:scale-95 relative"
                        onPointerDown={handleDiscPointerDown}
                        onPointerUp={handleDiscPointerUp}
                        onPointerCancel={handleDiscPointerCancel}
                        onPointerLeave={handleDiscPointerCancel}
                        style={{
                            background: `linear-gradient(135deg, ${currentPalette.dominant} 0%, ${currentPalette.dominantDark} 100%)`,
                            boxShadow: `0 10px 30px -10px ${currentPalette.dominant}88`
                        }}
                    >
                        {discScratch && (
                            <div
                                className="absolute inset-0 rounded-2xl animate-pulse"
                                style={{ backgroundColor: `${currentPalette.dominantLight}2d` }}
                            />
                        )}
                        <div
                            ref={discSpinnerRef}
                            className="absolute inset-0 flex items-center justify-center"
                            style={{
                                transform: 'rotate(0deg)',
                                willChange: 'transform'
                            }}
                        >
                            <Disc3
                                className={`text-white transition-transform duration-100 ${discScratch ? 'scale-110' : ''}`}
                                size={28}
                                style={{
                                    transformOrigin: 'center',
                                    transform: discScratch ? `rotate(${discScratchTiltDeg}deg)` : 'rotate(0deg)'
                                }}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-xl font-black tracking-tighter text-white hidden lg:block leading-none">{t('common.appTitle')}</h1>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-dominant hidden lg:block mt-1 opacity-80">{t('library.webPlayer')}</span>
                    </div>
                </div>

                <div
                    className="mb-0 relative group hidden lg:block"
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-dominant/20 to-dominant-light/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700"></div>
                    <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-dominant-light transition-all duration-300 z-10"
                        size={16}
                    />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={libState.searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setActiveSearchIndex(-1);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                setIsFocused(false);
                                setActiveSearchIndex(-1);
                                return;
                            }

                            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && isFocused && libState.searchQuery.trim()) {
                                e.preventDefault();
                                if (maxKeyboardIndex < 0) {
                                    return;
                                }

                                setActiveSearchIndex((prevIndex) => {
                                    if (prevIndex < 0) {
                                        return e.key === 'ArrowDown' ? 0 : maxKeyboardIndex;
                                    }

                                    if (e.key === 'ArrowDown') {
                                        return prevIndex >= maxKeyboardIndex ? 0 : prevIndex + 1;
                                    }

                                    return prevIndex <= 0 ? maxKeyboardIndex : prevIndex - 1;
                                });
                                return;
                            }

                            if (e.key === 'Enter') {
                                e.preventDefault();

                                if (activeSearchIndex >= 0 && activeSearchIndex < visibleResults.length) {
                                    playSearchResult(visibleResults[activeSearchIndex]);
                                    return;
                                }

                                if (hasMoreSearchResults && activeSearchIndex === visibleResults.length) {
                                    openSearchResults(libState.searchQuery);
                                    return;
                                }

                                openSearchResults(libState.searchQuery);
                            }
                        }}
                        placeholder={t('search.placeholder')}
                        aria-expanded={isFocused && Boolean(libState.searchQuery)}
                        aria-controls="sidebar-search-results"
                        aria-autocomplete="list"
                        className="relative z-10 w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-dominant/50 focus:bg-white/10 transition-all font-medium shadow-2xl backdrop-blur-xl"
                    />
                    <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-dominant/50 to-transparent scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500 z-20"></div>
                    {isFocused && libState.searchQuery && (
                        <div
                            id="sidebar-search-results"
                            className="absolute top-full left-0 right-0 mt-3 bg-[#111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-300"
                            role="listbox"
                            aria-label={t('aria.searchSuggestions')}
                        >
                            {libState.filteredTracks.length > 0 ? (
                                <>
                                    <div className="px-4 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white/5 border-b border-white/5">{t('search.results')}</div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                        {visibleResults.map((track, index) => (
                                            <button
                                                key={track.logic.hash_sha256}
                                                type="button"
                                                role="option"
                                                aria-selected={index === activeSearchIndex}
                                                className={`w-full text-left p-3 cursor-pointer flex items-center gap-3 transition-colors border-b border-white/5 last:border-0 ${index === activeSearchIndex ? 'bg-dominant/20' : 'hover:bg-dominant/10'} active:scale-[0.995]`}
                                                onClick={() => {
                                                    playSearchResult(track);
                                                }}
                                            >
                                                <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                                                    <ArtworkImage details={track.artworks?.track_artwork?.[0] || track.artworks?.album_artwork?.[0]} alt={getTrackDisplayName(track)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-white text-xs font-bold truncate">{getTrackDisplayName(track)}</div>
                                                    <div className="text-gray-500 text-[10px] truncate">{getArtistsDisplayName(track.metadata?.artists)}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    {hasMoreSearchResults && (
                                        <button
                                            type="button"
                                            className={`w-full p-3 text-center text-[10px] font-black text-dominant uppercase tracking-[0.2em] transition-all active:scale-95 ${activeSearchIndex === visibleResults.length ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                            onClick={() => openSearchResults(libState.searchQuery)}
                                        >
                                            {t('search.viewAll', { count: libState.filteredTracks.length })}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="p-8 text-center">
                                    <div className="text-gray-500 text-xs font-medium italic">{t('search.noResults', { query: libState.searchQuery })}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                <nav className="space-y-1">
                    {navItems.map(item => <NavButton key={item.id} item={item} />)}
                </nav>
            </div>

            <div className="mt-auto p-4 border-t border-white/5">
                <nav className="space-y-1">
                    {bottomItems.map(item => <NavButton key={item.id} item={item} />)}
                </nav>
            </div>
        </aside>
    );
};

