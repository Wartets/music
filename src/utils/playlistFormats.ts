import { dbService } from '../services/db';
import { TrackItem } from '../types/music';
import { parseDuration } from './formatters';
import { getArtistsDisplayName } from './artistUtils';
import { sanitizeExportPath } from './exportSanitizer';

export type PlaylistFileFormat = 'm3u' | 'm3u8' | 'pls';

export interface PlaylistImportEntry {
    path?: string;
    title?: string;
    durationSeconds?: number;
}

export interface PlaylistImportResult {
    tracks: TrackItem[];
    matchedEntries: number;
    unmatchedEntries: number;
}

const normalizeToken = (value: string): string => {
    const cleaned = value
        .replace(/^file:\/+/i, '')
        .replace(/^\uFEFF/, '')
        .replace(/\\/g, '/')
        .trim();

    try {
        return decodeURIComponent(cleaned).toLowerCase();
    } catch {
        return cleaned.toLowerCase();
    }
};

const normalizePathToken = (value: string): string => {
    const cleaned = normalizeToken(value)
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/');
    return cleaned;
};

const getBasename = (value: string): string => {
    const normalized = normalizePathToken(value);
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : normalized;
};

const getTitleTokens = (track: TrackItem): string[] => {
    const title = track.metadata?.title || track.logic.track_name;
    const artists = getArtistsDisplayName(track.metadata?.artists, '');
    const display = artists ? `${artists} - ${title}` : title;
    return [display, title, track.logic.track_name]
        .map(value => normalizeToken(value))
        .filter(Boolean);
};

const buildLookup = (tracks: TrackItem[]) => {
    const byPath = new Map<string, TrackItem>();
    const byBasename = new Map<string, TrackItem[]>();
    const byTitle = new Map<string, TrackItem[]>();

    for (const track of tracks) {
        const filePath = track.file?.path;
        if (typeof filePath === 'string' && filePath.trim()) {
            const absoluteToken = normalizePathToken(filePath);
            const repoRelativeToken = normalizePathToken(dbService.getRepositoryRelativePath(filePath));
            if (!byPath.has(absoluteToken)) byPath.set(absoluteToken, track);
            if (repoRelativeToken && !byPath.has(repoRelativeToken)) byPath.set(repoRelativeToken, track);
            const basename = getBasename(filePath);
            if (basename) {
                if (!byBasename.has(basename)) byBasename.set(basename, []);
                byBasename.get(basename)!.push(track);
            }
        }

        for (const titleToken of getTitleTokens(track)) {
            if (!byTitle.has(titleToken)) byTitle.set(titleToken, []);
            byTitle.get(titleToken)!.push(track);
        }
    }

    return { byPath, byBasename, byTitle };
};

const resolveTrack = (entry: PlaylistImportEntry, lookup: ReturnType<typeof buildLookup>): TrackItem | null => {
    const pathToken = entry.path ? normalizePathToken(entry.path) : '';
    if (pathToken) {
        const exact = lookup.byPath.get(pathToken);
        if (exact) return exact;

        const basename = getBasename(pathToken);
        const basenameMatches = lookup.byBasename.get(basename) || [];
        if (basenameMatches.length === 1) return basenameMatches[0];
        if (basenameMatches.length > 1) {
            const repoRelativeMatch = basenameMatches.find(track => normalizePathToken(dbService.getRepositoryRelativePath(track.file.path)) === pathToken);
            if (repoRelativeMatch) return repoRelativeMatch;
            return basenameMatches[0];
        }
    }

    const titleToken = entry.title ? normalizeToken(entry.title) : '';
    if (titleToken) {
        const titleMatches = lookup.byTitle.get(titleToken) || [];
        if (titleMatches.length === 1) return titleMatches[0];
        if (titleMatches.length > 1) return titleMatches[0];
    }

    return null;
};

const parseM3U = (text: string): PlaylistImportEntry[] => {
    const entries: PlaylistImportEntry[] = [];
    let pendingTitle: string | undefined;
    let pendingDuration: number | undefined;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line === '#EXTM3U') continue;

        if (line.startsWith('#EXTINF:')) {
            const extinfBody = line.slice('#EXTINF:'.length);
            const commaIndex = extinfBody.indexOf(',');
            const durationPart = commaIndex >= 0 ? extinfBody.slice(0, commaIndex).trim() : extinfBody.trim();
            const titlePart = commaIndex >= 0 ? extinfBody.slice(commaIndex + 1).trim() : '';
            const parsedDuration = Number.parseFloat(durationPart);
            pendingDuration = Number.isFinite(parsedDuration) ? parsedDuration : undefined;
            pendingTitle = titlePart || undefined;
            continue;
        }

        if (line.startsWith('#')) {
            continue;
        }

        entries.push({
            path: line,
            title: pendingTitle,
            durationSeconds: pendingDuration,
        });
        pendingTitle = undefined;
        pendingDuration = undefined;
    }

    return entries;
};

