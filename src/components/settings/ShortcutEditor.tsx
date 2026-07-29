import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/I18nContext';
import { DEFAULT_KEYBOARD_SHORTCUTS, persistenceService } from '../../services/persistence';
import type { KeyboardShortcuts, ShortcutConfig } from '../../services/persistence';

type ActionKey = keyof KeyboardShortcuts;

const EMPTY_SHORTCUT: ShortcutConfig = { key: '', ctrl: false, meta: false, shift: false, alt: false };

const formatShortcut = (shortcut: ShortcutConfig, t: (key: TranslationKey) => string): string => {
    if (!shortcut.key) {
        return t('settings.shortcuts.notSet');
    }

    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.meta) parts.push('Meta');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');

    let key = shortcut.key;
    if (key === ' ') key = t('settings.shortcuts.space');
    else if (key === 'ArrowRight') key = t('settings.shortcuts.right');
    else if (key === 'ArrowLeft') key = t('settings.shortcuts.left');
    else if (key.length === 1) key = key.toUpperCase();

    parts.push(key);
    return parts.join('+');
};

const getShortcutSignature = (shortcut: ShortcutConfig): string => {
    if (!shortcut.key) {
        return '';
    }

    const keyPart = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
    return `${shortcut.ctrl ? '1' : '0'}:${shortcut.meta ? '1' : '0'}:${shortcut.alt ? '1' : '0'}:${shortcut.shift ? '1' : '0'}:${keyPart}`;
};

