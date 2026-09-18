import type { TrackItem } from '../types/music';
import type { ViewType } from '../components/layout/viewRouting';
import { getTrackDisplayName } from './trackUtils';
import { getDeploymentBasePath } from './basePath';

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

export const getBasePath = (): string => getDeploymentBasePath();

const VIEW_PATH_MAP: Partial<Record<ViewType, string>> = {
    Dashboard: '/',
    AllTracks: '/tracks',
    Albums: '/albums',
    Artists: '/artists',
    Playlists: '/playlists',
    Favorites: '/favorites',
    Settings: '/settings',
    Queue: '/queue'
};

export const routeForView = (view: ViewType): string => {
    const suffix = VIEW_PATH_MAP[view];
    const base = getBasePath();
    if (!suffix || suffix === '/') {
        return base ? `${base}/` : '/';
    }
    return `${base}${suffix}`;
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
    const base = getBasePath();

    if (base) {
        const lowerPath = path.toLowerCase();
        const lowerBase = base.toLowerCase();
        if (lowerPath === lowerBase || lowerPath.startsWith(`${lowerBase}/`)) {
            path = path.slice(base.length) || '/';
        }
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

