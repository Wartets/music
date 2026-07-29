import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { en, loadLocale, detectBrowserLocale, isLocale, SUPPORTED_LOCALES } from './index';
import type { Locale, TranslationSchema } from './index';
import { persistenceService } from '../services/persistence';

type FlatKeys<T, Prefix extends string = ''> = T extends object
    ? { [K in keyof T]: FlatKeys<T[K], Prefix extends '' ? `${K & string}` : `${Prefix}.${K & string}`> }[keyof T]
    : Prefix;

export type TranslationKey = FlatKeys<TranslationSchema>;

interface I18nContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: TranslationKey, params?: Record<string, string | number>) => string;
    isLoading: boolean;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = 'i18n_locale';
const PROMPT_DISMISSED_KEY = 'i18n_prompt_dismissed';

function resolveKey(translations: TranslationSchema, key: string): string {
    const parts = key.split('.');
    let current: unknown = translations;
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') return key;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : key;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        const value = params[key];
        return value !== undefined ? String(value) : `{${key}}`;
    });
}

function getSavedLocale(): Locale | null {
    const saved = persistenceService.get(STORAGE_KEY);
    if (typeof saved === 'string' && isLocale(saved)) return saved;
    return null;
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [translations, setTranslations] = useState<TranslationSchema>(en);
    const [locale, setLocaleState] = useState<Locale>(() => getSavedLocale() || 'en');
    const [isLoading, setIsLoading] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const detectedLocaleRef = useRef<Locale>('en');

    useEffect(() => {
        const saved = getSavedLocale();
        if (saved) {
            if (saved !== 'en') {
                setIsLoading(true);
                loadLocale(saved).then(t => {
                    setTranslations(t);
                    setLocaleState(saved);
                    setIsLoading(false);
                });
            }
            return;
        }

        const detected = detectBrowserLocale();
        detectedLocaleRef.current = detected;
        if (detected !== 'en') {
            const dismissed = persistenceService.get(PROMPT_DISMISSED_KEY);
            if (!dismissed) {
                setShowPrompt(true);
            }
        }
    }, []);

    const setLocale = useCallback(async (newLocale: Locale) => {
        if (newLocale === locale && translations === en && newLocale === 'en') return;
        setIsLoading(true);
        const t = await loadLocale(newLocale);
        setTranslations(t);
        setLocaleState(newLocale);
        persistenceService.set(STORAGE_KEY, newLocale);
        setIsLoading(false);
        document.documentElement.lang = newLocale;
    }, [locale, translations]);

    const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
        const raw = resolveKey(translations, key);
        return interpolate(raw, params);
    }, [translations]);

    const handlePromptAccept = useCallback(() => {
        setShowPrompt(false);
        setLocale(detectedLocaleRef.current);
    }, [setLocale]);

    const handlePromptDismiss = useCallback(() => {
        setShowPrompt(false);
        persistenceService.set(PROMPT_DISMISSED_KEY, true);
        persistenceService.set(STORAGE_KEY, 'en');
    }, []);

    const contextValue = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale,
        t,
        isLoading,
    }), [locale, setLocale, t, isLoading]);

    const detectedMeta = SUPPORTED_LOCALES.find(l => l.code === detectedLocaleRef.current);

    return (
        <I18nContext.Provider value={contextValue}>
            {children}
            {showPrompt && detectedMeta && (
                <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-[90vw] shadow-2xl animate-in zoom-in-95 duration-300">
                        <h2 className="text-lg font-black text-white mb-2">
                            {t('languagePrompt.title')}
                        </h2>
                        <p className="text-sm text-gray-400 mb-6">
                            {t('languagePrompt.message', { language: detectedMeta.nativeName })}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePromptDismiss}
                                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                            >
                                {t('languagePrompt.dismiss')}
                            </button>
                            <button
                                onClick={handlePromptAccept}
                                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-on-dominant bg-dominant hover:brightness-110 transition-all shadow-lg"
                            >
                                {t('languagePrompt.confirm', { language: detectedMeta.nativeName })}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </I18nContext.Provider>
    );
};

export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useTranslation must be used within I18nProvider');
    return context;
}

