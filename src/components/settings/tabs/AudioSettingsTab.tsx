import React from 'react';
import { usePlayer } from '../../../contexts/PlayerContext';
import { useTranslation } from '../../../i18n/I18nContext';
import { ParametricEqEditor } from '../audio/ParametricEqEditor';
import { useSettingsView } from '../SettingsViewContext';

export const AudioSettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { state: playerState } = usePlayer();
    const {
        crossfadeDuration,
        crossfadeEnabled,
        normalizationEnabled,
        normalizationStrength,
        playbackSpeed,
        commitPlaybackSpeed,
        setCrossfadeDuration,
        setCrossfadeEnabled,
        setNormalizationEnabled,
        setNormalizationStrength,
        setPlaybackSpeed,
        setShuffleModePreference
    } = useSettingsView();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
                <ParametricEqEditor />
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-white">{t('settings.audio.crossfade')}</h3>
                        <button
                            onClick={() => setCrossfadeEnabled(previous => !previous)}
                            className={`w-10 h-5 rounded-full transition-all relative ${crossfadeEnabled ? 'bg-dominant' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${crossfadeEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-4">{t('settings.audio.crossfadeDesc')}</p>
                    <div className={`space-y-3 ${crossfadeEnabled ? '' : 'opacity-20 pointer-events-none'}`}>
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-gray-500 uppercase">{t('settings.audio.duration')}</span>
                            <span className="text-sm font-black text-dominant">{crossfadeDuration}s</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="15"
                            step="1"
                            value={crossfadeDuration}
                            onChange={(event) => setCrossfadeDuration(parseInt(event.target.value, 10))}
                            className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                        />
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-white">{t('settings.audio.volumeNormalization')}</h3>
                        <button
                            onClick={() => setNormalizationEnabled(previous => !previous)}
                            className={`w-10 h-5 rounded-full transition-all relative ${normalizationEnabled ? 'bg-dominant' : 'bg-white/10'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${normalizationEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-4">{t('audioSettings.volumeNormalizationDesc')}</p>
                    <div className={`space-y-3 ${normalizationEnabled ? '' : 'opacity-20 pointer-events-none'}`}>
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-gray-500 uppercase">{t('audioSettings.normalizationStrength')}</span>
                            <span className="text-sm font-black text-dominant">{normalizationStrength}%</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="100"
                            step="1"
                            value={normalizationStrength}
                            onChange={(event) => setNormalizationStrength(parseInt(event.target.value, 10))}
                            className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                        />
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <h3 className="text-sm font-black text-white mb-4">{t('settings.audio.playbackSpeed')}</h3>
                    <p className="text-[11px] text-gray-500 mb-4">{t('audioSettings.playbackSpeedDesc')}</p>
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-gray-500 uppercase">{t('settings.audio.playbackSpeed')}</span>
                            <span className="text-sm font-black text-dominant">{playbackSpeed.toFixed(2)}x</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.05"
                            value={playbackSpeed}
                            onChange={(event) => setPlaybackSpeed(parseFloat(event.target.value))}
                            onMouseUp={(event) => commitPlaybackSpeed(parseFloat((event.currentTarget as HTMLInputElement).value))}
                            onTouchEnd={(event) => commitPlaybackSpeed(parseFloat((event.currentTarget as HTMLInputElement).value))}
                            onPointerUp={(event) => commitPlaybackSpeed(parseFloat((event.currentTarget as HTMLInputElement).value))}
                            className="w-full accent-dominant h-1.5 bg-white/5 rounded-full cursor-pointer"
                        />
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <h3 className="text-sm font-black text-white mb-4">{t('settings.audio.shuffleIntelligence')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'standard', name: t('settings.audio.standard') },
                            { id: 'weighted', name: t('settings.audio.weighted') },
                            { id: 'discovery', name: t('settings.audio.discovery') },
                            { id: 'recent', name: t('settings.audio.freshness') }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setShuffleModePreference(mode.id as typeof playerState.shuffleMode)}
                                className={`p-2.5 rounded-xl border transition-all text-center ${playerState.shuffleMode === mode.id ? 'bg-dominant/20 border-dominant text-white ring-1 ring-dominant/20' : 'bg-black/20 border-white/5 text-gray-500 hover:bg-white/5'}`}
                            >
                                <div className="font-black text-[10px] uppercase tracking-tighter">{mode.name}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

