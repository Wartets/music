import { TrackItem } from '../types/music';
import { getTrackDisplayName } from './trackUtils';

const UNKNOWN_ALBUM_LABELS = new Set(['', 'unknown album', 'unknown', 'n/a', 'null']);

const normalizeText = (value: string | null | undefined) => (value || '').trim();

export const isSingleTrackCollection = (track: TrackItem) => {
    const folder = normalizeText(track.logic?.hierarchy?.folder).toLowerCase();
    const group = normalizeText(track.logic?.hierarchy?.group).toLowerCase();
    const fileDir = normalizeText(track.file?.dir).toLowerCase();

    return Boolean(
        track.logic?.is_single ||
        folder.includes('single') ||
        group.includes('single') ||
        fileDir.includes('\\single\\') ||
        fileDir.includes('/single/')
    );
};

export const getTrackCollectionLabel = (track: TrackItem) => {
    const album = normalizeText(track.metadata?.album);
    if (album && !UNKNOWN_ALBUM_LABELS.has(album.toLowerCase())) {
        return album;
    }

    const title = normalizeText(getTrackDisplayName(track));
    const folder = normalizeText(track.logic?.hierarchy?.folder);

    if (isSingleTrackCollection(track)) {
        return title || folder || 'Single';
    }

    return title || folder || 'Untitled Collection';
};

export const getTrackCollectionKey = (track: TrackItem) => {
    const album = normalizeText(track.metadata?.album);
    if (album && !UNKNOWN_ALBUM_LABELS.has(album.toLowerCase())) {
        return `album:${album.toLowerCase()}`;
    }

    const folder = normalizeText(track.logic?.hierarchy?.folder);
    const title = normalizeText(getTrackDisplayName(track));

    if (isSingleTrackCollection(track)) {
        return `single:${title.toLowerCase() || folder.toLowerCase()}`;
    }

    return `folder:${folder.toLowerCase() || title.toLowerCase()}`;
};
