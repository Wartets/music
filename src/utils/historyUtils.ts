import { persistenceService } from '../services/persistence';
import type { TrackItem } from '../types/music';
import { resolveTrackVersion } from './trackUtils';

export const resolveHistoryTracks = (
    tracks: TrackItem[],
    versionToPrimaryMap: Record<string, string>
): TrackItem[] => {
    const historyIds = persistenceService.getHistoryIds();

    return historyIds
        .map(id => resolveTrackVersion(id, tracks, versionToPrimaryMap))
        .filter((track): track is TrackItem => Boolean(track));
};
