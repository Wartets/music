import { MusicDatabase, TrackItem } from '../types/music';
import { resolveAssetCandidates, resolvePreferredAssetUrl, resolveRepositoryRelativePath } from './assetResolver';
import { normalizeArtists } from '../utils/artistUtils';

const normalizeArtworkPath = (path: string): string => {
    const normalized = resolveRepositoryRelativePath(path);
    if (!normalized) return '';

    // Preserve absolute/remote URLs exactly as they were provided.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
        return normalized;
    }

    return normalized.replace(/\\/g, '/').replace(/^\/+/, '');
};

/**
 * Database Service
 * Parses 'musicBib.json' and prepares the application for in-memory DB operations.
 */
export class DatabaseService {
    private database: MusicDatabase | null = null;
    private trackMap: Map<string, TrackItem> = new Map();

    /**
     * Converts the absolute path from the indexation batch script to a relative URL.
     */
    getRelativePath(absolutePath: string): string {
        return resolvePreferredAssetUrl(absolutePath);
    }

    getAssetCandidates(assetPath: string): string[] {
        return resolveAssetCandidates(assetPath);
    }

    getRepositoryRelativePath(assetPath: string): string {
        return resolveRepositoryRelativePath(assetPath);
    }

    /**
     * Loads and parses the initial musicBib.json file into the internal structure.
     */
    async loadInitialDatabase(): Promise<MusicDatabase | null> {
        if (this.database) {
            return this.database;
        }

        try {
            const manifestCandidates = resolveAssetCandidates('musicBib.json');
            let response: Response | null = null;

            for (const candidate of manifestCandidates) {
                try {
                    const candidateResponse = await fetch(candidate, { cache: 'no-store' });
                    if (candidateResponse.ok) {
                        response = candidateResponse;
                        break;
                    }
                } catch {
                    // Try next location.
                }
            }

            if (!response) {
                throw new Error('Failed to load musicBib.json from configured sources.');
            }

            const data: MusicDatabase = await response.json();

            // Normalize data: ensure metadata exists and artists is an array
            if (data.items && Array.isArray(data.items)) {
                for (const track of data.items) {
                    if (!track.metadata) {
                        track.metadata = {} as any;
                    }
                    track.metadata.artists = normalizeArtists(track.metadata.artists);

                    // Ensure audio_specs exists and populate codec
                    if (!track.audio_specs) {
                        track.audio_specs = { is_lossless: false } as any;
                    }
                    if (!track.audio_specs.codec && track.file && track.file.ext) {
                        track.audio_specs.codec = track.file.ext;
                    }

                    // Normalize artwork paths
                    if (track.artworks) {
                        if (track.artworks.track_artwork) {
                            track.artworks.track_artwork.forEach(art => {
                                if (art.path) art.path = normalizeArtworkPath(art.path);
                            });
                        }
                        if (track.artworks.album_artwork) {
                            track.artworks.album_artwork.forEach(art => {
                                if (art.path) art.path = normalizeArtworkPath(art.path);
                            });
                        }
                    }
                }
            }

            this.database = data;

            this.trackMap.clear();
            if (data.items && Array.isArray(data.items)) {
                for (const track of data.items) {
                    if (track.logic && track.logic.hash_sha256) {
                        this.trackMap.set(track.logic.hash_sha256, track);
                    }
                }
            }

            return this.database;
        } catch (error) {
            console.error("Error loading music library database:", error);
            return null;
        }
    }

    async getTrackByHash(hash: string): Promise<TrackItem | null> {
        if (!this.database) {
            await this.loadInitialDatabase();
        }
        return this.trackMap.get(hash) || null;
    }

    updateTrackMetadata(hash: string, metadataPatch: Partial<TrackItem['metadata']>): boolean {
        if (!this.database) return false;
        const track = this.trackMap.get(hash);
        if (!track) return false;
        track.metadata = {
            ...track.metadata,
            ...metadataPatch
        };
        return true;
    }

    exportDatabaseJson(): string | null {
        if (!this.database) return null;
        return JSON.stringify(this.database, null, 2);
    }

    async loadUserDataStore(): Promise<any> {
        return {};
    }

    getAllTracks(): TrackItem[] {
        return this.database ? this.database.items : [];
    }
}

export const dbService = new DatabaseService();

