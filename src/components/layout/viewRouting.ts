export type ViewType =
    | 'Dashboard'
    | 'SearchResults'
    | 'AllTracks'
    | 'DetailedHistory'
    | 'Albums'
    | 'Artists'
    | 'Genres'
    | 'Years'
    | 'Folders'
    | 'Formats'
    | 'Favorites'
    | 'Playlists'
    | 'Settings'
    | 'AlbumDetail'
    | 'ArtistDetail'
    | 'SongDetail'
    | 'BigScreen'
    | 'Queue';

export interface NavigationEntry {
    view: ViewType;
    data: unknown;
}

export const DEFAULT_VIEW: ViewType = 'Dashboard';

export const VALID_VIEWS: ReadonlySet<ViewType> = new Set([
    'Dashboard', 'SearchResults', 'AllTracks', 'DetailedHistory', 'Albums', 'Artists', 'Genres', 'Years',
    'Folders', 'Formats', 'Favorites', 'Playlists', 'Settings', 'AlbumDetail', 'ArtistDetail', 'SongDetail',
    'BigScreen', 'Queue'
]);

export const isViewType = (view: unknown): view is ViewType => {
    return typeof view === 'string' && VALID_VIEWS.has(view as ViewType);
};

export const resolveViewType = (view: unknown, fallback: ViewType = DEFAULT_VIEW): ViewType => {
    return isViewType(view) ? view : fallback;
};

export const normalizeHistoryEntry = (entry: unknown): NavigationEntry => {
    const candidate = typeof entry === 'object' && entry !== null ? entry as { view?: unknown; data?: unknown } : null;

    return {
        view: resolveViewType(candidate?.view),
        data: candidate?.data ?? null
    };
};

export const normalizeHistoryEntries = (entries: unknown): NavigationEntry[] => {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [{ view: DEFAULT_VIEW, data: null }];
    }

    const normalized = entries.map(normalizeHistoryEntry).filter((entry) => isViewType(entry.view));
    return normalized.length > 0 ? normalized : [{ view: DEFAULT_VIEW, data: null }];
};

const VIEW_TO_PRIMARY_TAB: Readonly<Partial<Record<ViewType, ViewType>>> = {
    SearchResults: 'AllTracks',
    AlbumDetail: 'Albums',
    ArtistDetail: 'Artists',
    SongDetail: 'AllTracks'
};

export const resolvePrimaryTabView = (
    view: ViewType,
    primaryTabs: readonly ViewType[],
    fallback: ViewType = DEFAULT_VIEW
): ViewType => {
    const mapped = VIEW_TO_PRIMARY_TAB[view] ?? view;
    return primaryTabs.includes(mapped) ? mapped : fallback;
};