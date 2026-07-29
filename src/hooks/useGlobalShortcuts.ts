import { useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { persistenceService, DEFAULT_KEYBOARD_SHORTCUTS } from '../services/persistence';
import type { ShortcutConfig } from '../services/persistence';

export const useGlobalShortcuts = () => {
    const { togglePlay, playNext, playPrevious, seek, getProgress } = usePlayer();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an interactive element (fix input conflicts)
            const target = e.target as EventTarget;
            if (target instanceof Element) {
                // Interactive elements that should receive key events normally
                const interactiveSelector = 'button, input, textarea, select, [contenteditable], [role="button"], a';
                if (target.closest(interactiveSelector)) {
                    return;
                }
            }

            // Load current shortcuts from preferences
            const prefs = persistenceService.getPreferences();
            const shortcuts = prefs.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS;

            // Helper to check if event matches a shortcut
            const matches = (shortcut: ShortcutConfig) => {
                if (!shortcut?.key) {
                    return false;
                }

                return e.key === shortcut.key &&
                    e.ctrlKey === shortcut.ctrl &&
                    e.metaKey === shortcut.meta &&
                    e.shiftKey === shortcut.shift &&
                    e.altKey === shortcut.alt;
            };

            // Toggle Play/Pause
            if (matches(shortcuts.togglePlay)) {
                e.preventDefault();
                togglePlay();
                return;
            }

            // Focus Search
            if (matches(shortcuts.focusSearch)) {
                e.preventDefault();
                const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                if (searchInput) searchInput.focus();
                return;
            }

            // Seek Forward
            if (matches(shortcuts.seekForward)) {
                e.preventDefault();
                seek(Math.max(0, getProgress() + 5));
                return;
            }

            // Seek Backward
            if (matches(shortcuts.seekBackward)) {
                e.preventDefault();
                seek(Math.max(0, getProgress() - 5));
                return;
            }

            // Next Track
            if (matches(shortcuts.playNext)) {
                e.preventDefault();
                playNext();
                return;
            }

            // Previous Track
            if (matches(shortcuts.playPrevious)) {
                e.preventDefault();
                playPrevious();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, playNext, playPrevious, seek, getProgress]);
};
