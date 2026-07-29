import { useState, useEffect } from 'react';

export const useMediaQuery = (query: string, initialValue?: boolean): boolean => {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return initialValue ?? false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const media = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

        setMatches(media.matches);

        media.addEventListener('change', handler);
        return () => media.removeEventListener('change', handler);
    }, [query]);

    return matches;
};

export const useIsMobile = (breakpoint = 768): boolean => {
    return useMediaQuery(`(max-width: ${breakpoint - 1}px)`, false);
};

export const useIsTablet = (breakpoint = 1024): boolean => {
    return useMediaQuery(`(min-width: 768px) and (max-width: ${breakpoint - 1}px)`, false);
};

export const useIsDesktop = (breakpoint = 1024): boolean => {
    return useMediaQuery(`(min-width: ${breakpoint}px)`, true);
};

export const usePrefersDarkMode = (): boolean => {
    return useMediaQuery('(prefers-color-scheme: dark)', true);
};

export const usePrefersReducedMotion = (): boolean => {
    return useMediaQuery('(prefers-reduced-motion: reduce)', false);
};

export const useTouchScreen = (): boolean => {
    return useMediaQuery('(pointer: coarse)', false);
};
