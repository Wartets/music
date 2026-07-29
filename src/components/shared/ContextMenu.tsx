import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    divider?: boolean;
    disabled?: boolean;
    subItems?: ContextMenuItem[];
    lazySubItems?: () => ContextMenuItem[];
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeSubMenu, setActiveSubMenu] = useState<{ source: ContextMenuItem, items: ContextMenuItem[], top: number, bottom: number, left: number, right: number } | null>(null);
    const subMenuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState({ x, y });
    const [subMenuPosition, setSubMenuPosition] = useState({ x, y });

    const placeLayer = ({
        anchorX,
        anchorY,
        layerWidth,
        layerHeight,
        gap = 8,
    }: {
        anchorX: number;
        anchorY: number;
        layerWidth: number;
        layerHeight: number;
        gap?: number;
    }) => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let nextX = anchorX;
        let nextY = anchorY;

        const maxX = Math.max(gap, viewportWidth - layerWidth - gap);
        const maxY = Math.max(gap, viewportHeight - layerHeight - gap);

        if (nextX > maxX) nextX = maxX;
        if (nextY > maxY) nextY = maxY;
        if (nextX < gap) nextX = gap;
        if (nextY < gap) nextY = gap;

        return { x: nextX, y: nextY };
    };

    const placeSubMenu = ({
        parent,
        layerWidth,
        layerHeight,
        gap = 8,
    }: {
        parent: { top: number; bottom: number; left: number; right: number };
        layerWidth: number;
        layerHeight: number;
        gap?: number;
    }) => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const spaceRight = viewportWidth - parent.right - gap;
        const spaceLeft = parent.left - gap;
        const openRight = spaceRight >= layerWidth || spaceRight >= spaceLeft;

        const rawX = openRight
            ? parent.right - 2
            : parent.left - layerWidth + 2;
        const preferredY = Math.max(gap, parent.top - 6);

        const maxX = Math.max(gap, viewportWidth - layerWidth - gap);
        const maxY = Math.max(gap, viewportHeight - layerHeight - gap);

        return {
            x: Math.max(gap, Math.min(rawX, maxX)),
            y: Math.max(gap, Math.min(preferredY, maxY)),
        };
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                (!subMenuRef.current || !subMenuRef.current.contains(e.target as Node))) {
                onClose();
            }
        };
        const handleScroll = () => onClose();

        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('wheel', handleScroll);
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('wheel', handleScroll);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [onClose]);

    useLayoutEffect(() => {
        const updateMenuPosition = () => {
            const menu = menuRef.current;
            if (!menu) return;
            const rect = menu.getBoundingClientRect();
            setMenuPosition(placeLayer({
                anchorX: x + 2,
                anchorY: y + 2,
                layerWidth: rect.width,
                layerHeight: rect.height,
            }));
        };

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);

        return () => {
            window.removeEventListener('resize', updateMenuPosition);
        };
    }, [x, y, items]);

    const resolveSubItems = (item: ContextMenuItem) => item.subItems || item.lazySubItems?.() || null;

    const openSubMenuForItem = (item: ContextMenuItem, target: HTMLElement) => {
        const subItems = resolveSubItems(item);
        if (!subItems) {
            setActiveSubMenu(null);
            return;
        }

        const rect = target.getBoundingClientRect();
        setActiveSubMenu(prev => {
            if (prev?.items === subItems) return prev;
            return {
                source: item,
                items: subItems,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right
            };
        });
    };

    const handleMouseEnter = (item: ContextMenuItem, _index: number, e: React.MouseEvent) => {
        openSubMenuForItem(item, e.currentTarget as HTMLElement);
    };

    const handleTouchEnd = (item: ContextMenuItem, _index: number, e: React.TouchEvent) => {
        e.preventDefault();
        if (item.subItems || item.lazySubItems) {
            openSubMenuForItem(item, e.currentTarget as HTMLElement);
        }
    };

    const handleMenuMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        const related = e.relatedTarget as Node | null;
        if (related && subMenuRef.current?.contains(related)) {
            return;
        }
        setActiveSubMenu(null);
    };

    useLayoutEffect(() => {
        const subMenu = subMenuRef.current;
        if (!activeSubMenu || !subMenu) return;

        const rect = subMenu.getBoundingClientRect();
        const positioned = placeSubMenu({
            parent: activeSubMenu,
            layerWidth: rect.width,
            layerHeight: rect.height,
        });
        const nextX = positioned.x;
        const nextY = positioned.y;
        setSubMenuPosition({ x: nextX, y: nextY });
    }, [activeSubMenu]);

    const handleSubMenuMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        const related = e.relatedTarget as Node | null;
        if (related && menuRef.current?.contains(related)) {
            return;
        }
        setActiveSubMenu(null);
    };

    return (
        <>
            <div
                ref={menuRef}
                className="fixed z-[110000] w-56 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl py-2 overflow-y-auto custom-scrollbar"
                style={{
                    left: menuPosition.x,
                    top: menuPosition.y,
                    maxHeight: 'calc(100dvh - 20px)'
                }}
                onMouseLeave={handleMenuMouseLeave}
            >
                {items.map((item, idx) => (
                    <React.Fragment key={idx}>
                        {item.divider && <div className="h-px bg-white/5 my-1.5 mx-3" />}
                        {!item.divider && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.subItems || item.lazySubItems) {
                                        openSubMenuForItem(item, e.currentTarget as HTMLElement);
                                        return;
                                    }
                                    if (!item.disabled) {
                                        item.onClick();
                                        onClose();
                                    }
                                }}
                                onMouseEnter={(e) => handleMouseEnter(item, idx, e)}
                                onTouchEnd={(e) => handleTouchEnd(item, idx, e)}
                                disabled={item.disabled}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5 md:py-2 text-sm md:text-xs font-bold transition-all relative group min-h-11 md:min-h-0 active:scale-95
                                    ${item.danger ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/20' : 'text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white'}
                                    ${item.disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                            >
                                {item.icon && <span className={`text-gray-400 group-hover:text-white transition-colors ${item.danger ? 'group-hover:text-red-400' : ''}`}>{item.icon}</span>}
                                <span className="flex-1 text-left truncate">{item.label}</span>
                                {(item.subItems || item.lazySubItems) && <ChevronRight size={14} className="text-gray-500 group-hover:text-white" />}
                                {activeSubMenu && activeSubMenu.source === items[idx] && (
                                    <div className="absolute left-0 top-0 w-1 h-full bg-dominant"></div>
                                )}
                            </button>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {activeSubMenu && (
                <div
                    ref={subMenuRef}
                    className="fixed z-[110001] w-56 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl py-2 overflow-y-auto custom-scrollbar"
                    style={{
                        left: subMenuPosition.x,
                        top: subMenuPosition.y,
                        maxHeight: 'calc(100dvh - 20px)'
                    }}
                    onMouseLeave={handleSubMenuMouseLeave}
                >
                    {activeSubMenu.items.map((sub, sidx) => (
                        <button
                            key={sidx}
                            onClick={(e) => {
                                e.stopPropagation();
                                sub.onClick();
                                onClose();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 md:py-2 text-sm md:text-xs font-bold text-gray-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer min-h-11 md:min-h-0 active:scale-95"
                        >
                            <span className="flex-1 text-left truncate">{sub.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
};
