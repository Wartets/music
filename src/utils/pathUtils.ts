const PATH_SEPARATOR = '/';

export const normalizePath = (input: string | null | undefined): string => {
    const normalized = String(input || '')
        .replace(/\\+/g, PATH_SEPARATOR)
        .replace(/\/+/g, PATH_SEPARATOR)
        .trim();

    return normalized.replace(/^\/+|\/+$/g, '');
};

export const splitPathSegments = (path: string | null | undefined): string[] => {
    return normalizePath(path).split(PATH_SEPARATOR).filter(Boolean);
};

export const getPathBasename = (path: string | null | undefined): string => {
    const segments = splitPathSegments(path);
    return segments.length > 0 ? segments[segments.length - 1] : 'Unknown Folder';
};

export const joinPathSegments = (segments: string[]): string => {
    return segments
        .map(segment => segment.trim())
        .filter(Boolean)
        .join(PATH_SEPARATOR);
};

export const getParentPath = (path: string | null | undefined): string => {
    const segments = splitPathSegments(path);
    if (segments.length <= 1) {
        return '';
    }
    return joinPathSegments(segments.slice(0, -1));
};

export const isPathWithin = (basePath: string | null | undefined, candidatePath: string | null | undefined): boolean => {
    const base = normalizePath(basePath).toLowerCase();
    const candidate = normalizePath(candidatePath).toLowerCase();

    if (!base) {
        return Boolean(candidate);
    }

    return candidate === base || candidate.startsWith(`${base}${PATH_SEPARATOR}`);
};

export const getDirectChildPath = (parentPath: string | null | undefined, candidatePath: string | null | undefined): string | null => {
    const parentSegments = splitPathSegments(parentPath);
    const candidateSegments = splitPathSegments(candidatePath);

    if (candidateSegments.length === 0) {
        return null;
    }

    if (parentSegments.length > candidateSegments.length) {
        return null;
    }

    for (let i = 0; i < parentSegments.length; i++) {
        if (parentSegments[i].toLowerCase() !== candidateSegments[i].toLowerCase()) {
            return null;
        }
    }

    if (candidateSegments.length === parentSegments.length) {
        return null;
    }

    return joinPathSegments(candidateSegments.slice(0, parentSegments.length + 1));
};
