import { dbService } from '../services/db';

const PATH_FIELD_NAMES = new Set(['path', 'dir']);

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isPathLikeKey = (key: string): boolean => {
    return PATH_FIELD_NAMES.has(key) || /path$/i.test(key) || /dir$/i.test(key);
};

export const sanitizeExportPath = (pathValue: unknown): string => {
    if (typeof pathValue !== 'string') {
        return '';
    }

    // Normalize Windows-style absolute paths to repository-relative paths where possible.
    // The database resolver already handles absolute local paths, repository anchors,
    // and URL passthroughs.
    return dbService.getRepositoryRelativePath(pathValue);
};

export const sanitizeExportPayload = <T>(input: T): T => {
    const seen = new WeakMap<object, any>();

    const walk = (value: unknown, parentKey?: string): unknown => {
        if (typeof value === 'string') {
            return parentKey && isPathLikeKey(parentKey) ? sanitizeExportPath(value) : value;
        }

        if (!isObject(value)) {
            return value;
        }

        if (seen.has(value)) {
            return seen.get(value);
        }

        const output: any = Array.isArray(value) ? [] : {};
        seen.set(value, output);

        for (const [key, childValue] of Object.entries(value)) {
            output[key] = walk(childValue, key);
        }

        return output;
    };

    return walk(input) as T;
};

