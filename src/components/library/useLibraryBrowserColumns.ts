import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ColumnConfig } from '../../types/music';

interface ColumnSpec {
    minWidth: number;
    priority: number;
}

const COLUMN_SPECS: Record<string, ColumnSpec> = {
    number:   { minWidth: 36,  priority: 3 },
    artwork:  { minWidth: 52,  priority: 2 },
    title:    { minWidth: 160, priority: 1 },
    album:    { minWidth: 100, priority: 4 },
    genre:    { minWidth: 80,  priority: 7 },
    year:     { minWidth: 68,  priority: 5 },
    bpm:      { minWidth: 58,  priority: 8 },
    duration: { minWidth: 76,  priority: 3 },
    bitrate:  { minWidth: 68,  priority: 9 },
    size:     { minWidth: 72,  priority: 10 },
};

export const useLibraryBrowserColumns = (columnConfig: ColumnConfig[]) => {
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

            const spec = COLUMN_SPECS[col.id];
            const width = spec ? Math.max(spec.minWidth, col.width || 0) : (col.width || 80);
            const needed = width + GAP_PER_COL;

            if (usedWidth + needed <= availableWidth - 160) {
                usedWidth += needed;
                accepted.push(col);
            }
        }

        const acceptedIds = new Set(accepted.map(c => c.id));
        return userVisible.filter(col => acceptedIds.has(col.id));
    }, [columnConfig, availableWidth]);

    const colWidths = useMemo(() => {
        const fixedTotal = visibleColumns.reduce((sum, col) => {
            if (col.id === 'title') return sum;
            const spec = COLUMN_SPECS[col.id];
            const min = spec?.minWidth ?? 60;
            return sum + Math.max(min, col.width || 0);
        }, 0);
        const titleWidth = Math.max(160, Math.min(availableWidth * 0.35, availableWidth - fixedTotal - 40));

        return visibleColumns.map(col => {
            if (col.id === 'title') return Math.round(titleWidth);
            const spec = COLUMN_SPECS[col.id];
            const min = spec?.minWidth ?? 60;
            return Math.max(min, col.width || 0);
        });
    }, [visibleColumns, availableWidth]);

    return { visibleColumns, colWidths, measureRef };
};

