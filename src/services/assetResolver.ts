const ABSOLUTE_URL_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const BASE_URL = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL || '').replace(/\/+$/, '');

const toPosixPath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/').trim();

const stripFileScheme = (value: string): string => value.replace(/^file:\/\//i, '');

const safeEncodeSegment = (segment: string): string => {
    if (!segment) return segment;
    try {
        return encodeURIComponent(decodeURIComponent(segment)).replace(/%3A/g, ':');
    } catch {
        return encodeURIComponent(segment).replace(/%3A/g, ':');
    }
};

const toEncodedUrlPath = (pathValue: string): string => {
    return pathValue
        .split('/')
        .map((segment, index) => {
            if (index === 0 && segment === '') return '';
            return safeEncodeSegment(segment);
        })
        .join('/');
};

const normalizeRepositoryRelativePath = (inputPath: string): string => {
    if (!inputPath) return '';

    const stripped = stripFileScheme(inputPath).trim();
    if (!stripped) return '';
    if (ABSOLUTE_URL_REGEX.test(stripped)) return stripped;

    let normalized = toPosixPath(stripped);

    // Strip repository anchor (e.g., '/Music-Library/')
    const repoAnchorIndex = normalized.toLowerCase().indexOf('/music-library/');
    if (repoAnchorIndex >= 0) {
        normalized = normalized.slice(repoAnchorIndex + '/music-library/'.length);
    }

    // Strip Windows drive letter or leading slashes
    normalized = normalized.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '');

    // Keep known repository-relative roots as-is.
    if (/^(assets|save)\//i.test(normalized) || /^musicBib\.json$/i.test(normalized)) {
        return normalized.replace(/^\/+/, '');
    }

    // If path contains an assets/save anchor deeper in an absolute path, keep from that anchor.
    const rootedAnchor = normalized.match(/(?:^|\/)(assets|save)\/.*$/i);
    if (rootedAnchor) {
        normalized = rootedAnchor[0].replace(/^\/+/, '');
        return normalized;
    }

    // Legacy fallback: detect collection anchor and explicitly root it under assets/.
    const collectionAnchor = normalized.match(/(Album\s+\d[^/]*|Single)\/.*$/i);
    if (collectionAnchor) {
        normalized = `assets/${collectionAnchor[0]}`;
    }

    return normalized.replace(/^\/+/, '');
};

export const resolveAssetCandidates = (assetPath: string, includeLocalFallback: boolean = true): string[] => {
    const normalized = normalizeRepositoryRelativePath(assetPath);
    if (!normalized) return [];
    if (ABSOLUTE_URL_REGEX.test(normalized)) return [normalized];

    const encodedPath = toEncodedUrlPath(normalized);
    const candidates: string[] = [];

    if (MEDIA_BASE_URL) {
        // The R2 bucket stores files without the 'assets/' prefix
        const remotePath = encodedPath.replace(/^assets\//i, '');
        candidates.push(`${MEDIA_BASE_URL}/${remotePath}`);
    }

    if (includeLocalFallback) {
        if (BASE_URL !== '/') {
            candidates.push(`${BASE_URL}/${encodedPath}`);
        }
        if (BASE_URL === '/') {
            candidates.push(`/${encodedPath}`);
        }
    }

    return Array.from(new Set(candidates));
};

export const resolvePreferredAssetUrl = (assetPath: string): string => {
    return resolveAssetCandidates(assetPath)[0] || '';
};

export const resolveRepositoryRelativePath = normalizeRepositoryRelativePath;
