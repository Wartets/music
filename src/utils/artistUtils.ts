const ARTIST_SEPARATORS_REGEX = /\s*(?:;|\||\\\\|\/|,|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b)\s*/i;

const normalizeArtistToken = (value: string): string => {
    return value.replace(/\s+/g, ' ').trim();
};

const splitArtistText = (value: string): string[] => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return [];
    }

    return normalized
        .split(ARTIST_SEPARATORS_REGEX)
        .map(normalizeArtistToken)
        .filter(Boolean);
};

export const normalizeArtists = (rawArtists: unknown): string[] => {
    if (Array.isArray(rawArtists)) {
        const seen = new Set<string>();
        const result: string[] = [];

        rawArtists.forEach(entry => {
            splitArtistText(String(entry || '')).forEach(name => {
                const key = name.toLocaleLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(name);
                }
            });
        });

        return result;
    }

    if (typeof rawArtists === 'string') {
        return splitArtistText(rawArtists);
    }

    return [];
};

export const getArtistsDisplayName = (rawArtists: unknown, fallback = 'Unknown Artist'): string => {
    const artists = normalizeArtists(rawArtists);
    return artists.length > 0 ? artists.join(', ') : fallback;
};

export const getPrimaryArtist = (rawArtists: unknown, fallback = 'Unknown Artist'): string => {
    const artists = normalizeArtists(rawArtists);
    return artists[0] || fallback;
};
