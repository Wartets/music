import React, { useMemo, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { useTranslation } from '../../i18n/I18nContext';
import { persistenceService } from '../../services/persistence';
import { TrackItem } from '../../types/music';
import { ShieldAlert, Trash2, Download, RefreshCcw, FileWarning, Zap, CheckCircle2, ChevronRight, BarChart3, Database } from 'lucide-react';
import { getTrackDisplayName } from '../../utils/trackUtils';

export const MaintenanceView: React.FC = () => {
    const { state, setEditingTracks, refresh } = useLibrary();
    const { showToast } = useUI();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'duplicates' | 'health' | 'data'>('duplicates');
    const [hiddenHashes, setHiddenHashes] = useState<Set<string>>(new Set());

    const visibleTracks = useMemo(
        () => state.tracks.filter(track => !hiddenHashes.has(track.logic.hash_sha256)),
        [state.tracks, hiddenHashes]
    );

    // --- Duplicate Logic ---
    const duplicateGroups = useMemo(() => {
        const hashGroups: Record<string, TrackItem[]> = {};
        const fuzzyGroups: Record<string, TrackItem[]> = {};

        visibleTracks.forEach(track => {
            // Hash Based
            const h = track.logic.hash_sha256;
            if (!hashGroups[h]) hashGroups[h] = [];
            hashGroups[h].push(track);

            // Fuzzy (Title + Artist)
            const fuzzyKey = `${(track.metadata?.title || '').toLowerCase().trim()}|${(track.metadata?.artists?.[0] || '').toLowerCase().trim()}`;
            if (fuzzyKey.length > 5) { // Avoid grouping empty tags
                if (!fuzzyGroups[fuzzyKey]) fuzzyGroups[fuzzyKey] = [];
                fuzzyGroups[fuzzyKey].push(track);
            }
        });

        const exact = Object.values(hashGroups).filter(g => g.length > 1);
        const probable = Object.values(fuzzyGroups).filter(g => {
            // Filter out if they are already in 'exact' duplicates
            if (g.length <= 1) return false;
            const hashes = new Set(g.map(t => t.logic.hash_sha256));
            return hashes.size > 1;
        });

        return { exact, probable };
    }, [visibleTracks]);

    // --- Health Logic ---
    const healthIssues = useMemo(() => {
        const lowBitrate = visibleTracks.filter(t => {
            const br = parseInt(t.audio_specs?.bitrate || '0');
            return br > 0 && br < 128;
        });
        const missingMetadata = visibleTracks.filter(t => !t.metadata?.genre || !t.metadata?.year || !t.metadata?.album);
        const ghostTracks: TrackItem[] = []; // Placeholder for files not found on disk if we had that check

        return { lowBitrate, missingMetadata, ghostTracks };
    }, [visibleTracks]);

    // --- Actions ---
    const handleExport = () => {
        const data = persistenceService.getData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `library_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('maintenanceView.libraryBackupExported'), 'success');
    };

    const hideTrack = (track: TrackItem) => {
        const hash = track.logic.hash_sha256;
        persistenceService.hideTrack(hash);
        setHiddenHashes(prev => new Set(prev).add(hash));
    };

    const handleCleanGroup = (group: TrackItem[]) => {
        if (group.length <= 1) {
            showToast(t('maintenanceView.noExtraTracksToClean'), 'info', { subtle: true });
            return;
        }

        const [, ...duplicatesToHide] = group;
        duplicatesToHide.forEach(track => persistenceService.hideTrack(track.logic.hash_sha256));

        setHiddenHashes(prev => {
            const next = new Set(prev);
            duplicatesToHide.forEach(track => next.add(track.logic.hash_sha256));
            return next;
        });

        refresh();
        showToast(t('maintenanceView.cleanedGroupHidden', { count: duplicatesToHide.length, suffix: duplicatesToHide.length > 1 ? 's' : '' }), 'success');
    };

    const handleFixTags = (track: TrackItem) => {
        setEditingTracks([track]);
        showToast(t('maintenanceView.editingTags', { title: getTrackDisplayName(track) }), 'info', { subtle: true });
    };

    const handleResetApplicationMetadata = () => {
        const confirmed = window.confirm(
            t('maintenanceView.resetApplicationMetadataConfirm')
        );

        if (!confirmed) {
            return;
        }

        persistenceService.resetApplicationMetadata();
        showToast(t('maintenanceView.applicationMetadataReset'), 'warning');
        window.setTimeout(() => {
            window.location.reload();
        }, 450);
    };

    return (
        <div className="h-full flex flex-col p-8 pt-0 md:pt-24 bg-surface-primary overflow-y-auto custom-scrollbar">
            <div className="flex items-end justify-between mb-10">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-white flex items-center gap-4">
                        <Database className="text-dominant" size={32} />
                        {t('maintenanceView.title')}
                    </h1>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-2">
                        {t('maintenanceView.subtitle', { count: visibleTracks.length })}
                    </p>
                </div>
                <div className="flex bg-white/5 rounded-2xl p-1 border border-white/5 shadow-2xl overflow-x-auto">
                    {(['duplicates', 'health', 'data'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all uppercase tracking-widest flex-shrink-0 min-w-0 ${activeTab === tab ? 'bg-white/10 text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {tab === 'duplicates' ? t('maintenanceView.tabDuplicates') : tab === 'health' ? t('maintenanceView.tabHealth') : t('maintenanceView.tabData')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-dominant/20 text-dominant flex items-center justify-center shadow-inner">
                        <Zap size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{duplicateGroups.exact.length + duplicateGroups.probable.length}</div>
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{t('maintenanceView.duplicateIssues')}</div>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 text-yellow-500 flex items-center justify-center shadow-inner">
                        <FileWarning size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{healthIssues.lowBitrate.length + healthIssues.missingMetadata.length}</div>
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{t('maintenanceView.healthWarnings')}</div>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-green-500/20 text-green-500 flex items-center justify-center shadow-inner">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{visibleTracks.length > 0 ? (100 - ((healthIssues.missingMetadata.length / visibleTracks.length) * 100)).toFixed(1) : 100}%</div>
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{t('maintenanceView.libraryIntegrity')}</div>
                    </div>
                </div>
            </div>

            <div className="flex-1">
                {activeTab === 'duplicates' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="mb-12">
                            <h2 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
                                {t('maintenanceView.exactHashDuplicates')}
                                <span className="ml-2 text-xs text-gray-500 font-bold px-2 py-0.5 bg-white/5 rounded-md">{duplicateGroups.exact.length} cases</span>
                            </h2>
                            <p className="text-sm text-gray-500 mb-8 max-w-2xl leading-relaxed">{t('maintenanceView.exactHashDuplicatesDesc')}</p>
                            <div className="grid gap-4">
                                {duplicateGroups.exact.slice(0, 10).map((group, idx) => (
                                    <div key={idx} className="bg-white/5 border border-white/5 rounded-3xl p-6 hover:bg-white/[0.07] transition-all group">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-white text-sm truncate max-w-[70%]">{group[0].metadata?.title || group[0].logic.track_name}</h3>
                                            <button
                                                onClick={() => handleCleanGroup(group)}
                                                className="text-xs text-red-400 font-black uppercase tracking-widest md:opacity-0 md:group-hover:opacity-100 transition-all hover:text-red-300 min-h-9 px-2 active:scale-95"
                                            >
                                                {t('maintenanceView.cleanGroup')}
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {group.map(track => (
                                                <div key={track.id} className="flex items-center justify-between text-xs py-2 border-t border-white/5">
                                                    <div className="flex items-center gap-3 truncate">
                                                        <span className="text-gray-500 font-mono">#{track.id}</span>
                                                        <span className="text-gray-300 truncate opacity-60 font-mono">{track.file.path}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            hideTrack(track);
                                                            showToast(t('common.trackHidden' as any), 'success', { subtle: true });
                                                        }}
                                                        className="p-2 min-h-10 min-w-10 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors active:scale-95"
                                                        aria-label={`${t('maintenanceView.hideDuplicate')} ${getTrackDisplayName(track)}`}
                                                        title={t('maintenanceView.hideDuplicate')}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h2 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></span>
                                {t('maintenanceView.probableDuplicates')}
                                <span className="ml-2 text-xs text-gray-500 font-bold px-2 py-0.5 bg-white/5 rounded-md">{duplicateGroups.probable.length} groups</span>
                            </h2>
                            <p className="text-sm text-gray-500 mb-8 max-w-2xl leading-relaxed">{t('maintenanceView.probableDuplicatesDesc')}</p>
                            {/* Similar rendering to exact duplicates */}
                        </section>
                    </div>
                )}

                {activeTab === 'health' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="bg-white/5 border border-white/5 p-8 rounded-[2rem]">
                            <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="text-dominant-light" size={20} />
                                {t('maintenanceView.lowBitrateAlert')}
                                <span className="ml-auto text-xs font-black text-gray-500 bg-black/40 px-3 py-1 rounded-full uppercase tracking-tighter">{healthIssues.lowBitrate.length} files</span>
                            </h2>
                            <p className="text-xs text-gray-400 mb-8 leading-relaxed">{t('maintenanceView.lowBitrateAlertDesc')}</p>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                                {healthIssues.lowBitrate.map(track => (
                                    <div key={track.id} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-dominant/30 transition-all">
                                        <div className="truncate">
                                            <div className="text-white text-sm font-bold truncate">{getTrackDisplayName(track)}</div>
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">{track.audio_specs?.bitrate} kbps · {track.audio_specs?.codec}</div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-600 group-hover:text-dominant transition-all translate-x-0 group-hover:translate-x-1" />
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="bg-white/5 border border-white/5 p-8 rounded-[2rem]">
                            <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                                <FileWarning className="text-yellow-500" size={20} />
                                {t('maintenanceView.missingCriticalTags')}
                                <span className="ml-auto text-xs font-black text-gray-500 bg-black/40 px-3 py-1 rounded-full uppercase tracking-tighter">{healthIssues.missingMetadata.length} files</span>
                            </h2>
                            <p className="text-xs text-gray-400 mb-8 leading-relaxed">{t('maintenanceView.missingCriticalTagsDesc')}</p>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                                {healthIssues.missingMetadata.map(track => (
                                    <div key={track.id} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-yellow-500/30 transition-all">
                                        <div className="truncate pr-4">
                                            <div className="text-white text-sm font-bold truncate">{getTrackDisplayName(track)}</div>
                                            <div className="flex gap-2 mt-2">
                                                {!track.metadata?.genre && <span className="bg-yellow-500/10 text-yellow-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">{t('maintenanceView.noGenre')}</span>}
                                                {!track.metadata?.year && <span className="bg-yellow-500/10 text-yellow-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">{t('maintenanceView.noYear')}</span>}
                                                {!track.metadata?.album && <span className="bg-yellow-500/10 text-yellow-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">{t('maintenanceView.noAlbum')}</span>}
                                            </div>
                                        </div>
                                        <button
                                            className="px-4 py-2 bg-white/5 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all active:scale-95"
                                            onClick={() => handleFixTags(track)}
                                        >
                                            {t('maintenanceView.fixTags')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'data' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
                        <div className="bg-white/5 border border-white/5 p-10 rounded-[3rem] shadow-3xl overflow-hidden relative group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-dominant/10 blur-[100px] -z-10 group-hover:bg-dominant/20 transition-all duration-1000"></div>
                            <h2 className="text-2xl font-black text-white mb-6">{t('maintenanceView.backupExport')}</h2>
                            <p className="text-gray-400 mb-10 leading-relaxed">{t('maintenanceView.backupExportDesc')}</p>

                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleExport}
                                    className="flex items-center justify-center gap-4 px-8 py-5 bg-dominant text-black rounded-2xl text-sm font-black hover:bg-dominant-light transition-all shadow-2xl shadow-dominant/30 active:scale-[0.98] uppercase tracking-[0.2em]"
                                >
                                    <Download size={20} /> {t('maintenanceView.exportLibraryData')}
                                </button>
                                <button
                                    className="flex items-center justify-center gap-4 px-8 py-5 bg-white/5 text-white/50 border border-white/5 rounded-2xl text-sm font-black hover:bg-white/10 hover:text-white transition-all active:scale-[0.98] uppercase tracking-[0.2em]"
                                    onClick={() => alert(t('maintenanceView.manualImportComingSoon'))}
                                >
                                    <RefreshCcw size={20} /> {t('maintenanceView.importBackup')}
                                </button>
                            </div>

                            <div className="mt-12 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                <h4 className="text-red-500 text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <ShieldAlert size={14} /> {t('maintenanceView.dangerZone')}
                                </h4>
                                <p className="text-[10px] text-red-400/70 mb-4 font-bold leading-relaxed">{t('maintenanceView.dangerZoneDesc')}</p>
                                <button
                                    className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500 opacity-50 hover:opacity-100 transition-all underline decoration-2 underline-offset-4 active:scale-95"
                                    onClick={handleResetApplicationMetadata}
                                >
                                    {t('maintenanceView.resetApplicationMetadata')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
