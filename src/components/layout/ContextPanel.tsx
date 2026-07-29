import React from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTranslation } from '../../i18n/I18nContext';
import { Visualizer } from '../player/Visualizer';
import { ImmersiveVisualizer } from '../player/ImmersiveVisualizer';
import { formatSizeMb } from '../../utils/formatters';

interface ParsedLyricLine {
    time: number;
    content: string;
    id: number;
}

interface ParsedLyrics {
    lines: ParsedLyricLine[];
    hasTimestamps: boolean;
    timedLineIndexes: Array<{ time: number; index: number }>;
}

const formatSpecValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '-';
    }

    if (typeof value === 'string') {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : '-';
    }

    return String(value);
};

export const ContextPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { state: playerState, getProgress } = usePlayer();
    const track = playerState.currentTrack;
    const [progressR, setProgressR] = React.useState(0);

    // Local timer for high-performance UI updates (lyrics scrolling)
    React.useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            setProgressR(getProgress());
        }, 200);
        return () => clearInterval(interval);
    }, [isOpen, getProgress]);

    const lyricsSourceText = React.useMemo(
        () => track?.metadata?.lyrics || track?.metadata?.description || track?.metadata?.comment || '',
        [track?.metadata?.comment, track?.metadata?.description, track?.metadata?.lyrics]
    );

    const parsedLyrics = React.useMemo(() => {
        if (!lyricsSourceText) return null;

        const lines = lyricsSourceText.split('\n');
        let hasTimestamps = false;

        const lyricsData: ParsedLyricLine[] = lines.map((line, idx) => {
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/);
            if (match) {
                hasTimestamps = true;
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const timeInSeconds = min * 60 + sec + (ms / (match[3].length === 2 ? 100 : 1000));
                const content = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/, '').trim();
                return { time: timeInSeconds, content, id: idx };
            }
            return { time: -1, content: line.trim(), id: idx };
        }).filter(l => l.content.length > 0 || l.time >= 0);

        if (lyricsData.length === 0) {
            return null;
        }

        const timedLineIndexes = lyricsData
            .map((line, index) => ({ time: line.time, index }))
            .filter((line) => line.time >= 0);

        return { lines: lyricsData, hasTimestamps, timedLineIndexes } as ParsedLyrics;
    }, [lyricsSourceText]);

    // Simple smooth scroll ref for active lyric
    const lyricsRef = React.useRef<HTMLDivElement>(null);
    const lyricsScrollTimeoutRef = React.useRef<number | null>(null);

    const activeLyricIndex = React.useMemo(() => {
        if (!parsedLyrics?.hasTimestamps || parsedLyrics.timedLineIndexes.length === 0) return -1;

        let left = 0;
        let right = parsedLyrics.timedLineIndexes.length - 1;
        let best = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const current = parsedLyrics.timedLineIndexes[mid];

            if (current.time <= progressR) {
                best = current.index;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return best;
    }, [parsedLyrics, progressR]);

    React.useEffect(() => {
        if (lyricsScrollTimeoutRef.current) {
            window.clearTimeout(lyricsScrollTimeoutRef.current);
            lyricsScrollTimeoutRef.current = null;
        }

        if (activeLyricIndex < 0 || !lyricsRef.current) {
            return;
        }

        lyricsScrollTimeoutRef.current = window.setTimeout(() => {
            const activeEl = lyricsRef.current?.querySelector(`[data-index="${activeLyricIndex}"]`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            lyricsScrollTimeoutRef.current = null;
        }, 90);

        return () => {
            if (lyricsScrollTimeoutRef.current) {
                window.clearTimeout(lyricsScrollTimeoutRef.current);
                lyricsScrollTimeoutRef.current = null;
            }
        };
    }, [activeLyricIndex]);

    if (!isOpen) return null;

    return (
        <>
            <div className="md:hidden fixed inset-0 z-[72] bg-black/55 backdrop-blur-[1px]" onClick={onClose} />
            <aside className="fixed md:static z-[73] md:z-40 left-2 right-2 md:left-auto md:right-auto bottom-[calc(10.25rem+env(safe-area-inset-bottom))] md:bottom-auto w-auto md:w-80 max-h-[56vh] md:max-h-none bg-black/65 md:bg-black/40 backdrop-blur-xl border border-white/10 md:border-l md:border-white/10 md:border-t-0 md:border-r-0 rounded-2xl md:rounded-none flex flex-col h-auto md:h-full overflow-y-auto md:overflow-hidden transition-all duration-300 relative shadow-2xl md:shadow-none">
                <div className="absolute inset-0 bg-dominant/5 pointer-events-none"></div>
                <div className="relative z-10 p-3 md:p-4 md:pt-6 flex flex-col h-full">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2.5 md:pb-4 mb-2.5 md:mb-4">
                        <h2 className="text-white font-bold tracking-tight text-sm md:text-lg">{t('contextPanel.trackDetails')}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 min-w-9 min-h-9 flex items-center justify-center rounded-lg hover:bg-white/5" aria-label={t('contextPanel.closePanel')}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    <div className="md:hidden text-[10px] uppercase tracking-[0.18em] text-white/45 mb-2">{t('contextPanel.reader')}</div>

                    <div className="flex-1 md:overflow-y-auto md:custom-scrollbar flex flex-col gap-3 md:gap-6 md:pr-2">
                        {/* Visualizer */}
                        <div className="bg-white/5 rounded-xl p-2.5 md:p-4 border border-white/5 shadow-inner">
                            <h3 className="text-[10px] md:text-[11px] text-gray-500 uppercase tracking-widest font-bold mb-2 md:mb-4">{t('contextPanel.audioOutput')}</h3>
                            <div className="relative bg-black/20 rounded-lg p-1.5 md:p-2 overflow-hidden border border-black/70">
                                <ImmersiveVisualizer track={track} className="opacity-100" />
                                <Visualizer />
                            </div>
                        </div>

                        {!track ? (
                            <div className="text-center text-gray-500 mt-4 md:mt-10 text-xs md:text-sm font-medium">{t('contextPanel.noTrackPlaying')}</div>
                        ) : (
                            <>
                                {/* Audio Specs */}
                                <div>
                                    <h3 className="text-[10px] md:text-[11px] text-dominant-light uppercase tracking-widest font-bold mb-2 md:mb-3 border-b border-dominant/30 pb-1 inline-block">{t('contextPanel.technicalSpecs')}</h3>
                                    <ul className="space-y-2 md:space-y-2.5 text-[11px] md:text-xs">
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.codec')}</span>
                                            <span className="text-white uppercase font-mono bg-white/10 px-1.5 py-0.5 rounded">{formatSpecValue(track.audio_specs?.codec)}</span>
                                        </li>
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.bitRate')}</span>
                                            <span className="text-white font-mono">{formatSpecValue(track.audio_specs?.bitrate)}</span>
                                        </li>
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.sampleRate')}</span>
                                            <span className="text-white font-mono">{formatSpecValue(track.audio_specs?.sample_rate)}</span>
                                        </li>
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.channels')}</span>
                                            <span className="text-white font-mono">{formatSpecValue(track.audio_specs?.channels)}</span>
                                        </li>
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.quality')}</span>
                                            <span className={`font-black tracking-widest font-mono text-[10px] px-2 py-0.5 rounded ${track.audio_specs?.is_lossless ? 'bg-dominant text-black shadow' : 'bg-white/5 text-gray-400'}`}>
                                                {track.audio_specs?.is_lossless ? t('contextPanel.lossless') : t('contextPanel.lossy')}
                                            </span>
                                        </li>
                                    </ul>
                                </div>

                                {/* Metadata Details */}
                                <div>
                                    <h3 className="text-[10px] md:text-[11px] text-dominant-light uppercase tracking-widest font-bold mb-2 md:mb-3 border-b border-dominant/30 pb-1 inline-block">{t('contextPanel.metadata')}</h3>
                                    <ul className="space-y-2 md:space-y-2.5 text-[11px] md:text-xs">
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.bpm')}</span>
                                            <span className="text-white font-mono">{formatSpecValue(track.metadata?.bpm)}</span>
                                        </li>
                                        <li className="flex justify-between items-start">
                                            <span className="text-gray-400">{t('contextPanel.genre')}</span>
                                            <span className="text-white text-right break-words max-w-[150px]">
                                                {Array.isArray(track.metadata?.genre) ? track.metadata.genre.join(', ') : formatSpecValue(track.metadata?.genre)}
                                            </span>
                                        </li>
                                        <li className="flex justify-between items-center">
                                            <span className="text-gray-400">{t('contextPanel.year')}</span>
                                            <span className="text-white font-mono">{formatSpecValue(track.metadata?.year)}</span>
                                        </li>
                                    </ul>
                                </div>

                                {/* File Info */}
                                <div>
                                    <h3 className="text-[10px] md:text-[11px] text-dominant-light uppercase tracking-widest font-bold mb-2 md:mb-3 border-b border-dominant/30 pb-1 inline-block">{t('contextPanel.fileInfo')}</h3>
                                    <ul className="space-y-2 md:space-y-2.5 text-[11px] md:text-xs">
                                        <li className="flex flex-col gap-1.5 bg-black/20 p-2 rounded border border-white/5">
                                            <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">{t('contextPanel.filePath')}</span>
                                            <span className="text-gray-300 opacity-70 font-mono tracking-tight break-all leading-snug">{track.file.path}</span>
                                        </li>
                                        <li className="flex justify-between items-center mt-1 md:mt-3">
                                            <span className="text-gray-400">{t('contextPanel.size')}</span>
                                            <span className="text-white font-mono">{formatSizeMb(track.file.size_bytes)}</span>
                                        </li>
                                    </ul>
                                </div>

                                {parsedLyrics && (
                                    <div className="flex-1 flex flex-col min-h-[140px] md:min-h-[200px] mt-1 md:mt-4">
                                        <h3 className="text-[10px] md:text-[11px] text-dominant-light uppercase tracking-widest font-bold mb-2 md:mb-3 border-b border-dominant/30 pb-1 inline-block">{t('contextPanel.lyrics')}</h3>
                                        <div
                                            ref={lyricsRef}
                                            className="flex-1 overflow-y-auto custom-scrollbar pr-1 md:pr-2 space-y-1.5 md:space-y-2 text-xs md:text-sm"
                                            style={{ scrollBehavior: 'smooth' }}
                                        >
                                            {parsedLyrics.lines.map((line: any, idx: number) => {
                                                if (line.content === '' && line.time === -1) {
                                                    return <div key={line.id} className="h-3 md:h-4" />;
                                                }
                                                const isActive = activeLyricIndex === idx;
                                                return (
                                                    <div
                                                        key={line.id}
                                                        data-index={idx}
                                                        className={`transition-colors duration-300 ${!parsedLyrics.hasTimestamps ? 'text-gray-300' :
                                                            isActive ? 'text-dominant font-bold scale-[1.02] transform origin-left' :
                                                                'text-gray-500 hover:text-gray-300'
                                                            }`}
                                                    >
                                                        {line.content || '♪'}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
};
