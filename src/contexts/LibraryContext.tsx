import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { TrackItem, LibraryState, ColumnConfig } from '../types/music';
import { dbService } from '../services/db';
import { searchService } from '../services/search';
import { persistenceService } from '../services/persistence';
import { TrackMetadata } from '../types/music';
import { MetadataWriteTarget } from '../services/persistence';
import { rankTrackVersions } from '../utils/versionUtils';
import { parseDuration } from '../utils/formatters';
import { parseGenres } from '../utils/genreUtils';
import { filterTracksByAlbumVisibility } from '../utils/albumVisibility';

interface LibraryContextProps {
    state: LibraryState;
    setSearchQuery: (query: string) => void;
    setSortBy: (sortBy: string) => void;
    updateTrackMetadata: (hash_sha256: string, override: Partial<TrackMetadata>, target?: MetadataWriteTarget) => Promise<void>;
    updateArtworkOverride: (hash_sha256: string, artwork: import('../types/music').ImageDetails[]) => void;
    updateColumnConfig: (config: ColumnConfig[]) => void;
    editingTracks: TrackItem[] | null;
    setEditingTracks: (tracks: TrackItem[] | null) => void;
    refresh: () => void;
    showUnknownAlbumTracks: boolean;
    setShowUnknownAlbumTracks: (value: boolean) => void;
}

const LibraryContext = createContext<LibraryContextProps | undefined>(undefined);

const DEFAULT_COLUMNS: ColumnConfig[] = [
    { id: 'number', label: '#', width: 40, visible: true, sortable: false },
    { id: 'artwork', label: '', width: 56, visible: true, sortable: false },
    { id: 'title', label: 'libraryBrowser.columns.title', width: 0, visible: true, sortable: true }, // 0 means flex-1
    { id: 'album', label: 'libraryBrowser.columns.album', width: 160, visible: true, sortable: true },
    { id: 'genre', label: 'libraryBrowser.columns.genre', width: 80, visible: true, sortable: true },
    { id: 'year', label: 'libraryBrowser.columns.year', width: 64, visible: true, sortable: true },
    { id: 'bpm', label: 'libraryBrowser.columns.bpm', width: 48, visible: true, sortable: true },
    { id: 'duration', label: 'libraryBrowser.columns.duration', width: 56, visible: true, sortable: true },
    { id: 'bitrate', label: 'libraryBrowser.columns.bitrate', width: 64, visible: true, sortable: true },
    { id: 'size', label: 'libraryBrowser.columns.size', width: 80, visible: true, sortable: true },
];

