import React from 'react';
import { ExternalLink, User } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';
import { developmentDependencyLinks, runtimeDependencyLinks } from '../../../data/packageMetadata';

export const CredentialsSettingsTab: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl">
                <h2 className="text-2xl font-black text-white mb-3 flex items-center gap-3">
                    <User className="text-dominant" size={24} />
                    {t('settings.credentials.title')}
                </h2>
                <p className="text-sm text-gray-500 mb-8">{t('settings.credentials.description')}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div className="p-5 rounded-2xl bg-black/20 border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t('settings.credentials.author')}</div>
                        <div className="text-sm font-bold text-white mb-2">{t('settings.credentials.authorName')}</div>
                        <a
                            href="https://wartets.github.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-dominant hover:text-dominant-light transition-colors"
                        >
                            {t('settings.credentials.portfolio')}
                            <ExternalLink size={14} />
                        </a>
                    </div>

                    <div className="p-5 rounded-2xl bg-black/20 border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t('settings.credentials.productLicense')}</div>
                        <div className="text-sm font-bold text-white mb-2">{t('settings.credentials.productLicenseDesc')}</div>
                        <a
                            href="https://github.com/Wartets/music/blob/main/LICENSE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-dominant hover:text-dominant-light transition-colors"
                        >
                            {t('settings.credentials.viewLicense')}
                            <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-black/20 border border-white/10 mb-8">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t('settings.credentials.musicAttribution')}</div>
                    <p className="text-xs text-gray-300 leading-relaxed mb-3">
                        {t('settings.credentials.musicAttributionDesc')}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href="https://github.com/Wartets/music"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-200 hover:bg-white/10 transition-all"
                        >
                            {t('settings.credentials.sourceRepository')}
                            <ExternalLink size={12} />
                        </a>
                        <a
                            href="https://wartets.github.io/music/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-200 hover:bg-white/10 transition-all"
                        >
                            {t('settings.credentials.liveSite')}
                            <ExternalLink size={12} />
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="p-5 rounded-2xl bg-black/20 border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">{t('settings.credentials.runtimeDeps')}</div>
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                            {runtimeDependencyLinks.map(pkg => (
                                <a
                                    key={pkg.name}
                                    href={pkg.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5 text-xs text-gray-200 hover:bg-white/10 transition-colors"
                                >
                                    <span className="font-bold">{pkg.name} <span className="text-gray-500 font-medium">{pkg.version}</span></span>
                                    <ExternalLink size={14} className="shrink-0 text-gray-500" />
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-black/20 border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">{t('settings.credentials.devDeps')}</div>
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                            {developmentDependencyLinks.map(pkg => (
                                <a
                                    key={pkg.name}
                                    href={pkg.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5 text-xs text-gray-200 hover:bg-white/10 transition-colors"
                                >
                                    <span className="font-bold">{pkg.name} <span className="text-gray-500 font-medium">{pkg.version}</span></span>
                                    <ExternalLink size={14} className="shrink-0 text-gray-500" />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

