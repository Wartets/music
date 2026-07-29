export interface GroupedTracks<T> {
    key: string;
    name: string;
    tracks: T[];
    isUnknown?: boolean;
}

interface GroupTracksOptions<T> {
    keyExtractor: (item: T) => string | string[] | null | undefined;
    unknownLabel: string;
    unknownKey?: string;
    shouldGroupUnknown?: boolean;
    normalizeKey?: (value: string) => string;
    nameResolver?: (value: string) => string;
    isUnknownValue?: (value: string) => boolean;
}

const toArray = (value: string | string[] | null | undefined): string[] => {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        return [value];
    }
    return [];
};

const defaultNormalizeKey = (value: string) => value.toLowerCase();

export const groupTracks = <T>(items: T[], options: GroupTracksOptions<T>) => {
    const {
        keyExtractor,
        unknownLabel,
        unknownKey = '__unknown__',
        shouldGroupUnknown = true,
        normalizeKey = defaultNormalizeKey,
        nameResolver = (value: string) => value,
        isUnknownValue
    } = options;

    const groups = new Map<string, GroupedTracks<T>>();
    const unknownTracks: T[] = [];

    items.forEach(item => {
        const rawValues = toArray(keyExtractor(item))
            .map(value => value.trim())
            .filter(Boolean);

        const normalizedValues = Array.from(new Set(rawValues));
        const validValues = normalizedValues.filter(value => !isUnknownValue?.(value));

        if (validValues.length === 0) {
            unknownTracks.push(item);
            return;
        }

        validValues.forEach(value => {
            const key = normalizeKey(value);
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    name: nameResolver(value),
                    tracks: []
                });
            }
            groups.get(key)!.tracks.push(item);
        });
    });

    if (shouldGroupUnknown && unknownTracks.length > 0) {
        groups.set(unknownKey, {
            key: unknownKey,
            name: unknownLabel,
            tracks: unknownTracks,
            isUnknown: true
        });
    }

    return {
        groups,
        unknown: unknownTracks
    };
};

const toGroupList = <T>(groups: Iterable<GroupedTracks<T>>): GroupedTracks<T>[] => Array.from(groups);

export const sortGroupsAlphabeticallyWithUnknownLast = <T>(
    groups: Iterable<GroupedTracks<T>>,
    compare?: (a: GroupedTracks<T>, b: GroupedTracks<T>) => number
): GroupedTracks<T>[] => {
    const comparer = compare || ((a: GroupedTracks<T>, b: GroupedTracks<T>) => a.name.localeCompare(b.name));

    return toGroupList(groups).sort((a, b) => {
        if (a.isUnknown) return 1;
        if (b.isUnknown) return -1;
        return comparer(a, b);
    });
};

export const sortGroupsByCountWithUnknownLast = <T>(
    groups: Iterable<GroupedTracks<T>>,
    tieBreaker?: (a: GroupedTracks<T>, b: GroupedTracks<T>) => number
): GroupedTracks<T>[] => {
    const resolveTie = tieBreaker || ((a: GroupedTracks<T>, b: GroupedTracks<T>) => a.name.localeCompare(b.name));

    return toGroupList(groups).sort((a, b) => {
        if (a.isUnknown) return 1;
        if (b.isUnknown) return -1;

        const countDiff = b.tracks.length - a.tracks.length;
        if (countDiff !== 0) {
            return countDiff;
        }

        return resolveTie(a, b);
    });
};
