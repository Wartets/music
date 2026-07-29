import React from 'react';
import { BarChart3, Database, FileText, Globe, Palette, User, Volume2 } from 'lucide-react';
import { SettingsViewProvider, useSettingsView } from './SettingsViewContext';
import { AudioSettingsTab } from './tabs/AudioSettingsTab';
import { CredentialsSettingsTab } from './tabs/CredentialsSettingsTab';
import { InterfaceSettingsTab } from './tabs/InterfaceSettingsTab';
import { LanguageSettingsTab } from './tabs/LanguageSettingsTab';
import { MaintenanceSettingsTab } from './tabs/MaintenanceSettingsTab';
import { MetadataSettingsTab } from './tabs/MetadataSettingsTab';
import { StatsSettingsTab } from './tabs/StatsSettingsTab';
import { useTranslation } from '../../i18n/I18nContext';
import type { SettingsTabId } from './settingsTypes';

const SettingsViewLayout: React.FC = () => {
    const { activeTab, setActiveTab } = useSettingsView();
    const { t } = useTranslation();

    const tabDefinitions: Array<{ id: SettingsTabId; label: string; icon: React.ReactNode }> = [
        { id: 'interface', label: t('settings.tabs.interface'), icon: <Palette size={16} /> },
        { id: 'audio', label: t('settings.tabs.audio'), icon: <Volume2 size={16} /> },
        { id: 'metadata', label: t('settings.tabs.metadata'), icon: <FileText size={16} /> },
        { id: 'stats', label: t('settings.tabs.stats'), icon: <BarChart3 size={16} /> },
        { id: 'credentials', label: t('settings.tabs.credentials'), icon: <User size={16} /> },
        { id: 'maintenance', label: t('settings.tabs.maintenance'), icon: <Database size={16} /> },
        { id: 'language', label: t('settings.language.title'), icon: <Globe size={16} /> },
    ];

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'audio':
                return <AudioSettingsTab />;
            case 'metadata':
                return <MetadataSettingsTab />;
            case 'maintenance':
                return <MaintenanceSettingsTab />;
            case 'stats':
                return <StatsSettingsTab />;
            case 'credentials':
                return <CredentialsSettingsTab />;
            case 'language':
                return <LanguageSettingsTab />;
            case 'interface':
            default:
                return <InterfaceSettingsTab />;
        }
    };

    return (
        <div className="h-full flex flex-col p-4 sm:p-5 md:p-8 pt-0 md:pt-24 bg-surface-primary overflow-hidden">
            <div className="max-w-[110rem] mx-auto w-full flex flex-col h-full">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4 md:mb-8">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white">{t('settings.title')}</h1>
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1 md:mt-2">{t('settings.subtitle')}</p>
                    </div>

                    <div className="grid w-full grid-cols-4 md:grid-cols-7 gap-1 bg-white/5 rounded-2xl p-1 border border-white/5 shadow-2xl">
                        {tabDefinitions.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-0.5 sm:gap-2 px-1 sm:px-2 md:px-3 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black transition-all uppercase tracking-widest ${activeTab === tab.id ? 'bg-dominant text-on-dominant shadow-dominant/20 shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                {tab.icon}
                                <span className="truncate">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
                    {renderActiveTab()}
                </div>
            </div>
        </div>
    );
};

export const SettingsView: React.FC<{ initialTab?: string }> = ({ initialTab }) => (
    <SettingsViewProvider initialTab={initialTab}>
        <SettingsViewLayout />
    </SettingsViewProvider>
);
