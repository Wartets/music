// Persistence Service for Music Library

import { coerceParametricEqBands, createDefaultParametricEqBands, type ParametricEqBand } from './parametricEq';
import { CROSSFADE_MIN, CROSSFADE_MAX } from './audioEngine';
import { RepeatMode } from '../types/playback';

export type ShuffleMode = 'standard' | 'weighted' | 'discovery' | 'recent';
export type MetadataWriteTarget = 'musicbib' | 'file' | 'both';

export interface ShortcutConfig {
    key: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    alt: boolean;
}

export interface KeyboardShortcuts {
    togglePlay: ShortcutConfig;
    seekForward: ShortcutConfig;
    seekBackward: ShortcutConfig;
    playNext: ShortcutConfig;
    playPrevious: ShortcutConfig;
    focusSearch: ShortcutConfig;
}

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
    togglePlay: { key: ' ', ctrl: false, meta: false, shift: false, alt: false },
    seekForward: { key: 'ArrowRight', ctrl: false, meta: false, shift: false, alt: false },
    seekBackward: { key: 'ArrowLeft', ctrl: false, meta: false, shift: false, alt: false },
    playNext: { key: 'ArrowRight', ctrl: true, meta: true, shift: false, alt: false },
    playPrevious: { key: 'ArrowLeft', ctrl: true, meta: true, shift: false, alt: false },
    focusSearch: { key: 'f', ctrl: true, meta: true, shift: false, alt: false }
};

export interface Playlist {
    id: string;
    name: string;
    trackIds: string[]; // using hash_sha256
    description?: string;
    customImage?: string; // URL or base64 string
}

export interface UserPreferences {
    volume: number;
    playbackSpeed: number;
    shuffle: boolean;
    shuffleMode: ShuffleMode;
    repeat: RepeatMode;
    eqEnabled: boolean;
    eqBands: ParametricEqBand[];
    crossfadeEnabled: boolean;
    crossfadeDuration: number;
    normalizationEnabled: boolean;
    normalizationStrength: number;
    metadataWriteTarget: MetadataWriteTarget;
    keyboardShortcuts?: KeyboardShortcuts;
}

export interface PlaybackState {
    trackId: string | null;
    queueIds: string[];
    historyIds: string[];
    position: number;
    volume: number;
}

const STORAGE_KEY = 'music_library_userdata';
const STORAGE_INDEX_KEY = `${STORAGE_KEY}:index`;
const STORAGE_SECTION_PREFIX = `${STORAGE_KEY}:section:`;
const STORAGE_CHUNK_SIZE = 90_000;

const PERSISTED_SECTIONS = [
    'history',
    'playlists',
    'smartPlaylists',
    'preferences',
    'playCounts',
    'metadataOverrides',
    'artworkOverrides',
    'ratings',
    'favorites',
    'hiddenTrackIds',
    'playbackState'
] as const;

type PersistedSection = typeof PERSISTED_SECTIONS[number];

interface SectionMeta {
    chunkCount: number;
    compressed: boolean;
}

interface StorageIndex {
    version: number;
    updatedAt: number;
    sections: Partial<Record<PersistedSection, SectionMeta>>;
}

interface UserDataStore {
    history: string[]; // array of hash_sha256
    playlists: Playlist[];
    smartPlaylists: import('../utils/smartPlaylistEvaluator').SmartPlaylistDefinition[];
    preferences: UserPreferences;
    playCounts: Record<string, number>; // hash_sha256 -> count
    metadataOverrides: Record<string, Partial<import('../types/music').TrackMetadata>>;
    artworkOverrides: Record<string, import('../types/music').ImageDetails[]>; // hash_sha256 -> artworks
    ratings: Record<string, number>; // hash_sha256 -> 0-5 stars
    favorites: string[]; // array of hash_sha256
    hiddenTrackIds: string[]; // temporarily hidden track hashes
    playbackState?: PlaybackState;
}

