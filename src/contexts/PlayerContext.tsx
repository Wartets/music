import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { PlayerState, TrackItem } from '../types/music';
import { audioEngine, AudioPlaybackError } from '../services/audioEngine';
import { coerceParametricEqBands, createDefaultParametricEqBands } from '../services/parametricEq';
import { persistenceService } from '../services/persistence';
import { tabSync } from '../services/tabSync';
import { useLibrary } from './LibraryContext';
import { useUI } from './UIContext';
import { useTranslation } from '../i18n/I18nContext';
import { rankTrackVersions } from '../utils/versionUtils';
import { RepeatMode } from '../types/playback';
import { getTrackDisplayName } from '../utils/trackUtils';

interface PlayTrackOptions {
    skipHistoryPush?: boolean;
    suppressHistoryLog?: boolean;
    recoveryAttempt?: boolean;
    isEndOfTrackTransition?: boolean;
}

interface PlayerContextProps {
    state: PlayerState;
    isRemoteControlled: boolean;
    playTrack: (track: TrackItem, queue?: TrackItem[]) => void;
    togglePlay: () => void;
    playNext: () => void;
    playPrevious: () => void;
    setVolume: (level: number) => void;
    seek: (time: number) => void;
    getProgress: () => number;
    stop: () => void;
    seekForward: () => void;
    seekBackward: () => void;
    toggleShuffle: () => void;
    setRepeat: (mode: RepeatMode) => void;
    reorderQueue: (startIndex: number, endIndex: number) => void;
    removeFromQueue: (index: number) => void;
    addToQueue: (track: TrackItem) => void;
    addToNext: (track: TrackItem) => void;
    clearQueue: () => void;
    setAutoplay: (enabled: boolean) => void;
    setQueueLimit: (limit: number) => void;
    setShuffleMode: (mode: import('../services/persistence').ShuffleMode) => void;
    saveQueueAsPlaylist: (name: string) => void;
}

