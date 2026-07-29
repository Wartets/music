import type { TrackItem } from '../types/music';
import { getTrackDisplayName } from './trackUtils';

export type ParsedAppRoute =
    | { kind: 'track'; shortHash: string; slug?: string }
    | { kind: 'artist'; slug: string }
    | { kind: 'album'; slug: string }
    | { kind: 'view'; viewPath: 'dashboard' | 'tracks' | 'albums' | 'artists' | 'playlists' | 'favorites' | 'settings' | 'queue' }
    | { kind: 'none' };

export const slugify = (value: string): string => {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72);
};

export const getBasePath = (): string => {
    if (typeof window !== 'undefined') {
        const path = window.location.pathname.toLowerCase();
        if (path === '/music-library' || path.startsWith('/music-library/')) {
            return window.location.pathname.slice(0, 14); // Preserves original casing
        }
        if (path === '/music' || path.startsWith('/music/')) {
            return window.location.pathname.slice(0, 6);
        }
    }
    return '';
};

export const routeForTrack = (track: TrackItem): string => {
    const shortHash = (track.logic.hash_sha256 || '').slice(0, 8);
    const title = getTrackDisplayName(track, 'track');
    const artist = track.metadata?.artists?.[0] || '';
    const slug = slugify([artist, title].filter(Boolean).join(' '));
    return `${getBasePath()}/t/${shortHash}${slug ? `-${slug}` : ''}`;
};

export const routeForArtist = (artistName: string): string => {
    return `${getBasePath()}/artist/${slugify(artistName || 'artist')}`;
};

export const routeForAlbum = (albumName: string): string => {
    return `${getBasePath()}/album/${slugify(albumName || 'album')}`;
};

export const parseAppRoute = (pathname: string, search: string): ParsedAppRoute => {
    let path = (pathname || '/').trim();
    const lowerPath = path.toLowerCase();

    // Strip the subpath before parsing
    if (lowerPath === '/music-library' || lowerPath.startsWith('/music-library/')) {
        path = path.slice(14) || '/';
    } else if (lowerPath === '/music' || lowerPath.startsWith('/music/')) {
        path = path.slice(6) || '/';
    }

    const clean = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;

    const trackMatch = clean.match(/^\/t\/([a-f0-9]{6,16})(?:-([a-z0-9-]+))?$/i);
    if (trackMatch) {
        return { kind: 'track', shortHash: trackMatch[1].toLowerCase(), slug: trackMatch[2] };
    }

    const artistMatch = clean.match(/^\/artist\/([a-z0-9-]{1,120})$/i);
    if (artistMatch) {
        return { kind: 'artist', slug: artistMatch[1].toLowerCase() };
    }

    const albumMatch = clean.match(/^\/album\/([a-z0-9-]{1,120})$/i);
    if (albumMatch) {
        return { kind: 'album', slug: albumMatch[1].toLowerCase() };
    }

    const staticViews: Record<string, ParsedAppRoute> = {
        '/': { kind: 'view', viewPath: 'dashboard' },
        '/dashboard': { kind: 'view', viewPath: 'dashboard' },
        '/tracks': { kind: 'view', viewPath: 'tracks' },
        '/albums': { kind: 'view', viewPath: 'albums' },
        '/artists': { kind: 'view', viewPath: 'artists' },
        '/playlists': { kind: 'view', viewPath: 'playlists' },
        '/favorites': { kind: 'view', viewPath: 'favorites' },
        '/settings': { kind: 'view', viewPath: 'settings' },
        '/queue': { kind: 'view', viewPath: 'queue' }
    };
    if (staticViews[clean]) {
        return staticViews[clean];
    }

    // Backward-compatible short-hash query support
    const params = new URLSearchParams(search || '');
    const short = params.get('s');
    if (short) {
        return { kind: 'track', shortHash: short.toLowerCase() };
    }

    return { kind: 'none' };
};
