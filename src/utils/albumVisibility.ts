import type { TrackItem } from '../types/music';

const UNKNOWN_ALBUM_TOKENS = new Set(['', 'unknown album', 'unknown', 'n/a', 'na', 'null', '-']);

const normalizeAlbumToken = (value: string | null | undefined): string => {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

export const isTrackWithoutAlbum = (track: TrackItem): boolean => {
    const album = normalizeAlbumToken(track.metadata?.album);
    return UNKNOWN_ALBUM_TOKENS.has(album);
};

export const filterTracksByAlbumVisibility = (
    tracks: TrackItem[],
    showUnknownAlbumTracks: boolean
): TrackItem[] => {
    if (showUnknownAlbumTracks) return tracks;
    return tracks.filter(track => !isTrackWithoutAlbum(track));
};
