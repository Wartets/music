import React from 'react';
import { AudioLines, CalendarRange, Database, Disc3, FileAudio, Gauge, PieChart } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { EmptyState } from '../shared/EmptyState';
import { parseDuration } from '../../utils/formatters';
import type { TrackItem } from '../../types/music';
import { useTranslation } from '../../i18n/I18nContext';

interface DistributionRow {
    label: string;
    count: number;
}

const numberFormatter = new Intl.NumberFormat();

const parseNumericString = (value?: string | null): number => {
    if (!value) return 0;
    const match = value.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
};

const getTrackTimestamp = (track: TrackItem): number | null => {
    const epoch = track.file?.epoch_created;
    if (typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0) {
        return epoch * 1000;
    }

    const created = track.file?.created;
    if (!created) return null;

    const parsed = Date.parse(created);
    return Number.isFinite(parsed) ? parsed : null;
};

const BarList: React.FC<{ data: DistributionRow[]; colorClass?: string }> = ({ data, colorClass = 'bg-dominant' }) => {
    const max = data.reduce((highest, item) => Math.max(highest, item.count), 1);

    return (
        <div className="space-y-3">
            {data.map((item) => (
                <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-300 font-semibold truncate">{item.label}</span>
                        <span className="text-gray-500 font-mono">{numberFormatter.format(item.count)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                            className={`h-full ${colorClass} transition-all duration-500`}
                            style={{ width: `${(item.count / max) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

export const AnalysisView: React.FC = () => {
    const { state } = useLibrary();
    const { t } = useTranslation();

    const analysis = React.useMemo(() => {
        const tracks = state.filteredTracks;
        const totalTracks = tracks.length;

        const formatMap = new Map<string, number>();
        const yearMap = new Map<number, number>();
        const bitrateBuckets: Record<'lossyLow' | 'lossyMid' | 'lossyHigh' | 'lossless' | 'unknown', number> = {
            lossyLow: 0,
            lossyMid: 0,
            lossyHigh: 0,
            lossless: 0,
            unknown: 0
        };

        let lossless = 0;
        let lossy = 0;
        let totalSeconds = 0;
        let totalSizeMb = 0;
        let oldestTimestamp: number | null = null;
        let newestTimestamp: number | null = null;

        tracks.forEach((track) => {
            totalSeconds += parseDuration(track.audio_specs?.duration);
            totalSizeMb += track.file?.size_mb || 0;

            if (track.audio_specs?.is_lossless) {
                lossless += 1;
            } else {
                lossy += 1;
            }

            const ext = (track.file?.ext || 'Unknown').replace('.', '').toUpperCase();
            const codec = track.audio_specs?.codec?.trim();
            const formatKey = codec ? `${ext} · ${codec.toUpperCase()}` : ext;
            formatMap.set(formatKey, (formatMap.get(formatKey) || 0) + 1);

            const bitrate = parseNumericString(track.audio_specs?.bitrate);
            if (track.audio_specs?.is_lossless) {
                bitrateBuckets.lossless += 1;
            } else if (bitrate === 0) {
                bitrateBuckets.unknown += 1;
            } else if (bitrate < 160) {
                bitrateBuckets.lossyLow += 1;
            } else if (bitrate < 320) {
                bitrateBuckets.lossyMid += 1;
            } else {
                bitrateBuckets.lossyHigh += 1;
            }

            const timestamp = getTrackTimestamp(track);
            if (timestamp !== null) {
                oldestTimestamp = oldestTimestamp === null ? timestamp : Math.min(oldestTimestamp, timestamp);
                newestTimestamp = newestTimestamp === null ? timestamp : Math.max(newestTimestamp, timestamp);

                const year = new Date(timestamp).getFullYear();
                yearMap.set(year, (yearMap.get(year) || 0) + 1);
            } else {
                const fallbackYear = Number(track.metadata?.year);
                if (Number.isFinite(fallbackYear) && fallbackYear > 0) {
                    yearMap.set(fallbackYear, (yearMap.get(fallbackYear) || 0) + 1);
                }
            }
        });

        const formatDistribution = [...formatMap.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        const yearDistribution = [...yearMap.entries()]
            .map(([year, count]) => ({ label: String(year), count }))
            .sort((a, b) => Number(a.label) - Number(b.label));

        const topFormats = formatDistribution.slice(0, 8);
        const recentYears = yearDistribution.slice(-8);
        const averageDurationSeconds = totalTracks > 0 ? totalSeconds / totalTracks : 0;

        return {
            totalTracks,
            totalSeconds,
            totalSizeMb,
            averageDurationSeconds,
            lossless,
            lossy,
            losslessRatio: totalTracks > 0 ? (lossless / totalTracks) * 100 : 0,
            formatDistribution,
            topFormats,
            recentYears,
            bitrateBuckets,
            oldestTimestamp,
            newestTimestamp
        };
    }, [state.filteredTracks]);

    if (analysis.totalTracks === 0) {
        return (
            <div className="h-full p-6 md:p-8 pt-0 md:pt-24 bg-surface-primary">
                <EmptyState
                    icon={<PieChart size={40} />}
                    title={t('analysis.noTracks')}
                    subtitle={t('analysis.noTracksDesc')}
                    className="rounded-3xl bg-white/[0.03] border border-white/5"
                />
            </div>
        );
    }

    const donutStyle = {
        background: `conic-gradient(rgb(34 197 94) ${analysis.losslessRatio}%, rgb(234 88 12) ${analysis.losslessRatio}% 100%)`
    };

    const bitrateRows: DistributionRow[] = [
        { label: t('analysis.lossless'), count: analysis.bitrateBuckets.lossless },
        { label: t('analysis.lossyLow'), count: analysis.bitrateBuckets.lossyLow },
        { label: t('analysis.lossyMid'), count: analysis.bitrateBuckets.lossyMid },
        { label: t('analysis.lossyHigh'), count: analysis.bitrateBuckets.lossyHigh },
        { label: t('analysis.unknownBitrate'), count: analysis.bitrateBuckets.unknown }
    ].filter((row) => row.count > 0);

    return (
        <div className="h-full p-6 md:p-8 pt-0 md:pt-24 bg-surface-primary overflow-y-auto custom-scrollbar">
            <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                    <AudioLines size={30} className="text-dominant" />
                    {t('analysis.title')}
                </h1>
                <p className="text-xs md:text-sm text-gray-400 font-semibold mt-2">
                    {t('analysis.description')} {numberFormatter.format(analysis.totalTracks)} {t('nav.tracks')}.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.tracksInScope')}</p>
                    <p className="text-2xl font-black text-white mt-2">{numberFormatter.format(analysis.totalTracks)}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.totalDuration')}</p>
                    <p className="text-2xl font-black text-white mt-2">{Math.floor(analysis.totalSeconds / 3600)}{t('analysis.hours')} {Math.floor((analysis.totalSeconds % 3600) / 60)}{t('analysis.minutes')}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.avgTrackLength')}</p>
                    <p className="text-2xl font-black text-white mt-2">{Math.floor(analysis.averageDurationSeconds / 60)}{t('analysis.minutes')} {Math.floor(analysis.averageDurationSeconds % 60)}{t('analysis.seconds')}</p>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.estimatedSize')}</p>
                    <p className="text-2xl font-black text-white mt-2">{analysis.totalSizeMb.toFixed(1)} MB</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className="rounded-3xl bg-white/5 border border-white/5 p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-5">
                        <PieChart size={16} className="text-dominant" />
                        {t('analysis.losslessVsLossy')}
                    </h2>
                    <div className="flex flex-col sm:flex-row items-center gap-5">
                        <div className="w-36 h-36 rounded-full p-3" style={donutStyle}>
                            <div className="w-full h-full rounded-full bg-[#0b0b0b] flex items-center justify-center text-center">
                                <div>
                                    <p className="text-2xl font-black text-white">{analysis.losslessRatio.toFixed(1)}%</p>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">{t('analysis.lossless')}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 w-full">
                            <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-300">{t('analysis.lossless')}</span>
                                <span className="text-sm font-black text-green-400">{numberFormatter.format(analysis.lossless)}</span>
                            </div>
                            <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-300">{t('analysis.lossyLow')}</span>
                                <span className="text-sm font-black text-orange-400">{numberFormatter.format(analysis.lossy)}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-3xl bg-white/5 border border-white/5 p-6 xl:col-span-2">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-5">
                        <FileAudio size={16} className="text-dominant" />
                        {t('analysis.formatStats')}
                    </h2>
                    <BarList data={analysis.topFormats} />
                    {analysis.formatDistribution.length > analysis.topFormats.length && (
                        <p className="mt-4 text-[11px] text-gray-500">
                            {t('analysis.showingTop')} {analysis.topFormats.length} {t('analysis.of')} {analysis.formatDistribution.length} {t('analysis.detectedFormats')}
                        </p>
                    )}
                </section>

                <section className="rounded-3xl bg-white/5 border border-white/5 p-6 xl:col-span-2">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-5">
                        <Gauge size={16} className="text-dominant" />
                        {t('analysis.bitrateProfile')}
                    </h2>
                    <BarList data={bitrateRows} colorClass="bg-gradient-to-r from-emerald-500 to-cyan-400" />
                </section>

                <section className="rounded-3xl bg-white/5 border border-white/5 p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-5">
                        <CalendarRange size={16} className="text-dominant" />
                        {t('analysis.dateRange')}
                    </h2>
                    <div className="space-y-3 mb-4">
                        <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.oldest')}</p>
                            <p className="text-sm font-bold text-white mt-1">
                                {analysis.oldestTimestamp ? new Date(analysis.oldestTimestamp).toLocaleDateString() : t('analysis.unknownLabel')}
                            </p>
                        </div>
                        <div className="rounded-xl bg-white/5 border border-white/5 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t('analysis.newest')}</p>
                            <p className="text-sm font-bold text-white mt-1">
                                {analysis.newestTimestamp ? new Date(analysis.newestTimestamp).toLocaleDateString() : t('analysis.unknownLabel')}
                            </p>
                        </div>
                    </div>
                    {analysis.recentYears.length > 0 ? (
                        <BarList data={analysis.recentYears} colorClass="bg-purple-500" />
                    ) : (
                        <p className="text-xs text-gray-500">{t('analysis.noYearMeta')}</p>
                    )}
                </section>

                <section className="rounded-3xl bg-white/5 border border-white/5 p-6 xl:col-span-3">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-5">
                        <Database size={16} className="text-dominant" />
                        {t('analysis.fullBreakdown')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {analysis.formatDistribution.map((row) => (
                            <div key={row.label} className="rounded-xl bg-black/30 border border-white/5 px-3 py-2 flex items-center justify-between gap-3">
                                <span className="text-xs text-gray-300 font-semibold truncate flex items-center gap-2">
                                    <Disc3 size={13} className="text-gray-500" />
                                    {row.label}
                                </span>
                                <span className="text-xs font-mono text-gray-400">{numberFormatter.format(row.count)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};
