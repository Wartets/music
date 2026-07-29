import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { formatDuration } from '../../utils/formatters';
import { RepeatMode } from '../../types/playback';
import { ViewType } from './viewRouting';
import { persistenceService } from '../../services/persistence';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName, getTrackVersionDisplayName } from '../../utils/trackUtils';
import { Info, Link2, Music, Volume1, Volume2, VolumeX } from 'lucide-react';

const IconPlay = React.memo(() => <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="transition-transform group-active:scale-90"><path d="M8 5v14l11-7z" /></svg>);
const IconPause = React.memo(() => <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="transition-transform group-active:scale-90"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>);
const IconNext = React.memo(() => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>);
const IconPrev = React.memo(() => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>);
const IconSeekBackward = React.memo(() => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 17l-5-5 5-5" />
        <path d="M18 17l-5-5 5-5" />
    </svg>
));
const IconSeekForward = React.memo(() => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 17l5-5-5-5" />
        <path d="M6 17l5-5-5-5" />
    </svg>
));
const IconExpandTrack = React.memo(() => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>
));

const IconShuffle = React.memo(({ active }: { active: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? 'white' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-all ${active ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : ''}`}><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
));

const IconRepeat = React.memo(({ mode }: { mode: RepeatMode }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mode !== RepeatMode.None ? 'white' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-all ${mode !== RepeatMode.None ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : ''}`}>
        {mode === RepeatMode.One ? (
            <>
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                <path d="M11 15V9.5L9.5 10.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
        ) : (
            <><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>
        )}
    </svg>
));

const TrackInfoIcon = React.memo(() => <Info size={14} />);
const PlaceholderMusicIcon = React.memo(({ compact }: { compact: boolean }) => <Music className="opacity-20" size={compact ? 20 : 24} />);
const VolumeIcon = React.memo(({ vol }: { vol: number }) => {
    if (vol === 0) return <VolumeX size={18} />;
    if (vol < 0.5) return <Volume1 size={18} />;
    return <Volume2 size={18} />;
});

