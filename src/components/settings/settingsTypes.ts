export type SettingsTabId = 'interface' | 'audio' | 'metadata' | 'maintenance' | 'stats' | 'credentials' | 'language';

export type MaintenanceTabId = 'duplicates' | 'health' | 'data';

export interface SettingsStatCard {
    label: string;
    value: string;
}

export interface GenreDecadeEntry {
    decade: string;
    genres: Array<[string, number]>;
}

export interface SettingsDetailedStats {
    totalPlaytimeMinutes: number;
    averageBitrate: number;
    totalTracks: number;
    totalAlbums: number;
    totalArtists: number;
    totalGenres: number;
    totalFolders: number;
    totalSizeGb: number;
    averageDurationMinutes: number;
    losslessCount: number;
    ratedTracksCount: number;
    averageRating: number;
    totalVersions: number;
    singlesCount: number;
    topCodec: string;
    averageSampleRateKhz: number;
    oldestYear: number | null;
    newestYear: number | null;
    historyCount: number;
    favoritesCount: number;
    genreDistribution: Array<[string, number]>;
    genreFullDistribution: Array<[string, number]>;
    genreByDecade: GenreDecadeEntry[];
    genreByFormat: Array<{ genre: string; lossless: number; lossy: number }>;
    maxGenreCount: number;
}