const PlayerContext = createContext<PlayerContextProps | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<PlayerState>(() => {
        const initialPrefs = persistenceService.getPreferences();
        const savedState = persistenceService.getPlaybackState();

        return {
            currentTrack: null, // Will be hydrated in useEffect
            isPlaying: false,
            volume: savedState?.volume ?? initialPrefs.volume,
            queue: [], // Will be hydrated
            history: [], // Will be hydrated
            shuffle: initialPrefs.shuffle,
            shuffleMode: initialPrefs.shuffleMode,
            repeat: initialPrefs.repeat,
            autoplay: persistenceService.get('ui_autoplay') !== false,
            queueLimit: 0, // 0 means no limit
        };
    });

    // Use ref to access latest state in event listeners without recreating them
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const progressRef = useRef(0);
    const applyingRemoteRef = useRef(false);
    const [isRemoteControlled, setIsRemoteControlled] = useState(false);
    const remoteBadgeTimerRef = useRef<number | null>(null);
    const getProgress = useCallback(() => {
        const value = Number(progressRef.current);
        return Number.isFinite(value) ? value : 0;
    }, []);
    const playTrackLogicRef = useRef<(track: TrackItem, queue?: TrackItem[], options?: PlayTrackOptions) => void>(() => { });
    const handlePlaybackFailureRef = useRef<(error: Error, failedTrack?: TrackItem | null) => void>(() => { });

    const recoveryRef = useRef<{
        attempted: Set<string>;
        attemptedPrimary: Set<string>;
        notified: Set<string>;
        lastErrorAt: number;
        lastErrorKey: string;
    }>({
        attempted: new Set(),
        attemptedPrimary: new Set(),
        notified: new Set(),
        lastErrorAt: 0,
        lastErrorKey: ''
    });

    // Handle initial state restoration from persistence
    const [isRestored, setIsRestored] = useState(false);
    const { state: libState } = useLibrary();
    const { showToast } = useUI();
    const { t } = useTranslation();

    const resetRecoveryState = useCallback(() => {
        recoveryRef.current.attempted.clear();
        recoveryRef.current.attemptedPrimary.clear();
        recoveryRef.current.notified.clear();
        recoveryRef.current.lastErrorAt = 0;
        recoveryRef.current.lastErrorKey = '';
    }, []);

    const toPrimaryHash = useCallback((trackOrHash: TrackItem | string | null | undefined): string => {
        const hash = typeof trackOrHash === 'string'
            ? trackOrHash
            : (trackOrHash?.logic?.hash_sha256 || '');
        if (!hash) return '';
        return libState.versionToPrimaryMap[hash] || hash;
    }, [libState.versionToPrimaryMap]);

    useEffect(() => {
        const prefs = persistenceService.getPreferences();
        audioEngine.setEqState(
            !!prefs.eqEnabled,
            coerceParametricEqBands(prefs.eqBands) || createDefaultParametricEqBands(),
            null
        );
        audioEngine.setPlaybackRate(
            Number.isFinite(prefs.playbackSpeed) ? prefs.playbackSpeed : 1
        );
        audioEngine.setVolumeNormalization(
            !!prefs.normalizationEnabled,
            Number.isFinite(prefs.normalizationStrength) ? prefs.normalizationStrength : 45
        );
        audioEngine.setCrossfade(
            !!prefs.crossfadeEnabled,
            Number.isFinite(prefs.crossfadeDuration) ? prefs.crossfadeDuration : 3
        );
    }, []);

    const resolveVersionGroup = useCallback((track: TrackItem): TrackItem[] => {
        const hash = track.logic?.hash_sha256;
        const primaryHash = libState.versionToPrimaryMap[hash] || hash;
        const primary = libState.tracks.find(t => t.logic.hash_sha256 === primaryHash) || track;
        const versions = primary.versions && primary.versions.length > 0 ? primary.versions : [primary];
        return rankTrackVersions(versions);
    }, [libState.tracks, libState.versionToPrimaryMap]);

    useEffect(() => {
        if (libState.isLoading || isRestored) return;

        const saved = persistenceService.getPlaybackState();
        if (saved) {
            const toPrimaryId = (id: string | null | undefined) => id ? (libState.versionToPrimaryMap[id] || id) : null;
            const findTrackByAnyId = (id: string | null | undefined) => {
                const primaryId = toPrimaryId(id);
                if (!primaryId) return null;
                return libState.tracks.find((t: TrackItem) => t.logic.hash_sha256 === primaryId) || null;
            };

            const track = findTrackByAnyId(saved.trackId);
            const queue = saved.queueIds
                .map((id: string) => findTrackByAnyId(id))
                .filter(Boolean) as TrackItem[];
            const history = saved.historyIds
                .map((id: string) => findTrackByAnyId(id))
                .filter(Boolean) as TrackItem[];

            setState(prev => ({
                ...prev,
                currentTrack: track || null,
                queue,
                history,
                volume: saved.volume ?? prev.volume,
            }));

            if (track) {
                audioEngine.setVolume(saved.volume ?? state.volume);
                const savedPosition = Number(saved.position);
                const safePosition = Number.isFinite(savedPosition) ? Math.max(0, savedPosition) : 0;
                audioEngine.load(track, safePosition);
                progressRef.current = safePosition;
            }
        }
        setIsRestored(true);
    }, [libState.isLoading, libState.tracks, libState.versionToPrimaryMap, isRestored]);

    // Save state effect
    useEffect(() => {
        if (!isRestored) return;
        const timer = setInterval(() => {
            const cur = stateRef.current;
            const payload = {
                trackId: cur.currentTrack?.logic.hash_sha256 || null,
                queueIds: cur.queue.map(t => t.logic.hash_sha256),
                historyIds: cur.history.map(t => t.logic.hash_sha256),
                position: progressRef.current,
                volume: cur.volume,
                isPlaying: cur.isPlaying
            };
            persistenceService.setPlaybackState({
                trackId: payload.trackId,
                queueIds: payload.queueIds,
                historyIds: payload.historyIds,
                position: payload.position,
                volume: payload.volume
            });

            // Broadcast playback state to other tabs unless we are currently applying a remote update
            try {
                if (!applyingRemoteRef.current) {
                    tabSync.broadcast({ type: 'playbackState', payload });
                }
            } catch {
                // ignore
            }
        }, 5000); // Every 5 seconds
        return () => clearInterval(timer);
    }, [isRestored]);

    const playTrackLogic = useCallback((track: TrackItem, queue?: TrackItem[], options: PlayTrackOptions = {}) => {
        const currentState = stateRef.current;
        const newQueue = queue || currentState.queue;
        const { skipHistoryPush = false, suppressHistoryLog = false, recoveryAttempt = false, isEndOfTrackTransition = false } = options;

        const history = [...currentState.history];
        if (!skipHistoryPush && currentState.currentTrack && currentState.currentTrack.logic.hash_sha256 !== track.logic.hash_sha256) {
            history.push(currentState.currentTrack);
        }

        if (!recoveryAttempt) {
            resetRecoveryState();
        }

        progressRef.current = 0;

        const nextState = {
            ...stateRef.current,
            currentTrack: track,
            queue: newQueue,
            history,
        };
        stateRef.current = nextState;
        setState(nextState);

        audioEngine.play(track, isEndOfTrackTransition).then(() => {
            if (!suppressHistoryLog) {
                persistenceService.addToHistory(track.logic.hash_sha256);
            }

            // Prepare gapless playback: preload the next track
            const currentTrackHash = track.logic.hash_sha256;
            const currentIndex = newQueue.findIndex(t => t.logic.hash_sha256 === currentTrackHash);
            if (currentIndex >= 0 && currentIndex + 1 < newQueue.length) {
                const nextTrack = newQueue[currentIndex + 1];
                audioEngine.prepareGapless(nextTrack);
            }
        }).catch((err) => {
            handlePlaybackFailureRef.current(err as Error, track);
        });
    }, [resetRecoveryState]);

    useEffect(() => {
        playTrackLogicRef.current = playTrackLogic;
    }, [playTrackLogic]);

    const describePlaybackError = useCallback((error: Error): { title: string; message: string } => {
        if (error instanceof AudioPlaybackError) {
            switch (error.code) {
                case 'autoplay_blocked':
                    return {
                        title: t('player.errors.playbackBlocked'),
                        message: t('player.errors.autoplayBlocked')
                    };
                case 'format_unsupported':
                    return {
                        title: t('player.errors.unsupportedFormat'),
                        message: t('player.errors.unsupportedVersion')
                    };
                case 'media_network':
                    return {
                        title: t('player.errors.sourceUnavailable'),
                        message: t('player.errors.sourceUnavailableFallback')
                    };
                case 'media_decode':
                    return {
                        title: t('player.errors.decodeFailed'),
                        message: t('player.errors.decodeFailedFallback')
                    };
                case 'playback_interrupted':
                    return {
                        title: t('player.errors.playbackInterrupted'),
                        message: t('player.errors.playbackInterruptedFallback')
                    };
                default:
                    return {
                        title: t('player.errors.playbackError'),
                        message: error.message || t('player.errors.unexpectedFailure')
                    };
            }
        }

        const lower = (error.message || '').toLowerCase();
        if (lower.includes('network')) {
            return { title: t('player.errors.networkIssue'), message: t('player.errors.networkFallback') };
        }
        if (lower.includes('decode')) {
            return { title: t('player.errors.decodeIssue'), message: t('player.errors.decodeFallback') };
        }
        if (lower.includes('not supported')) {
            return { title: t('player.errors.unsupportedFormat'), message: t('player.errors.unsupportedFallback') };
        }

        return { title: t('player.errors.playbackError'), message: error.message || t('player.errors.unexpectedFailure') };
    }, [t]);

    const handlePlaybackFailure = useCallback((error: Error, failedTrack?: TrackItem | null) => {
        const cur = stateRef.current;
        const failed = failedTrack || cur.currentTrack;
        const showOnce = (
            key: string,
            message: string,
            type: 'success' | 'error' | 'warning' | 'info',
            options?: Parameters<typeof showToast>[2]
        ) => {
            if (recoveryRef.current.notified.has(key)) return;
            recoveryRef.current.notified.add(key);
            showToast(message, type, options);
        };

        if (!failed) {
            const fallback = describePlaybackError(error);
            showOnce(`playback-orphan-${error.name}-${error.message}`, fallback.message, 'error', { title: fallback.title });
            return;
        }

        const failedHash = failed.logic.hash_sha256;
        const failedPrimaryHash = toPrimaryHash(failed);
        const now = Date.now();
        const errKey = `${failedPrimaryHash}|${failedHash}`;
        if (
            recoveryRef.current.lastErrorKey === errKey &&
            now - recoveryRef.current.lastErrorAt < 500
        ) {
            return;
        }
        recoveryRef.current.lastErrorKey = errKey;
        recoveryRef.current.lastErrorAt = now;
        recoveryRef.current.attempted.add(failedHash);
        if (failedPrimaryHash) {
            recoveryRef.current.attemptedPrimary.add(failedPrimaryHash);
        }

        const versions = resolveVersionGroup(failed);
        const nextVersion = versions.find(version => {
            const hash = version.logic.hash_sha256;
            return hash !== failedHash && !recoveryRef.current.attempted.has(hash);
        });

        if (nextVersion) {
            recoveryRef.current.attempted.add(nextVersion.logic.hash_sha256);
            showOnce(
                `version-fallback-${failedPrimaryHash || failedHash}`,
                t('player.recovery.versionFallback', { name: getTrackDisplayName(failed, t('player.unknownTrack')) }),
                'warning',
                { title: t('player.recovery.recoveringPlayback'), subtle: true, dedupeKey: `version-fallback-${failedPrimaryHash || failedHash}`, durationMs: 2200 }
            );
            playTrackLogicRef.current(nextVersion, cur.queue, {
                skipHistoryPush: true,
                suppressHistoryLog: true,
                recoveryAttempt: true
            });
            return;
        }

        const queue = cur.queue || [];
        // Find the position of the failed track (or its primary) in the queue
        // to determine where to scan for the next playable track
        let anchorIndex = queue.findIndex(t => t.logic.hash_sha256 === failedHash);
        if (anchorIndex < 0 && failedPrimaryHash) {
            anchorIndex = queue.findIndex(t => toPrimaryHash(t) === failedPrimaryHash);
        }
        if (anchorIndex < 0) {
            // Failed track not in queue — use the original currentTrack position
            const currentHash = cur.currentTrack?.logic.hash_sha256 || '';
            anchorIndex = currentHash
                ? queue.findIndex(t => t.logic.hash_sha256 === currentHash)
                : -1;
            if (anchorIndex < 0) {
                const currentPrimary = cur.currentTrack ? toPrimaryHash(cur.currentTrack) : '';
                if (currentPrimary) {
                    anchorIndex = queue.findIndex(t => toPrimaryHash(t) === currentPrimary);
                }
            }
        }

        const scanOrder: number[] = [];
        for (let i = anchorIndex + 1; i < queue.length; i++) {
            scanOrder.push(i);
        }
        if (cur.repeat === RepeatMode.All && queue.length > 0) {
            for (let i = 0; i <= Math.max(anchorIndex, 0) && i < queue.length; i++) {
                scanOrder.push(i);
            }
        }

        const nextQueueTrack = scanOrder
            .map(index => queue[index])
            .find(track => {
                const hash = track.logic.hash_sha256;
                const primaryHash = toPrimaryHash(track);
                if (!hash) return false;
                if (primaryHash && recoveryRef.current.attemptedPrimary.has(primaryHash)) return false;
                return !recoveryRef.current.attempted.has(hash);
            });

        if (nextQueueTrack) {
            recoveryRef.current.attempted.add(nextQueueTrack.logic.hash_sha256);
            const nextPrimaryHash = toPrimaryHash(nextQueueTrack);
            if (nextPrimaryHash) {
                recoveryRef.current.attemptedPrimary.add(nextPrimaryHash);
            }
            showOnce(
                `queue-skip-${failedPrimaryHash || failedHash}`,
                t('player.recovery.queueSkipped', { name: failed.metadata?.title || failed.logic.track_name || t('player.unknownTrack') }),
                'warning',
                { title: t('player.recovery.trackSkipped'), subtle: true, dedupeKey: `queue-skip-${failedPrimaryHash || failedHash}`, durationMs: 2600 }
            );
            playTrackLogicRef.current(nextQueueTrack, cur.queue, {
                skipHistoryPush: true,
                suppressHistoryLog: true,
                recoveryAttempt: true
            });
            return;
        }

        const fallback = describePlaybackError(error);
        showOnce(
            `playback-stop-${failedPrimaryHash || failedHash}`,
            t('player.recovery.playbackStopped', { name: failed.metadata?.title || failed.logic.track_name || t('player.unknownTrack'), message: fallback.message }),
            'error',
            { title: fallback.title, dedupeKey: `playback-stop-${failedPrimaryHash || failedHash}`, durationMs: 5200 }
        );
        if (fallback.title === t('player.errors.unsupportedFormat')) {
            showOnce(
                `compatibility-tip-${failedPrimaryHash || failedHash}`,
                t('player.recovery.compatibilityHelper'),
                'info',
                { title: t('player.recovery.compatibilityHelperTitle'), durationMs: 5200 }
            );
        }
        audioEngine.pause();
        setState(prev => ({ ...prev, isPlaying: false }));
    }, [describePlaybackError, resolveVersionGroup, showToast, toPrimaryHash]);

    useEffect(() => {
        handlePlaybackFailureRef.current = handlePlaybackFailure;
    }, [handlePlaybackFailure]);



    useEffect(() => {
        const handleHistoryCleared = () => {
            setState(prev => ({ ...prev, history: [] }));
        };
        window.addEventListener('music-history-cleared', handleHistoryCleared);
        // Listen for tab-sync open requests
        const handleTabSyncMessage = (e: Event) => {
            const msg = (e as CustomEvent).detail as { type?: string; payload?: any; origin?: string };
            if (!msg || !msg.type) return;

            const isRemote = tabSync.isRemoteOrigin(msg.origin);

            // Visual indicator for remote-origin actions
            if (isRemote) {
                try {
                        showToast(t('player.remoteActionReceived'), 'info', { subtle: true, durationMs: 1800 });
                    setIsRemoteControlled(true);
                    if (remoteBadgeTimerRef.current !== null) {
                        window.clearTimeout(remoteBadgeTimerRef.current);
                    }
                    remoteBadgeTimerRef.current = window.setTimeout(() => {
                        setIsRemoteControlled(false);
                        remoteBadgeTimerRef.current = null;
                    }, 4500);
                } catch { }
            }

            if (msg.type === 'openAction' || msg.type === 'openTrack' || msg.type === 'openTracks') {
                // normalize payload
                const payload = msg.payload || msg;
                const action = msg.type === 'openAction' ? payload?.action : msg.type;
                const data = payload?.payload || payload;
                if ((msg.type === 'openTrack' || action === 'openTrack') && data && data.trackId) {
                    const primaryId = libState.versionToPrimaryMap[data.trackId] || data.trackId;
                    const track = libState.tracks.find(t => t.logic.hash_sha256 === primaryId) || null;
                    if (track) {
                        playTrackLogicRef.current(track, [track]);
                    }
                }
                if ((msg.type === 'openTracks' || action === 'openTracks') && data && Array.isArray(data.trackIds)) {
                    const ids = data.trackIds.map((id: string) => libState.versionToPrimaryMap[id] || id);
                    const tracks = libState.tracks.filter(t => ids.includes(t.logic.hash_sha256));
                    if (tracks.length > 0) {
                        playTrackLogicRef.current(tracks[0], tracks);
                    }
                }
            }

            if (msg.type === 'persistence-updated') {
                const sections = msg.payload?.sections || [];
                if (sections.includes('preferences')) {
                    const prefs = persistenceService.getPreferences();
                    audioEngine.setEqState(
                        !!prefs.eqEnabled,
                        coerceParametricEqBands(prefs.eqBands) || createDefaultParametricEqBands(),
                        null
                    );
                    audioEngine.setPlaybackRate(Number.isFinite(prefs.playbackSpeed) ? prefs.playbackSpeed : 1);
                    audioEngine.setVolumeNormalization(
                        !!prefs.normalizationEnabled,
                        Number.isFinite(prefs.normalizationStrength) ? prefs.normalizationStrength : 45
                    );
                    audioEngine.setCrossfade(
                        !!prefs.crossfadeEnabled,
                        Number.isFinite(prefs.crossfadeDuration) ? prefs.crossfadeDuration : 3
                    );

                    setState(prev => ({
                        ...prev,
                        volume: Number.isFinite(prefs.volume) ? prefs.volume : prev.volume,
                        shuffle: !!prefs.shuffle,
                        shuffleMode: prefs.shuffleMode || prev.shuffleMode,
                        repeat: prefs.repeat || prev.repeat
                    }));
                }

                if (sections.includes('playbackState')) {
                    const synced = persistenceService.getPlaybackState();
                    if (synced && !applyingRemoteRef.current) {
                        const toPrimaryId = (id: string | null | undefined) => id ? (libState.versionToPrimaryMap[id] || id) : null;
                        const trackId = toPrimaryId(synced.trackId);
                        const track = trackId ? (libState.tracks.find(t => t.logic.hash_sha256 === trackId) || null) : null;
                        const queue = synced.queueIds
                            .map((id: string) => {
                                const mapped = toPrimaryId(id);
                                return mapped ? libState.tracks.find(t => t.logic.hash_sha256 === mapped) || null : null;
                            })
                            .filter(Boolean) as TrackItem[];

                        setState(prev => ({
                            ...prev,
                            currentTrack: track || prev.currentTrack,
                            queue: queue.length > 0 ? queue : prev.queue,
                            volume: Number.isFinite(synced.volume) ? synced.volume : prev.volume
                        }));
                        progressRef.current = Number.isFinite(synced.position) ? Math.max(0, synced.position) : progressRef.current;
                    }
                }
            }

            if (msg.type === 'playbackState' && msg.payload && tabSync.isRemoteOrigin(msg.origin)) {
                // Apply incoming playback state from other tabs only
                try {
                    applyingRemoteRef.current = true;
                    const p = msg.payload;
                    const primaryId = p.trackId ? (libState.versionToPrimaryMap[p.trackId] || p.trackId) : null;
                    const track = primaryId ? libState.tracks.find(t => t.logic.hash_sha256 === primaryId) || null : null;

                    const queue = (p.queueIds || []).map((id: string) => libState.tracks.find(t => t.logic.hash_sha256 === (libState.versionToPrimaryMap[id] || id))).filter(Boolean) as TrackItem[];
                    const history = (p.historyIds || []).map((id: string) => libState.tracks.find(t => t.logic.hash_sha256 === (libState.versionToPrimaryMap[id] || id))).filter(Boolean) as TrackItem[];

                    setState(prev => ({
                        ...prev,
                        currentTrack: track || prev.currentTrack,
                        queue: queue.length ? queue : prev.queue,
                        history: history.length ? history : prev.history,
                        volume: typeof p.volume === 'number' ? p.volume : prev.volume,
                        isPlaying: !!p.isPlaying
                    }));

                    // If remote indicates playing, attempt to play
                    if (p.isPlaying && track) {
                        audioEngine.load(track, typeof p.position === 'number' ? p.position : 0);
                        audioEngine.play().catch(err => handlePlaybackFailureRef.current(err as Error, track));
                    }
                } finally {
                    // allow a small debounce window before clearing to avoid immediate rebroadcast
                    window.setTimeout(() => { applyingRemoteRef.current = false; }, 600);
                }
            }
            // support short-hash open by URL param with collision mitigation
            if (msg.type === 'openByShortHash' && msg.payload?.short) {
                const short = String(msg.payload.short).trim();
                if (!short) return;

                const matches = libState.tracks.filter(t => t.logic.hash_sha256.startsWith(short));
                if (matches.length === 0) {
                    try { showToast(`No track found for '${short}'`, 'warning'); } catch { }
                    return;
                }

                if (matches.length === 1) {
                    playTrackLogicRef.current(matches[0], [matches[0]]);
                    return;
                }

                // Multiple matches — try to resolve to a single primary
                const primaryMap = libState.versionToPrimaryMap || {};
                const primaryGroups = new Map<string, TrackItem[]>();
                for (const m of matches) {
                    const primary = primaryMap[m.logic.hash_sha256] || m.logic.hash_sha256;
                    const arr = primaryGroups.get(primary) || [];
                    arr.push(m);
                    primaryGroups.set(primary, arr);
                }

                if (primaryGroups.size === 1) {
                    // All matches map to the same primary track — play the primary
                    const primaryHash = Array.from(primaryGroups.keys())[0];
                    const primaryTrack = libState.tracks.find(t => t.logic.hash_sha256 === primaryHash) || matches[0];
                    playTrackLogicRef.current(primaryTrack, [primaryTrack]);
                    return;
                }

                // Still ambiguous across different primaries — don't auto-play. Ask the user to disambiguate.
                try {
                    showToast(`Ambiguous short id '${short}' — ${matches.length} matches found; please use a longer prefix.`, 'warning', { durationMs: 6000 });
                } catch { }
                // Log matches for debugging
                try { console.warn('Ambiguous short-hash open:', short, matches.map(m => m.logic.hash_sha256)); } catch { }
                return;
            }
        };
        window.addEventListener('tab-sync-message', handleTabSyncMessage as EventListener);
        return () => {
            window.removeEventListener('music-history-cleared', handleHistoryCleared);
            window.removeEventListener('tab-sync-message', handleTabSyncMessage as EventListener);
        };
    }, [libState.tracks, libState.versionToPrimaryMap, showToast]);

    const playTrack = useCallback((track: TrackItem, queue?: TrackItem[]) => {
        playTrackLogic(track, queue);
    }, [playTrackLogic]);

    const togglePlay = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isPlaying) {
            audioEngine.pause();
        } else if (cur.currentTrack) {
            audioEngine.play().catch(err => {
                handlePlaybackFailureRef.current(err as Error, cur.currentTrack);
            });
        }
    }, []);

    const advanceToNextTrack = useCallback((respectAutoplay: boolean) => {
        const cur = stateRef.current;

        if (cur.repeat === RepeatMode.One && cur.currentTrack) {
            audioEngine.seek(0);
            audioEngine.play().catch(err => {
                handlePlaybackFailureRef.current(err as Error, cur.currentTrack);
            });
            return true;
        }

        if (respectAutoplay && !cur.autoplay) {
            audioEngine.pause();
            setState(prev => ({ ...prev, isPlaying: false }));
            return false;
        }

        if (cur.queue.length > 0 && cur.currentTrack) {
            const currentHash = cur.currentTrack.logic.hash_sha256;
            const currentPrimaryHash = toPrimaryHash(cur.currentTrack);

            // Look for the current track by direct hash match
            let currentIndex = cur.queue.findIndex(t => t.logic.hash_sha256 === currentHash);
            
            // If not found by direct hash and we have a primary hash, try to match the primary
            // (useful for version tracks where the queue contains primary tracks)
            if (currentIndex < 0 && currentPrimaryHash) {
                currentIndex = cur.queue.findIndex(t => toPrimaryHash(t) === currentPrimaryHash);
            }

            // If current track isn't found in queue, this indicates a queue mismatch.
            // SAFETY: To avoid looping the same track, avoid playing queue[0] if it's the current track.
            // Instead, play the next safe track or pause if we can't determine the right next track.
            if (currentIndex < 0) {
                // Track not in queue — this shouldn't happen in normal circumstances.
                // To avoid looping, try playing the second track, then first, then pause.
                if (cur.queue.length > 1) {
                    // Try queue[1] first to avoid repeating queue[0]
                    playTrackLogic(cur.queue[1], cur.queue);
                    return true;
                } else if (cur.queue.length === 1 && cur.repeat === RepeatMode.All) {
                    // Special case: single-track queue with repeat-all
                    playTrackLogic(cur.queue[0], cur.queue);
                    return true;
                } else {
                    // Can't safely advance, so pause to avoid looping
                    audioEngine.pause();
                    setState(prev => ({ ...prev, isPlaying: false }));
                    return false;
                }
            }

            const nextTrackIndex = currentIndex + 1;

            if (nextTrackIndex < cur.queue.length) {
                playTrackLogic(cur.queue[nextTrackIndex], cur.queue, { isEndOfTrackTransition: true });
                return true;
            }

            if (cur.repeat === RepeatMode.All) {
                playTrackLogic(cur.queue[0], cur.queue, { isEndOfTrackTransition: true });
                return true;
            }

            audioEngine.pause();
            setState(prev => ({ ...prev, isPlaying: false }));
            return false;
        }

        audioEngine.pause();
        setState(prev => ({ ...prev, isPlaying: false }));
        return false;
    }, [playTrackLogic, toPrimaryHash]);

    const playNext = useCallback(() => {
        advanceToNextTrack(false);
    }, [advanceToNextTrack]);

    useEffect(() => {
        return () => {
            audioEngine.cleanup();
            if (remoteBadgeTimerRef.current !== null) {
                window.clearTimeout(remoteBadgeTimerRef.current);
                remoteBadgeTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        // Tie to audioEngine events
        audioEngine.onTimeUpdate = (currentTime) => {
            const safeTime = Number(currentTime);
            progressRef.current = Number.isFinite(safeTime) ? Math.max(0, safeTime) : 0;
        };

        audioEngine.onEnded = () => {
            advanceToNextTrack(true);
        };

        audioEngine.onPlay = () => {
            resetRecoveryState();
            setState(prev => ({ ...prev, isPlaying: true }));
        };
        audioEngine.onPause = () => setState(prev => ({ ...prev, isPlaying: false }));

        audioEngine.onError = (error) => {
            handlePlaybackFailureRef.current(error, stateRef.current.currentTrack);
        };
    }, [advanceToNextTrack, resetRecoveryState]);

    useEffect(() => {
        // Keep gapless preload in sync whenever current track or queue changes
        if (state.currentTrack && state.queue.length > 0) {
            const currentIndex = state.queue.findIndex(t => t.logic.hash_sha256 === state.currentTrack!.logic.hash_sha256);
            if (currentIndex >= 0 && currentIndex + 1 < state.queue.length) {
                const nextTrack = state.queue[currentIndex + 1];
                audioEngine.prepareGapless(nextTrack);
            }
        }
    }, [state.currentTrack, state.queue]);

    const playPrevious = useCallback(() => {
        const cur = stateRef.current;
        if (progressRef.current > 3) {
            audioEngine.seek(0);
            progressRef.current = 0;
        } else if (cur.history.length > 0) {
            const newHistory = [...cur.history];
            const prevTrack = newHistory.pop()!;

            progressRef.current = 0;
            const queue = cur.queue;
            setState(prev => ({
                ...prev,
                currentTrack: prevTrack,
                queue,
                history: newHistory
            }));
            audioEngine.play(prevTrack).catch(err => {
                handlePlaybackFailureRef.current(err as Error, prevTrack);
            });
        }
    }, []);

    const setVolume = useCallback((level: number) => {
        audioEngine.setVolume(level);
        setState(prev => ({ ...prev, volume: level }));
        persistenceService.updatePreferences({ volume: level });
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const seek = useCallback((time: number) => {
        audioEngine.seek(time);
        progressRef.current = time;
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const weightedShuffle = (tracks: TrackItem[], getWeight: (t: TrackItem) => number): TrackItem[] => {
        const result: TrackItem[] = [];
        const pool = [...tracks];
        const weights = pool.map(getWeight);

        while (pool.length > 0) {
            const totalWeight = weights.reduce((acc, w) => acc + w, 0);
            let r = Math.random() * totalWeight;

            for (let i = 0; i < pool.length; i++) {
                r -= weights[i];
                if (r <= 0) {
                    result.push(pool[i]);
                    pool.splice(i, 1);
                    weights.splice(i, 1);
                    break;
                }
            }
        }
        return result;
    };

    const applyShuffle = useCallback((tracks: TrackItem[], mode: import('../services/persistence').ShuffleMode): TrackItem[] => {
        if (tracks.length <= 1) return tracks;

        const currentTrack = stateRef.current.currentTrack;
        const remaining = currentTrack
            ? tracks.filter(t => t.logic.hash_sha256 !== currentTrack.logic.hash_sha256)
            : [...tracks];

        let shuffled: TrackItem[] = [];

        switch (mode) {
            case 'weighted': {
                const ratings = persistenceService.getAllRatings();
                shuffled = weightedShuffle(remaining, (t) => (ratings[t.logic.hash_sha256] || 0) + 1);
                break;
            }
            case 'discovery': {
                const counts = persistenceService.getAllPlayCounts();
                shuffled = weightedShuffle(remaining, (t) => 1 / ((counts[t.logic.hash_sha256] || 0) + 1));
                break;
            }
            case 'recent': {
                shuffled = remaining.sort((a, b) => (b.file?.epoch_created || 0) - (a.file?.epoch_created || 0));
                const topRecent = shuffled.slice(0, 10);
                const others = shuffled.slice(10);
                shuffled = [...audioEngine.shuffleArray(topRecent), ...audioEngine.shuffleArray(others)];
                break;
            }
            default:
                shuffled = audioEngine.shuffleArray(remaining);
        }

        return currentTrack ? [currentTrack, ...shuffled] : shuffled;
    }, []);

    const toggleShuffle = useCallback(() => {
        setState(prev => {
            const newShuffle = !prev.shuffle;
            let newQueue = [...prev.queue];
            if (newShuffle) {
                newQueue = applyShuffle(newQueue, prev.shuffleMode);
            }
            persistenceService.updatePreferences({ shuffle: newShuffle });
            return { ...prev, shuffle: newShuffle, queue: newQueue };
        });
    }, [applyShuffle]);

    const setShuffleMode = useCallback((mode: import('../services/persistence').ShuffleMode) => {
        setState(prev => {
            const next = { ...prev, shuffleMode: mode };
            if (prev.shuffle) {
                next.queue = applyShuffle([...prev.queue], mode);
            }
            persistenceService.updatePreferences({ shuffleMode: mode });
            return next;
        });
    }, [applyShuffle]);

    const setRepeat = useCallback((mode: RepeatMode) => {
        setState(prev => ({ ...prev, repeat: mode }));
        persistenceService.updatePreferences({ repeat: mode });
    }, []);

    const reorderQueue = useCallback((startIndex: number, endIndex: number) => {
        setState(prev => {
            const newQueue = Array.from(prev.queue);
            const [removed] = newQueue.splice(startIndex, 1);
            newQueue.splice(endIndex, 0, removed);
            return { ...prev, queue: newQueue };
        });
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const removeFromQueue = useCallback((index: number) => {
        setState(prev => {
            const newQueue = Array.from(prev.queue);
            newQueue.splice(index, 1);
            return { ...prev, queue: newQueue };
        });
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const addToQueue = useCallback((track: TrackItem) => {
        setState(prev => {
            if (prev.queue.some(t => t.logic.hash_sha256 === track.logic.hash_sha256)) return prev;
            return { ...prev, queue: [...prev.queue, track] };
        });
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const addToNext = useCallback((track: TrackItem) => {
        setState(prev => {
            const newQueue = [...prev.queue];
            const currentIdx = prev.currentTrack
                ? newQueue.findIndex(t => t.logic.hash_sha256 === prev.currentTrack?.logic.hash_sha256)
                : -1;

            const existingIdx = newQueue.findIndex(t => t.logic.hash_sha256 === track.logic.hash_sha256);
            if (existingIdx !== -1) newQueue.splice(existingIdx, 1);

            newQueue.splice(currentIdx + 1, 0, track);
            return { ...prev, queue: newQueue };
        });
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const clearQueue = useCallback(() => {
        setState(prev => ({ ...prev, queue: prev.currentTrack ? [prev.currentTrack] : [] }));
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const setAutoplay = useCallback((enabled: boolean) => {
        persistenceService.set('ui_autoplay', enabled);
        setState(prev => ({ ...prev, autoplay: enabled }));
        try { persistenceService.flushNow(); } catch { }
    }, []);

    const setQueueLimit = useCallback((limit: number) => {
        setState(prev => ({ ...prev, queueLimit: limit }));
    }, []);

    const saveQueueAsPlaylist = useCallback((name: string) => {
        const cur = stateRef.current;
        if (cur.queue.length === 0) return;
        const newPl = persistenceService.createPlaylist(name);
        cur.queue.forEach(track => {
            persistenceService.addTrackToPlaylist(newPl.id, track.logic.hash_sha256);
        });
    }, []);

    const stop = useCallback(() => {
        audioEngine.stop();
        progressRef.current = 0;
        setState(prev => ({ ...prev, isPlaying: false }));
    }, []);

    const seekForward = useCallback(() => {
        audioEngine.seekRelative(10);
    }, []);

    const seekBackward = useCallback(() => {
        audioEngine.seekRelative(-10);
    }, []);

    return (
        <PlayerContext.Provider value={{
            state, isRemoteControlled, playTrack, togglePlay, playNext, playPrevious,
            setVolume, seek, getProgress, stop, seekForward, seekBackward,
            toggleShuffle, setRepeat, setShuffleMode,
            reorderQueue, removeFromQueue, clearQueue,
            addToQueue, addToNext, setAutoplay, setQueueLimit, saveQueueAsPlaylist
        }}>
            {children}
        </PlayerContext.Provider>
    );
};

export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (!context) throw new Error('usePlayer must be used within PlayerProvider');
    return context;
};

