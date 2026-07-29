import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { RepeatMode } from '../../types/playback';
import { Maximize2, Minimize2, Repeat, Repeat1, Shuffle, X } from 'lucide-react';
import { formatDuration } from '../../utils/formatters';
import { ViewType } from '../layout/AppLayout';
import { ArtworkImage } from '../shared/ArtworkImage';
import { ImmersiveVisualizer } from '../player/ImmersiveVisualizer';
import { TrackItem } from '../../types/music';
import { useIsMobile, useIsTablet } from '../../hooks/useMediaQuery';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName } from '../../utils/trackUtils';

const getTrackArtwork = (track?: TrackItem | null) => track?.artworks?.track_artwork?.[0] || track?.artworks?.album_artwork?.[0];

const hashText = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const getFallbackArtworkColor = (track?: TrackItem | null) => {
    const seed = getTrackDisplayName(track, 'track');
    const hue = hashText(seed) % 360;
    return `hsl(${hue} 36% 28%)`;
};

const getTrackDominantColor = (track?: TrackItem | null) => getTrackArtwork(track)?.dominant_color || getFallbackArtworkColor(track);

const getTrackTitle = (track?: TrackItem | null, fallback = '') => getTrackDisplayName(track, fallback);

export const BigScreenView: React.FC<{ onBack: () => void; onNavigate: (view: ViewType, data?: any) => void }> = ({ onBack, onNavigate }) => {
    const { state, togglePlay, playNext, playPrevious, seek, getProgress, toggleShuffle, setRepeat } = usePlayer();
    const { t } = useTranslation();
    const track = state.currentTrack;
    const unknownTrackLabel = t('player.unknownTrack');
    const unknownArtistLabel = t('player.unknownArtist');
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [localProgress, setLocalProgress] = useState(0);
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const [transitionTrack, setTransitionTrack] = useState<TrackItem | null>(null);
    const [isArtworkTransitioning, setIsArtworkTransitioning] = useState(false);
    const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionFrameRef = useRef<number | null>(null);
    const previousTrackRef = useRef<TrackItem | null>(track);
    const frozenAngleRef = useRef<number>(0);
    const discSpinnerRef = useRef<HTMLDivElement>(null);
    const discAnimationRef = useRef<Animation | null>(null);
    const inactivityTimeoutMs = isFullscreen ? 3000 : 4500;
    const showFullscreenButton = !isMobile && !isTablet;
    const isDiscSpinning = Boolean(track && state.isPlaying);

    const SPIN_DURATION = 16000;

    const getTrackBaseAngle = useCallback((trackHash: string): number => {
        return (Math.abs(hashText(trackHash)) % 360);
    }, []);

    const resetInactivity = useCallback(() => {
        setIsControlsVisible(true);
        if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = setTimeout(() => {
            setIsControlsVisible(false);
        }, inactivityTimeoutMs);
    }, [inactivityTimeoutMs]);

    useEffect(() => {
        window.addEventListener('mousemove', resetInactivity);
        window.addEventListener('mousedown', resetInactivity);
        window.addEventListener('keydown', resetInactivity);
        window.addEventListener('touchstart', resetInactivity);
        window.addEventListener('wheel', resetInactivity, { passive: true });
        resetInactivity();
        return () => {
            window.removeEventListener('mousemove', resetInactivity);
            window.removeEventListener('mousedown', resetInactivity);
            window.removeEventListener('keydown', resetInactivity);
            window.removeEventListener('touchstart', resetInactivity);
            window.removeEventListener('wheel', resetInactivity);
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
        };
    }, [resetInactivity]);

    useEffect(() => {
        const interval = setInterval(() => {
            setLocalProgress(getProgress());
        }, 500);
        return () => clearInterval(interval);
    }, [getProgress]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onBack();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onBack]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const el = discSpinnerRef.current;
        if (!el) return;

        const anim = el.animate(
            [
                { transform: 'rotate(0deg)' },
                { transform: 'rotate(360deg)' }
            ],
            {
                duration: SPIN_DURATION,
                iterations: Infinity,
                easing: 'linear',
            }
        );
        anim.pause();
        discAnimationRef.current = anim;

        return () => {
            anim.cancel();
            discAnimationRef.current = null;
        };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const anim = discAnimationRef.current;
        if (!anim) return;

        if (isDiscSpinning) {
            anim.play();
        } else {
            anim.pause();
        }
    }, [isDiscSpinning]);

    useEffect(() => {
        const anim = discAnimationRef.current;
        if (!anim || !track) return;

        const angle = getTrackBaseAngle(track.logic.hash_sha256);
        const timeOffset = (angle / 360) * SPIN_DURATION;
        anim.currentTime = timeOffset;
    }, [track?.logic.hash_sha256, getTrackBaseAngle]);

    useEffect(() => {
        const nextTrackId = track?.logic.hash_sha256 || null;
        const previousTrack = previousTrackRef.current;

        if (!track) {
            previousTrackRef.current = null;
            setTransitionTrack(null);
            setIsArtworkTransitioning(false);
            return;
        }

        const previousTrackId = previousTrack?.logic.hash_sha256 || null;
        if (previousTrack && previousTrackId !== nextTrackId) {
            const anim = discAnimationRef.current;
            if (anim && typeof anim.currentTime === 'number') {
                const currentAngle = ((anim.currentTime % SPIN_DURATION) / SPIN_DURATION) * 360;
                frozenAngleRef.current = currentAngle;
            }

            setTransitionTrack(previousTrack);
            setIsArtworkTransitioning(true);

            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }
            if (transitionFrameRef.current !== null) {
                cancelAnimationFrame(transitionFrameRef.current);
            }

            transitionFrameRef.current = requestAnimationFrame(() => {
                transitionFrameRef.current = requestAnimationFrame(() => {
                    setIsArtworkTransitioning(false);
                });
            });

            transitionTimeoutRef.current = setTimeout(() => {
                setTransitionTrack(null);
            }, 1600);
        }

        previousTrackRef.current = track;
    }, [track, getTrackBaseAngle]);

    useEffect(() => {
        return () => {
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }
            if (transitionFrameRef.current !== null) {
                cancelAnimationFrame(transitionFrameRef.current);
            }
        };
    }, []);

    if (!track) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-black text-white">
                <p>{t('bigScreen.noTrackPlaying')}</p>
                <button onClick={onBack} className="mt-4 text-dominant hover:underline">{t('bigScreen.goBack')}</button>
            </div>
        );
    }

    const toggleFullscreen = () => {
        if (!showFullscreenButton) {
            return;
        }

        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    const handleBackgroundDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        toggleFullscreen();
    };

    const artworkDetails = getTrackArtwork(track);
    const transitionArtworkDetails = getTrackArtwork(transitionTrack);
    const dominantColor = getTrackDominantColor(track);

    return (
        <div className={`fixed inset-0 z-[100] flex flex-col overflow-hidden select-none bg-black ${isControlsVisible ? 'cursor-default' : 'cursor-none'}`} onDoubleClick={handleBackgroundDoubleClick}>
            {/* Static artwork-derived background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute inset-0 bg-black" />
                <ImmersiveVisualizer track={track} className="opacity-100" />
                <div className="absolute inset-0 transition-colors duration-700" style={{ backgroundColor: dominantColor, opacity: 0.2, mixBlendMode: 'screen' }} />
                <div className="absolute inset-0 bg-black/18 mix-blend-overlay" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.08),transparent_58%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.08),rgba(0,0,0,0.2))]" />
            </div>

            {/* Header */}
            <div className={`relative z-10 flex items-center justify-between p-8 transition-all duration-1000 ease-in-out ${isControlsVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
                <button
                    onClick={onBack}
                    className="h-12 w-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-2xl border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.45)] transition-all duration-200 hover:scale-105 active:scale-95"
                    title={t('bigScreen.exitImmersive')}
                    aria-label={t('bigScreen.exitImmersive')}
                >
                    <X size={18} />
                </button>
                <div className="flex items-center gap-4">
                    {showFullscreenButton && (
                        <button
                            onClick={toggleFullscreen}
                            className="h-12 w-12 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-2xl border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.45)] transition-all duration-200 hover:scale-105 active:scale-95"
                            title={isFullscreen ? t('bigScreen.exitFullscreen') : t('bigScreen.enterFullscreen')}
                            aria-label={isFullscreen ? t('bigScreen.exitFullscreen') : t('bigScreen.enterFullscreen')}
                        >
                            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Main content — centered on full viewport height with slight upward bias */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '5vh' }}>
                <div className="w-full max-w-7xl mx-auto px-12 flex flex-col lg:flex-row items-center gap-16">
                    {/* CD Disc */}
                    <div className="relative pointer-events-auto flex-shrink-0">
                        <div
                            className="absolute -inset-16 rounded-full blur-[60px] transition-opacity duration-[1.5s] ease-out pointer-events-none"
                            style={{
                                background: `radial-gradient(circle, ${dominantColor} 0%, transparent 65%)`,
                                opacity: isArtworkTransitioning ? 0.6 : 0.85,
                            }}
                        />
                        <div className="relative w-80 h-80 md:w-[450px] md:h-[450px] rounded-full cd-disc-edge-bevel">
                            {/* Outgoing disc (frozen at transition angle) */}
                            {transitionTrack && transitionArtworkDetails && (
                                <div
                                    className="absolute inset-0 rounded-full overflow-hidden transition-opacity duration-[1.4s] ease-[cubic-bezier(0.4,0,0.2,1)]"
                                    style={{ opacity: isArtworkTransitioning ? 1 : 0 }}
                                >
                                    <div
                                        className="absolute inset-0"
                                        style={{ transform: `rotate(${frozenAngleRef.current}deg)` }}
                                    >
                                        <ArtworkImage
                                            details={transitionArtworkDetails}
                                            alt={getTrackTitle(transitionTrack, unknownTrackLabel)}
                                            className="w-full h-full object-cover"
                                            loading="eager"
                                        />
                                        <div className="absolute inset-0 cd-disc-grooves" />
                                        <div className="absolute inset-0 cd-disc-iridescence" />
                                        <div className="absolute inset-0 cd-disc-inner-ring" />
                                        <div className="absolute inset-0 cd-disc-surface-sheen" />
                                    </div>
                                </div>
                            )}
                            {/* Current disc (spinning) */}
                            <div
                                className="absolute inset-0 rounded-full overflow-hidden transition-opacity duration-[1.4s] ease-[cubic-bezier(0.4,0,0.2,1)]"
                                style={{ opacity: isArtworkTransitioning ? 0 : 1 }}
                            >
                                <div
                                    ref={discSpinnerRef}
                                    className="absolute inset-0"
                                    style={{ willChange: 'transform' }}
                                >
                                    <ArtworkImage
                                        details={artworkDetails}
                                        alt={getTrackTitle(track, unknownTrackLabel)}
                                        className="w-full h-full object-cover"
                                        loading="eager"
                                    />
                                    <div className="absolute inset-0 cd-disc-grooves" />
                                    <div className="absolute inset-0 cd-disc-iridescence" />
                                    <div className="absolute inset-0 cd-disc-inner-ring" />
                                    <div className="absolute inset-0 cd-disc-surface-sheen" />
                                </div>
                            </div>
                            {/* Center hole (fixed, doesn't rotate) */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[13%] h-[13%] rounded-full cd-disc-center-hole z-10" />
                            {/* Specular highlight (fixed, doesn't rotate) */}
                            <div className="absolute inset-0 rounded-full cd-disc-specular pointer-events-none z-10" />
                        </div>
                    </div>

                    {/* Info & Metadata */}
                    <div className={`pointer-events-auto flex flex-col items-center lg:items-start text-center lg:text-left max-w-xl transition-all duration-700 ease-out ${isArtworkTransitioning ? 'translate-y-1 opacity-80' : 'translate-y-0 opacity-100'}`}>
                        <button
                            onClick={() => onNavigate('SongDetail', track)}
                            className="text-4xl md:text-6xl font-black tracking-tight text-white mb-4 hover:text-dominant-light transition-colors text-center lg:text-left break-words"
                        >
                            {getTrackTitle(track, unknownTrackLabel)}
                        </button>
                        <button
                            onClick={() => onNavigate('ArtistDetail', track.metadata?.artists?.[0] || unknownArtistLabel)}
                            className="text-xl md:text-3xl text-white/50 font-medium mb-8 hover:text-white transition-colors text-center lg:text-left break-words"
                        >
                            {track.metadata?.artists?.join(', ') || unknownArtistLabel}
                        </button>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-white/10 rounded-full mb-4 relative cursor-pointer group" onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const pct = x / rect.width;
                            const parseDur = (str: string | null): number => {
                                if (!str) return 0;
                                const p = str.split(':');
                                let s = 0, m = 1;
                                while (p.length > 0) { s += m * parseFloat(p.pop() || '0'); m *= 60; }
                                return s;
                            };
                            seek(parseDur(track.audio_specs.duration) * pct);
                        }}>
                            <div
                                className="h-full bg-white rounded-full relative"
                                style={{
                                    width: `${(() => {
                                        const parseDur = (str: string | null): number => {
                                            if (!str) return 0;
                                            const p = str.split(':');
                                            let s = 0, m = 1;
                                            while (p.length > 0) { s += m * parseFloat(p.pop() || '0'); m *= 60; }
                                            return s;
                                        };
                                        const dur = parseDur(track.audio_specs.duration);
                                        return dur > 0 ? (localProgress / dur) * 100 : 0;
                                    })()}%`
                                }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform" />
                            </div>
                        </div>
                        <div className="w-full flex justify-between text-white/30 font-mono text-sm">
                            <span>{formatDuration(localProgress)}</span>
                            <span>{track.audio_specs.duration}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls (Floating/Overlay) — restyled for immersive */}
            <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-20 transition-all duration-1000 ease-in-out px-10 py-4 rounded-2xl bg-black/30 backdrop-blur-2xl border border-white/[0.06] shadow-[0_8px_60px_rgba(0,0,0,0.5)] ${isControlsVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-6 pointer-events-none'}`}>
                <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded-full transition-all duration-300 ${state.shuffle ? 'text-white bg-white/15' : 'text-white/40 hover:text-white/80'}`}
                    title="Shuffle"
                    aria-pressed={state.shuffle}
                >
                    <Shuffle size={16} />
                </button>
                <button onClick={playPrevious} className="text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all duration-200">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                </button>
                <button onClick={togglePlay} className="w-16 h-16 bg-white/90 hover:bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg">
                    {state.isPlaying ? (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>
                    )}
                </button>
                <button onClick={playNext} className="text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all duration-200">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>
                <button
                    onClick={() => setRepeat(state.repeat === RepeatMode.None ? RepeatMode.All : state.repeat === RepeatMode.All ? RepeatMode.One : RepeatMode.None)}
                    className={`p-2 rounded-full transition-all duration-300 ${state.repeat !== RepeatMode.None ? 'text-white bg-white/15' : 'text-white/40 hover:text-white/80'}`}
                    title={`Repeat: ${state.repeat}`}
                    aria-pressed={state.repeat !== RepeatMode.None}
                >
                    {state.repeat === RepeatMode.One ? <Repeat1 size={16} /> : <Repeat size={16} />}
                </button>
            </div>
        </div>
    );
};

