import React from 'react';
import { BarChart3, Download, FileWarning, RefreshCcw, ShieldAlert, Zap } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';
import { useSettingsView } from '../SettingsViewContext';
import { getTrackDisplayName } from '../../../utils/trackUtils';

export const MaintenanceSettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { clearHistory, duplicateGroups, handleExport, healthIssues, maintenanceTab, setMaintenanceTab } = useSettingsView();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex gap-4 mb-4">
                {(['duplicates', 'health', 'data'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setMaintenanceTab(tab)}
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${maintenanceTab === tab ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {maintenanceTab === 'duplicates' && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white/5 border border-white/5 p-8 rounded-3xl">
                            <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                                <Zap className="text-red-500" size={20} />
                                {t('settings.maintenance.exactHashMatches')}
                                <span className="ml-auto text-xs px-2 py-0.5 bg-red-500/10 text-red-500 rounded-md">{duplicateGroups.exact.length}</span>
                            </h3>
                            <p className="text-xs text-gray-500 mb-6">{t('settings.maintenance.exactHashMatchesDesc')}</p>
                            <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {duplicateGroups.exact.slice(0, 10).map((group, index) => (
                                    <div key={`${group[0]?.logic.hash_sha256 || 'exact'}-${index}`} className="p-4 bg-black/20 rounded-2xl border border-white/5 flex flex-col gap-2">
                                        <div className="font-bold text-xs text-white truncate">{getTrackDisplayName(group[0])}</div>
                                        <div className="space-y-1">
                                            {group.map(track => (
                                                <div key={track.id} className="text-[10px] text-gray-500 truncate opacity-60 font-mono italic">
                                                    {track.file.path}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {duplicateGroups.exact.length === 0 && <div className="p-8 text-center text-xs text-gray-500 italic">{t('settings.maintenance.noExactDuplicates')}</div>}
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/5 p-8 rounded-3xl">
                            <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                                <ShieldAlert className="text-yellow-500" size={20} />
                                {t('settings.maintenance.probableDuplicates')}
                                <span className="ml-auto text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-md">{duplicateGroups.probable.length}</span>
                            </h3>
                            <p className="text-xs text-gray-500 mb-6">{t('settings.maintenance.probableDuplicatesDesc')}</p>
                            <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {duplicateGroups.probable.slice(0, 10).map((group, index) => (
                                    <div key={`${group[0]?.logic.hash_sha256 || 'probable'}-${index}`} className="p-4 bg-black/20 rounded-2xl border border-white/5 flex flex-col gap-2">
                                        <div className="font-bold text-xs text-white truncate">{getTrackDisplayName(group[0])}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black">{group[0].metadata?.artists?.[0]}</div>
                                    </div>
                                ))}
                                {duplicateGroups.probable.length === 0 && <div className="p-8 text-center text-xs text-gray-500 italic">{t('settings.maintenance.noFuzzyDuplicates')}</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {maintenanceTab === 'health' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white/5 border border-white/5 p-8 rounded-3xl">
                        <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                            <BarChart3 className="text-dominant" size={20} />
                            {t('settings.maintenance.lowBitrate')}
                            <span className="ml-auto text-xs px-2 py-0.5 bg-dominant/10 text-dominant rounded-md">{healthIssues.lowBitrate.length}</span>
                        </h3>
                        <p className="text-xs text-gray-500 mb-6">{t('settings.maintenance.lowBitrateDesc')}</p>
                        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                            {healthIssues.lowBitrate.map(track => (
                                <div key={track.id} className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                                    <span className="text-[10px] text-white font-bold truncate pr-4">{getTrackDisplayName(track)}</span>
                                    <span className="text-[10px] font-black text-gray-500 uppercase whitespace-nowrap">{track.audio_specs.bitrate} kbps</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/5 p-8 rounded-3xl">
                        <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                            <FileWarning className="text-orange-500" size={20} />
                            {t('settings.maintenance.incompleteMeta')}
                            <span className="ml-auto text-xs px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded-md">{healthIssues.missingMetadata.length}</span>
                        </h3>
                        <p className="text-xs text-gray-500 mb-6">{t('settings.maintenance.incompleteMetaDesc')}</p>
                        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                            {healthIssues.missingMetadata.map(track => (
                                <div key={track.id} className="p-3 bg-black/20 rounded-xl border border-white/5">
                                    <div className="text-[10px] text-white font-bold truncate mb-1">{getTrackDisplayName(track)}</div>
                                    <div className="flex gap-2">
                                        {!track.metadata?.genre && <span className="text-[8px] bg-white/5 px-1 rounded text-orange-400">GENRE</span>}
                                        {!track.metadata?.year && <span className="text-[8px] bg-white/5 px-1 rounded text-orange-400">YEAR</span>}
                                        {!track.metadata?.album && <span className="text-[8px] bg-white/5 px-1 rounded text-orange-400">ALBUM</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {maintenanceTab === 'data' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white/5 border border-white/5 p-8 rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-dominant/5 blur-3xl -z-10 transition-all group-hover:bg-dominant/10" />
                        <h3 className="text-xl font-black text-white mb-6">{t('settings.maintenance.libraryBackup')}</h3>
                        <p className="text-xs text-gray-500 mb-8 leading-relaxed">{t('settings.maintenance.libraryBackupDesc')}</p>
                        <button onClick={handleExport} className="w-full flex items-center justify-center gap-3 py-4 bg-dominant text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-dominant-light transition-all shadow-xl shadow-dominant/20 active:scale-95">
                            <Download size={16} /> {t('settings.maintenance.exportJson')}
                        </button>
                        <button className="w-full mt-3 flex items-center justify-center gap-3 py-4 bg-white/5 text-gray-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5">
                            <RefreshCcw size={16} /> {t('settings.maintenance.restoreBackup')}
                        </button>
                        <div className="mt-4 p-3 rounded-xl border border-white/10 bg-black/20">
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('settings.maintenance.codecHelper')}</div>
                            <p className="text-[10px] text-gray-500 mb-2">{t('settings.maintenance.codecHelperDesc')}</p>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText('powershell -ExecutionPolicy Bypass -File .\\scripts\\fix_codecs.ps1');
                                    alert('PowerShell command copied. Run it from the project root.');
                                }}
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                {t('settings.maintenance.copyFixCommand')}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/5 p-8 rounded-3xl">
                        <h3 className="text-xl font-black text-white mb-6">{t('settings.maintenance.dangerZone')}</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                                <div className="font-bold text-xs text-red-500 mb-1">{t('settings.maintenance.clearHistory')}</div>
                                <p className="text-[10px] text-gray-500 mb-4">{t('settings.maintenance.clearHistoryDesc')}</p>
                                <button onClick={clearHistory} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black uppercase hover:bg-red-500/20 transition-all">
                                    {t('settings.maintenance.executeWipe')}
                                </button>
                            </div>
                            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                                <div className="font-bold text-xs text-red-500 mb-1">{t('settings.maintenance.resetAll')}</div>
                                <p className="text-[10px] text-gray-500 mb-4">{t('settings.maintenance.resetAllDesc')}</p>
                                <button className="px-4 py-2 bg-white/5 text-red-500 opacity-30 hover:opacity-100 rounded-lg text-[10px] font-black uppercase transition-all">
                                    {t('settings.maintenance.fullReset')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

