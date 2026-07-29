import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

interface UseFocusTrapOptions {
    active: boolean;
    onEscape?: () => void;
    restoreFocus?: boolean;
    initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const isFocusableVisible = (element: HTMLElement) => {
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
};

export const useFocusTrap = <T extends HTMLElement>({
    active,
    onEscape,
    restoreFocus = true,
    initialFocusRef,
}: UseFocusTrapOptions) => {
    const containerRef = useRef<T | null>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);

    const focusInitialElement = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const preferred = initialFocusRef?.current;
        if (preferred && container.contains(preferred)) {
            preferred.focus();
            return;
        }

        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter(isFocusableVisible);

        (focusable[0] || container).focus();
    }, [initialFocusRef]);

    useEffect(() => {
        if (!active) return;

        previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => focusInitialElement());

        return () => window.cancelAnimationFrame(frame);
    }, [active, focusInitialElement]);

    useEffect(() => {
        if (!active || !restoreFocus) return;

        return () => {
            previousActiveElementRef.current?.focus?.();
        };
    }, [active, restoreFocus]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (!active) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onEscape?.();
            return;
        }

        if (event.key !== 'Tab') return;

        const container = containerRef.current;
        if (!container) return;

        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter(isFocusableVisible)
            .filter(el => !el.hasAttribute('disabled'));

        if (focusable.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
            if (!current || current === first || !container.contains(current)) {
                event.preventDefault();
                last.focus();
            }
            return;
        }

        if (!current || current === last || !container.contains(current)) {
            event.preventDefault();
            first.focus();
        }
    }, [active, onEscape]);

    return { containerRef, handleKeyDown };
};