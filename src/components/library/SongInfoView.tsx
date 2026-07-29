import React from 'react';
import { TrackItem } from '../../types/music';
import { ArtworkImage } from '../shared/ArtworkImage';
import { usePlayer } from '../../contexts/PlayerContext';
import { Play } from 'lucide-react';
import { parseGenres } from '../../utils/genreUtils';
import { useTranslation } from '../../i18n/I18nContext';
import { getTrackDisplayName, getTrackVersionDisplayName } from '../../utils/trackUtils';

interface SongInfoViewProps {
    track: TrackItem;
    onNavigate: (view: any, data?: any) => void;
}

export const SongInfoView: React.FC<SongInfoViewProps> = ({ track, onNavigate }) => {
    const { playTrack } = usePlayer();
    const { t } = useTranslation();
    const artwork = track.artworks?.track_artwork?.[0] || track.artworks?.album_artwork?.[0];
    const versions = track.versions || [track];
    const artists = track.metadata?.artists?.filter(Boolean) || [];
    const albumName = track.metadata?.album?.trim();
    const genres = parseGenres(track.metadata?.genre);
    const normalizedYear = track.metadata?.year?.trim();

    const navigateToAlbum = () => {
        if (!albumName) return;
        onNavigate('AlbumDetail', albumName);
    };

    const navigateToArtist = (artist: string) => {
        if (!artist) return;
        onNavigate('ArtistDetail', artist);
    };

    const navigateToYear = () => {
        if (!normalizedYear) return;
        onNavigate('AllTracks', { filter: { type: 'year', value: normalizedYear } });
    };

    const navigateToGenre = (genre: string) => {
        onNavigate('AllTracks', { filter: { type: 'genre', value: genre } });
    };

    return (
        <div className="h-full flex flex-col px-3 md:px-8 pb-6 md:pb-8 pt-0 md:pt-28 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col md:flex-row gap-6 md:gap-12 mb-6 md:mb-12">
                <div className="w-40 h-40 md:w-64 md:h-64 rounded-2xl overflow-hidden shadow-2xl border border-white/5 flex-shrink-0">
                    <ArtworkImage details={artwork} alt={getTrackDisplayName(track)} className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col justify-end">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3 md:mb-4 text-white">{getTrackDisplayName(track)}</h1>
                    <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                        {artists.length > 0 ? artists.map((artist) => (
                            <button
                                key={artist}
                                onClick={() => navigateToArtist(artist)}
                                className="text-sm md:text-lg text-white/60 hover:text-dominant-light hover:underline transition-colors font-semibold"
                                title={`${t('artists.playArtist')} ${artist}`}
                            >
                                {artist}
                            </button>
                        )) : (
                            <span className="text-lg md:text-2xl text-white/50 font-medium">{t('player.unknownArtist')}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full text-gray-400">
                            {track.logic.track_name}
                        </span>
                        <span className="text-xs font-bold bg-dominant/20 px-3 py-1 rounded-full text-dominant-light">
                            {getTrackVersionDisplayName(track)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 border-t border-white/5 pt-8">
                <div className="space-y-8">
                    <div>
                        <h3 className="text-gray-500 font-bold uppercase tracking-wider mb-4 border-b border-white/5 pb-2 text-xs">{t('songInfo.availableVersions')}</h3>
                        <div className="space-y-2">
                            {versions.map((v) => (
                                <div
                                    key={v.logic.hash_sha256}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all group ${v.logic.hash_sha256 === track.logic.hash_sha256
                                            ? 'bg-dominant/10 border-dominant/30 shadow-[0_0_20px_rgba(var(--color-dominant-rgb),0.1)]'
                                            : 'bg-white/5 border-transparent hover:border-white/10 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-bold truncate">{getTrackVersionDisplayName(v)}</span>
                                            {v.logic.hash_sha256 === track.logic.hash_sha256 && (
                                                <span className="text-[10px] bg-dominant text-white px-1.5 py-0.5 rounded uppercase font-black">{t('songInfo.latest')}</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-white/40 mt-1 flex items-center gap-2">
                                            <span>{v.audio_specs.bitrate}</span>
                                            <span>•</span>
                                            <span>{t('songInfo.modified')} {v.file.modified.split(' ')[0]}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => playTrack(v, versions)}
                                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white text-white hover:text-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 md:group-hover:opacity-0 active:opacity-100 md:active:opacity-0"
                                        aria-label={t('songInfo.playVersion')}
                                    >
                                        <Play size={16} fill="currentColor" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div>
                        <h3 className="text-gray-500 font-bold uppercase tracking-wider mb-4 border-b border-white/5 pb-2 text-xs">{t('songInfo.metadataSpecs')}</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.album')}</h4>
                                {albumName ? (
                                    <button
                                        onClick={navigateToAlbum}
                                        className="text-sm text-left hover:text-dominant-light hover:underline transition-colors"
                                        title={`${t('albums.goToArtist')} ${albumName}`}
                                    >
                                        {albumName}
                                    </button>
                                ) : (
                                    <p className="text-sm text-white/60">{t('library.unknown')}</p>
                                )}
                            </div>
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.audioQuality')}</h4>
                                <p className="text-sm">{track.audio_specs.bitrate} | {track.audio_specs.sample_rate}</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.duration')}</h4>
                                <p className="text-sm">{track.audio_specs.duration}</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.fileSize')}</h4>
                                <p className="text-sm">{(track.file.size_bytes / (1024 * 1024)).toFixed(2)} MB</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.genre')}</h4>
                                {genres.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {genres.map((genre) => (
                                            <button
                                                key={genre}
                                                onClick={() => navigateToGenre(genre)}
                                                className="text-xs bg-white/10 hover:bg-dominant/20 px-2.5 py-1 rounded-full text-white/80 hover:text-dominant-light transition-colors"
                                                title={`${t('genres.playGenre')} ${genre}`}
                                            >
                                                {genre}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-white/60">{t('library.unknown')}</p>
                                )}
                            </div>
                            <div>
                                <h4 className="text-[10px] text-white/30 font-black uppercase mb-1">{t('songInfo.year')}</h4>
                                {normalizedYear ? (
                                    <button
                                        onClick={navigateToYear}
                                        className="text-sm text-left hover:text-dominant-light hover:underline transition-colors"
                                        title={`${t('years.playYear')} ${normalizedYear}`}
                                    >
                                        {normalizedYear}
                                    </button>
                                ) : (
                                    <p className="text-sm text-white/60">{t('library.unknown')}</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-[10px] text-white/30 font-black uppercase mb-2">{t('songInfo.originalFilePath')}</h4>
                        <p className="break-all text-[10px] font-mono text-white/40 bg-white/5 p-3 rounded-lg border border-white/5">{track.file.path}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

