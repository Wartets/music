import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { UIProvider } from './contexts/UIContext';
import { I18nProvider } from './i18n/I18nContext';
import './index.css';

const MAX_OPEN_PAYLOAD_LENGTH = 16 * 1024;

const isSerializablePayload = (value: unknown): boolean => {
    if (value === null) return true;
    const valueType = typeof value;
    return valueType === 'string' || valueType === 'number' || valueType === 'boolean' || Array.isArray(value) || valueType === 'object';
};

const parseOpenPayload = (raw: string | null): unknown => {
    if (!raw) return null;

    if (raw.length > MAX_OPEN_PAYLOAD_LENGTH) {
        console.warn('Ignoring openPayload: payload exceeds size limit');
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return isSerializablePayload(parsed) ? parsed : null;
    } catch (error) {
        console.warn('Ignoring openPayload: failed to parse payload', error);
        return null;
    }
};

// Note: I18nProvider at outermost to allow all components to access translations
// Note: UIProvider must be at the top level to allow other providers to show toasts
// Note: PlayerProvider must be a parent of ThemeProvider because ThemeProvider uses usePlayer()
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary fallbackComponent={() => null}>
            <I18nProvider>
                <UIProvider>
                    <LibraryProvider>
                        <PlayerProvider>
                            <ThemeProvider>
                                <App />
                            </ThemeProvider>
                        </PlayerProvider>
                    </LibraryProvider>
                </UIProvider>
            </I18nProvider>
        </ErrorBoundary>
    </React.StrictMode>
);

// Initialize tab-sync (SharedWorker / BroadcastChannel)
import { tabSync } from './services/tabSync';
if (typeof window !== 'undefined') {
    try {
        tabSync.init();
    } catch {
        // ignore
    }

    // If this tab was opened with an openAction param, dispatch it as a tab-sync message
    try {
        const params = new URL(window.location.href).searchParams;
        const action = params.get('openAction');
        const payloadRaw = params.get('openPayload');
        if (action) {
            const payload = parseOpenPayload(payloadRaw);
            // normalize and dispatch so contexts can react
            window.dispatchEvent(new CustomEvent('tab-sync-message', { detail: { type: action, payload } }));
        }

        // Also support short-hash 's' param for direct track links — only dispatch if it looks like a hex prefix
        const short = params.get('s');
        if (short) {
            const trimmed = String(short).trim();
            const isHex = /^[0-9a-fA-F]+$/.test(trimmed);
            const MIN_SHORT_HASH_LEN = 6; // require a minimum prefix length to avoid accidental collisions
            if (isHex && trimmed.length >= MIN_SHORT_HASH_LEN) {
                window.dispatchEvent(new CustomEvent('tab-sync-message', { detail: { type: 'openByShortHash', payload: { short: trimmed } } }));
            } else {
                console.warn('Ignored short-hash param: must be hex and at least', MIN_SHORT_HASH_LEN, 'chars');
            }
        }
    } catch {
        // ignore
    }
}

if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator) {
        const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        const shouldRegisterServiceWorker = import.meta.env.PROD && !isLocalhost;

        window.addEventListener('load', () => {
            if (shouldRegisterServiceWorker) {
                navigator.serviceWorker
                    .register(`${import.meta.env.BASE_URL}sw.js`)
                    .catch(() => {
                        // Ignore service-worker registration errors in unsupported environments.
                    });
                return;
            }

            // In local/dev contexts, clear old registrations and caches to avoid stale blank screens.
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                registrations.forEach((registration) => {
                    registration.unregister().catch(() => {
                        // Ignore cleanup failures.
                    });
                });
            }).catch(() => {
                // Ignore cleanup failures.
            });

            if ('caches' in window) {
                caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {
                    // Ignore cache cleanup failures.
                });
            }
        });
    }

    if ('storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persist().catch(() => {
            // Persistence is best-effort.
        });
    }
}
