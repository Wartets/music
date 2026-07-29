// Tab synchronization service: uses SharedWorker when available and falls back to BroadcastChannel

import { routeForAlbum, routeForArtist } from '../utils/urlRoutes';

type TabMessage = { type: string; payload?: any };

class TabSync {
    private port: MessagePort | null = null;
    private bc: BroadcastChannel | null = null;
    private listeners: Record<string, ((p: any) => void)[]> = {};
    private tabId: string = '';

    init() {
        if (typeof window === 'undefined') return;

        this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

        // Try SharedWorker first
        try {
            // Vite-compatible import
            const worker = new SharedWorker(new URL('../workers/tabSync.shared.ts', import.meta.url), { type: 'module' });
            this.port = worker.port;
            this.port.start?.();
            this.port.onmessage = (ev: MessageEvent<TabMessage>) => this.handleIncoming(ev.data);
        } catch (e) {
            // Fallback to BroadcastChannel
            if ('BroadcastChannel' in window) {
                try {
                    this.bc = new BroadcastChannel('music-library-tab-sync');
                    this.bc.onmessage = (ev: MessageEvent<TabMessage>) => this.handleIncoming(ev.data);
                } catch (err) {
                    // last resort: listen to storage events (handled elsewhere)
                    this.bc = null;
                }
            }
        }

        // Always listen for local persistence events so we can relay them
        window.addEventListener('music-persistence-saved', (e: Event) => {
            const detail = (e as CustomEvent).detail;
            this.broadcast({ type: 'persistence-updated', payload: detail });
        });
    }

    private handleIncoming(msg: TabMessage) {
        if (!msg || typeof msg.type !== 'string') return;
        // Attach origin info
        const payloadWithOrigin = { ...msg, origin: (msg as any).origin || null };
        // Re-dispatch as DOM CustomEvent for existing app listeners
        window.dispatchEvent(new CustomEvent('tab-sync-message', { detail: payloadWithOrigin }));

        const handlers = this.listeners[msg.type] || [];
        handlers.forEach(h => h(msg.payload));
    }

    broadcast(msg: TabMessage) {
        try {
            const withOrigin = { ...msg, origin: this.tabId } as TabMessage & { origin: string };
            if (this.port) {
                this.port.postMessage(withOrigin as any);
            }
            if (this.bc) {
                this.bc.postMessage(withOrigin as any);
            }
            // Also dispatch locally so this tab processes the message the same way
            this.handleIncoming(withOrigin as any);
        } catch (e) {
            // ignore
        }
    }

    on(type: string, handler: (payload: any) => void) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(handler);
    }

    isRemoteOrigin(origin?: string | null): boolean {
        return Boolean(origin && origin !== this.tabId);
    }

    private openNewTab(url: string) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');

        // Some browsers may still populate opener; sever it defensively.
        if (opened) {
            try {
                opened.opener = null;
            } catch {
                // Ignore cross-origin or restricted-window errors.
            }
        }

        return opened;
    }

    getCurrentTabId(): string {
        return this.tabId;
    }

    openInNewTab(action: string, payload?: any) {
        const url = new URL(window.location.href);

        if (action === 'openTrack' && payload?.trackId) {
            const short = String(payload.trackId).slice(0, 8);
            url.pathname = `/t/${short}`;
            url.search = '';
            url.hash = '';
            this.openNewTab(url.toString());
            return;
        }

        if (action === 'openArtist' && payload?.artist) {
            url.pathname = routeForArtist(String(payload.artist));
            url.search = '';
            url.hash = '';
            this.openNewTab(url.toString());
            return;
        }

        if (action === 'openAlbum' && payload?.album) {
            url.pathname = routeForAlbum(String(payload.album));
            url.search = '';
            url.hash = '';
            this.openNewTab(url.toString());
            return;
        }

        // Fallback query format for batch or custom actions
        url.searchParams.set('openAction', action);
        if (payload) {
            try {
                url.searchParams.set('openPayload', JSON.stringify(payload));
            } catch {
                // ignore
            }
        }

        this.openNewTab(url.toString());
    }
}

export const tabSync = new TabSync();