export const LibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<LibraryState>(() => {
        const saved = persistenceService.get('library_columns');
        return {
            tracks: [],
            filteredTracks: [],
            isLoading: true,
            searchQuery: '',
            sortBy: 'date',
            sortOrder: 'desc',
            filterBy: {},
            columnConfig: saved || DEFAULT_COLUMNS,
            versionToPrimaryMap: {},
            stats: { totalDuration: 0, totalTracks: 0, totalSizeMb: 0 }
        };
    });

    const [showUnknownAlbumTracks, setShowUnknownAlbumTracksState] = useState<boolean>(
        () => persistenceService.getPreferences().showUnknownAlbumTracks ?? false
    );
    const rawTracksRef = useRef<TrackItem[]>([]);

    const buildDerivedTrackState = useCallback((allTracks: TrackItem[], showUnknown: boolean) => {
        const visibleTracks = filterTracksByAlbumVisibility(allTracks, showUnknown);

        let totalSizeMb = 0;
        let totalDuration = 0;
        visibleTracks.forEach(t => {
            totalSizeMb += t.file?.size_mb || 0;
            totalDuration += parseDuration(t.audio_specs?.duration || '0:00');
        });

        const versionToPrimaryMap: Record<string, string> = {};
        visibleTracks.forEach(primary => {
            primary.versions?.forEach(v => {
                versionToPrimaryMap[v.logic.hash_sha256] = primary.logic.hash_sha256;
            });
        });

        return {
            tracks: visibleTracks,
            versionToPrimaryMap,
            stats: { totalTracks: visibleTracks.length, totalSizeMb, totalDuration }
        };
    }, []);

    const setShowUnknownAlbumTracks = useCallback((value: boolean) => {
        setShowUnknownAlbumTracksState(value);
        persistenceService.updatePreferences({ showUnknownAlbumTracks: value });
    }, []);

    useEffect(() => {
        if (rawTracksRef.current.length === 0) return;
        const derived = buildDerivedTrackState(rawTracksRef.current, showUnknownAlbumTracks);
        searchService.buildIndex(derived.tracks);
        setState(prev => ({
            ...prev,
            tracks: derived.tracks,
            filteredTracks: derived.tracks,
            versionToPrimaryMap: derived.versionToPrimaryMap,
            stats: derived.stats
        }));
    }, [showUnknownAlbumTracks, buildDerivedTrackState]);

    useEffect(() => {
        const loadDb = async () => {
            const db = await dbService.loadInitialDatabase();
            if (db && db.items) {
                const overrides = persistenceService.getMetadataOverrides();
                const artworkOverrides = persistenceService.getArtworkOverrides();
                const hiddenTrackIds = new Set(persistenceService.getHiddenTrackIds());

                const rawTracks = db.items.map((t: TrackItem) => {
                    const hash = t.logic?.hash_sha256;
                    let track = { ...t };
                    if (hash && overrides[hash]) {
                        track.metadata = {
                            ...track.metadata,
                            ...overrides[hash]
                        };
                    }
                    if (hash && artworkOverrides[hash]) {
                        track.artworks = {
                            ...track.artworks,
                            track_artwork: artworkOverrides[hash]
                        };
                    }
                    return track;
                }).filter(t => !hiddenTrackIds.has(t.logic?.hash_sha256));

                const groupedMap = new Map<string, TrackItem[]>();
                rawTracks.forEach(t => {
                    const directoryKey = (t.file?.dir || t.logic?.hierarchy?.folder || 'unknown-directory').toLowerCase();
                    const key = `${directoryKey}::${(t.logic?.track_name || 'unknown').toLowerCase()}`;
                    if (!groupedMap.has(key)) {
                        groupedMap.set(key, []);
                    }
                    groupedMap.get(key)!.push(t);
                });

                const allTracks: TrackItem[] = Array.from(groupedMap.values()).map(versions => {
                    // Use multi-factor ranking (semantic-like version, version-name date, file dates, quality).
                    const sorted = rankTrackVersions(versions);
                    const primary = { ...sorted[0] };
                    primary.versions = sorted;

                    if (sorted.length > 1) {
                        const seen = new Set((primary.metadata?.artists || []).map((a: string) => a.toLowerCase()));
                        const merged = [...(primary.metadata?.artists || [])];
                        for (let i = 1; i < sorted.length; i++) {
                            for (const artist of (sorted[i].metadata?.artists || [])) {
                                const key = artist.toLowerCase();
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    merged.push(artist);
                                }
                            }
                        }
                        if (merged.length > (primary.metadata?.artists || []).length) {
                            primary.metadata = { ...primary.metadata, artists: merged };
                        }
                    }

                    return primary;
                });

                rawTracksRef.current = allTracks;
                const derived = buildDerivedTrackState(allTracks, showUnknownAlbumTracks);
                searchService.buildIndex(derived.tracks);

                setState(prev => ({
                    ...prev,
                    tracks: derived.tracks,
                    filteredTracks: derived.tracks,
                    isLoading: false,
                    versionToPrimaryMap: derived.versionToPrimaryMap,
                    stats: derived.stats
                }));
            } else {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        };
        loadDb();
    }, []);

    useEffect(() => {
        // Listen for remote persistence updates and refresh UI where appropriate
        const handler = (e: Event) => {
            const msg = (e as CustomEvent).detail as { type?: string; payload?: any; origin?: string };
            if (!msg || msg.type !== 'persistence-updated') return;
            const sections = msg.payload?.sections || [];
            // If playlists changed or history changed, trigger refresh
            if (sections.includes('playlists') || sections.includes('history') || sections.includes('preferences')) {
                setState(prev => ({ ...prev }));
            }
        };
        window.addEventListener('tab-sync-message', handler as EventListener);
        return () => window.removeEventListener('tab-sync-message', handler as EventListener);
    }, []);

    const sortTracks = useCallback((tracks: TrackItem[], sortBy: string, sortOrder: 'asc' | 'desc'): TrackItem[] => {
        const sorted = tracks.sort((a, b) => {
            let res = 0;
            if (sortBy === 'title') {
                res = (a.metadata?.title || a.logic?.track_name || '').localeCompare(b.metadata?.title || b.logic?.track_name || '');
            } else if (sortBy === 'artist') {
                const artistA = a.metadata?.artists?.[0] || '';
                const artistB = b.metadata?.artists?.[0] || '';
                res = artistA.localeCompare(artistB);
            } else if (sortBy === 'album') {
                const albumA = a.metadata?.album || '';
                const albumB = b.metadata?.album || '';
                res = albumA.localeCompare(albumB);
            } else if (sortBy === 'date' || sortBy === 'year') {
                const dateA = Number(a.metadata?.year) || 0;
                const dateB = Number(b.metadata?.year) || 0;
                res = dateA - dateB;
            } else if (sortBy === 'genre') {
                const genreA = parseGenres(a.metadata?.genre)[0] || '';
                const genreB = parseGenres(b.metadata?.genre)[0] || '';
                res = genreA.localeCompare(genreB);
            } else if (sortBy === 'bpm') {
                const bpmA = Number(a.metadata?.bpm) || 0;
                const bpmB = Number(b.metadata?.bpm) || 0;
                res = bpmA - bpmB;
            } else if (sortBy === 'duration') {
                res = parseDuration(a.audio_specs?.duration || '0:00') - parseDuration(b.audio_specs?.duration || '0:00');
            } else if (sortBy === 'bitrate') {
                const brA = parseInt(a.audio_specs?.bitrate || '0');
                const brB = parseInt(b.audio_specs?.bitrate || '0');
                res = brA - brB;
            } else if (sortBy === 'size') {
                res = (a.file?.size_bytes || 0) - (b.file?.size_bytes || 0);
            }
            return res;
        });

        return sortOrder === 'desc' ? sorted.reverse() : sorted;
    }, []);

    const currentSearchQueryRef = useRef(state.searchQuery);
    const metadataExportTimerRef = useRef<number | null>(null);
    const searchTimeoutRef = useRef<number | null>(null);

    // Memoized debounced search function
    const performSearch = useCallback(async (query: string, tracks: TrackItem[], isLoading: boolean) => {
        if (isLoading) return;

        if (!query.trim()) {
            // If no search, we sort tracks
            const sorted = sortTracks([...tracks], state.sortBy, state.sortOrder);
            setState(prev => ({ ...prev, filteredTracks: sorted }));
            return;
        }

        const results = await searchService.search(query);

        // Prevent race conditions: only update if this is still the active search
        if (currentSearchQueryRef.current !== query) {
            return;
        }

        const sorted = sortTracks([...results], state.sortBy, state.sortOrder);
        setState(prev => ({ ...prev, filteredTracks: sorted }));
    }, [sortTracks, state.sortBy, state.sortOrder]);

    useEffect(() => {
        currentSearchQueryRef.current = state.searchQuery;

        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Set new debounced timeout
        searchTimeoutRef.current = window.setTimeout(() => {
            performSearch(state.searchQuery, state.tracks, state.isLoading);
        }, 300); // 300ms debounce

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [state.searchQuery, state.sortBy, state.sortOrder, state.isLoading, state.tracks, performSearch]);


    const setSearchQuery = useCallback((query: string) => {
        setState(prev => ({ ...prev, searchQuery: query }));
    }, []);

    const setSortBy = useCallback((sortBy: string) => {
        setState(prev => {
            const isSame = prev.sortBy === sortBy;
            const newOrder = isSame ? (prev.sortOrder === 'asc' ? 'desc' : 'asc') : (sortBy === 'date' || sortBy === 'year' ? 'desc' : 'asc');
            return { ...prev, sortBy, sortOrder: newOrder };
        });
    }, []);

    const updateTrackMetadata = useCallback(async (hash_sha256: string, override: Partial<TrackMetadata>, target?: MetadataWriteTarget) => {
        const activeTarget = target || persistenceService.getPreferences().metadataWriteTarget || 'musicbib';

        if (activeTarget === 'musicbib' || activeTarget === 'both') {
            dbService.updateTrackMetadata(hash_sha256, override);
        }

        if (activeTarget === 'file' || activeTarget === 'both') {
            persistenceService.setMetadataOverride(hash_sha256, override);
        }

        // Compute updated tracks synchronously, keep the full catalogue and visible state in sync, then rebuild search index
        const updateTracksArray = (tracks: TrackItem[]) => tracks.map(t => {
            if (t.logic?.hash_sha256 === hash_sha256) {
                return { ...t, metadata: { ...t.metadata, ...override } as TrackMetadata };
            }
            return t;
        });

        rawTracksRef.current = updateTracksArray(rawTracksRef.current);
        const updatedTracks = filterTracksByAlbumVisibility(rawTracksRef.current, showUnknownAlbumTracks);

        setState(prev => ({
            ...prev,
            tracks: updatedTracks,
            filteredTracks: filterTracksByAlbumVisibility(updateTracksArray(prev.filteredTracks), showUnknownAlbumTracks)
        }));

        // Rebuild search index so in-memory search reflects metadata changes immediately.
        try {
            if (updatedTracks.length > 0) {
                searchService.buildIndex(updatedTracks);
            }
        } catch (e) {
            console.warn('Failed to update search index after metadata change', e);
        }

        if (activeTarget === 'musicbib' || activeTarget === 'both') {
            if (metadataExportTimerRef.current) {
                window.clearTimeout(metadataExportTimerRef.current);
            }

            metadataExportTimerRef.current = window.setTimeout(() => {
                const serialized = dbService.exportDatabaseJson();
                if (!serialized || typeof window === 'undefined') return;

                const blob = new Blob([serialized], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'musicBib.json';
                a.click();
                URL.revokeObjectURL(url);
            }, 250);
        }
    }, [showUnknownAlbumTracks]);

    const updateArtworkOverride = useCallback((hash_sha256: string, artwork: import('../types/music').ImageDetails[]) => {
        persistenceService.setArtworkOverride(hash_sha256, artwork);
        const updateTracksArray = (tracks: TrackItem[]) => tracks.map(t => {
            if (t.logic?.hash_sha256 === hash_sha256) {
                return { ...t, artworks: { ...t.artworks, track_artwork: artwork } };
            }
            return t;
        });

        rawTracksRef.current = updateTracksArray(rawTracksRef.current);

        setState(prev => ({
            ...prev,
            tracks: updateTracksArray(prev.tracks),
            filteredTracks: updateTracksArray(prev.filteredTracks)
        }));
    }, []);

    const [editingTracks, setEditingTracks] = useState<TrackItem[] | null>(null);

    const updateColumnConfig = useCallback((config: ColumnConfig[]) => {
        persistenceService.set('library_columns', config);
        setState(prev => ({ ...prev, columnConfig: config }));
    }, []);

    const refresh = useCallback(() => {
        setState(prev => ({ ...prev }));
    }, []);

    return (
        <LibraryContext.Provider value={{
            state,
            setSearchQuery,
            setSortBy,
            updateTrackMetadata,
            updateArtworkOverride,
            updateColumnConfig,
            editingTracks,
            setEditingTracks,
            refresh,
            showUnknownAlbumTracks,
            setShowUnknownAlbumTracks
        }}>
            {children}
        </LibraryContext.Provider>
    );
};

export const useLibrary = () => {
    const context = useContext(LibraryContext);
    if (!context) throw new Error('useLibrary must be used within LibraryProvider');
    return context;
};

