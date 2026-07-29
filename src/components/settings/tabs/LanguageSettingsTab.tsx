import React from 'react';
import { Globe, Check } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';
import { SUPPORTED_LOCALES } from '../../../i18n';
import type { Locale } from '../../../i18n';

export const LanguageSettingsTab: React.FC = () => {
    const { locale, setLocale, t, isLoading } = useTranslation();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
                <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-3">
                    <Globe className="text-dominant" size={24} />
                    {t('settings.language.title')}
                </h2>
                <p className="text-sm text-gray-500 mb-8">{t('settings.language.description')}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {SUPPORTED_LOCALES.map(loc => {
                        const isActive = locale === loc.code;
                        return (
                            <button
                                key={loc.code}
                                onClick={() => setLocale(loc.code as Locale)}
                                disabled={isLoading}
                                className={`relative flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                                    isActive
                                        ? 'bg-dominant/15 border-dominant/40 shadow-lg shadow-dominant/10'
                                        : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
                                } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-white">{loc.nativeName}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">{loc.name}</div>
                                </div>
                                {isActive && (
                                    <div className="w-6 h-6 rounded-full bg-dominant flex items-center justify-center flex-shrink-0">
                                        <Check size={14} className="text-on-dominant" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
