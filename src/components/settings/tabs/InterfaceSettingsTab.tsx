import React from 'react';
import { Keyboard, Monitor, Sparkles } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ThemeMode } from '../../../contexts/ThemeContext';
import { useSettingsView } from '../SettingsViewContext';
import { useTranslation } from '../../../i18n/I18nContext';
import { ShortcutEditor } from '../ShortcutEditor';

export const InterfaceSettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { settings: themeSettings, updateSettings, currentPalette, reportBadPalette } = useTheme();
    const {
        setInterfacePreference,
        requestNowPlayingNotifications,
        uiCompactPlayerEnabled,
        setUiCompactPlayerEnabled,
        uiGlowEnabled,
        setUiGlowEnabled,
        uiNowPlayingNotificationsEnabled,
        setUiNowPlayingNotificationsEnabled
    } = useSettingsView();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
                <div
                    className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-[100px] opacity-10 pointer-events-none"
                    style={{ backgroundColor: currentPalette.dominant }}
                />
                <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-3">
                    <Sparkles className="text-dominant" size={24} />
                    {t('settings.interface.dynamicTheming')}
                </h2>
                <p className="text-sm text-gray-500 mb-8">{t('settings.interface.dynamicThemingDesc')}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{t('settings.interface.colorMode')}</label>
                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                                {(['adaptive', 'neutral'] as ThemeMode[]).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => updateSettings({ mode })}
                                        className={`flex-1 py-2 text-xs font-black uppercase rounded-lg transition-all ${themeSettings.mode === mode ? 'bg-dominant text-on-dominant shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={`space-y-4 ${themeSettings.mode !== 'adaptive' ? 'opacity-30 pointer-events-none' : ''}`}>
                            {[
                                { id: 'enforceContrast', label: t('settings.interface.accessibilityContrast'), desc: t('settings.interface.accessibilityContrastDesc') },
                                { id: 'limitAggressiveColors', label: t('settings.interface.limitSaturation'), desc: t('settings.interface.limitSaturationDesc') },
                                { id: 'applyToNonEssentialsOnly', label: t('settings.interface.minimalistAccents'), desc: t('settings.interface.minimalistAccentsDesc') }
                            ].map(option => {
                                const enabled = Boolean(themeSettings[option.id as keyof typeof themeSettings]);
                                return (
                                    <div key={option.id} className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                        <div>
                                            <div className="font-bold text-sm text-white">{option.label}</div>
                                            <div className="text-[10px] text-gray-500">{option.desc}</div>
                                        </div>
                                        <button
                                            onClick={() => updateSettings({ [option.id]: !enabled })}
                                            className={`w-12 h-6 rounded-full transition-all relative ${enabled ? 'bg-dominant' : 'bg-white/10'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-7 bg-black' : 'left-1'}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-black/40 rounded-3xl p-8 border border-white/5 flex flex-col justify-between">
                        <div>
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">{t('settings.interface.aestheticPreview')}</h3>
                            <div
                                className="p-6 rounded-2xl transition-all duration-1000 mb-6 border border-white/5"
                                style={{
                                    backgroundColor: themeSettings.applyToNonEssentialsOnly ? '#111' : currentPalette.dominantDark,
                                    color: currentPalette.onDominant
                                }}
                            >
                                <h4 className="font-black text-xl mb-2">{t('settings.interface.visualFidelity')}</h4>
                                <p className="text-xs opacity-70 mb-6 leading-relaxed">{t('settings.interface.visualFidelityDesc')}</p>
                                <div className="flex gap-3">
                                    <button className="px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-xl" style={{ backgroundColor: currentPalette.dominant, color: currentPalette.onDominant }}>
                                        {t('settings.interface.action')}
                                    </button>
                                    <button className="px-5 py-2 rounded-xl text-[10px] font-black uppercase border border-current opacity-60">
                                        {t('settings.interface.ghost')}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button onClick={reportBadPalette} className="text-[10px] font-black text-gray-500 hover:text-red-400 uppercase tracking-widest transition-colors self-end">
                            {t('settings.interface.reportPoorContrast')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                    <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
                        <Monitor className="text-dominant" size={20} />
                        {t('settings.interface.layout')}
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                            <div>
                                <div className="font-bold text-sm text-white">{t('settings.interface.progressGlow')}</div>
                                <div className="text-[10px] text-gray-500">{t('settings.interface.progressGlowDesc')}</div>
                            </div>
                            <button
                                onClick={() => {
                                    const nextValue = !uiGlowEnabled;
                                    setInterfacePreference('ui_glow', nextValue);
                                    setUiGlowEnabled(nextValue);
                                }}
                                className={`w-12 h-6 rounded-full transition-all relative ${uiGlowEnabled ? 'bg-dominant' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${uiGlowEnabled ? 'left-7 bg-black' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                            <div>
                                <div className="font-bold text-sm text-white">{t('settings.interface.compactPlayer')}</div>
                                <div className="text-[10px] text-gray-500">{t('settings.interface.compactPlayerDesc')}</div>
                            </div>
                            <button
                                onClick={() => {
                                    const nextValue = !uiCompactPlayerEnabled;
                                    setInterfacePreference('ui_compact_player', nextValue);
                                    setUiCompactPlayerEnabled(nextValue);
                                }}
                                className={`w-12 h-6 rounded-full transition-all relative ${uiCompactPlayerEnabled ? 'bg-dominant' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${uiCompactPlayerEnabled ? 'left-7 bg-black' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                            <div>
                                <div className="font-bold text-sm text-white">{t('settings.interface.nowPlayingNotifications')}</div>
                                <div className="text-[10px] text-gray-500">{t('settings.interface.nowPlayingNotificationsDesc')}</div>
                            </div>
                            <button
                                onClick={async () => {
                                    if (uiNowPlayingNotificationsEnabled) {
                                        setInterfacePreference('ui_now_playing_notifications', false);
                                        setUiNowPlayingNotificationsEnabled(false);
                                        return;
                                    }

                                    const allowed = await requestNowPlayingNotifications();
                                    if (!allowed) return;

                                    setInterfacePreference('ui_now_playing_notifications', true);
                                    setUiNowPlayingNotificationsEnabled(true);
                                }}
                                className={`w-12 h-6 rounded-full transition-all relative ${uiNowPlayingNotificationsEnabled ? 'bg-dominant' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${uiNowPlayingNotificationsEnabled ? 'left-7 bg-black' : 'left-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                    <h3 className="text-lg font-black text-white mb-6 flex items-center gap-3">
                        <Keyboard className="text-dominant" size={20} />
                        {t('settings.interface.keyboardShortcuts')}
                    </h3>
                    <p className="text-sm text-gray-500 mb-6">{t('settings.interface.keyboardShortcutsDesc')}</p>
                    <ShortcutEditor />
                </div>
            </div>
        </div>
    );
};
