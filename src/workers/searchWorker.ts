import { TrackItem } from '../types/music';
import { isPathWithin, normalizePath } from '../utils/pathUtils';

// Configuration for search behavior
interface WorkerConfig {
    advancedOperators: boolean;
    fieldWeights?: {
        title: number;
        artist: number;
        album: number;
        genre: number;
        year: number;
        format: number;
    };
}

interface SearchEntry {
    track: TrackItem;
    title: string;
    artists: string;
    album: string;
    genreText: string;
    year: string;
    format: string;
    folder: string;
    combinedText: string;
    tokenSet: Set<string>;
}

interface QueryNode {
    type: 'AND' | 'OR' | 'NOT' | 'TERM';
    value?: string;
    children?: QueryNode[];
}

type WorkerMessage = {
    type?: unknown;
    payload?: unknown;
    config?: unknown;
};

type SearchRequestPayload = {
    query?: unknown;
    id?: unknown;
    limit?: unknown;
};

const MAX_QUERY_LENGTH = 1024;
const MAX_RESULTS = 1000;

const splitGenres = (genre: string | null | undefined): string[] => {
    if (!genre) return [];
    return genre.split(' / ').map(g => g.trim().toLowerCase()).filter(g => g.length > 0);
};

const normalizeText = (value: unknown): string => {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const tokenizeQuery = (query: string): string[] => {
    return (query.match(/(?:[^\s"]+|"[^"]*")+/g) || [])
        .map(token => token.trim())
        .filter(Boolean);
};

const tokenizeForIndex = (value: string): string[] => {
    return value.match(/[a-z0-9]+/g) || [];
};

const parseFilterToken = (token: string): { key: string; value: string } | null => {
    const separatorIndex = token.indexOf(':');
    if (separatorIndex <= 0) {
        return null;
    }

    const rawKey = token.slice(0, separatorIndex).toLowerCase();
    let rawValue = token.slice(separatorIndex + 1).trim();
    if (!rawValue) {
        return null;
    }

    if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
        rawValue = rawValue.slice(1, -1);
    }

    return {
        key: rawKey,
        value: rawValue.toLowerCase()
    };
};

const isWorkerMessage = (value: unknown): value is WorkerMessage => {
    return typeof value === 'object' && value !== null;
};

const isWorkerConfig = (value: unknown): value is WorkerConfig => {
    if (typeof value !== 'object' || value === null) return false;
    const maybe = value as Record<string, unknown>;
    return typeof maybe.advancedOperators === 'boolean'
        && (maybe.fieldWeights === undefined || typeof maybe.fieldWeights === 'object');
};

const isSearchRequestPayload = (value: unknown): value is SearchRequestPayload => {
    return typeof value === 'object' && value !== null;
};

const isTrackArray = (value: unknown): value is TrackItem[] => {
    return Array.isArray(value);
};

const buildSearchEntry = (track: TrackItem): SearchEntry => {
    const title = normalizeText(track.metadata?.title || track.logic?.track_name || '');
    const artists = normalizeText((track.metadata?.artists || []).join(' '));
    const album = normalizeText(track.metadata?.album || '');
    const genreText = normalizeText((track.metadata?.genre || '').split(' / ').join(' '));
    const year = normalizeText(track.metadata?.year || '');
    const format = normalizeText(track.file?.ext || '');
    const folder = normalizeText(track.logic?.hierarchy?.folder || track.file?.dir || '');
    const combinedText = [title, artists, album, genreText, year, format, folder].filter(Boolean).join(' ');
    const tokenSet = new Set(tokenizeForIndex(combinedText));

    return {
        track,
        title,
        artists,
        album,
        genreText,
        year,
        format,
        folder,
        combinedText,
        tokenSet
    };
};

let tracksCache: TrackItem[] = [];
let searchEntries: SearchEntry[] = [];
let tokenIndex: Map<string, Set<number>> = new Map();
let yearIndex: Map<string, Set<number>> = new Map();
let allTrackIndices: Set<number> = new Set();
let workerConfig: WorkerConfig = {
    advancedOperators: true,
    fieldWeights: {
        title: 1.0,
        artist: 0.9,
        album: 0.8,
        genre: 0.7,
        year: 0.6,
        format: 0.5
    }
};

const rebuildIndex = (tracks: TrackItem[]): void => {
    tracksCache = tracks;
    searchEntries = tracks.map(buildSearchEntry);
    tokenIndex = new Map();
    yearIndex = new Map();
    allTrackIndices = new Set();

    searchEntries.forEach((entry, index) => {
        allTrackIndices.add(index);
        entry.tokenSet.forEach((token) => {
            let set = tokenIndex.get(token);
            if (!set) {
                set = new Set<number>();
                tokenIndex.set(token, set);
            }
            set.add(index);
        });

        if (entry.year) {
            let set = yearIndex.get(entry.year);
            if (!set) {
                set = new Set<number>();
                yearIndex.set(entry.year, set);
            }
            set.add(index);
        }
    });
};

const getWeights = () => workerConfig.fieldWeights || {
    title: 1,
    artist: 1,
    album: 1,
    genre: 1,
    year: 1,
    format: 1
};

const candidateIndicesForTokens = (tokens: string[]): Set<number> => {
    if (tokens.length === 0) {
        return new Set(allTrackIndices);
    }

    const normalizedTokens = Array.from(new Set(tokens.map(token => normalizeText(token)).filter(Boolean)));
    if (normalizedTokens.length === 0) {
        return new Set(allTrackIndices);
    }

    let candidateSet: Set<number> | null = null;
    for (const token of normalizedTokens) {
        const indexed = tokenIndex.get(token);
        if (!indexed) {
            return new Set();
        }

        if (!candidateSet) {
            candidateSet = new Set(indexed);
            continue;
        }

        candidateSet = new Set([...candidateSet].filter(index => indexed.has(index)));
        if (candidateSet.size === 0) {
            return candidateSet;
        }
    }

    return candidateSet || new Set(allTrackIndices);
};

const candidateIndicesForTerm = (term: string): Set<number> => {
    const filter = parseFilterToken(term);
    if (filter) {
        const valueTokens = tokenizeForIndex(filter.value);
        if (filter.key === 'year') {
            if (/^\d{4}0s$/.test(filter.value)) {
                const decadeStart = parseInt(filter.value.slice(0, -1), 10);
                const decadeCandidates = new Set<number>();
                for (let year = decadeStart; year < decadeStart + 10; year++) {
                    const yearMatches = yearIndex.get(String(year));
                    if (yearMatches) {
                        yearMatches.forEach(index => decadeCandidates.add(index));
                    }
                }
                return decadeCandidates;
            }

            const exactYearCandidates = yearIndex.get(filter.value);
            return exactYearCandidates ? new Set(exactYearCandidates) : new Set();
        }
        if (filter.key === 'folder' || filter.key === 'album' || filter.key === 'artist' || filter.key === 'genre' || filter.key === 'format') {
            return valueTokens.length > 0 ? candidateIndicesForTokens(valueTokens) : new Set(allTrackIndices);
        }
    }

    const termTokens = tokenizeForIndex(term);
    return termTokens.length > 0 ? candidateIndicesForTokens(termTokens) : new Set(allTrackIndices);
};

const collectCandidateIndices = (node: QueryNode | null): Set<number> => {
    if (!node) {
        return new Set(allTrackIndices);
    }

    switch (node.type) {
        case 'TERM':
            return candidateIndicesForTerm(node.value || '');
        case 'AND': {
            const children = node.children || [];
            if (children.length === 0) return new Set(allTrackIndices);
            return children.reduce<Set<number>>((acc, child, index) => {
                const childSet = collectCandidateIndices(child);
                if (index === 0) {
                    return new Set(childSet);
                }
                return new Set([...acc].filter(candidate => childSet.has(candidate)));
            }, new Set<number>());
        }
        case 'OR': {
            const children = node.children || [];
            if (children.length === 0) return new Set();
            const union = new Set<number>();
            children.forEach(child => {
                collectCandidateIndices(child).forEach(index => union.add(index));
            });
            return union;
        }
        case 'NOT': {
            const excluded = collectCandidateIndices(node.children?.[0] || null);
            return new Set([...allTrackIndices].filter(index => !excluded.has(index)));
        }
        default:
            return new Set(allTrackIndices);
    }
};

const calculateRelevance = (entry: SearchEntry, term: string): number => {
    if (!term) return 0;

    const weights = getWeights();
    let score = 0;
    const normalizedTerm = normalizeText(term);
    const filter = parseFilterToken(term);

    if (filter) {
        const filterValue = filter.value;
        if (filter.key === 'year' && entry.year === filterValue) {
            return 60 * (weights.year ?? 1);
        }
        if (filter.key === 'folder' && entry.folder.includes(normalizeText(filterValue))) {
            return 35 * (weights.genre ?? 1);
        }
        if (filter.key === 'format' && entry.format === filterValue) {
            return 50 * (weights.format ?? 1);
        }
        if (filter.key === 'artist' && entry.artists.includes(filterValue)) {
            return 90 * (weights.artist ?? 1);
        }
        if (filter.key === 'genre' && entry.genreText.includes(filterValue)) {
            return 70 * (weights.genre ?? 1);
        }
        if (filter.key === 'album' && entry.album.includes(filterValue)) {
            return 80 * (weights.album ?? 1);
        }
    }

    if (entry.title === normalizedTerm) score += 100 * (weights.title ?? 1);
    else if (entry.title.includes(normalizedTerm)) score += 50 * (weights.title ?? 1);

    if (entry.artists === normalizedTerm) score += 90 * (weights.artist ?? 1);
    else if (entry.artists.includes(normalizedTerm)) score += 45 * (weights.artist ?? 1);

    if (entry.album === normalizedTerm) score += 80 * (weights.album ?? 1);
    else if (entry.album.includes(normalizedTerm)) score += 40 * (weights.album ?? 1);

    if (splitGenres(entry.genreText).some(g => g === normalizedTerm)) {
        score += 70 * (weights.genre ?? 1);
    } else if (entry.genreText.includes(normalizedTerm)) {
        score += 35 * (weights.genre ?? 1);
    }

    if (entry.year === normalizedTerm) score += 60 * (weights.year ?? 1);
    else if (entry.year.includes(normalizedTerm)) score += 30 * (weights.year ?? 1);

    if (entry.format === normalizedTerm) score += 50 * (weights.format ?? 1);
    else if (entry.format.includes(normalizedTerm)) score += 25 * (weights.format ?? 1);

    return score;
};

const matchesTerm = (entry: SearchEntry, term: string): boolean => {
    const filter = parseFilterToken(term);
    if (filter) {
        const { key, value: val } = filter;
        if (key === 'year') {
            if (/^\d{4}0s$/.test(val)) {
                const decadeStart = parseInt(val.slice(0, -1), 10);
                const year = parseInt(entry.year, 10);
                return !Number.isNaN(year) && year >= decadeStart && year < (decadeStart + 10);
            }
            return entry.year === val;
        }
        if (key === 'folder') {
            const requestedFolder = normalizePath(val).toLowerCase();
            return isPathWithin(requestedFolder, entry.folder);
        }
        if (key === 'format') return entry.format === val;
        if (key === 'artist') return entry.artists.includes(val);
        if (key === 'genre') return splitGenres(entry.genreText).some(g => g === val || g.includes(val));
        if (key === 'album') return entry.album.includes(val);
    }

    return entry.combinedText.includes(normalizedTerm(term));
};

const normalizedTerm = (term: string): string => normalizeText(term);

const parseAdvancedQuery = (tokens: string[]): QueryNode | null => {
    if (tokens.length === 0) return null;

    let orIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].toUpperCase() === 'OR') {
            orIndex = i;
            break;
        }
    }

    if (orIndex >= 0) {
        const left = parseAdvancedQuery(tokens.slice(0, orIndex));
        const right = parseAdvancedQuery(tokens.slice(orIndex + 1));
        if (left && right) {
            return { type: 'OR', children: [left, right] };
        }
    }

    let notIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].toUpperCase() === 'NOT') {
            notIndex = i;
            break;
        }
    }

    if (notIndex >= 0) {
        const operand = parseAdvancedQuery(tokens.slice(notIndex + 1));
        if (operand) {
            return { type: 'NOT', children: [operand] };
        }
    }

    let andIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].toUpperCase() === 'AND') {
            andIndex = i;
            break;
        }
    }

    if (andIndex >= 0) {
        const left = parseAdvancedQuery(tokens.slice(0, andIndex));
        const right = parseAdvancedQuery(tokens.slice(andIndex + 1));
        if (left && right) {
            return { type: 'AND', children: [left, right] };
        }
    }

    if (tokens.length > 1) {
        const left = { type: 'TERM' as const, value: tokens[0] };
        const right = parseAdvancedQuery(tokens.slice(1));
        if (right) {
            return { type: 'AND', children: [left, right] };
        }
    }

    return { type: 'TERM', value: tokens[0] };
};