const parsePls = (text: string): PlaylistImportEntry[] => {
    const fileEntries = new Map<number, PlaylistImportEntry>();

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith(';') || line.startsWith('[')) continue;

        const fileMatch = line.match(/^File(\d+)=(.*)$/i);
        if (fileMatch) {
            const index = Number.parseInt(fileMatch[1], 10);
            const existing = fileEntries.get(index) || {};
            existing.path = fileMatch[2].trim();
            fileEntries.set(index, existing);
            continue;
        }

        const titleMatch = line.match(/^Title(\d+)=(.*)$/i);
        if (titleMatch) {
            const index = Number.parseInt(titleMatch[1], 10);
            const existing = fileEntries.get(index) || {};
            existing.title = titleMatch[2].trim();
            fileEntries.set(index, existing);
            continue;
        }

        const lengthMatch = line.match(/^Length(\d+)=(.*)$/i);
        if (lengthMatch) {
            const index = Number.parseInt(lengthMatch[1], 10);
            const existing = fileEntries.get(index) || {};
            const parsedLength = Number.parseFloat(lengthMatch[2]);
            existing.durationSeconds = Number.isFinite(parsedLength) ? parsedLength : undefined;
            fileEntries.set(index, existing);
        }
    }

    return Array.from(fileEntries.entries())
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry)
        .filter(entry => Boolean(entry.path || entry.title));
};

export const inferPlaylistFileFormat = (fileName: string, text?: string): PlaylistFileFormat => {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pls')) return 'pls';
    if (lowerName.endsWith('.m3u8')) return 'm3u8';
    if (lowerName.endsWith('.m3u')) return 'm3u';

    const header = (text || '').trimStart().slice(0, 32).toUpperCase();
    if (header.startsWith('[PLAYLIST]')) return 'pls';
    return 'm3u';
};

export const parsePlaylistFile = (text: string, format: PlaylistFileFormat): PlaylistImportEntry[] => {
    switch (format) {
        case 'pls':
            return parsePls(text);
        case 'm3u8':
        case 'm3u':
        default:
            return parseM3U(text);
    }
};

export const resolveImportedPlaylistTracks = (entries: PlaylistImportEntry[], libraryTracks: TrackItem[]): PlaylistImportResult => {
    const lookup = buildLookup(libraryTracks);
    const tracks: TrackItem[] = [];
    let unmatchedEntries = 0;

    for (const entry of entries) {
        const track = resolveTrack(entry, lookup);
        if (track) {
            tracks.push(track);
        } else {
            unmatchedEntries += 1;
        }
    }

    return {
        tracks,
        matchedEntries: tracks.length,
        unmatchedEntries,
    };
};

const formatDurationForExport = (track: TrackItem): number => {
    const duration = track.audio_specs?.duration || '0:00';
    const seconds = parseDuration(duration);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : -1;
};

const formatTrackTitle = (track: TrackItem): string => {
    const artists = getArtistsDisplayName(track.metadata?.artists, 'Unknown');
    const title = track.metadata?.title || track.logic.track_name;
    return `${artists} - ${title}`;
};

const formatTrackPath = (track: TrackItem): string => {
    const preferred = sanitizeExportPath(track.file?.path);
    return preferred || track.file?.path || '';
};

const serializeM3U = (tracks: TrackItem[], extended = true): string => {
    let output = '#EXTM3U\n';
    for (const track of tracks) {
        if (extended) {
            output += `#EXTINF:${formatDurationForExport(track)},${formatTrackTitle(track)}\n`;
        }
        output += `${formatTrackPath(track)}\n`;
    }
    return output;
};

const serializePls = (tracks: TrackItem[]): string => {
    const lines = ['[playlist]', `NumberOfEntries=${tracks.length}`];

    tracks.forEach((track, index) => {
        const entryNumber = index + 1;
        lines.push(`File${entryNumber}=${formatTrackPath(track)}`);
        lines.push(`Title${entryNumber}=${formatTrackTitle(track)}`);
        lines.push(`Length${entryNumber}=${formatDurationForExport(track)}`);
    });

    lines.push('Version=2');
    return `${lines.join('\n')}\n`;
};

export const exportPlaylistFile = (tracks: TrackItem[], format: PlaylistFileFormat): { content: string; mimeType: string; extension: string } => {
    switch (format) {
        case 'pls':
            return {
                content: serializePls(tracks),
                mimeType: 'audio/x-scpls',
                extension: 'pls',
            };
        case 'm3u8':
            return {
                content: serializeM3U(tracks, true),
                mimeType: 'application/vnd.apple.mpegurl',
                extension: 'm3u8',
            };
        case 'm3u':
        default:
            return {
                content: serializeM3U(tracks, true),
                mimeType: 'audio/x-mpegurl',
                extension: 'm3u',
            };
    }
};

