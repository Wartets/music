import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ColumnConfig, TrackItem } from '../../types/music';
import { getTrackCollectionLabel } from '../../utils/collectionLabels';
import { parseGenres } from '../../utils/genreUtils';
import { formatSizeMb } from '../../utils/formatters';
import { measureTextWidth } from '../../utils/textMeasurement';

interface ColumnSpec {
    minWidth: number;
    maxWidth: number;
    priority: number;
}

const COLUMN_SPECS: Record<string, ColumnSpec> = {
    number:   { minWidth: 34,  maxWidth: 52,  priority: 3 },
    artwork:  { minWidth: 52,  maxWidth: 52,  priority: 2 },
    title:    { minWidth: 160, maxWidth: 720, priority: 1 },
    album:    { minWidth: 90,  maxWidth: 280, priority: 4 },
    genre:    { minWidth: 70,  maxWidth: 220, priority: 7 },
    year:     { minWidth: 56,  maxWidth: 88,  priority: 5 },
    bpm:      { minWidth: 48,  maxWidth: 76,  priority: 8 },
    duration: { minWidth: 60,  maxWidth: 92,  priority: 3 },
    bitrate:  { minWidth: 56,  maxWidth: 100, priority: 9 },
    size:     { minWidth: 64,  maxWidth: 108, priority: 10 },
};

const COLUMN_HEADER_LABELS: Record<string, string> = {
    number: '#',
    title: 'Title',
    album: 'Album',
    genre: 'Genre',
    year: 'Year',
    bpm: 'BPM',
    duration: 'Time',
    bitrate: 'kbps',
    size: 'Size',
};

const CELL_HORIZONTAL_PADDING = 28;
const HEADER_FONT = '700 10px Inter, system-ui, sans-serif';
const CELL_FONT = '600 12px Inter, system-ui, sans-serif';
const SAMPLE_SIZE = 300;

const getColumnCellText = (columnId: string, track: TrackItem): string => {
    switch (columnId) {
        case 'album':
            return getTrackCollectionLabel(track);
        case 'genre': {
            const genres = parseGenres(track.metadata?.genre);
            return genres.length > 0 ? genres.join(' / ') : '-';
        }
        case 'year':
            return track.metadata?.year || '-';
        case 'bpm':
            return track.metadata?.bpm || '-';
        case 'duration':
            return track.audio_specs?.duration || '0:00';
        case 'bitrate':
            return track.audio_specs?.bitrate?.replace(' Kbits/s', '') || '-';
        case 'size':
            return formatSizeMb(track.file?.size_bytes);
        default:
            return '';
    }
};

const sampleTracks = (tracks: TrackItem[]): TrackItem[] => {
    if (tracks.length <= SAMPLE_SIZE) return tracks;
    const step = Math.ceil(tracks.length / SAMPLE_SIZE);
    const sample: TrackItem[] = [];
    for (let i = 0; i < tracks.length; i += step) {
        sample.push(tracks[i]);
    }
    return sample;
};

export const useLibraryBrowserColumns = (columnConfig: ColumnConfig[], tracks: TrackItem[]) => {
    const [availableWidth, setAvailableWidth] = useState(() => {
        if (typeof window !== 'undefined') return window.innerWidth - 280;
        return 1000;
    });

    const widthRef = useRef<HTMLDivElement | null>(null);

    const measureRef = useCallback((el: HTMLDivElement | null) => {
        widthRef.current = el;
        if (el) setAvailableWidth(el.offsetWidth);
    }, []);

    useEffect(() => {
        const el = widthRef.current;
        if (!el) return;
        let lastReported = el.offsetWidth;

        const ro = new ResizeObserver((entries) => {
            const w = Math.round(entries[0].contentRect.width);
            if (w > 0 && Math.abs(w - lastReported) > 50) {
                lastReported = w;
                setAvailableWidth(w);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const sampledTracks = useMemo(() => sampleTracks(tracks), [tracks]);

    const naturalWidths = useMemo(() => {
        const widths: Record<string, number> = {};

        columnConfig.forEach(col => {
            const spec = COLUMN_SPECS[col.id];
            if (!spec || col.id === 'title' || col.id === 'artwork') return;

            let maxContentWidth = measureTextWidth(COLUMN_HEADER_LABELS[col.id] || col.id, HEADER_FONT);

            for (const track of sampledTracks) {
                const text = getColumnCellText(col.id, track);
                if (!text) continue;
                const width = measureTextWidth(text, CELL_FONT);
                if (width > maxContentWidth) maxContentWidth = width;
            }

            widths[col.id] = Math.round(Math.min(spec.maxWidth, Math.max(spec.minWidth, maxContentWidth + CELL_HORIZONTAL_PADDING)));
        });

        return widths;
    }, [columnConfig, sampledTracks]);

    const getColumnWidth = useCallback((columnId: string): number => {
        if (columnId === 'artwork') return COLUMN_SPECS.artwork.minWidth;
        return naturalWidths[columnId] ?? COLUMN_SPECS[columnId]?.minWidth ?? 72;
    }, [naturalWidths]);

    const visibleColumns = useMemo(() => {
        const userVisible = columnConfig.filter(col => col.visible);

        const sorted = [...userVisible].sort((a, b) => {
            const pa = COLUMN_SPECS[a.id]?.priority ?? 50;
            const pb = COLUMN_SPECS[b.id]?.priority ?? 50;
            return pa - pb;
        });

        const GAP_PER_COL = 8;
        let usedWidth = 0;
        const accepted: ColumnConfig[] = [];

        for (const col of sorted) {
            if (col.id === 'title') {
                accepted.push(col);
                continue;
            }

            const needed = getColumnWidth(col.id) + GAP_PER_COL;

            if (usedWidth + needed <= availableWidth - 160) {
                usedWidth += needed;
                accepted.push(col);
            }
        }

        const acceptedIds = new Set(accepted.map(c => c.id));
        return userVisible.filter(col => acceptedIds.has(col.id));
    }, [columnConfig, availableWidth, getColumnWidth]);

    const colWidths = useMemo(() => {
        const fixedTotal = visibleColumns.reduce((sum, col) => {
            if (col.id === 'title') return sum;
            return sum + getColumnWidth(col.id);
        }, 0);
        const titleWidth = Math.max(160, Math.min(availableWidth * 0.4, availableWidth - fixedTotal - 40));

        return visibleColumns.map(col => (col.id === 'title' ? Math.round(titleWidth) : getColumnWidth(col.id)));
    }, [visibleColumns, availableWidth, getColumnWidth]);

    return { visibleColumns, colWidths, measureRef };
};
