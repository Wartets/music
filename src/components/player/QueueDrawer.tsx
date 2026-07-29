import React from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTranslation } from '../../i18n/I18nContext';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { QueueTrackItem, QueueDisplayItem } from '../queue/QueueTrackItem';

interface QueueDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
    const { state, playTrack, reorderQueue, removeFromQueue, clearQueue } = usePlayer();
    const { t } = useTranslation();

    // Compute queue display locally  (read-only, just for rendering)
    const queueDisplay = React.useMemo(() => {
        const currentTrack = state.currentTrack;
        const queue = state.queue;
        const curIdx = currentTrack ? queue.findIndex(t => t.logic.hash_sha256 === currentTrack.logic.hash_sha256) : -1;
        const nextTracksRaw = curIdx !== -1 ? queue.slice(curIdx + 1) : queue;

        return nextTracksRaw.map((track, i) => ({
            ...track,
            originalIndex: i,
            id: track.logic.hash_sha256 + '-' + i,
            startTimeSeconds: 0
        })) as QueueDisplayItem[];
    }, [state.currentTrack, state.queue]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = state.queue.findIndex((t) => t.logic.hash_sha256 === active.id);
            const newIndex = state.queue.findIndex((t) => t.logic.hash_sha256 === over?.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                reorderQueue(oldIndex, newIndex);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0,
            width: '350px',
            backgroundColor: '#1a1a1a',
            borderLeft: '1px solid #333',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif'
        }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>{t('player.upNext')}</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={clearQueue}
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        {t('player.clearQueue')}
                    </button>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
                        aria-label={t('common.close')}
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {queueDisplay.length === 0 ? (
                    <div style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
                        {t('player.queueEmpty')}
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={state.queue.map(t => t.logic.hash_sha256)}
                            strategy={verticalListSortingStrategy}
                        >
                            {state.queue.map((track, index) => (
                                <QueueTrackItem
                                    key={track.logic.hash_sha256}
                                    track={track}
                                    index={index}
                                    sortableId={track.logic.hash_sha256}
                                    layout="drawer"
                                    isCurrent={state.currentTrack?.logic.hash_sha256 === track.logic.hash_sha256}
                                    onPlay={(t) => playTrack(t, state.queue)}
                                    onRemove={removeFromQueue}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    );
};