const DEFAULT_DATA: UserDataStore = {
    history: [],
    playlists: [],
    smartPlaylists: [],
    preferences: {
        volume: 1.0,
        playbackSpeed: 1.0,
        shuffle: false,
        shuffleMode: 'recent',
        repeat: RepeatMode.None,
        eqEnabled: false,
        eqBands: createDefaultParametricEqBands(),
        crossfadeEnabled: false,
        crossfadeDuration: 3,
        normalizationEnabled: false,
        normalizationStrength: 45,
        metadataWriteTarget: 'musicbib',
        keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS
    },
    playCounts: {},
    metadataOverrides: {},
    artworkOverrides: {},
    ratings: {},
    favorites: [],
    hiddenTrackIds: []
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isStringArray = (value: unknown): value is string[] => {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
};

const isNumberRecord = (value: unknown): value is Record<string, number> => {
    return isRecord(value) && Object.values(value).every(item => typeof item === 'number' && Number.isFinite(item));
};

const isPlaylist = (value: unknown): value is Playlist => {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.name === 'string'
        && Array.isArray(value.trackIds) && value.trackIds.every(trackId => typeof trackId === 'string')
        && (value.description === undefined || typeof value.description === 'string')
        && (value.customImage === undefined || typeof value.customImage === 'string');
};

const isPlaylistArray = (value: unknown): value is Playlist[] => {
    return Array.isArray(value) && value.every(isPlaylist);
};

const isKeyboardShortcutConfig = (value: unknown): value is KeyboardShortcuts[keyof KeyboardShortcuts] => {
    return isRecord(value)
        && typeof value.key === 'string'
        && typeof value.ctrl === 'boolean'
        && typeof value.meta === 'boolean'
        && typeof value.shift === 'boolean'
        && typeof value.alt === 'boolean';
};

const isKeyboardShortcuts = (value: unknown): value is KeyboardShortcuts => {
    return isRecord(value)
        && isKeyboardShortcutConfig(value.togglePlay)
        && isKeyboardShortcutConfig(value.seekForward)
        && isKeyboardShortcutConfig(value.seekBackward)
        && isKeyboardShortcutConfig(value.playNext)
        && isKeyboardShortcutConfig(value.playPrevious)
        && isKeyboardShortcutConfig(value.focusSearch);
};

const isPlaybackState = (value: unknown): value is PlaybackState => {
    return isRecord(value)
        && (value.trackId === null || typeof value.trackId === 'string')
        && isStringArray(value.queueIds)
        && isStringArray(value.historyIds)
        && typeof value.position === 'number' && Number.isFinite(value.position)
        && typeof value.volume === 'number' && Number.isFinite(value.volume);
};

const isImageDetailsArray = (value: unknown): boolean => {
    return Array.isArray(value) && value.every(isRecord);
};

class PersistenceService {
    private data: UserDataStore;
    private sectionHashes: Record<PersistedSection, string>;
    // (previously used for spin-locking; no longer required)
    private shouldMigrateLegacy: boolean = false;
    // New non-blocking write queue
    private pendingSections: Set<PersistedSection> = new Set();
    private flushScheduled: boolean = false;

    private static readonly COMPRESSION_TOKENS: Array<[string, string]> = [
        ['"metadataOverrides":', '"!mo":'],
        ['"artworkOverrides":', '"!ao":'],
        ['"smartPlaylists":', '"!sp":'],
        ['"playbackState":', '"!ps":'],
        ['"hiddenTrackIds":', '"!hi":'],
        ['"preferences":', '"!pr":'],
        ['"playCounts":', '"!pc":'],
        ['"favorites":', '"!fv":'],
        ['"history":', '"!hs":'],
        ['"playlists":', '"!pl":'],
        ['"ratings":', '"!rt":'],
    ];

    constructor() {
        // storageLockOwner removed; persistence now uses optimistic non-blocking writes
        this.data = this.loadData();
        this.sectionHashes = this.computeSectionHashes(this.data);

        if (this.shouldMigrateLegacy && typeof window !== 'undefined') {
            this.saveData(PERSISTED_SECTIONS);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    private normalizeLoadedData(parsed: Partial<UserDataStore>): UserDataStore {
        return {
            ...DEFAULT_DATA,
            ...parsed,
            preferences: {
                ...DEFAULT_DATA.preferences,
                ...(parsed.preferences || {})
            },
            history: parsed.history || [],
            playlists: parsed.playlists || [],
            smartPlaylists: parsed.smartPlaylists || [],
            playCounts: parsed.playCounts || {},
            metadataOverrides: parsed.metadataOverrides || {},
            artworkOverrides: parsed.artworkOverrides || {},
            ratings: parsed.ratings || {},
            favorites: parsed.favorites || [],
            hiddenTrackIds: parsed.hiddenTrackIds || []
        };
    }

    private backupCorruptStorageValue(storageKey: string, raw: string): void {
        if (typeof window === 'undefined') return;

        try {
            const backupKey = `${storageKey}:corrupt:${Date.now()}`;
            localStorage.setItem(backupKey, raw);
        } catch {
            // Best effort only.
        }
    }

    private safeParseJson<T>(raw: string | null, fallback: T, storageKey: string, validator?: (value: unknown) => value is T): T {
        if (!raw) return fallback;

        try {
            const parsed = JSON.parse(raw) as unknown;
            if (validator && !validator(parsed)) {
                console.warn(`Invalid persisted JSON for ${storageKey}; using fallback.`);
                this.backupCorruptStorageValue(storageKey, raw);
                return fallback;
            }
            return parsed as T;
        } catch (error) {
            console.warn(`Failed to parse persisted JSON for ${storageKey}; using fallback.`, error);
            this.backupCorruptStorageValue(storageKey, raw);
            return fallback;
        }
    }

    private sanitizePreferences(value: unknown): Partial<UserPreferences> | undefined {
        if (!isRecord(value)) return undefined;

        const prefs: Partial<UserPreferences> = {};

        if (typeof value.volume === 'number' && Number.isFinite(value.volume)) prefs.volume = value.volume;
        if (typeof value.playbackSpeed === 'number' && Number.isFinite(value.playbackSpeed)) prefs.playbackSpeed = value.playbackSpeed;
        if (typeof value.shuffle === 'boolean') prefs.shuffle = value.shuffle;
        if (value.shuffleMode === 'standard' || value.shuffleMode === 'weighted' || value.shuffleMode === 'discovery' || value.shuffleMode === 'recent') prefs.shuffleMode = value.shuffleMode;
        if (value.repeat === RepeatMode.None || value.repeat === RepeatMode.All || value.repeat === RepeatMode.One) prefs.repeat = value.repeat;
        if (typeof value.eqEnabled === 'boolean') prefs.eqEnabled = value.eqEnabled;
        const eqBands = coerceParametricEqBands(value.eqBands);
        if (eqBands) prefs.eqBands = eqBands;
        if (typeof value.crossfadeEnabled === 'boolean') prefs.crossfadeEnabled = value.crossfadeEnabled;
        if (typeof value.crossfadeDuration === 'number' && Number.isFinite(value.crossfadeDuration)) {
            const d = Math.max(CROSSFADE_MIN, Math.min(CROSSFADE_MAX, value.crossfadeDuration));
            prefs.crossfadeDuration = d;
        }
        if (typeof value.normalizationEnabled === 'boolean') prefs.normalizationEnabled = value.normalizationEnabled;
        if (typeof value.normalizationStrength === 'number' && Number.isFinite(value.normalizationStrength)) prefs.normalizationStrength = value.normalizationStrength;
        if (value.metadataWriteTarget === 'musicbib' || value.metadataWriteTarget === 'file' || value.metadataWriteTarget === 'both') prefs.metadataWriteTarget = value.metadataWriteTarget;
        if (isKeyboardShortcuts(value.keyboardShortcuts)) prefs.keyboardShortcuts = value.keyboardShortcuts;

        return Object.keys(prefs).length > 0 ? prefs : undefined;
    }

    private sanitizeLoadedData(parsed: unknown): Partial<UserDataStore> {
        if (!isRecord(parsed)) {
            return {};
        }

        const sanitized: Partial<UserDataStore> = {};

        if (isStringArray(parsed.history)) sanitized.history = parsed.history;
        if (isPlaylistArray(parsed.playlists)) sanitized.playlists = parsed.playlists;
        if (Array.isArray(parsed.smartPlaylists) && parsed.smartPlaylists.every(isRecord)) sanitized.smartPlaylists = parsed.smartPlaylists as unknown as UserDataStore['smartPlaylists'];

        const preferences = this.sanitizePreferences(parsed.preferences);
        if (preferences) sanitized.preferences = preferences as UserPreferences;

        if (isNumberRecord(parsed.playCounts)) sanitized.playCounts = parsed.playCounts;
        if (isRecord(parsed.metadataOverrides)) sanitized.metadataOverrides = parsed.metadataOverrides as UserDataStore['metadataOverrides'];
        if (isRecord(parsed.artworkOverrides) && Object.values(parsed.artworkOverrides).every(isImageDetailsArray)) sanitized.artworkOverrides = parsed.artworkOverrides as UserDataStore['artworkOverrides'];
        if (isNumberRecord(parsed.ratings)) sanitized.ratings = parsed.ratings;
        if (isStringArray(parsed.favorites)) sanitized.favorites = parsed.favorites;
        if (isStringArray(parsed.hiddenTrackIds)) sanitized.hiddenTrackIds = parsed.hiddenTrackIds;
        if (isPlaybackState(parsed.playbackState)) sanitized.playbackState = parsed.playbackState;

        return sanitized;
    }

    private readStorageIndex(): StorageIndex {
        if (typeof window === 'undefined') {
            return { version: 2, updatedAt: Date.now(), sections: {} };
        }

        const raw = localStorage.getItem(STORAGE_INDEX_KEY);
        const parsed = this.safeParseJson<unknown>(raw, null, STORAGE_INDEX_KEY, isRecord);

        if (!parsed) {
            return { version: 2, updatedAt: Date.now(), sections: {} };
        }

        const indexRecord = parsed as UnknownRecord;
        const sections = isRecord(indexRecord.sections) ? indexRecord.sections : {};
        return {
            version: typeof indexRecord.version === 'number' ? indexRecord.version : 2,
            updatedAt: typeof indexRecord.updatedAt === 'number' ? indexRecord.updatedAt : Date.now(),
            sections: sections as StorageIndex['sections']
        };
    }

    private getSectionStorageKey(section: PersistedSection): string {
        return `${STORAGE_SECTION_PREFIX}${section}`;
    }

    private compressPayload(raw: string): string {
        let result = raw;
        for (const [from, to] of PersistenceService.COMPRESSION_TOKENS) {
            result = result.split(from).join(to);
        }
        return result;
    }

    private decompressPayload(raw: string): string {
        let result = raw;
        for (let i = PersistenceService.COMPRESSION_TOKENS.length - 1; i >= 0; i--) {
            const [from, to] = PersistenceService.COMPRESSION_TOKENS[i];
            result = result.split(to).join(from);
        }
        return result;
    }

    private writeChunked(baseKey: string, payload: string, previousChunkCount: number = 0): number {
        if (typeof window === 'undefined') return 0;

        const chunkCount = Math.max(1, Math.ceil(payload.length / STORAGE_CHUNK_SIZE));
        for (let i = 0; i < chunkCount; i++) {
            const chunk = payload.slice(i * STORAGE_CHUNK_SIZE, (i + 1) * STORAGE_CHUNK_SIZE);
            localStorage.setItem(`${baseKey}:chunk:${i}`, chunk);
        }

        for (let i = chunkCount; i < previousChunkCount; i++) {
            localStorage.removeItem(`${baseKey}:chunk:${i}`);
        }

        return chunkCount;
    }

    private readChunked(baseKey: string, chunkCount: number): string {
        if (typeof window === 'undefined') return '';
        let combined = '';
        for (let i = 0; i < chunkCount; i++) {
            combined += localStorage.getItem(`${baseKey}:chunk:${i}`) || '';
        }
        return combined;
    }

    private loadSegmentedData(): UserDataStore | null {
        if (typeof window === 'undefined') return null;

        const index = this.readStorageIndex();
        const hasSections = Object.keys(index.sections || {}).length > 0;
        if (!hasSections) {
            return null;
        }

        const reconstructed: Partial<UserDataStore> = {};
        let loadedAnySection = false;

        try {
            for (const section of PERSISTED_SECTIONS) {
                const meta = index.sections[section];
                if (!meta || meta.chunkCount <= 0) continue;

                const serialized = this.readChunked(this.getSectionStorageKey(section), meta.chunkCount);
                if (!serialized) continue;

                const decompressed = meta.compressed ? this.decompressPayload(serialized) : serialized;
                const parsedSection = this.safeParseJson<unknown>(decompressed, null, this.getSectionStorageKey(section));
                if (parsedSection === null) continue;

                switch (section) {
                    case 'history':
                    case 'favorites':
                    case 'hiddenTrackIds':
                        if (isStringArray(parsedSection)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'playlists':
                        if (isPlaylistArray(parsedSection)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'smartPlaylists':
                        if (Array.isArray(parsedSection) && parsedSection.every(isRecord)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'preferences': {
                        const prefs = this.sanitizePreferences(parsedSection);
                        if (prefs) {
                            (reconstructed as any)[section] = prefs;
                            loadedAnySection = true;
                        }
                        break;
                    }
                    case 'playCounts':
                    case 'ratings':
                        if (isNumberRecord(parsedSection)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'metadataOverrides':
                        if (isRecord(parsedSection)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'artworkOverrides':
                        if (isRecord(parsedSection) && Object.values(parsedSection).every(isImageDetailsArray)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                    case 'playbackState':
                        if (isPlaybackState(parsedSection)) {
                            (reconstructed as any)[section] = parsedSection;
                            loadedAnySection = true;
                        }
                        break;
                }
            }

            if (!loadedAnySection) {
                return null;
            }

            return this.normalizeLoadedData(reconstructed);
        } catch (e) {
            console.error('Failed to load segmented user data', e);
            return null;
        }
    }

    private hashValue(value: unknown): string {
        // Use a deterministic canonical JSON serialization and a 64-bit FNV-1a hash
        // to reduce accidental collisions and ensure stable change detection.
        const source = this.stableStringify(value ?? null);
        return this.fnv1a64(source);
    }

    private stableStringify(value: unknown): string {
        const canonicalize = (v: unknown): unknown => {
            if (v === null || typeof v !== 'object') return v;
            if (Array.isArray(v)) return v.map(canonicalize);
            const obj = v as Record<string, unknown>;
            const keys = Object.keys(obj).sort();
            const out: Record<string, unknown> = {};
            for (const k of keys) {
                out[k] = canonicalize(obj[k]);
            }
            return out;
        };

        try {
            return JSON.stringify(canonicalize(value));
        } catch {
            // Fallback to basic stringify if canonicalization fails
            return JSON.stringify(value ?? null);
        }
    }

    private fnv1a64(input: string): string {
        const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
        const data = encoder ? encoder.encode(input) : Buffer.from(input, 'utf8');
        const FNV_OFFSET = 14695981039346656037n;
        const FNV_PRIME = 1099511628211n;
        let hash = FNV_OFFSET;
        for (let i = 0; i < data.length; i++) {
            hash ^= BigInt(data[i]);
            hash = (hash * FNV_PRIME) & ((1n << 64n) - 1n);
        }
        // return as zero-padded hex
        return hash.toString(16).padStart(16, '0');
    }

    private computeSectionHashes(data: UserDataStore): Record<PersistedSection, string> {
        const hashes = {} as Record<PersistedSection, string>;
        PERSISTED_SECTIONS.forEach(section => {
            hashes[section] = this.hashValue((data as any)[section]);
        });
        return hashes;
    }

    // acquireStorageLock removed — persistence now uses non-blocking async flushWrites

    private scheduleFlush() {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        // schedule on next microtask to batch multiple saveData calls
        Promise.resolve().then(() => this.flushWrites());
    }

    private async flushWrites() {
        this.flushScheduled = false;
        if (typeof window === 'undefined') return;

        const sectionsToWrite = Array.from(this.pendingSections);
        if (sectionsToWrite.length === 0) return;

        // clear pending set early so subsequent saves get queued separately
        this.pendingSections = new Set();

        try {
            const index = this.readStorageIndex();

            sectionsToWrite.forEach(section => {
                const raw = JSON.stringify((this.data as any)[section]);
                const compressed = this.compressPayload(raw);
                const previousChunkCount = index.sections[section]?.chunkCount || 0;
                const chunkCount = this.writeChunked(this.getSectionStorageKey(section), compressed, previousChunkCount);

                index.sections[section] = {
                    chunkCount,
                    compressed: true
                };

                this.sectionHashes[section] = this.hashValue((this.data as any)[section]);
            });

            index.updatedAt = Date.now();
            index.version = (typeof index.version === 'number' ? index.version : 1) + 1;
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));

            try {
                window.dispatchEvent(new CustomEvent('music-persistence-saved', { detail: { sections: sectionsToWrite } }));
            } catch {
                // ignore
            }
        } catch (e) {
            console.error('Failed to flush user data', e);
        }
    }

    /**
     * Synchronously flush pending sections to localStorage.
     * Designed to be safe to call from page lifecycle events (beforeunload / pagehide).
     */
    flushNow(): void {
        if (typeof window === 'undefined') return;

        const sectionsToWrite = Array.from(this.pendingSections);
        if (sectionsToWrite.length === 0) return;

        // clear pending set early so subsequent saves get queued separately
        this.pendingSections = new Set();

        try {
            const index = this.readStorageIndex();

            sectionsToWrite.forEach(section => {
                const raw = JSON.stringify((this.data as any)[section]);
                const compressed = this.compressPayload(raw);
                const previousChunkCount = index.sections[section]?.chunkCount || 0;
                const chunkCount = this.writeChunked(this.getSectionStorageKey(section), compressed, previousChunkCount);

                index.sections[section] = {
                    chunkCount,
                    compressed: true
                };

                this.sectionHashes[section] = this.hashValue((this.data as any)[section]);
            });

            index.updatedAt = Date.now();
            index.version = (typeof index.version === 'number' ? index.version : 1) + 1;
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));

            try {
                window.dispatchEvent(new CustomEvent('music-persistence-saved', { detail: { sections: sectionsToWrite } }));
            } catch {
                // ignore
            }
        } catch (e) {
            console.error('Failed to flush user data (sync)', e);
        }
    }

    private loadData(): UserDataStore {
        if (typeof window === 'undefined') return DEFAULT_DATA;

        const segmentedData = this.loadSegmentedData();
        if (segmentedData) {
            return segmentedData;
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_DATA;

        const parsed = this.safeParseJson<unknown>(stored, null, STORAGE_KEY, isRecord);
        if (!parsed) {
            return DEFAULT_DATA;
        }

        this.shouldMigrateLegacy = true;
        return this.normalizeLoadedData(this.sanitizeLoadedData(parsed));
    }

    private saveData(forceSections?: readonly PersistedSection[]) {
        if (typeof window === 'undefined') return;

        const changedSections = (forceSections && forceSections.length > 0)
            ? [...forceSections]
            : PERSISTED_SECTIONS.filter(section => this.sectionHashes[section] !== this.hashValue((this.data as any)[section]));

        if (changedSections.length === 0) {
            return;
        }

        // Enqueue sections for asynchronous flush to avoid blocking the main thread.
        changedSections.forEach(s => this.pendingSections.add(s));
        this.scheduleFlush();
    }

    // -- Preferences
    getPreferences(): UserPreferences {
        return this.data.preferences;
    }

    updatePreferences(prefs: Partial<UserPreferences>) {
        this.data.preferences = { ...this.data.preferences, ...prefs };
        this.saveData();
    }

    // -- Playback State
    getPlaybackState(): PlaybackState | null {
        return this.data.playbackState || null;
    }

    setPlaybackState(state: PlaybackState) {
        this.data.playbackState = state;
        this.saveData();
    }

    // -- History
    getHistoryIds(): string[] {
        return this.data.history;
    }

    clearHistory() {
        this.data.history = [];
        this.data.playCounts = {};
        this.saveData();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('music-history-cleared'));
        }
    }

    addToHistory(hash_sha256: string) {
        this.data.history = this.data.history.filter(id => id !== hash_sha256);
        this.data.history.unshift(hash_sha256);
        if (this.data.history.length > 100) {
            this.data.history.pop();
        }

        // Also increment play count
        this.data.playCounts[hash_sha256] = (this.data.playCounts[hash_sha256] || 0) + 1;
        this.saveData();
    }

    // -- Play Counts
    getPlayCount(hash_sha256: string): number {
        return this.data.playCounts[hash_sha256] || 0;
    }

    getAllPlayCounts(): Record<string, number> {
        return this.data.playCounts || {};
    }

    getTopTracks(limit: number = 5): string[] {
        return Object.entries(this.data.playCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([hash]) => hash);
    }

    // -- Metadata Overrides
    getMetadataOverrides() {
        return this.data.metadataOverrides;
    }

    setMetadataOverride(hash_sha256: string, override: Partial<import('../types/music').TrackMetadata>) {
        this.data.metadataOverrides[hash_sha256] = {
            ...(this.data.metadataOverrides[hash_sha256] || {}),
            ...override
        };
        this.saveData();
    }

    // -- Artwork Overrides
    getArtworkOverrides() {
        return this.data.artworkOverrides || {};
    }

    getData() {
        return this.data;
    }

    setArtworkOverride(hash_sha256: string, artworks: import('../types/music').ImageDetails[]) {
        if (!this.data.artworkOverrides) this.data.artworkOverrides = {};
        this.data.artworkOverrides[hash_sha256] = artworks;
        this.saveData();
    }

    // -- Playlists
    getPlaylists(): Playlist[] {
        return this.data.playlists;
    }

    createPlaylist(name: string, description?: string): Playlist {
        const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const newPlaylist: Playlist = { id, name, description, trackIds: [] };
        this.data.playlists.push(newPlaylist);
        this.saveData();
        return newPlaylist;
    }

    updatePlaylist(playlistId: string, updates: Partial<Playlist>) {
        const pl = this.data.playlists.find(p => p.id === playlistId);
        if (pl) {
            Object.assign(pl, updates);
            this.saveData();
        }
    }

    deletePlaylist(id: string) {
        this.data.playlists = this.data.playlists.filter(p => p.id !== id);
        this.saveData();
    }

    // -- Smart Playlists
    getSmartPlaylists() {
        return this.data.smartPlaylists || [];
    }

    saveSmartPlaylist(def: import('../utils/smartPlaylistEvaluator').SmartPlaylistDefinition) {
        if (!this.data.smartPlaylists) this.data.smartPlaylists = [];
        const existingIndex = this.data.smartPlaylists.findIndex(p => p.id === def.id);
        if (existingIndex >= 0) {
            this.data.smartPlaylists[existingIndex] = def;
        } else {
            this.data.smartPlaylists.push(def);
        }
        this.saveData();
    }

    deleteSmartPlaylist(id: string) {
        if (!this.data.smartPlaylists) return;
        this.data.smartPlaylists = this.data.smartPlaylists.filter(p => p.id !== id);
        this.saveData();
    }

    addTrackToPlaylist(playlistId: string, trackHash: string) {
        const pl = this.data.playlists.find(p => p.id === playlistId);
        if (pl && !pl.trackIds.includes(trackHash)) {
            pl.trackIds.push(trackHash);
            this.saveData();
        }
    }

    removeFromPlaylist(playlistId: string, trackHash: string) {
        const pl = this.data.playlists.find(p => p.id === playlistId);
        if (pl) {
            pl.trackIds = pl.trackIds.filter(id => id !== trackHash);
            this.saveData();
        }
    }

    // -- Ratings (0-5 stars)
    getRating(hash_sha256: string): number {
        return this.data.ratings?.[hash_sha256] || 0;
    }

    setRating(hash_sha256: string, rating: number) {
        if (!this.data.ratings) this.data.ratings = {};
        this.data.ratings[hash_sha256] = Math.max(0, Math.min(5, rating));
        this.saveData();
    }

    getAllRatings(): Record<string, number> {
        return this.data.ratings || {};
    }

    // -- Favorites
    isFavorite(hash_sha256: string): boolean {
        return (this.data.favorites || []).includes(hash_sha256);
    }

    toggleFavorite(hash_sha256: string): boolean {
        if (!this.data.favorites) this.data.favorites = [];
        const idx = this.data.favorites.indexOf(hash_sha256);
        if (idx >= 0) {
            this.data.favorites.splice(idx, 1);
            this.saveData();
            return false;
        } else {
            this.data.favorites.push(hash_sha256);
            this.saveData();
            return true;
        }
    }

    getFavorites(): string[] {
        return this.data.favorites || [];
    }

    getHiddenTrackIds(): string[] {
        return this.data.hiddenTrackIds || [];
    }

    hideTrack(hash_sha256: string): void {
        if (!this.data.hiddenTrackIds) this.data.hiddenTrackIds = [];
        if (!this.data.hiddenTrackIds.includes(hash_sha256)) {
            this.data.hiddenTrackIds.push(hash_sha256);
            this.saveData();
        }
    }

    unhideTrack(hash_sha256: string): void {
        if (!this.data.hiddenTrackIds) return;
        this.data.hiddenTrackIds = this.data.hiddenTrackIds.filter(id => id !== hash_sha256);
        this.saveData();
    }

    resetApplicationMetadata(): void {
        this.data.history = [];
        this.data.playCounts = {};
        this.data.playlists = [];
        this.data.smartPlaylists = [];
        this.data.metadataOverrides = {};
        this.data.artworkOverrides = {};
        this.data.ratings = {};
        this.data.favorites = [];
        this.data.hiddenTrackIds = [];
        this.saveData();
    }

    // -- Generic store (for UI preferences like columns)
    get(key: string): any {
        if (typeof window === 'undefined') return null;
        const storageKey = `music_library_ui_${key}`;
        const stored = localStorage.getItem(storageKey);
        return this.safeParseJson<any>(stored, null, storageKey);
    }

    set(key: string, value: any) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(`music_library_ui_${key}`, JSON.stringify(value));
        try {
            window.dispatchEvent(new CustomEvent('music-ui-changed', { detail: { key, value } }));
        } catch {
            // ignore
        }
    }
}

export const persistenceService = new PersistenceService();