const evaluateQueryNode = (node: QueryNode | null, entry: SearchEntry): boolean => {
    if (!node) return true;

    switch (node.type) {
        case 'TERM':
            return node.value ? matchesTerm(entry, node.value) : true;
        case 'AND':
            return node.children ? node.children.every(child => evaluateQueryNode(child, entry)) : true;
        case 'OR':
            return node.children ? node.children.some(child => evaluateQueryNode(child, entry)) : false;
        case 'NOT':
            return node.children ? !evaluateQueryNode(node.children[0], entry) : true;
        default:
            return true;
    }
};

const clampLimit = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return MAX_RESULTS;
    }
    return Math.max(1, Math.min(MAX_RESULTS, Math.floor(value)));
};

const isValidQuery = (query: unknown): query is string => {
    return typeof query === 'string';
};

const postSearchDone = (id: unknown, results: TrackItem[]): void => {
    postMessage({ type: 'SEARCH_DONE', payload: { id, results } });
};

const postSearchError = (id: unknown, error: string): void => {
    postMessage({ type: 'SEARCH_ERROR', payload: { id, error } });
};

const handleSearch = (payload: SearchRequestPayload): void => {
    const query = isValidQuery(payload.query) ? payload.query.trim() : '';
    const id = payload.id;
    const limit = clampLimit(payload.limit);

    if (query.length > MAX_QUERY_LENGTH) {
        postSearchError(id, `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`);
        return;
    }

    if (!query) {
        postSearchDone(id, tracksCache.slice(0, limit));
        return;
    }

    const tokens = tokenizeQuery(query.toLowerCase());
    const queryNode = workerConfig.advancedOperators
        ? parseAdvancedQuery(tokens)
        : (tokens.length > 0 ? { type: 'AND' as const, children: tokens.map(token => ({ type: 'TERM' as const, value: token })) } : null);

    const candidates = collectCandidateIndices(queryNode);
    const resultsWithScores = [...candidates]
        .map(index => ({ index, entry: searchEntries[index] }))
        .filter(item => item.entry && evaluateQueryNode(queryNode, item.entry))
        .map(item => {
            const score = tokens.reduce((total, token) => total + calculateRelevance(item.entry, token), 0);
            return { track: item.entry.track, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.track);

    postSearchDone(id, resultsWithScores);
};

self.onmessage = (e: MessageEvent) => {
    const message = e.data;
    if (!isWorkerMessage(message) || typeof message.type !== 'string') {
        return;
    }

    try {
        if (message.type === 'CONFIG_UPDATE') {
            if (isWorkerConfig(message.config)) {
                workerConfig = { ...workerConfig, ...message.config };
            }
            return;
        }

        if (message.type === 'INIT') {
            const payload = message.payload;
            if (isTrackArray(payload)) {
                rebuildIndex(payload);
            } else {
                rebuildIndex([]);
            }

            if (isWorkerConfig(message.config)) {
                workerConfig = { ...workerConfig, ...message.config };
            }

            postMessage({ type: 'INIT_DONE' });
            return;
        }

        if (message.type === 'SEARCH') {
            const payload = isSearchRequestPayload(message.payload) ? message.payload : {};
            handleSearch(payload);
            return;
        }
    } catch (error) {
        const requestId = isSearchRequestPayload(message.payload) ? message.payload.id : undefined;
        postSearchError(requestId, error instanceof Error ? error.message : 'Search worker failed.');
    }
};

