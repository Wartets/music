import { useCallback } from 'react';
import { ColumnConfig } from '../../types/music';

export const useLibraryBrowserSort = (
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    setSortBy: (sortBy: string) => void,
) => {
    const handleSortColumn = useCallback((column: ColumnConfig) => {
        if (!column.sortable) return;
        setSortBy(column.id === 'year' ? 'date' : column.id);
    }, [setSortBy]);

    const isColumnSorted = useCallback((columnId: string) => {
        if (columnId === 'year') {
            return sortBy === 'date' || sortBy === 'year';
        }
        return sortBy === columnId;
    }, [sortBy]);

    const getSortDirection = useCallback((columnId: string) => {
        if (!isColumnSorted(columnId)) return null;
        return sortOrder;
    }, [isColumnSorted, sortOrder]);

    return { handleSortColumn, isColumnSorted, getSortDirection };
};