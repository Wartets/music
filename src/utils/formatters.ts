import type { TrackItem } from '../types/music';

/**
 * Formats a duration in seconds to a mm:ss string.
 * @param seconds - Total seconds
 */
export const formatDuration = (seconds?: number | string): string => {
    if (seconds === null || seconds === undefined || seconds === '') return '0:00';

    const num = typeof seconds === 'string'
        ? (seconds.includes(':') ? parseDuration(seconds) : parseFloat(seconds))
        : seconds;

    if (isNaN(num)) return '0:00';

    const minutes = Math.floor(num / 60);
    const remainingSeconds = Math.floor(num % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Parses a mm:ss duration string into total seconds.
 * @param durationStr - String like "3:45"
 */
export const parseDuration = (durationStr?: string | null): number => {
    if (!durationStr) return 0;

    const normalized = durationStr.trim();
    if (!normalized) return 0;

    if (/^\d+(\.\d+)?$/.test(normalized)) {
        return Math.max(0, Math.floor(parseFloat(normalized)));
    }

    const cleaned = normalized.replace(/[^0-9:.]/g, '');
    const parts = cleaned.split(':').map(part => part.trim()).filter(Boolean);

    if (parts.length === 0 || parts.some(part => Number.isNaN(Number(part)))) {
        return 0;
    }

    let totalSeconds = 0;
    let multiplier = 1;

    for (let i = parts.length - 1; i >= 0; i--) {
        totalSeconds += parseFloat(parts[i]) * multiplier;
        multiplier *= 60;
    }

    return Math.max(0, Math.floor(totalSeconds));
};

/**
 * Formats an epoch timestamp to a local date string.
 * @param epoch - Timestamp
 */
export const formatDate = (epoch?: number): string => {
    if (!epoch) return 'Unknown';
    return new Date(epoch).toLocaleDateString();
};

/**
 * Formats a byte size into MB.
 * @param bytes - Size in bytes
 */
export const formatSizeMb = (bytes?: number): string => {
    if (!bytes) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

/**
 * Determines if a track is lossless based on specs.
 * @param isLossless - boolean
 */
export const getLosslessBadge = (isLossless?: boolean): string | null => {
    return isLossless ? 'LOSSLESS' : null;
};

export const formatTotalDuration = (tracks: TrackItem[]): string => {
    const totalSeconds = tracks.reduce((sum, track) => sum + parseDuration(track.audio_specs?.duration || '0:00'), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};
