import type { TrackItem } from '../types/music';

const parseTrackNumber = (value?: string | null): number => {
    if (!value) return Number.POSITIVE_INFINITY;

    const normalized = String(value).trim();
    if (!normalized) return Number.POSITIVE_INFINITY;

    const match = normalized.match(/\d+/);
    if (!match) return Number.POSITIVE_INFINITY;

    const parsed = Number.parseInt(match[0], 10);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

export const sortTracksByTrackNumber = (tracks: TrackItem[]): TrackItem[] => (
    [...tracks].sort((a, b) => {
        const aTrack = parseTrackNumber(a.metadata?.track_number);
        const bTrack = parseTrackNumber(b.metadata?.track_number);

        if (aTrack !== bTrack) {
            return aTrack - bTrack;
        }

        const aTitle = a.metadata?.title || a.logic.track_name || '';
        const bTitle = b.metadata?.title || b.logic.track_name || '';
        return aTitle.localeCompare(bTitle);
    })
);
