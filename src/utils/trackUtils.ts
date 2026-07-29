import type { TrackItem } from '../types/music';

export const getTrackDisplayName = (track?: TrackItem | null, fallback = ''): string => {
    if (!track) {
        return fallback;
    }

    const canonicalTrackName = track.logic?.track_name?.trim();
    if (canonicalTrackName) {
        return canonicalTrackName;
    }

    const metadataTitle = track.metadata?.title?.trim();
    if (metadataTitle) {
        return metadataTitle;
    }

    return fallback;
};

export const getTrackVersionDisplayName = (track?: TrackItem | null, fallback = ''): string => {
    if (!track) {
        return fallback;
    }

    const fileVersion = track.file?.name?.trim();
    if (fileVersion) {
        return fileVersion;
    }

    const logicVersion = track.logic?.version_name?.trim();
    if (logicVersion) {
        return logicVersion;
    }

    return fallback;
};

export const resolveTrackVersion = (
    id: string,
    tracks: TrackItem[],
    versionToPrimaryMap: Record<string, string>
): TrackItem | undefined => {
    const trackMap = new Map(tracks.map(track => [track.logic.hash_sha256, track] as const));

    // Prefer exact version identity when available so views like Recently Played / Most Played
    // reflect the actual played track variant. Fallback to the mapped primary for legacy IDs.
    const exactTrack = trackMap.get(id);
    if (exactTrack) {
        return exactTrack;
    }

    const primaryId = versionToPrimaryMap[id] || id;
    return trackMap.get(primaryId);
};