export const PlayerBar: React.FC<{ onToggleContext?: () => void, onNavigate: (view: ViewType, data?: unknown) => void }> = ({ onToggleContext, onNavigate }) => {
    const { state, isRemoteControlled, togglePlay, playNext, playPrevious, setVolume, seek, getProgress, seekForward, seekBackward, toggleShuffle, setRepeat } = usePlayer();
    const { t } = useTranslation();
    const track = state.currentTrack;
    const previousVolumeRef = useRef<number>(state.volume > 0 ? state.volume : 0.8);

    const [isDragging, setIsDragging] = useState(false);
    const [localProgress, setLocalProgress] = useState(0);
    const rafRef = useRef<number | null>(null);
    const durationRef = useRef<number>(0);

    // Helper for HH:MM:SS / MM:SS to seconds
    const parseDurationStr = (str: string | null): number => {
        if (!str) return 0;
        const p = str.split(':');
        let s = 0, m = 1;
        while (p.length > 0) {
            s += m * parseFloat(p.pop() || '0');
            m *= 60;
        }
        return s;
    };

    const durationSec = parseDurationStr(track?.audio_specs?.duration || null);
    durationRef.current = durationSec;
    const safeProgress = Math.max(0, Math.min(localProgress, durationSec || 0));
    const progressPercent = durationSec > 0 ? (safeProgress / durationSec) * 100 : 0;

    useEffect(() => {
        let lastTime = 0;

        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const updateProgress = (timestamp: number) => {
            if (timestamp - lastTime > 42 && !isDragging) {
                lastTime = timestamp;
                const current = getProgress();
                setLocalProgress(current);
            }

            if (state.isPlaying) {
                rafRef.current = requestAnimationFrame(updateProgress);
            }
        };

        if (state.isPlaying) {
            rafRef.current = requestAnimationFrame(updateProgress);
        } else if (!isDragging) {
            setLocalProgress(getProgress());
        }

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [getProgress, state.isPlaying, isDragging, track?.logic.hash_sha256]);

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        setLocalProgress(value);
        if (track) {
            seek(value);
        }
    };

    const handleSeekPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
    };

    const handleSeekPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setIsDragging(false);
    };

    const isCompact = persistenceService.get('ui_compact_player') === true;
    const isGlowEnabled = persistenceService.get('ui_glow') !== false;

    const artworkDetails = track?.artworks?.track_artwork?.[0] || track?.artworks?.album_artwork?.[0];
    const isLossless = track?.audio_specs?.is_lossless;
    const sampleRate = parseInt(track?.audio_specs?.sample_rate || '44100');
    const isHiRes = isLossless && sampleRate > 48000;
    const isMuted = state.volume === 0;

    useEffect(() => {
        if (state.volume > 0) {
            previousVolumeRef.current = state.volume;
        }
    }, [state.volume]);

    useEffect(() => {
        if (!isDragging && track) {
            const currentProgress = getProgress();
            if (Math.abs(currentProgress - localProgress) > 1) {
                setLocalProgress(currentProgress);
            }
        }
    }, [track, getProgress, isDragging]);

    const handleRepeatToggle = useCallback(() => {
        setRepeat(state.repeat === RepeatMode.None ? RepeatMode.All : state.repeat === RepeatMode.All ? RepeatMode.One : RepeatMode.None);
    }, [setRepeat, state.repeat]);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const nextVolume = Number(e.target.value);
        if (nextVolume > 0) {
            previousVolumeRef.current = nextVolume;
        }
        setVolume(nextVolume);
    }, [setVolume]);

    const toggleMute = () => {
        if (state.volume === 0) {
            const restored = previousVolumeRef.current > 0 ? previousVolumeRef.current : 0.8;
            setVolume(restored);
        } else {
            previousVolumeRef.current = state.volume;
            setVolume(0);
        }
    };

    const { currentPalette } = useTheme();

    const desktopPrimaryControls = React.useMemo(() => (
        <>
            <button
                onClick={toggleShuffle}
                disabled={!track}
                className={`inline-flex items-center justify-center transition-all rounded-full w-9 h-9 md:w-auto md:h-auto md:py-2 md:px-2.5 ${activeClass(track, state.shuffle ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)]' : 'text-gray-400 hover:text-white hover:bg-white/5')}`}
                title={state.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
                aria-label={state.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
            >
                <IconShuffle active={state.shuffle} />
            </button>

            <button
                onClick={playPrevious}
                disabled={!track}
                className={`transition-transform active:scale-95 w-9 h-9 md:w-auto md:h-auto md:py-2 md:px-1 inline-flex items-center justify-center rounded-full ${activeClass(track, 'text-gray-200 hover:text-white hover:bg-white/5')}`}
                aria-label={t('player.previous')}
            >
                <IconPrev />
            </button>

            <button
                onClick={seekBackward}
                disabled={!track}
                title={t('player.seekBackward')}
                className={`transition-transform active:scale-95 py-2 px-0.5 hidden lg:block ${activeClass(track, 'text-gray-400 hover:text-white')}`}
                aria-label={t('player.seekBackward')}
            >
                <IconSeekBackward />
            </button>

            <button
                onClick={togglePlay}
                disabled={!track}
                className={`w-12 h-12 md:w-12 md:h-12 rounded-full bg-white text-black flex items-center justify-center transition-all shadow-lg shadow-white/10 ${activeClass(track, 'hover:scale-105 active:scale-95')}`}
                aria-label={state.isPlaying ? t('player.pause') : t('player.play')}
            >
                {state.isPlaying ? <IconPause /> : <IconPlay />}
            </button>

            <button
                onClick={seekForward}
                disabled={!track}
                title={t('player.seekForward')}
                className={`transition-transform active:scale-95 py-2 px-0.5 hidden lg:block ${activeClass(track, 'text-gray-400 hover:text-white')}`}
                aria-label={t('player.seekForward')}
            >
                <IconSeekForward />
            </button>

            <button
                onClick={playNext}
                disabled={!track}
                className={`transition-transform active:scale-95 w-9 h-9 md:w-auto md:h-auto md:py-2 md:px-1 inline-flex items-center justify-center rounded-full ${activeClass(track, 'text-gray-200 hover:text-white hover:bg-white/5')}`}
                aria-label={t('player.next')}
            >
                <IconNext />
            </button>

            <button
                onClick={handleRepeatToggle}
                disabled={!track}
                className={`inline-flex items-center justify-center transition-all rounded-full w-9 h-9 md:w-auto md:h-auto md:py-2 md:px-2.5 ${activeClass(track, state.repeat !== 'none' ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)]' : 'text-gray-400 hover:text-white hover:bg-white/5')}`}
                title={t('player.repeat')}
                aria-label={t('player.repeat')}
            >
                <IconRepeat mode={state.repeat} />
            </button>
        </>
    ), [handleRepeatToggle, playNext, playPrevious, seekBackward, seekForward, state.isPlaying, state.repeat, state.shuffle, togglePlay, toggleShuffle, track]);

    return (
        <footer
            className={`${isCompact ? 'h-[5rem] md:h-20' : 'h-[5.25rem] md:h-24'} fixed md:static bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 backdrop-blur-3xl border-t border-white/5 flex flex-col z-[60] transition-all duration-1000 overflow-hidden`}
            style={{ backgroundColor: `${currentPalette.dominantDark}bb` }}
        >
            {/* Subtle bottom glow */}
            <div
                className="absolute bottom-0 left-0 w-full h-[1px] opacity-20 transition-colors duration-1000"
                style={{ backgroundColor: currentPalette.dominant }}
            ></div>

            {/* Seek Bar */}
            <div className="w-full relative h-[6px] group -mt-[3px] cursor-pointer" style={{ pointerEvents: track ? 'auto' : 'none' }}>
                <input
                    type="range"
                    min={0}
                    max={durationSec}
                    step={0.1}
                    value={localProgress}
                    onChange={handleSeekChange}
                    onPointerDown={handleSeekPointerDown}
                    onPointerUp={handleSeekPointerUp}
                    onPointerCancel={() => setIsDragging(false)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 touch-none"
                    disabled={!track}
                    aria-label={t('player.trackPosition')}
                />

                {/* Background Line */}
                <div className="absolute inset-x-0 h-[2px] top-1/2 -translate-y-1/2 bg-white/10 group-hover:h-[4px] transition-all pointer-events-none rounded-full mx-1"></div>

                {/* Progress Fill */}
                <div
                    className={`absolute inset-y-0 left-0 bg-dominant group-hover:bg-dominant-light transition-all rounded-r-full pointer-events-none top-1/2 -translate-y-1/2 h-[2px] group-hover:h-[4px] mx-1 origin-left ${isCompact ? '' : isGlowEnabled ? 'shadow-[0_0_15px_rgba(var(--color-dominant-rgb),0.5)]' : ''}`}
                    style={{ transform: `scaleX(${durationSec > 0 ? safeProgress / durationSec : 0})`, width: 'calc(100% - 8px)' }}
                ></div>

                {/* Visual Feedback on Drag */}
                {isDragging && (
                    <div
                        className="absolute -top-8 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded border border-white/10 transition-opacity pointer-events-none translate-x-1/2"
                        style={{ right: `calc(${100 - progressPercent}%)` }}
                    >
                        {formatDuration(localProgress)}
                    </div>
                )}
            </div>

            <div className="flex-1 flex items-center justify-between px-2 md:px-6 pt-0.5 md:pt-1">
                {/* Left: Track Info */}
                <div className="flex items-center w-auto md:w-1/3 min-w-0 pr-2 md:pr-4">
                    {track ? (
                        <>
                            <div
                                className={`${isCompact ? 'w-10 h-10 md:w-12 md:h-12' : 'w-12 h-12 md:w-14 md:h-14'} rounded-md bg-white/5 flex-shrink-0 mr-3 md:mr-4 overflow-hidden border border-white/5 shadow-2xl relative group cursor-pointer active:scale-95 transition-transform`}
                                onClick={() => onNavigate('BigScreen', track)}
                                role="button"
                                aria-label={t('player.openBigScreen')}
                            >
                                <ArtworkImage details={artworkDetails} alt={getTrackDisplayName(track)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <IconExpandTrack />
                                </div>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onNavigate('SongDetail', track)}
                                        className="text-white font-bold text-xs md:text-sm truncate hover:text-dominant-light transition-colors text-left pointer-events-auto"
                                    >
                                        {/* Primary track title in bold */}
                                        {getTrackDisplayName(track)}
                                        {/* Version/file name in parentheses (deterministic per-file) */}
                                        {getTrackVersionDisplayName(track) && (
                                            <span className="text-white/40 font-medium ml-1.5 text-[11px]">
                                                ({getTrackVersionDisplayName(track)})
                                            </span>
                                        )}
                                    </button>
                                    {isLossless && (
                                        <span className="text-[9px] bg-dominant/20 text-dominant-light px-1.5 py-0.5 rounded uppercase tracking-widest font-bold border border-dominant/30 flex-shrink-0">
                                            {isHiRes ? t('player.hiRes') : t('player.lossless')}
                                        </span>
                                    )}
                                    {isRemoteControlled && (
                                        <span
                                            className="inline-flex items-center gap-1 text-[9px] bg-cyan-400/15 text-cyan-200 px-1.5 py-0.5 rounded uppercase tracking-widest font-bold border border-cyan-300/30 flex-shrink-0"
                                            title={t('player.syncedTooltip')}
                                        >
                                            <Link2 size={10} />
                                            {t('player.synced')}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => onNavigate('ArtistDetail', track.metadata?.artists?.[0])}
                                    className="text-gray-400 text-[11px] md:text-xs truncate mt-0.5 font-medium hover:text-white transition-colors text-left"
                                >
                                    {track.metadata?.artists?.join(', ') || t('player.unknownArtist')}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center group">
                            <div className={`${isCompact ? 'w-10 h-10 md:w-12 md:h-12' : 'w-12 h-12 md:w-14 md:h-14'} rounded-md bg-white/5 mr-4 flex items-center justify-center text-gray-800 border border-white/5`}>
                                <PlaceholderMusicIcon compact={isCompact} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="h-3.5 w-24 bg-white/5 rounded-full opacity-50"></div>
                                <div className="h-2.5 w-36 bg-white/5 rounded-full opacity-30"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Center: Controls */}
                <div className="flex flex-col items-center justify-center flex-1 md:w-1/3 max-w-[420px]">
                    <div className="flex items-center justify-center gap-1 md:gap-3">
                        {desktopPrimaryControls}
                    </div>

                    <div className="md:hidden mt-1 mb-1 text-[10px] font-mono text-gray-400 leading-none">
                        <span>{formatDuration(safeProgress)}</span>
                        <span className="mx-1.5 text-gray-600">/</span>
                        <span>{formatDuration(durationSec || 0)}</span>
                    </div>

                    <div className="md:hidden mt-1 flex items-center justify-center gap-2.5 w-full">
                        {onToggleContext && (
                            <button
                                onClick={onToggleContext}
                                disabled={!track}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${activeClass(track, 'text-gray-300 hover:text-white hover:bg-white/5')}`}
                                title="Track Info"
                                aria-label="Track info"
                            >
                                <TrackInfoIcon />
                            </button>
                        )}

                        <button
                            onClick={toggleMute}
                            disabled={!track}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${activeClass(track, 'text-gray-300 hover:text-white hover:bg-white/5')}`}
                            title={isMuted ? 'Unmute' : 'Mute'}
                            aria-label={isMuted ? t('player.unmute') : t('player.mute')}
                            aria-pressed={isMuted}
                        >
                            <VolumeIcon vol={state.volume} />
                        </button>

                        <div className="relative h-[4px] w-28 bg-white/10 rounded-full cursor-pointer">
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={state.volume}
                                onChange={handleVolumeChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                disabled={!track}
                                aria-label={t('player.volume')}
                            />
                            <div
                                className="absolute inset-y-0 left-0 bg-dominant transition-all rounded-full pointer-events-none"
                                style={{ width: `${state.volume * 100}%` }}
                            ></div>
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg pointer-events-none"
                                style={{ left: `calc(${state.volume * 100}% - 5px)` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Right: Volume (time display now in SeekBar) */}
                <div className="hidden md:flex flex-col items-end w-1/3 text-xs text-gray-400 font-medium font-mono">
                    <div className="mb-1 text-[10px] leading-none text-gray-400">
                        <span>{formatDuration(safeProgress)}</span>
                        <span className="mx-2 text-gray-600">/</span>
                        <span>{formatDuration(durationSec || 0)}</span>
                    </div>

                    <div className="flex items-center gap-3 w-32 group/vol relative">
                        <button
                            onClick={toggleMute}
                            disabled={!track}
                            className={`flex items-center justify-center transition-colors ${activeClass(track, 'text-gray-300 hover:text-white')}`}
                            title={isMuted ? 'Unmute' : 'Mute'}
                            aria-label={isMuted ? t('player.unmute') : t('player.mute')}
                            aria-pressed={isMuted}
                        >
                            <VolumeIcon vol={state.volume} />
                        </button>
                        <div className="relative h-[4px] w-full bg-white/10 rounded-full flex-1 cursor-pointer group-hover/vol:h-[6px] transition-all">
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={state.volume}
                                onChange={handleVolumeChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                aria-label={t('player.volume')}
                            />
                            <div
                                className="absolute inset-y-0 left-0 bg-dominant transition-all rounded-full pointer-events-none shadow-[0_0_10px_rgba(var(--color-dominant-rgb),0.5)]"
                                style={{ width: `${state.volume * 100}%` }}
                            ></div>
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
                                style={{ left: `calc(${state.volume * 100}% - 6px)` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </footer >
    );
};

const activeClass = (track: any, classes: string) => track ? classes : 'opacity-50 cursor-not-allowed text-gray-600';

