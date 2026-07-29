import React, { useMemo } from 'react';
import { AlbumGroup } from '../../types/music';
import { useLibrary } from '../../contexts/LibraryContext';
import { LibraryBrowser } from './LibraryBrowser';
import { getTrackCollectionKey, getTrackCollectionLabel } from '../../utils/collectionLabels';
import { EmptyState } from '../shared/EmptyState';
import { Folder } from 'lucide-react';
import { getCollectionArtwork } from '../../utils/artworkResolver';
import { sortTracksByTrackNumber } from '../../utils/trackSorting';
import { useTranslation } from '../../i18n/I18nContext';

const UNKNOWN_ALBUM_LABELS = new Set(['', '-', 'unknown', 'unknown album', 'n/a', 'na', 'null']);

const isUnknownAlbumName = (value: string | null | undefined): boolean => {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return UNKNOWN_ALBUM_LABELS.has(normalized);
};


interface AlbumContentsViewProps {
    album: AlbumGroup | string;
    onNavigate: (view: any, data: any) => void;
}

export const AlbumContentsView: React.FC<AlbumContentsViewProps> = ({ album: initialAlbum, onNavigate }) => {
    const { state: libraryState } = useLibrary();
    const { t } = useTranslation();

    const album = useMemo(() => {
        if (typeof initialAlbum === 'object' && initialAlbum !== null && 'tracks' in initialAlbum) {
            const sorted = sortTracksByTrackNumber(initialAlbum.tracks);
            const isArtworkDisabledCollection = initialAlbum.name.toLowerCase() === t('library.single').toLowerCase() || isUnknownAlbumName(initialAlbum.name);
            const collectionArtwork = isArtworkDisabledCollection ? undefined : getCollectionArtwork(sorted);
            return {
                ...initialAlbum,
                tracks: sorted,
                artworkPath: collectionArtwork?.path,
                dominantColor: collectionArtwork?.dominant_color || initialAlbum.dominantColor || '#1a1a1a'
            } as AlbumGroup;
        }

        const albumName = typeof initialAlbum === 'string' ? initialAlbum : (initialAlbum as any)?.name;
        if (!albumName) return null;

        const tracks = sortTracksByTrackNumber(libraryState.tracks.filter(t => {
            return getTrackCollectionKey(t) === `album:${albumName.toLowerCase()}` || getTrackCollectionLabel(t) === albumName;
        }));
        if (tracks.length === 0) return null;

        const isArtworkDisabledCollection = albumName.toLowerCase() === t('library.single').toLowerCase() || isUnknownAlbumName(albumName);
        const collectionArtwork = isArtworkDisabledCollection ? undefined : getCollectionArtwork(tracks);

        return {
            name: albumName,
            artist: tracks[0].metadata?.album_artist || tracks[0].metadata?.artists?.[0] || t('library.unknownArtist'),
            tracks: tracks,
            artworkPath: collectionArtwork?.path,
            dominantColor: collectionArtwork?.dominant_color || '#1a1a1a'
        } as AlbumGroup;
    }, [initialAlbum, libraryState.tracks, t]);

    if (!album) return (
        <EmptyState
            icon={<Folder size={36} />}
            title={t('albumContents.notFound')}
            className="h-full px-6"
            titleClassName="font-bold uppercase tracking-widest text-white/40"
            action={
                <button
                    onClick={() => onNavigate('Albums', null)}
                    className="px-4 py-2.5 min-h-11 rounded-xl border border-white/10 text-white/80 hover:text-white hover:bg-white/5 transition-colors text-[10px] font-black tracking-[0.25em]"
                >
                    {t('albumContents.backToAlbums')}
                </button>
            }
        />
    );

    return (
        <LibraryBrowser
            title={album.name}
            subtitle={album.artist}
            tracks={album.tracks}
            onNavigate={onNavigate}
            artworkPath={album.artworkPath}
        />
    );
};
