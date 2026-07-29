import { TrackItem } from '../types/music';

/**
 * Search Service Configuration
 * Controls search behavior and field weighting for advanced search
 */
export interface SearchConfig {
    /** Enable support for AND, OR, NOT operators */
    advancedOperators: boolean;
    /** Field-specific weight multipliers (0-1, where 1 is normal weight) */
    fieldWeights?: {
        title: number;
        artist: number;
        album: number;
        genre: number;
        year: number;
        format: number;
    };
}

/**
 * Search Service
 * Integrates search engine using a Web Worker to ensure the UI thread remains unblocked.
 * Supports advanced operators (AND, OR, NOT) and field-based weighting.
 */
export class SearchService {
    private worker: Worker | null = null;
    private searchCallbacks: Map<number, (results: TrackItem[]) => void> = new Map();
    private currentSearchId: number = 0;
    private isReady: boolean = false;
    private onReadyCallbacks: (() => void)[] = [];
    private config: SearchConfig = {
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

    constructor(config?: Partial<SearchConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        this.initWorker();
    }

    private initWorker() {
        if (typeof window !== 'undefined' && window.Worker) {
            // Correct Vite Web Worker instantiation
            this.worker = new Worker(
                new URL('../workers/searchWorker.ts', import.meta.url),
                { type: 'module' }
            );

            this.worker.onmessage = (e: MessageEvent) => {
                const { type, payload } = e.data;
                if (type === 'INIT_DONE') {
                    this.isReady = true;
                    this.onReadyCallbacks.forEach(cb => cb());
                    this.onReadyCallbacks = [];
                } else if (type === 'SEARCH_DONE') {
                    const cb = this.searchCallbacks.get(payload.id);
                    if (cb) {
                        cb(payload.results);
                        this.searchCallbacks.delete(payload.id);
                    }
                } else if (type === 'SEARCH_ERROR') {
                    const cb = this.searchCallbacks.get(payload.id);
                    if (cb) {
                        console.warn('[SearchService] Worker search error:', payload?.error || 'Unknown worker error');
                        cb([]);
                        this.searchCallbacks.delete(payload.id);
                    }
                }
            };
        }
    }

    /**
     * Initializes the search index using the full library data.
     */
    buildIndex(tracks: TrackItem[]): void {
        if (this.worker) {
            this.isReady = false;
            this.worker.postMessage({ 
                type: 'INIT', 
                payload: tracks,
                config: this.config 
            });
        }
    }

    /**
     * Waits until the worker is initialized with the dataset.
     */
    async waitForReady(): Promise<void> {
        if (this.isReady) return;
        return new Promise((resolve) => {
            this.onReadyCallbacks.push(resolve);
        });
    }

    /**
     * Performs an instant "As You Type" search query across the library.
     * Supports advanced operators: AND, OR, NOT
     * Examples:
     *   - "jazz piano" → tracks matching both jazz AND piano
     *   - "jazz OR classical" → tracks matching either jazz OR classical
     *   - "jazz NOT piano" → jazz tracks excluding piano
     *   - "artist:Miles Davis" → field-specific search
     * @param query - The user's input string
     * @returns Promise of Array of matched tracks sorted by relevance
     */
    async search(query: string): Promise<TrackItem[]> {
        if (!this.worker) {
            return [];
        }

        await this.waitForReady();

        return new Promise((resolve) => {
            const id = ++this.currentSearchId;
            this.searchCallbacks.set(id, resolve);
            this.worker!.postMessage({ 
                type: 'SEARCH', 
                payload: { query, id, limit: 1000 },
                config: this.config 
            });
        });
    }

    /**
     * Update search configuration at runtime
     */
    setConfig(config: Partial<SearchConfig>): void {
        this.config = { ...this.config, ...config };
        if (this.worker) {
            this.worker.postMessage({ type: 'CONFIG_UPDATE', config: this.config });
        }
    }

    evaluateSmartQuery(_criteria: string): TrackItem[] {
        return [];
    }
}

export const searchService = new SearchService();
