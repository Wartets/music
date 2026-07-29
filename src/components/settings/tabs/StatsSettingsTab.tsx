import React, { useMemo } from 'react';
import { BarChart3, Disc3, Music } from 'lucide-react';
import { useTranslation } from '../../../i18n/I18nContext';
import { useSettingsView } from '../SettingsViewContext';

const GENRE_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
    '#a855f7', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef',
    '#22c55e', '#eab308', '#64748b',
];

const DonutChart: React.FC<{ data: Array<[string, number]>; total: number }> = ({ data, total }) => {
    const segments = useMemo(() => {
        let cumulative = 0;
        return data.map(([genre, count], i) => {
            const percent = (count / total) * 100;
            const offset = cumulative;
            cumulative += percent;
            return { genre, count, percent, offset, color: GENRE_COLORS[i % GENRE_COLORS.length] };
        });
    }, [data, total]);

    const radius = 80;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="relative flex-shrink-0">
                <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
                    {segments.map((seg, i) => (
                        <circle
                            key={i}
                            cx="110"
                            cy="110"
                            r={radius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${(seg.percent / 100) * circumference} ${circumference}`}
                            strokeDashoffset={-(seg.offset / 100) * circumference}
                            className="transition-all duration-700"
                            strokeLinecap="butt"
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-white">{data.length}</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">genres</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 min-w-0">
                {segments.slice(0, 12).map((seg) => (
                    <div key={seg.genre} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-xs text-gray-300 truncate">{seg.genre}</span>
                        <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{seg.percent.toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const StatsSettingsTab: React.FC = () => {
    const { t } = useTranslation();
    const { statsCards, detailedStats } = useSettingsView();

    const genreTotal = useMemo(
        () => detailedStats.genreFullDistribution.reduce((sum, [, count]) => sum + count, 0),
        [detailedStats.genreFullDistribution]
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Overview Stats */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-white flex items-center gap-3">
                            <BarChart3 className="text-dominant" size={24} />
                            {t('settings.stats.title')}
                        </h2>
                        <p className="text-sm text-gray-500">{t('settings.stats.description')}</p>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {t('settings.stats.updatedFrom')}
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {statsCards.map(card => (
                        <div key={card.label} className="p-5 rounded-2xl bg-black/25 border border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{card.label}</div>
                            <div className="text-2xl font-black text-white truncate">{card.value}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 space-y-3">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.totalPlaytime')}</span><span className="text-sm font-black text-dominant">{detailedStats.totalPlaytimeMinutes} {t('settings.stats.min')}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.avgQuality')}</span><span className="text-sm font-black text-white">{detailedStats.averageBitrate} {t('settings.stats.kbps')}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.avgDuration')}</span><span className="text-sm font-black text-white">{detailedStats.averageDurationMinutes.toFixed(1)} {t('settings.stats.min')}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.librarySize')}</span><span className="text-sm font-black text-white">{detailedStats.totalSizeGb.toFixed(2)} {t('settings.stats.gb')}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.albums')}</span><span className="text-sm font-black text-white">{detailedStats.totalAlbums}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.artists')}</span><span className="text-sm font-black text-white">{detailedStats.totalArtists}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.genres')}</span><span className="text-sm font-black text-white">{detailedStats.totalGenres}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.folders')}</span><span className="text-sm font-black text-white">{detailedStats.totalFolders}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.versions')}</span><span className="text-sm font-black text-white">{detailedStats.totalVersions}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.singles')}</span><span className="text-sm font-black text-white">{detailedStats.singlesCount}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.topCodec')}</span><span className="text-sm font-black text-white">{detailedStats.topCodec}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.avgSampleRate')}</span><span className="text-sm font-black text-white">{detailedStats.averageSampleRateKhz.toFixed(1)} {t('settings.stats.khz')}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.yearRange')}</span><span className="text-sm font-black text-white">{detailedStats.oldestYear && detailedStats.newestYear ? `${detailedStats.oldestYear}-${detailedStats.newestYear}` : '-'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.lossless')}</span><span className="text-sm font-black text-white">{detailedStats.losslessCount} ({detailedStats.totalTracks > 0 ? Math.round((detailedStats.losslessCount / detailedStats.totalTracks) * 100) : 0}{t('settings.stats.percent')})</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.ratedTracks')}</span><span className="text-sm font-black text-white">{detailedStats.ratedTracksCount} {detailedStats.ratedTracksCount > 0 ? `(${detailedStats.averageRating.toFixed(1)}★)` : ''}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.historyEntries')}</span><span className="text-sm font-black text-white">{detailedStats.historyCount}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('settings.stats.favorites')}</span><span className="text-sm font-black text-white">{detailedStats.favoritesCount}</span></div>
                </div>
            </div>

            {/* Genre Analysis */}
            {detailedStats.genreFullDistribution.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
                    <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-2">
                        <Disc3 className="text-dominant" size={24} />
                        {t('settings.stats.genreMix')}
                    </h2>
                    <p className="text-sm text-gray-500 mb-8">Distribution across {detailedStats.totalGenres} genres</p>

                    {/* Donut Chart */}
                    <DonutChart data={detailedStats.genreFullDistribution.slice(0, 12)} total={genreTotal} />

                    {/* Horizontal Bar Chart — All Genres */}
                    <div className="mt-10 pt-8 border-t border-white/5">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-5">Track Count by Genre</h3>
                        <div className="space-y-3">
                            {detailedStats.genreFullDistribution.slice(0, 15).map(([genre, count], i) => (
                                <div key={genre} className="group">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-gray-300 font-medium">{genre}</span>
                                        <span className="text-gray-500">{count}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700 group-hover:brightness-125"
                                            style={{
                                                width: `${(count / detailedStats.maxGenreCount) * 100}%`,
                                                backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length],
                                                opacity: 0.7,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Genre by Format (Lossless vs Lossy) */}
                    {detailedStats.genreByFormat.length > 0 && (
                        <div className="mt-10 pt-8 border-t border-white/5">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-5">
                                <span className="flex items-center gap-2">
                                    <Music size={12} className="text-dominant" />
                                    Quality by Genre (Lossless vs Lossy)
                                </span>
                            </h3>
                            <div className="space-y-3">
                                {detailedStats.genreByFormat.map(({ genre, lossless, lossy }) => {
                                    const total = lossless + lossy;
                                    const losslessPct = total > 0 ? (lossless / total) * 100 : 0;
                                    return (
                                        <div key={genre}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-gray-300 font-medium">{genre}</span>
                                                <span className="text-gray-500">{losslessPct.toFixed(0)}% lossless</span>
                                            </div>
                                            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden flex">
                                                <div
                                                    className="h-full bg-emerald-500/70 transition-all duration-700"
                                                    style={{ width: `${losslessPct}%` }}
                                                />
                                                <div
                                                    className="h-full bg-amber-500/50 transition-all duration-700"
                                                    style={{ width: `${100 - losslessPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-4 mt-4 text-[10px] text-gray-500">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />Lossless</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />Lossy</span>
                            </div>
                        </div>
                    )}

                    {/* Genre by Decade */}
                    {detailedStats.genreByDecade.length > 0 && (
                        <div className="mt-10 pt-8 border-t border-white/5">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-5">Genre Evolution by Decade</h3>
                            <div className="space-y-5">
                                {detailedStats.genreByDecade.map(({ decade, genres }) => {
                                    const decadeTotal = genres.reduce((sum, [, c]) => sum + c, 0);
                                    return (
                                        <div key={decade}>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-sm font-black text-white w-12">{decade}</span>
                                                <span className="text-[10px] text-gray-600">{decadeTotal} tracks</span>
                                            </div>
                                            <div className="h-4 bg-white/5 rounded-full overflow-hidden flex">
                                                {genres.map(([genre, count], i) => {
                                                    const pct = (count / decadeTotal) * 100;
                                                    const colorIdx = detailedStats.genreFullDistribution.findIndex(([g]) => g === genre);
                                                    const color = GENRE_COLORS[(colorIdx >= 0 ? colorIdx : i) % GENRE_COLORS.length];
                                                    return (
                                                        <div
                                                            key={genre}
                                                            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                                                            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.75 }}
                                                            title={`${genre}: ${count} (${pct.toFixed(0)}%)`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                                                {genres.slice(0, 4).map(([genre, count], i) => {
                                                    const colorIdx = detailedStats.genreFullDistribution.findIndex(([g]) => g === genre);
                                                    const color = GENRE_COLORS[(colorIdx >= 0 ? colorIdx : i) % GENRE_COLORS.length];
                                                    return (
                                                        <span key={genre} className="flex items-center gap-1 text-[10px] text-gray-500">
                                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                                            {genre} ({count})
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
