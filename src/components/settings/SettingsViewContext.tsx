import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n/I18nContext';
import { audioEngine } from '../../services/audioEngine';
import {
    applyEqPreset as applyEqPresetBands,
    clampEqBand,
    clampEqGain,
    clampEqQ,
    coerceParametricEqBands,
    createDefaultParametricEqBands,
    PARAMETRIC_EQ_PRESETS,
    type ParametricEqBand,
    type ParametricEqPreset
} from '../../services/parametricEq';
import { CROSSFADE_MIN, CROSSFADE_MAX, CROSSFADE_DEFAULT } from '../../services/audioEngine';
import { persistenceService } from '../../services/persistence';
import type { MetadataWriteTarget, ShuffleMode } from '../../services/persistence';
import type { TrackItem } from '../../types/music';
import { parseDuration } from '../../utils/formatters';
import { getTrackDisplayName } from '../../utils/trackUtils';
import type { MaintenanceTabId, SettingsDetailedStats, SettingsStatCard, SettingsTabId } from './settingsTypes';

interface DuplicateGroups {
    exact: TrackItem[][];
    probable: TrackItem[][];
}

interface HealthIssues {
    lowBitrate: TrackItem[];
    missingMetadata: TrackItem[];
}

interface SettingsViewContextValue {
    activeTab: SettingsTabId;
    setActiveTab: React.Dispatch<React.SetStateAction<SettingsTabId>>;
    maintenanceTab: MaintenanceTabId;
    setMaintenanceTab: React.Dispatch<React.SetStateAction<MaintenanceTabId>>;
    metadataWriteTarget: MetadataWriteTarget;
    setMetadataWriteTarget: (target: MetadataWriteTarget) => void;
    metadataSearch: string;
    setMetadataSearch: React.Dispatch<React.SetStateAction<string>>;
    selectedHashes: Set<string>;
    setSelectedHashes: React.Dispatch<React.SetStateAction<Set<string>>>;
    uiGlowEnabled: boolean;
    setUiGlowEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    uiCompactPlayerEnabled: boolean;
    setUiCompactPlayerEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    uiNowPlayingNotificationsEnabled: boolean;
    setUiNowPlayingNotificationsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    eqEnabled: boolean;
    setEqEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    eqBands: ParametricEqBand[];
    setEqBands: React.Dispatch<React.SetStateAction<ParametricEqBand[]>>;
    eqPresets: ParametricEqPreset[];
    auditionBandIndex: number | null;
    setAuditionBandIndex: React.Dispatch<React.SetStateAction<number | null>>;
    updateEqBand: (index: number, patch: Partial<ParametricEqBand>) => void;
    resetEqBand: (index: number) => void;
    resetEqBands: () => void;
    applyEqPreset: (presetId: string) => void;
    crossfadeEnabled: boolean;
    setCrossfadeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    crossfadeDuration: number;
    setCrossfadeDuration: React.Dispatch<React.SetStateAction<number>>;
    normalizationEnabled: boolean;
    setNormalizationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    normalizationStrength: number;
    setNormalizationStrength: React.Dispatch<React.SetStateAction<number>>;
    playbackSpeed: number;
    setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
    commitPlaybackSpeed: (value: number) => void;
    eqZeroSnapThreshold: number;
    duplicateGroups: DuplicateGroups;
    healthIssues: HealthIssues;
    metadataCandidates: TrackItem[];
    statsCards: SettingsStatCard[];
    detailedStats: SettingsDetailedStats;
    setInterfacePreference: (key: string, value: boolean) => void;
    requestNowPlayingNotifications: () => Promise<boolean>;
    setShuffleModePreference: (mode: ShuffleMode) => void;
    toggleTrackSelection: (hash: string) => void;
    handleExport: () => void;
    clearHistory: () => void;
    openMetadataEditor: () => void;
}

const DEFAULT_ACTIVE_TAB: SettingsTabId = 'interface';
const DEFAULT_MAINTENANCE_TAB: MaintenanceTabId = 'duplicates';
const EQ_ZERO_SNAP_THRESHOLD = 0.35;

const SettingsViewContext = createContext<SettingsViewContextValue | undefined>(undefined);

