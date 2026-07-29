import React, { useEffect, useMemo } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { LibraryBrowser } from './LibraryBrowser';
import { Hash } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface AllTracksViewProps {
    onNavigate?: (view: any, data?: any) => void;
    initialFilter?: {
        type: 'year' | 'folder' | 'format' | 'genre' | 'artist';
        value: string;
    };
}

export const AllTracksView: React.FC<AllTracksViewProps> = ({ onNavigate, initialFilter }) => {
    const { state: libraryState, setSearchQuery } = useLibrary();
    const { t } = useTranslation();

    const typeLabelByKey = useMemo<Record<'year' | 'folder' | 'format' | 'genre' | 'artist', string>>(() => ({
        year: t('years.title'),
        folder: t('folders.title'),
        format: t('formats.title'),
        genre: t('genres.title'),
        artist: t('artists.title'),
    }), [t]);

    useEffect(() => {
        if (initialFilter) {
            const { type, value } = initialFilter;
            const normalizedValue = /\s/.test(value) ? `"${value}"` : value;
            setSearchQuery(`${type}:${normalizedValue}`);
        }
    }, [initialFilter, setSearchQuery]);

    const title = useMemo(() => {
        if (initialFilter) {
            return `${typeLabelByKey[initialFilter.type]}: ${initialFilter.value}`;
        }
        return t('nav.allTracks');
    }, [initialFilter, t, typeLabelByKey]);

    return (
        <LibraryBrowser
            title={title}
            tracks={libraryState.filteredTracks}
            onNavigate={onNavigate || (() => { })}
            headerIcon={<Hash size={32} />}
            subtitle={initialFilter
                ? `${t('library.filteredBy')} ${typeLabelByKey[initialFilter.type]}`
                : t('library.allIndexedTracks')}
        />
    );
};

