import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useLibrary } from '../../contexts/LibraryContext';
import { HighlightText } from '../shared/HighlightText';

export interface GridItem {
    id: string;
    title: string;
    subtitle: string;
    imageDetails?: any;
    icon?: React.ReactNode;
    visualToken?: {
        symbol?: React.ReactNode;
        label?: string;
        style?: React.CSSProperties;
        symbolClassName?: string;
        labelClassName?: string;
    };
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    isTextIcon?: boolean;
    isNonInteractive?: boolean;
}

interface CollectionGridViewProps {
    title: string;
    subtitle: string;
    items: GridItem[];
    sortOptions: { id: string; label: string; icon: React.ReactNode }[];
    currentSort: string;
    onSortChange: (sortId: string) => void;
    layoutMode?: 'full' | 'drawer' | 'mobile' | 'desktop';
}

export const CollectionGridView: React.FC<CollectionGridViewProps> = ({
    title,
    subtitle,
    items,
    sortOptions,
    currentSort,
    onSortChange,
    layoutMode
}) => {
    const { state: libraryState } = useLibrary(); // local require to avoid circular deps if any
    const listRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(600);
    const [containerWidth, setContainerWidth] = useState(900);

    const resolvedLayoutMode = useMemo<'mobile' | 'desktop'>(() => {
        if (layoutMode === 'mobile') return 'mobile';
        if (layoutMode === 'desktop') return 'desktop';
        return containerWidth >= 768 ? 'desktop' : 'mobile';
    }, [containerWidth, layoutMode]);

    const isDesktop = resolvedLayoutMode === 'desktop';
    const gridGap = isDesktop ? 24 : 12;
    const gridColumns = isDesktop ? 4 : 2;
    const cardMinHeight = isDesktop ? 100 : 120;
    const symbolDisplaySizeClass = isDesktop ? 'text-[40px]' : 'text-[48px]';

    const symbolContainerClassName = 'min-w-12 min-h-12 w-12 h-12 flex items-center justify-center';

    const virtualized = items.length >= 1000;
    const overscanRows = 2;

    const cardWidth = useMemo(() => {
        const totalGap = Math.max(0, (gridColumns - 1) * gridGap);
        return Math.max(120, (containerWidth - totalGap) / Math.max(1, gridColumns));
    }, [containerWidth, gridColumns, gridGap]);

    const cardMetaHeight = isDesktop ? 64 : 56;
    const rowHeight = cardWidth + cardMetaHeight;
    const rowStride = rowHeight + gridGap;
    const totalRows = Math.ceil(items.length / Math.max(1, gridColumns));
    const totalContentHeight = totalRows > 0 ? (totalRows * rowHeight) + ((totalRows - 1) * gridGap) : 0;

    const visibleRange = useMemo(() => {
        if (!virtualized) {
            return {
                startIndex: 0,
                endIndex: items.length,
                topPadding: 0,
                bottomPadding: 0,
            };
        }

        const startRow = Math.max(0, Math.floor(scrollTop / rowStride) - overscanRows);
        const endRow = Math.min(totalRows - 1, Math.floor((scrollTop + viewportHeight) / rowStride) + overscanRows);
        const rowsVisible = Math.max(0, endRow - startRow + 1);

        const startIndex = startRow * gridColumns;
        const endIndex = Math.min(items.length, (endRow + 1) * gridColumns);
        const topPadding = startRow * rowStride;
        const visibleHeight = rowsVisible > 0 ? (rowsVisible * rowHeight) + ((rowsVisible - 1) * gridGap) : 0;
        const bottomPadding = Math.max(0, totalContentHeight - topPadding - visibleHeight);

        return {
            startIndex,
            endIndex,
            topPadding,
            bottomPadding,
        };
    }, [virtualized, scrollTop, rowStride, totalRows, viewportHeight, gridColumns, items.length, rowHeight, gridGap, totalContentHeight]);

    const visibleItems = useMemo(
        () => items.slice(visibleRange.startIndex, visibleRange.endIndex),
        [items, visibleRange.endIndex, visibleRange.startIndex]
    );

    useEffect(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }

        setViewportHeight(list.clientHeight);
        setContainerWidth(list.clientWidth);

        const observer = new ResizeObserver(entries => {
            const target = entries[0]?.target as HTMLElement | undefined;
            if (!target) return;
            setViewportHeight(target.clientHeight);
            setContainerWidth(target.clientWidth);
        });

        observer.observe(list);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const nextTop = e.currentTarget.scrollTop;

        if (!virtualized) {
            setScrollTop(nextTop);
            return;
        }

        if (rafRef.current !== null) {
            return;
        }

        rafRef.current = window.requestAnimationFrame(() => {
            setScrollTop(nextTop);
            rafRef.current = null;
        });
    }, [virtualized]);

    const renderCard = useCallback((item: GridItem) => {
        const usesVisualToken = !item.isTextIcon && !item.imageDetails && !!item.visualToken;
        const visualToken = item.visualToken;

        return (
            <div
                key={item.id}
                className={`group flex flex-col transition-colors duration-200 ${item.isNonInteractive ? '' : 'cursor-pointer'}`}
                onClick={item.onClick}
                onContextMenu={item.onContextMenu}
            >
                <div
                    className={`relative aspect-square rounded-2xl overflow-hidden shadow-2xl bg-white/5 border border-white/5 transition-[border-color,box-shadow,background-color] duration-250 flex items-center justify-center mb-3 ${item.isNonInteractive ? 'opacity-60' : 'group-hover:border-white/20 group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]'}`}
                    style={{ minHeight: `${cardMinHeight}px`, ...(usesVisualToken ? (visualToken?.style || {}) : {}) }}
                >
                    {item.isTextIcon ? (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <span className="text-4xl md:text-[40px] font-black text-white/20 group-hover:text-dominant transition-colors duration-500 select-none">
                                {item.imageDetails}
                            </span>
                        </>
                    ) : item.imageDetails ? (
                        <ArtworkImage
                            details={item.imageDetails}
                            alt={item.title}
                            className={`w-full h-full object-cover transition-[filter] duration-300 ${item.isNonInteractive ? '' : 'group-hover:brightness-110 group-hover:saturate-110'}`}
                            loading="lazy"
                        />
                    ) : usesVisualToken ? (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/25"></div>
                            <div className="relative z-10 flex flex-col items-center justify-center px-3 text-center gap-2">
                                <div className={symbolContainerClassName}>
                                    <div className={visualToken?.symbolClassName || `${symbolDisplaySizeClass} font-black text-white/70 group-hover:text-white transition-colors duration-500`}>
                                        {visualToken?.symbol}
                                    </div>
                                </div>
                                {visualToken?.label && (
                                    <span className={visualToken.labelClassName || 'text-[10px] font-bold uppercase tracking-[0.18em] text-white/65'}>
                                        {visualToken.label}
                                    </span>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            {item.icon || <div className="w-12 h-12 bg-white/10 rounded-full"></div>}
                        </>
                    )}
                    {!item.isNonInteractive && (
                        <div className="absolute inset-0 z-20 pointer-events-none bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-250 flex items-center justify-center backdrop-blur-[1px]">
                            <Play size={isDesktop ? 32 : 28} fill="currentColor" className="text-white drop-shadow-2xl" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 pr-1 px-1">
                    <h3 className={`font-bold text-sm truncate transition-colors ${item.isNonInteractive ? 'text-white/60' : 'text-white group-hover:text-dominant-light'}`}>
                        <HighlightText text={item.title} query={libraryState.searchQuery} />
                    </h3>
                    <p className={`text-[11px] font-bold truncate mt-0.5 uppercase tracking-tighter transition-colors ${item.isNonInteractive ? 'text-gray-700' : 'text-gray-500'}`}>
                        <HighlightText text={item.subtitle} query={libraryState.searchQuery} />
                    </p>
                </div>
            </div>
        );
    }, [cardMinHeight, isDesktop, libraryState.searchQuery, symbolDisplaySizeClass]);

    return (
        <div className="h-full flex flex-col p-2 sm:p-3 md:p-6 pt-0 md:pt-20 bg-surface-primary">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-3 md:mb-8 gap-3 md:gap-4">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white">{title}</h1>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1">{subtitle}</p>
                </div>
                {sortOptions.length > 0 && (
                    <div className="flex items-center gap-2 self-start md:self-auto">
                        <div className="flex bg-white/5 rounded-xl border border-white/5 p-1 overflow-x-auto no-scrollbar max-w-[calc(100vw-2rem)] sm:max-w-full">
                            {sortOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => onSortChange(opt.id)}
                                    className={`px-3 py-2.5 sm:px-4 sm:py-2 flex-shrink-0 rounded-lg text-xs font-bold transition-all flex items-center gap-2 min-h-10 ${currentSort === opt.id ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {opt.icon} <span className="hidden sm:inline">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
            >
                <div
                    className={`grid ${isDesktop ? 'grid-cols-4 gap-6' : 'grid-cols-2 gap-3'} pb-24 md:pb-28`}
                    style={virtualized ? { paddingTop: visibleRange.topPadding, paddingBottom: visibleRange.bottomPadding } : undefined}
                >
                    {(virtualized ? visibleItems : items).map(renderCard)}
                </div>
            </div>
        </div>
    );
};
