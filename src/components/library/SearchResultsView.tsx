import React, { useMemo } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { ArtworkImage } from '../shared/ArtworkImage';
import { Search, Clock, Disc3, Mic2, Hash } from 'lucide-react';
import { ViewType } from '../layout/AppLayout';
import { getCollectionArtwork } from '../../utils/artworkResolver';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName } from '../../utils/trackUtils';

interface SearchResultsViewProps {
    query?: string;
    sourceView?: ViewType;
    onNavigate: (view: ViewType, data?: any) => void;
}

const compactViews = new Set<ViewType>(['Albums', 'AlbumDetail', 'Artists', 'Years', 'Folders', 'Formats']);

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({ query, sourceView, onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { playTrack } = usePlayer();
    const { openItemContextMenu } = useItemContextMenu();
    const { t } = useTranslation();

    const safeQuery = (query || libraryState.searchQuery || '').trim();
    const results = libraryState.filteredTracks;

    const grouped = useMemo(() => {
        const singleLabel = t('library.single');
        const albumGroups = new Map<string, { name: string; tracks: any[]; artwork?: any }>();
        const artistGroups = new Map<string, { name: string; tracks: any[] }>();

        results.forEach(track => {
            const albumName = track.metadata?.album || track.logic?.hierarchy?.album || singleLabel;
            if (!albumGroups.has(albumName)) {
                albumGroups.set(albumName, {
                    name: albumName,
                    tracks: []
                });
            }
            albumGroups.get(albumName)!.tracks.push(track);

            (track.metadata?.artists || [t('library.unknownArtist')]).forEach((artist: string) => {
                if (!artistGroups.has(artist)) artistGroups.set(artist, { name: artist, tracks: [] });
                artistGroups.get(artist)!.tracks.push(track);
            });
        });

        return {
            albums: [...albumGroups.values()].map(group => ({
                ...group,
                artwork: group.name.toLowerCase() === singleLabel.toLowerCase() ? undefined : getCollectionArtwork(group.tracks)
            })).sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12),
            artists: [...artistGroups.values()].sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12)
        };
    }, [results, t]);

    const isCompact = compactViews.has(sourceView || 'Dashboard');

    const openTrack = (track: any) => playTrack(track, results);

    return (
        <div className="h-full flex flex-col p-3 md:p-6 pt-0 md:pt-20 overflow-y-auto custom-scrollbar bg-surface-primary">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-4 md:mb-8">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.35em] text-dominant/70 mb-2 flex items-center gap-2">
                        <Search size={12} /> {t('search.searchResults')}
                    </div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter text-white truncate max-w-full">
                        {safeQuery || t('search.allResults')}
                    </h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-2">
                        {results.length} {t('search.tracks')} {t('search.matchedFrom')} {sourceView ? `${sourceView.toLowerCase()} ${t('search.contextAware').toLowerCase()}` : t('search.contextAware').toLowerCase()}.
                    </p>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 flex-wrap">
                    <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-1.5"><Disc3 size={12} /> {t('search.tracks')}</span>
                    <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-1.5"><Mic2 size={12} /> {t('search.artists')}</span>
                    <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-1.5"><Hash size={12} /> {t('search.contextAware')}</span>
                </div>
            </div>

            {results.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center px-6">
                    <Search size={48} className="mb-4 opacity-20" />
                    <div className="text-sm font-bold">{t('search.noMatchesFound')}</div>
                    <div className="text-xs mt-1 max-w-md">{t('search.noMatchesDesc')}</div>
                </div>
            ) : isCompact ? (
                <div className="space-y-8 pb-28">
                    {grouped.albums.map(group => (
                        <section key={group.name} className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('search.albumResult')}</div>
                                    <h2 className="text-xl md:text-3xl font-black text-white truncate">{group.name}</h2>
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{group.tracks.length} {t('search.tracks')}</div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                {group.tracks.slice(0, 6).map(track => (
                                    <button
                                        key={track.logic.hash_sha256}
                                        onClick={() => openTrack(track)}
                                        onContextMenu={(e) => openItemContextMenu(e, track, results, onNavigate)}
                                        className="flex items-center gap-3 text-left p-3 rounded-2xl bg-black/20 border border-white/5 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/5">
                                            <ArtworkImage details={track.artworks?.track_artwork?.[0] || track.artworks?.album_artwork?.[0]} alt={getTrackDisplayName(track)} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-bold text-white truncate">{getTrackDisplayName(track)}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{track.metadata?.artists?.join(', ') || t('library.unknownArtist')}</div>
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-500">{track.audio_specs?.duration || '0:00'}</div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-6 pb-28">
                    <section className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black text-white flex items-center gap-2"><Clock size={18} className="text-dominant" /> {t('search.tracks')}</h2>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('search.denseList')}</span>
                        </div>
                        <div className="space-y-2">
                            {results.slice(0, 60).map(track => (
                                <div
                                    key={track.logic.hash_sha256}
                                    onClick={() => openTrack(track)}
                                    onContextMenu={(e) => openItemContextMenu(e, track, results, onNavigate)}
                                    className="flex items-center gap-4 p-3 rounded-2xl bg-black/20 border border-transparent hover:bg-white/5 hover:border-white/5 cursor-pointer transition-colors"
                                >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 border border-white/5">
                                        <ArtworkImage details={track.artworks?.track_artwork?.[0] || track.artworks?.album_artwork?.[0]} alt={getTrackDisplayName(track)} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-bold text-white truncate">{getTrackDisplayName(track)}</div>
                                        <div className="text-[10px] text-gray-500 truncate uppercase tracking-widest">{track.metadata?.artists?.join(', ') || t('library.unknownArtist')} • {track.metadata?.album || t('library.single')}</div>
                                    </div>
                                    <div className="text-[10px] font-mono text-gray-500">{track.audio_specs?.duration || '0:00'}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <aside className="space-y-6">
                        <section className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6">
                            <h2 className="text-lg font-black text-white flex items-center gap-2 mb-4"><Mic2 size={18} className="text-dominant" /> {t('search.artists')}</h2>
                            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar">
                                {grouped.artists.slice(0, 10).map(artist => (
                                    <button
                                        key={artist.name}
                                        onClick={() => onNavigate('ArtistDetail', artist.name)}
                                        className="w-full text-left p-3 rounded-2xl bg-black/20 border border-transparent hover:bg-white/5 hover:border-white/5 transition-colors"
                                    >
                                        <div className="text-sm font-bold text-white truncate">{artist.name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">{artist.tracks.length} {t('search.matchingTracks')}</div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6">
                            <h2 className="text-lg font-black text-white flex items-center gap-2 mb-4"><Disc3 size={18} className="text-dominant" /> {t('search.albums')}</h2>
                            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1 custom-scrollbar">
                                {grouped.albums.slice(0, 10).map(album => (
                                    <button
                                        key={album.name}
                                        onClick={() => onNavigate('AlbumDetail', album.name)}
                                        className="w-full text-left p-3 rounded-2xl bg-black/20 border border-transparent hover:bg-white/5 hover:border-white/5 transition-colors"
                                    >
                                        <div className="text-sm font-bold text-white truncate">{album.name}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">{album.tracks.length} {t('search.matchingTracks')}</div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </aside>
                </div>
            )}
        </div>
    );
};

