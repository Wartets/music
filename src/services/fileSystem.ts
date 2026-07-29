/**
 * File System Service Stub
 * Handles path resolution and translations between the absolute paths
 * returned by indexation.bat and web-friendly relative paths.
 */

import { dbService } from './db';

export class FileSystemService {
    /**
     * Physical file moves are not supported in the web build.
     * This service only resolves paths for browser-friendly access.
     */
    isPhysicalMoveSupported(): false {
        return false;
    }

    /**
     * Converts a physical path to a viable local web URL or blob reference.
     * @param absolutePath - The 'path' property from TrackFile
     * @returns Resolvable local URL
     */
    resolveAudioPath(absolutePath: string): string {
        return dbService.getRelativePath(absolutePath);
    }

    resolveAudioPathCandidates(absolutePath: string): string[] {
        return dbService.getAssetCandidates(absolutePath);
    }

    /**
     * Resolves the artwork image path, applying fallbacks if missing.
     * @param artworkPath - The image path from ImageDetails
     * @returns Resolvable image URL
     */
    resolveArtworkPath(artworkPath: string | undefined): string {
        if (!artworkPath) return '';
        return dbService.getRelativePath(artworkPath);
    }

    resolveArtworkPathCandidates(artworkPath: string | undefined): string[] {
        if (!artworkPath) return [];
        return dbService.getAssetCandidates(artworkPath);
    }

    /**
     * Unsupported in the web app.
     * Returns false so callers can detect that the move was not performed.
     */
    physicallyMoveFile(oldPath: string, newPath: string): boolean {
        console.warn(
            `[FileSystemService] Unsupported operation: physical file moves are not available in this build. ` +
            `Requested move from ${oldPath} to ${newPath}.`
        );
        return false;
    }
}

export const fileSystemService = new FileSystemService();
