import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface VirtualListProps<T> {
    items: T[];
    rowHeight: number;
    renderRow: (item: T, index: number) => React.ReactNode;
    overscan?: number;
    getSectionKey?: (item: T, index: number) => string | null;
    renderSectionHeader?: (sectionKey: string, sectionItems: T[], startIndex: number) => React.ReactNode;
}

export function VirtualList<T>({
    items,
    rowHeight,
    renderRow,
    overscan = 5,
    getSectionKey,
    renderSectionHeader
}: VirtualListProps<T>): React.ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const rafRef = useRef<number | null>(null);
    const lastScrollTopRef = useRef(0);

    useEffect(() => {
        if (containerRef.current) {
            setContainerHeight(containerRef.current.clientHeight);
            const observer = new ResizeObserver((entries) => {
                const el = entries[0]?.target as HTMLElement;
                if (el) setContainerHeight(el.clientHeight);
            });
            observer.observe(containerRef.current);
            return () => observer.disconnect();
        }
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
        lastScrollTopRef.current = e.currentTarget.scrollTop;
        if (rafRef.current !== null) return;
        rafRef.current = window.requestAnimationFrame(() => {
            setScrollTop(lastScrollTopRef.current);
            rafRef.current = null;
        });
    }, []);

    const totalHeight = items.length * rowHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(items.length - 1, Math.floor((scrollTop + containerHeight) / rowHeight) + overscan);

    // Compute section start indices
    const sectionStarts = useMemo<number[]>(() => {
        if (!getSectionKey) return [];
        const starts: number[] = [];
        let lastKey: string | null = null;
        items.forEach((item, idx) => {
            const key = getSectionKey(item, idx);
            if (key !== null && key !== lastKey) {
                starts.push(idx);
            }
            lastKey = key;
        });
        return starts;
    }, [items, getSectionKey]);

    // Determine which section's sticky header should be visible
    const stickySectionIndex = useMemo((): number | null => {
        if (!renderSectionHeader || sectionStarts.length === 0) return null;
        for (let i = 0; i < sectionStarts.length; i++) {
            const start = sectionStarts[i] * rowHeight;
            const next = i + 1 < sectionStarts.length ? sectionStarts[i + 1] * rowHeight : items.length * rowHeight;
            if (scrollTop > start && scrollTop < next) {
                return i;
            }
        }
        return null;
    }, [scrollTop, sectionStarts, rowHeight, items.length, renderSectionHeader]);

    // Build visible rows
    const visibleItems: React.ReactNode[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
        visibleItems.push(
            <div
                key={i}
                style={{
                    position: 'absolute',
                    top: `${i * rowHeight}px`,
                    width: '100%',
                    height: `${rowHeight}px`
                }}
            >
                {renderRow(items[i], i)}
            </div>
        );
    }

    // Build sticky header element if needed
    const stickyHeaderElement = stickySectionIndex !== null ? (() => {
        const sectionStartIdx = sectionStarts[stickySectionIndex!];
        const sectionKey = getSectionKey!(items[sectionStartIdx], sectionStartIdx);
        if (!sectionKey) return null;
        return (
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${rowHeight}px`,
                    zIndex: 10
                }}
            >
                {renderSectionHeader!(sectionKey, [items[sectionStartIdx]], sectionStartIdx)}
            </div>
        );
    })() : null;

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{ height: '100%', width: '100%', overflowY: 'auto', position: 'relative' }}
        >
            {stickyHeaderElement}
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                {visibleItems}
            </div>
        </div>
    );
}
