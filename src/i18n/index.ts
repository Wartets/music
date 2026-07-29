import en from './locales/en';
import type { TranslationSchema } from './locales/en';

export type Locale = 'en' | 'fr' | 'it';

export interface LocaleMeta {
    code: Locale;
    name: string;
    nativeName: string;
}

export const SUPPORTED_LOCALES: LocaleMeta[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano' },
];

const localeModules: Record<Locale, () => Promise<{ default: TranslationSchema }>> = {
    en: () => Promise.resolve({ default: en }),
    fr: () => import('./locales/fr'),
    it: () => import('./locales/it'),
};

const loadedLocales = new Map<Locale, TranslationSchema>();
loadedLocales.set('en', en);

export async function loadLocale(locale: Locale): Promise<TranslationSchema> {
    const cached = loadedLocales.get(locale);
    if (cached) return cached;

    const mod = await localeModules[locale]();
    loadedLocales.set(locale, mod.default);
    return mod.default;
}

export function getLoadedLocale(locale: Locale): TranslationSchema | undefined {
    return loadedLocales.get(locale);
}

export function detectBrowserLocale(): Locale {
    const languages = navigator.languages || [navigator.language];
    for (const lang of languages) {
        const code = lang.split('-')[0].toLowerCase();
        if (SUPPORTED_LOCALES.some(l => l.code === code)) {
            return code as Locale;
        }
    }
    return 'en';
}

export function isLocale(value: string): value is Locale {
    return SUPPORTED_LOCALES.some(l => l.code === value);
}

export { en };
export type { TranslationSchema };