export const ShortcutEditor: React.FC = () => {
    const { t } = useTranslation();

    const actionDefinitions: Record<ActionKey, { label: string; description: string }> = {
        togglePlay: { label: t('settings.shortcuts.playPause'), description: t('settings.shortcuts.togglePlayback') },
        seekForward: { label: t('settings.shortcuts.seekForward'), description: t('settings.shortcuts.seekForwardDesc') },
        seekBackward: { label: t('settings.shortcuts.seekBackward'), description: t('settings.shortcuts.seekBackward') },
        playNext: { label: t('settings.shortcuts.nextTrack'), description: t('settings.shortcuts.nextTrackDesc') },
        playPrevious: { label: t('settings.shortcuts.previousTrack'), description: t('settings.shortcuts.previousTrackDesc') },
        focusSearch: { label: t('settings.shortcuts.focusSearch'), description: t('settings.shortcuts.focusSearchDesc') }
    };

    const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(() => {
        const prefs = persistenceService.getPreferences();
        return prefs.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS;
    });
    const [recordingAction, setRecordingAction] = useState<ActionKey | null>(null);
    const [captureError, setCaptureError] = useState<string | null>(null);

    const conflictByAction = React.useMemo(() => {
        const map: Partial<Record<ActionKey, string>> = {};
        const grouped = new Map<string, ActionKey[]>();

        (Object.keys(actionDefinitions) as ActionKey[]).forEach(action => {
            const signature = getShortcutSignature(shortcuts[action]);
            if (!signature) {
                return;
            }

            if (!grouped.has(signature)) {
                grouped.set(signature, []);
            }
            grouped.get(signature)!.push(action);
        });

        grouped.forEach(actions => {
            if (actions.length <= 1) {
                return;
            }

            actions.forEach(action => {
                const others = actions.filter(other => other !== action).map(other => actionDefinitions[other].label);
                map[action] = `${t('settings.shortcuts.conflict')} ${others.join(', ')}`;
            });
        });

        return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shortcuts, t]);

    useEffect(() => {
        const handleStorage = () => {
            const prefs = persistenceService.getPreferences();
            setShortcuts(prefs.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS);
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const captureShortcut = useCallback((event: KeyboardEvent) => {
        if (!recordingAction) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'Escape') {
            setShortcuts(previous => {
                const updated = { ...previous, [recordingAction]: EMPTY_SHORTCUT };
                persistenceService.updatePreferences({ keyboardShortcuts: updated });
                return updated;
            });
            setCaptureError(null);
            setRecordingAction(null);
            return;
        }

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
            return;
        }

        const nextShortcut: ShortcutConfig = {
            key: event.key,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            shift: event.shiftKey,
            alt: event.altKey
        };

        const duplicateAction = (Object.keys(actionDefinitions) as ActionKey[]).find(action => {
            if (action === recordingAction) {
                return false;
            }

            return getShortcutSignature(shortcuts[action]) === getShortcutSignature(nextShortcut);
        });

        if (duplicateAction) {
            setCaptureError(`${t('settings.shortcuts.conflict')} ${actionDefinitions[duplicateAction].label}.`);
            return;
        }

        setShortcuts(previous => {
            const updated = { ...previous, [recordingAction]: nextShortcut };
            persistenceService.updatePreferences({ keyboardShortcuts: updated });
            return updated;
        });
        setCaptureError(null);
        setRecordingAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordingAction, shortcuts]);

    useEffect(() => {
        if (!recordingAction) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            captureShortcut(event);
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [captureShortcut, recordingAction]);

    const resetActionToDefault = (action: ActionKey) => {
        setShortcuts(previous => {
            const updated = { ...previous, [action]: DEFAULT_KEYBOARD_SHORTCUTS[action] };
            persistenceService.updatePreferences({ keyboardShortcuts: updated });
            return updated;
        });
        setCaptureError(null);
        setRecordingAction(null);
    };

    const clearActionShortcut = (action: ActionKey) => {
        setShortcuts(previous => {
            const updated = { ...previous, [action]: EMPTY_SHORTCUT };
            persistenceService.updatePreferences({ keyboardShortcuts: updated });
            return updated;
        });
        setCaptureError(null);
        setRecordingAction(null);
    };

    const resetToDefault = () => {
        setShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
        persistenceService.updatePreferences({ keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS });
        setCaptureError(null);
        setRecordingAction(null);
    };

    return (
        <div className="space-y-3">
            {(Object.keys(actionDefinitions) as ActionKey[]).map(action => (
                <div key={action} className="p-4 bg-black/20 rounded-2xl border border-white/5">
                    {(() => {
                        const isRecording = recordingAction === action;
                        const hasShortcut = Boolean(shortcuts[action].key);

                        return (
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="font-bold text-sm text-white">{actionDefinitions[action].label}</div>
                                    <div className="text-[10px] text-gray-500">{actionDefinitions[action].description}</div>
                                </div>

                                <div className="flex flex-col items-stretch gap-2 md:min-w-[300px]">
                                    <button
                                        onClick={() => {
                                            setCaptureError(null);
                                            setRecordingAction(action);
                                        }}
                                        className={`w-full px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${isRecording
                                                ? 'bg-red-500/20 text-red-300 border-red-500/60 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]'
                                                : hasShortcut
                                                    ? 'bg-dominant/20 text-dominant-light border-dominant/40 hover:bg-dominant/30'
                                                    : 'bg-white/5 text-gray-300 border-white/20 border-dashed hover:bg-white/10'
                                            }`}
                                        title={isRecording ? t('settings.shortcuts.recording') : t('settings.shortcuts.setOrChangeShortcut')}
                                    >
                                        {isRecording ? t('settings.shortcuts.pressKeys') : formatShortcut(shortcuts[action], t)}
                                    </button>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => clearActionShortcut(action)}
                                            className="px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                                            title={t('settings.shortcuts.clearShortcut')}
                                        >
                                            {t('settings.shortcuts.notSet')}
                                        </button>
                                        <button
                                            onClick={() => resetActionToDefault(action)}
                                            className="px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-amber-500/10 text-amber-300 border border-amber-400/25 hover:bg-amber-500/20"
                                            title={t('settings.shortcuts.resetShortcut')}
                                        >
                                            {t('settings.shortcuts.resetDefaults')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    {conflictByAction[action] && (
                        <div className="mt-2 text-[10px] text-amber-400 font-semibold">
                            {conflictByAction[action]}
                        </div>
                    )}
                    {recordingAction === action && captureError && (
                        <div className="mt-2 text-[10px] text-red-400 font-semibold">
                            {captureError}
                        </div>
                    )}
                </div>
            ))}
            <div className="flex justify-end">
                <button onClick={resetToDefault} className="text-xs text-gray-500 hover:text-white uppercase tracking-widest">
                    {t('settings.shortcuts.resetDefaults')}
                </button>
            </div>
        </div>
    );
};
