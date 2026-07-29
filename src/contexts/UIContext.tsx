import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { ContextMenuItem } from '../components/shared/ContextMenu';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
    title?: string;
    durationMs?: number;
    subtle?: boolean;
    dedupeKey?: string;
}

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    title?: string;
    subtle?: boolean;
    dedupeKey?: string;
    durationMs: number;
}

interface ToastState {
    active: ToastItem[];
    queue: ToastItem[];
}

const MAX_VISIBLE_TOASTS = 2;
const MAX_QUEUED_TOASTS = 24;

const queueToast = (state: ToastState, toast: ToastItem): ToastState => {
    // Check for duplicate messages: if the exact same message is already shown, skip it
    const duplicate = [...state.active, ...state.queue].some(
        existing => existing.message === toast.message && existing.type === toast.type
    );

    if (duplicate) {
        return state;
    }

    if (state.active.length < MAX_VISIBLE_TOASTS) {
        return {
            ...state,
            active: [...state.active, toast],
        };
    }

    const nextQueue = [...state.queue, toast];
    return {
        ...state,
        queue: nextQueue.slice(-MAX_QUEUED_TOASTS),
    };
};

const removeToastFromState = (state: ToastState, id: string): ToastState => {
    const activeWithout = state.active.filter(toast => toast.id !== id);

    if (activeWithout.length !== state.active.length) {
        if (state.queue.length > 0) {
            const [nextToast, ...remainingQueue] = state.queue;
            return {
                active: [...activeWithout, nextToast],
                queue: remainingQueue,
            };
        }

        return {
            ...state,
            active: activeWithout,
        };
    }

    return {
        ...state,
        queue: state.queue.filter(toast => toast.id !== id),
    };
};

interface UIContextProps {
    showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
    closeContextMenu: () => void;
    contextMenu: { x: number, y: number, items: ContextMenuItem[] } | null;
    showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const UIContext = createContext<UIContextProps | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { t } = useTranslation();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, items: ContextMenuItem[] } | null>(null);
    const [toastState, setToastState] = useState<ToastState>({ active: [], queue: [] });
    const timersRef = useRef<Record<string, number>>({});

    const showContextMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
        setContextMenu({ x, y, items });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const removeToast = useCallback((id: string) => {
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }

        setToastState(prev => removeToastFromState(prev, id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', options: ToastOptions = {}) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dedupeKey = options.dedupeKey || `${type}:${message}`;
        const durationMs = options.durationMs ?? (options.subtle ? 1800 : (type === 'error' ? 4200 : 2800));

        const toast: ToastItem = {
            id,
            message,
            type,
            title: options.title,
            subtle: options.subtle,
            dedupeKey,
            durationMs,
        };

        setToastState(prev => queueToast(prev, toast));
    }, []);

    useEffect(() => {
        toastState.active.forEach(toast => {
            if (timersRef.current[toast.id]) return;
            timersRef.current[toast.id] = window.setTimeout(() => removeToast(toast.id), toast.durationMs);
        });

        const activeIds = new Set(toastState.active.map(toast => toast.id));
        Object.keys(timersRef.current).forEach(id => {
            if (!activeIds.has(id)) {
                clearTimeout(timersRef.current[id]);
                delete timersRef.current[id];
            }
        });
    }, [toastState.active, removeToast]);

    useEffect(() => {
        return () => {
            Object.values(timersRef.current).forEach(timer => clearTimeout(timer));
            timersRef.current = {};
        };
    }, []);

    const toastVisuals = useMemo(() => ({
        success: {
            icon: <CheckCircle2 size={16} />,
            className: 'bg-green-500/15 border-green-400/30 text-green-200'
        },
        error: {
            icon: <AlertCircle size={16} />,
            className: 'bg-red-500/15 border-red-400/35 text-red-200'
        },
        warning: {
            icon: <AlertTriangle size={16} />,
            className: 'bg-amber-500/15 border-amber-300/30 text-amber-100'
        },
        info: {
            icon: <Info size={16} />,
            className: 'bg-dominant/20 border-white/15 text-white/90'
        }
    }), []);

    const contextValue = useMemo(() => ({
        showContextMenu,
        closeContextMenu,
        contextMenu,
        showToast
    }), [showContextMenu, closeContextMenu, contextMenu, showToast]);

    return (
        <UIContext.Provider value={contextValue}>
            {children}
            {toastState.active.length > 0 && (
                <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] md:bottom-24.25 z-[120000] flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,560px)]">
                    {toastState.active.map(toast => {
                        const visuals = toastVisuals[toast.type];
                        const subtleClass = toast.subtle ? 'px-3 py-1.5 rounded-full text-[11px] shadow-lg' : 'px-4 py-2.5 rounded-xl text-sm shadow-2xl';
                        return (
                            <div
                                key={toast.id}
                                className={`w-auto max-w-full border backdrop-blur-xl pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200 ${subtleClass} ${visuals.className}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="opacity-90">{visuals.icon}</span>
                                    <div className="min-w-0">
                                        {toast.title && !toast.subtle && (
                                            <div className="text-[11px] uppercase tracking-widest font-black opacity-75">
                                                {toast.title}
                                            </div>
                                        )}
                                        <div className={`font-medium ${toast.subtle ? 'truncate max-w-[70vw]' : ''}`}>
                                            {toast.message}
                                        </div>
                                    </div>
                                    {!toast.subtle && (
                                        <button
                                            onClick={() => removeToast(toast.id)}
                                            className="ml-1 text-white/50 hover:text-white transition-colors"
                                            title={t('common.dismiss')}
                                            aria-label={t('common.dismissToast')}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {toastState.queue.length > 0 && (
                        <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-white/45 bg-black/30 border border-white/10 rounded-full pointer-events-none">
                            {t('common.queued', { count: toastState.queue.length })}
                        </div>
                    )}
                </div>
            )}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error('useUI must be used within UIProvider');
    return context;
};

