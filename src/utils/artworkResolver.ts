import type { ImageDetails, TrackItem } from '../types/music';

type ArtworkTrackLike = {
    artworks?: TrackItem['artworks'];
    versions?: Array<{
        artworks?: TrackItem['artworks'];
    }>;
};

export const getBestArtwork = (track?: ArtworkTrackLike | null): ImageDetails | undefined => {
    if (!track) return undefined;

    const fromTrack = track.artworks?.track_artwork?.[0] || track.artworks?.album_artwork?.[0];
    if (fromTrack) {
        return fromTrack;
    }

    if (!track.versions?.length) {
        return undefined;
    }

    for (const version of track.versions) {
        const fromVersion = version.artworks?.track_artwork?.[0] || version.artworks?.album_artwork?.[0];
        if (fromVersion) {
            return fromVersion;
        }
    }

    return undefined;
};

export const getBestAlbumArtwork = (track?: ArtworkTrackLike | null): ImageDetails | undefined => {
    if (!track) return undefined;

    const fromTrack = track.artworks?.album_artwork?.[0] || track.artworks?.track_artwork?.[0];
    if (fromTrack) {
        return fromTrack;
    }

    if (!track.versions?.length) {
        return undefined;
    }

    for (const version of track.versions) {
        const fromVersion = version.artworks?.album_artwork?.[0] || version.artworks?.track_artwork?.[0];
        if (fromVersion) {
            return fromVersion;
        }
    }

    return undefined;
};

export const getCollectionArtwork = (tracks?: TrackItem[] | null): ImageDetails | undefined => {
    if (!tracks || tracks.length === 0) return undefined;
    for (const track of tracks) {
        const artwork = getBestAlbumArtwork(track);
        if (artwork) {
            return artwork;
        }
    }

    return undefined;
};