const resolveInitialTab = (initialTab?: string): SettingsTabId => {
    if (initialTab === 'maintenance') return 'maintenance';
    if (initialTab === 'audio') return 'audio';
    if (initialTab === 'metadata') return 'metadata';
    if (initialTab === 'stats') return 'stats';
    if (initialTab === 'credentials') return 'credentials';
    return DEFAULT_ACTIVE_TAB;
};

const normalizeEqBands = (bands: ParametricEqBand[] | unknown): ParametricEqBand[] => (
    coerceParametricEqBands(bands) || createDefaultParametricEqBands()
);

const clampPlaybackSpeed = (speed: number): number => {
    if (!Number.isFinite(speed)) return 1;
    return Math.max(0.5, Math.min(2, speed));
};

export const SettingsViewProvider: React.FC<React.PropsWithChildren<{ initialTab?: string }>> = ({ children, initialTab }) => {
    const { state: libraryState, setEditingTracks } = useLibrary();
    const { setShuffleMode } = usePlayer();
    const { t } = useTranslation();
    useTheme();

    const [activeTab, setActiveTab] = useState<SettingsTabId>(() => resolveInitialTab(initialTab));
    const [maintenanceTab, setMaintenanceTab] = useState<MaintenanceTabId>(DEFAULT_MAINTENANCE_TAB);
    const [metadataWriteTarget, setMetadataWriteTargetState] = useState<MetadataWriteTarget>(() => (
        persistenceService.getPreferences().metadataWriteTarget || 'musicbib'
    ));
    const [metadataSearch, setMetadataSearch] = useState('');
    const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
    const [uiGlowEnabled, setUiGlowEnabled] = useState(() => persistenceService.get('ui_glow') !== false);
    const [uiCompactPlayerEnabled, setUiCompactPlayerEnabled] = useState(() => persistenceService.get('ui_compact_player') === true);
    const [uiNowPlayingNotificationsEnabled, setUiNowPlayingNotificationsEnabled] = useState(() => persistenceService.get('ui_now_playing_notifications') === true);
    const [eqEnabled, setEqEnabled] = useState(() => persistenceService.getPreferences().eqEnabled);
    const [eqBands, setEqBands] = useState<ParametricEqBand[]>(() => normalizeEqBands(persistenceService.getPreferences().eqBands));
    const [auditionBandIndex, setAuditionBandIndex] = useState<number | null>(null);
    const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => persistenceService.getPreferences().crossfadeEnabled || false);
    const initialCross = Number.isFinite(persistenceService.getPreferences().crossfadeDuration)
        ? Math.max(CROSSFADE_MIN, Math.min(CROSSFADE_MAX, persistenceService.getPreferences().crossfadeDuration))
        : CROSSFADE_DEFAULT;
    const [crossfadeDuration, setCrossfadeDuration] = useState(() => initialCross);
    const [normalizationEnabled, setNormalizationEnabled] = useState(() => persistenceService.getPreferences().normalizationEnabled || false);
    const [normalizationStrength, setNormalizationStrength] = useState(() => persistenceService.getPreferences().normalizationStrength || 45);
    const [playbackSpeed, setPlaybackSpeed] = useState(() => {
        const speed = persistenceService.getPreferences().playbackSpeed;
        return clampPlaybackSpeed(speed);
    });

    useEffect(() => {
        audioEngine.setEqState(eqEnabled, eqBands, auditionBandIndex);
    }, [auditionBandIndex, eqBands, eqEnabled]);

    useEffect(() => {
        persistenceService.updatePreferences({
            eqEnabled,
            eqBands,
            crossfadeEnabled,
            crossfadeDuration: Math.max(CROSSFADE_MIN, Math.min(CROSSFADE_MAX, crossfadeDuration)),
            normalizationEnabled,
            normalizationStrength
        });
    }, [crossfadeDuration, crossfadeEnabled, eqBands, eqEnabled, normalizationEnabled, normalizationStrength]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            audioEngine.setPlaybackRate(clampPlaybackSpeed(playbackSpeed));
        }, 90);

        return () => window.clearTimeout(timer);
    }, [playbackSpeed]);

    useEffect(() => {
        audioEngine.setVolumeNormalization(normalizationEnabled, normalizationStrength);
    }, [normalizationEnabled, normalizationStrength]);

    useEffect(() => {
        audioEngine.setCrossfade(crossfadeEnabled, Math.max(CROSSFADE_MIN, Math.min(CROSSFADE_MAX, crossfadeDuration)));
    }, [crossfadeEnabled, crossfadeDuration]);

    useEffect(() => {
        const syncInterfaceSettingsFromStorage = () => {
            setUiGlowEnabled(persistenceService.get('ui_glow') !== false);
            setUiCompactPlayerEnabled(persistenceService.get('ui_compact_player') === true);
            setUiNowPlayingNotificationsEnabled(persistenceService.get('ui_now_playing_notifications') === true);
        };

        window.addEventListener('storage', syncInterfaceSettingsFromStorage);
        return () => window.removeEventListener('storage', syncInterfaceSettingsFromStorage);
    }, []);

    const duplicateGroups = useMemo<DuplicateGroups>(() => {
        const hashGroups: Record<string, TrackItem[]> = {};
        const fuzzyGroups: Record<string, TrackItem[]> = {};

        libraryState.tracks.forEach(track => {
            const hash = track.logic.hash_sha256;
            if (!hashGroups[hash]) hashGroups[hash] = [];
            hashGroups[hash].push(track);

            const fuzzyKey = `${(track.metadata?.title || '').toLowerCase().trim()}|${(track.metadata?.artists?.[0] || '').toLowerCase().trim()}`;
            if (fuzzyKey.length <= 5) return;

            if (!fuzzyGroups[fuzzyKey]) fuzzyGroups[fuzzyKey] = [];
            fuzzyGroups[fuzzyKey].push(track);
        });

        return {
            exact: Object.values(hashGroups).filter(group => group.length > 1),
            probable: Object.values(fuzzyGroups).filter(group => {
                if (group.length <= 1) return false;
                const hashes = new Set(group.map(track => track.logic.hash_sha256));
                return hashes.size > 1;
            })
        };
    }, [libraryState.tracks]);

    const healthIssues = useMemo<HealthIssues>(() => {
        const lowBitrate = libraryState.tracks.filter(track => {
            const bitrate = parseInt(track.audio_specs?.bitrate || '0', 10);
            return bitrate > 0 && bitrate < 128;
        });
        const missingMetadata = libraryState.tracks.filter(track => !track.metadata?.genre || !track.metadata?.year || !track.metadata?.album);

        return { lowBitrate, missingMetadata };
    }, [libraryState.tracks]);

    const metadataCandidates = useMemo(() => {
        const query = metadataSearch.trim().toLowerCase();
        const candidates = libraryState.tracks.filter(track => {
            if (!query) return true;

            const title = getTrackDisplayName(track).toLowerCase();
            const artist = (track.metadata?.artists?.join(' ') || '').toLowerCase();
            const album = (track.metadata?.album || '').toLowerCase();
            return title.includes(query) || artist.includes(query) || album.includes(query);
        });

        return candidates.slice(0, 80);
    }, [libraryState.tracks, metadataSearch]);

    const statsCards = useMemo<SettingsStatCard[]>(() => ([
        { label: t('settings.stats.statTracks'), value: libraryState.stats.totalTracks.toLocaleString() },
        { label: t('settings.stats.statDuration'), value: `${Math.round(libraryState.stats.totalDuration / 60).toLocaleString()} ${t('settings.stats.min')}` },
        { label: t('settings.stats.statSize'), value: `${libraryState.stats.totalSizeMb.toFixed(1)} MB` },
        { label: t('settings.stats.statLossless'), value: libraryState.tracks.filter(track => track.audio_specs?.is_lossless).length.toLocaleString() }
    ]), [libraryState.stats.totalDuration, libraryState.stats.totalSizeMb, libraryState.stats.totalTracks, libraryState.tracks, t]);

    const detailedStats = useMemo<SettingsDetailedStats>(() => {
        const tracks = libraryState.tracks;
        const favorites = persistenceService.getFavorites();
        const ratings = persistenceService.getAllRatings();
        const genres: Record<string, number> = {};
        const artistSet = new Set<string>();
        const albumSet = new Set<string>();
        const folderSet = new Set<string>();
        let totalTime = 0;
        let totalBitrate = 0;
        let bitrateCount = 0;
        let totalSizeMb = 0;
        let lossless = 0;
        let totalVersionsCount = 0;
        let singles = 0;
        let totalSampleRate = 0;
        let sampleRateCount = 0;
        const codecDist: Record<string, number> = {};
        const years: number[] = [];

        tracks.forEach(track => {
            const trackGenres = track.metadata?.genre;
            if (Array.isArray(trackGenres)) {
                trackGenres.forEach(genre => {
                    genres[genre] = (genres[genre] || 0) + 1;
                });
            } else if (trackGenres) {
                genres[trackGenres] = (genres[trackGenres] || 0) + 1;
            }

            (track.metadata?.artists || []).forEach(artist => {
                if (artist?.trim()) artistSet.add(artist.trim());
            });

            if (track.metadata?.album?.trim()) albumSet.add(track.metadata.album.trim());
            if (track.logic?.hierarchy?.folder?.trim()) folderSet.add(track.logic.hierarchy.folder.trim());
            if (track.logic?.is_single) singles++;
            totalVersionsCount += track.versions?.length || 1;

            if (track.audio_specs?.duration) {
                totalTime += parseDuration(track.audio_specs.duration);
            }

            if (track.audio_specs?.bitrate) {
                const bitrate = parseInt(track.audio_specs.bitrate, 10);
                if (!isNaN(bitrate)) {
                    totalBitrate += bitrate;
                    bitrateCount++;
                }
            }

            if (track.audio_specs?.sample_rate) {
                const sampleRate = parseInt(String(track.audio_specs.sample_rate).replace(/[^\d]/g, ''), 10);
                if (!isNaN(sampleRate) && sampleRate > 0) {
                    totalSampleRate += sampleRate;
                    sampleRateCount++;
                }
            }

            const codec = (track.audio_specs?.codec || track.file?.ext || 'unknown').toLowerCase();
            codecDist[codec] = (codecDist[codec] || 0) + 1;

            const year = Number(track.metadata?.year);
            if (!isNaN(year) && year > 1000) years.push(year);

            totalSizeMb += track.file?.size_mb || 0;
            if (track.audio_specs?.is_lossless) {
                lossless++;
            }
        });

        const ratingsValues = Object.values(ratings).filter(value => value > 0);
        const allSortedGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]);
        const sortedGenres = allSortedGenres.slice(0, 8);

        const genreByDecadeMap: Record<string, Record<string, number>> = {};
        const genreByFormatMap: Record<string, { lossless: number; lossy: number }> = {};

        tracks.forEach(track => {
            const trackGenres = track.metadata?.genre;
            const genreList: string[] = Array.isArray(trackGenres)
                ? trackGenres
                : trackGenres ? [trackGenres] : [];
            const year = Number(track.metadata?.year);
            const isLossless = Boolean(track.audio_specs?.is_lossless);

            genreList.forEach(genre => {
                if (!genre) return;

                if (!isNaN(year) && year > 1000) {
                    const decade = `${Math.floor(year / 10) * 10}s`;
                    if (!genreByDecadeMap[decade]) genreByDecadeMap[decade] = {};
                    genreByDecadeMap[decade][genre] = (genreByDecadeMap[decade][genre] || 0) + 1;
                }

                if (!genreByFormatMap[genre]) genreByFormatMap[genre] = { lossless: 0, lossy: 0 };
                if (isLossless) {
                    genreByFormatMap[genre].lossless++;
                } else {
                    genreByFormatMap[genre].lossy++;
                }
            });
        });

        const genreByDecade = Object.entries(genreByDecadeMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([decade, genreCounts]) => ({
                decade,
                genres: Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            }));

        const genreByFormat = allSortedGenres.slice(0, 10).map(([genre]) => ({
            genre,
            lossless: genreByFormatMap[genre]?.lossless || 0,
            lossy: genreByFormatMap[genre]?.lossy || 0,
        }));

        return {
            totalPlaytimeMinutes: Math.round(totalTime / 60),
            averageBitrate: bitrateCount > 0 ? Math.round(totalBitrate / bitrateCount) : 0,
            totalTracks: tracks.length,
            totalAlbums: albumSet.size,
            totalArtists: artistSet.size,
            totalGenres: Object.keys(genres).length,
            totalFolders: folderSet.size,
            totalSizeGb: totalSizeMb / 1024,
            averageDurationMinutes: tracks.length > 0 ? (totalTime / tracks.length) / 60 : 0,
            losslessCount: lossless,
            ratedTracksCount: ratingsValues.length,
            averageRating: ratingsValues.length > 0
                ? ratingsValues.reduce((acc, n) => acc + n, 0) / ratingsValues.length
                : 0,
            totalVersions: totalVersionsCount,
            singlesCount: singles,
            topCodec: Object.entries(codecDist).sort((a, b) => b[1] - a[1])[0]?.[0]?.toUpperCase() || '-',
            averageSampleRateKhz: sampleRateCount > 0 ? (totalSampleRate / sampleRateCount) / 1000 : 0,
            oldestYear: years.length ? Math.min(...years) : null,
            newestYear: years.length ? Math.max(...years) : null,
            historyCount: persistenceService.getHistoryIds().length,
            favoritesCount: favorites.length,
            genreDistribution: sortedGenres,
            genreFullDistribution: allSortedGenres,
            genreByDecade,
            genreByFormat,
            maxGenreCount: Math.max(...Object.values(genres).concat(1))
        };
    }, [libraryState.tracks]);

    const setMetadataWriteTarget = useCallback((target: MetadataWriteTarget) => {
        setMetadataWriteTargetState(target);
        persistenceService.updatePreferences({ metadataWriteTarget: target });
    }, []);

    const setInterfacePreference = useCallback((key: string, value: boolean) => {
        persistenceService.set(key, value);
        window.dispatchEvent(new Event('storage'));
    }, []);

    const requestNowPlayingNotifications = useCallback(async () => {
        if (!('Notification' in window)) {
            alert('Notifications are not supported in this browser.');
            return false;
        }

        if (Notification.permission === 'denied') {
            alert('Notifications are blocked for this site. Please re-enable them in browser settings.');
            return false;
        }

        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                return false;
            }
        }

        return true;
    }, []);

    const setShuffleModePreference = useCallback((mode: ShuffleMode) => {
        setShuffleMode(mode);
    }, [setShuffleMode]);

    const commitPlaybackSpeed = useCallback((value: number) => {
        const nextSpeed = clampPlaybackSpeed(value);
        setPlaybackSpeed(nextSpeed);
        audioEngine.setPlaybackRate(nextSpeed);
        persistenceService.updatePreferences({ playbackSpeed: nextSpeed });
    }, []);

    const snapEqBandValue = useCallback((value: number) => {
        const rounded = Math.round(value * 10) / 10;
        return Math.abs(rounded) <= EQ_ZERO_SNAP_THRESHOLD ? 0 : rounded;
    }, []);

    const updateEqBand = useCallback((index: number, patch: Partial<ParametricEqBand>) => {
        setEqBands(previous => {
            const nextBands = [...previous];
            const currentBand = nextBands[index];
            if (!currentBand) return previous;

            const nextBand = clampEqBand({
                ...currentBand,
                ...patch,
                gain: patch.gain === undefined ? currentBand.gain : snapEqBandValue(clampEqGain(patch.gain)),
                q: patch.q === undefined ? currentBand.q : clampEqQ(patch.q)
            }, currentBand);
            nextBands[index] = nextBand;
            return nextBands;
        });
    }, [snapEqBandValue]);

    const resetEqBand = useCallback((index: number) => {
        const defaults = createDefaultParametricEqBands();
        const fallback = defaults[index];
        if (!fallback) return;
        updateEqBand(index, fallback);
    }, [updateEqBand]);

    const resetEqBands = useCallback(() => {
        setEqBands(createDefaultParametricEqBands());
        setAuditionBandIndex(null);
    }, []);

    const applyEqPreset = useCallback((presetId: string) => {
        setEqBands(applyEqPresetBands(presetId));
        setEqEnabled(true);
        setAuditionBandIndex(null);
    }, []);

    const toggleTrackSelection = useCallback((hash: string) => {
        setSelectedHashes(previous => {
            const next = new Set(previous);
            if (next.has(hash)) {
                next.delete(hash);
            } else {
                next.add(hash);
            }
            return next;
        });
    }, []);

    const handleExport = useCallback(() => {
        const data = persistenceService.getData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `library_backup_${new Date().toISOString().split('T')[0]}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, []);

    const clearHistory = useCallback(() => {
        if (!window.confirm(t('settings.maintenance.clearHistoryConfirm')) ) {
            return;
        }

        persistenceService.clearHistory();
        window.alert(t('settings.maintenance.historyCleared'));
    }, [t]);

    const openMetadataEditor = useCallback(() => {
        const selectedTracks = libraryState.tracks.filter(track => selectedHashes.has(track.logic.hash_sha256));
        if (selectedTracks.length === 0) return;

        persistenceService.updatePreferences({ metadataWriteTarget });
        setEditingTracks(selectedTracks);
    }, [libraryState.tracks, metadataWriteTarget, selectedHashes, setEditingTracks]);

    const value = useMemo<SettingsViewContextValue>(() => ({
        activeTab,
        setActiveTab,
        maintenanceTab,
        setMaintenanceTab,
        metadataWriteTarget,
        setMetadataWriteTarget,
        metadataSearch,
        setMetadataSearch,
        selectedHashes,
        setSelectedHashes,
        uiGlowEnabled,
        setUiGlowEnabled,
        uiCompactPlayerEnabled,
        setUiCompactPlayerEnabled,
        uiNowPlayingNotificationsEnabled,
        setUiNowPlayingNotificationsEnabled,
        eqEnabled,
        setEqEnabled,
        eqBands,
        setEqBands,
        eqPresets: PARAMETRIC_EQ_PRESETS,
        auditionBandIndex,
        setAuditionBandIndex,
        updateEqBand,
        resetEqBand,
        resetEqBands,
        applyEqPreset,
        crossfadeEnabled,
        setCrossfadeEnabled,
        crossfadeDuration,
        setCrossfadeDuration,
        normalizationEnabled,
        setNormalizationEnabled,
        normalizationStrength,
        setNormalizationStrength,
        playbackSpeed,
        setPlaybackSpeed,
        commitPlaybackSpeed,
        eqZeroSnapThreshold: EQ_ZERO_SNAP_THRESHOLD,
        duplicateGroups,
        healthIssues,
        metadataCandidates,
        statsCards,
        detailedStats,
        setInterfacePreference,
        requestNowPlayingNotifications,
        setShuffleModePreference,
        toggleTrackSelection,
        handleExport,
        clearHistory,
        openMetadataEditor
    }), [
        activeTab,
        applyEqPreset,
        auditionBandIndex,
        clearHistory,
        crossfadeDuration,
        crossfadeEnabled,
        duplicateGroups,
        eqBands,
        eqEnabled,
        commitPlaybackSpeed,
        handleExport,
        healthIssues,
        maintenanceTab,
        metadataCandidates,
        metadataSearch,
        metadataWriteTarget,
        normalizationEnabled,
        normalizationStrength,
        playbackSpeed,
        openMetadataEditor,
        requestNowPlayingNotifications,
        resetEqBand,
        resetEqBands,
        selectedHashes,
        setInterfacePreference,
        setMetadataWriteTarget,
        setShuffleModePreference,
        detailedStats,
        statsCards,
        toggleTrackSelection,
        uiCompactPlayerEnabled,
        uiGlowEnabled,
        uiNowPlayingNotificationsEnabled,
        updateEqBand
    ]);

    return (
        <SettingsViewContext.Provider value={value}>
            {children}
        </SettingsViewContext.Provider>
    );
};

export const useSettingsView = () => {
    const context = useContext(SettingsViewContext);
    if (!context) {
        throw new Error('useSettingsView must be used within SettingsViewProvider');
    }
    return context;
};

