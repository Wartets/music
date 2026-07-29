import React, { useState, useMemo, useEffect } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { TrackItem } from '../../types/music';
import { RepeatMode, getRepeatModeLabel } from '../../types/playback';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
    ListMusic, History,
    Search, Download, Save,
    Zap, Clock, Filter, Shuffle, Repeat, Repeat1, Trash2
} from 'lucide-react';
import { formatDuration, parseDuration } from '../../utils/formatters';
import { useUI } from '../../contexts/UIContext';
import { useTranslation } from '../../i18n/I18nContext';
import { persistenceService } from '../../services/persistence';
import { VirtualList } from '../shared/VirtualList';
import { NowPlayingIndicator } from '../shared/NowPlayingIndicator';
import { useItemContextMenu } from '../../hooks/useItemContextMenu';
import { sanitizeExportPayload } from '../../utils/exportSanitizer';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { getBestArtwork } from '../../utils/artworkResolver';
import { resolveHistoryTracks } from '../../utils/historyUtils';
import { EmptyState } from '../shared/EmptyState';
import { QueueTrackItem, QueueDisplayItem } from '../queue/QueueTrackItem';
import { ArtworkImage } from '../shared/ArtworkImage';
import { getTrackDisplayName } from '../../utils/trackUtils';

const trackTitle = (track: TrackItem | QueueDisplayItem) => getTrackDisplayName(track as TrackItem);

export const QueueView: React.FC = () => {
    const {
        state: playerState,
        getProgress,
        removeFromQueue,
        playTrack,
        clearQueue,
        reorderQueue,
        setAutoplay,
        saveQueueAsPlaylist,
        toggleShuffle,
        setRepeat,
        setShuffleMode
    } = usePlayer();
    const { state: libState } = useLibrary();
    const { showToast } = useUI();
    const { t } = useTranslation();
    const { openItemContextMenu } = useItemContextMenu<TrackItem>();

    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'index' | 'duration' | 'name'>('index');
    const [clockTick, setClockTick] = useState(0);
    const isMobile = useIsMobile();

    useEffect(() => {
        if (activeTab !== 'queue') return;
        const timer = window.setInterval(() => setClockTick(prev => prev + 1), 1000);
        return () => window.clearInterval(timer);
    }, [activeTab]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 200, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const currentTrack = playerState.currentTrack;
    const queue = playerState.queue;
    const history = useMemo(() => {
        return resolveHistoryTracks(libState.tracks, libState.versionToPrimaryMap);
    }, [libState.tracks, libState.versionToPrimaryMap, playerState.history]);

    const curIdx = currentTrack
        ? queue.findIndex(t => t.logic.hash_sha256 === currentTrack.logic.hash_sha256)
        : -1;

    // Compute queue display locally (unified queue state, removed from PlayerContext)
    const queueDisplay = useMemo(() => {
        const nextTracksRaw = curIdx !== -1 ? queue.slice(curIdx + 1) : queue;

        let items: QueueDisplayItem[] = nextTracksRaw.map((track, i) => ({
            ...track,
            originalIndex: i,
            id: track.logic.hash_sha256 + '-' + i,
            startTimeSeconds: 0
        }));

        // Calculate start times for each track
        let accumulatedTime = currentTrack ? getProgress() : 0;
        items.forEach((item) => {
            item.startTimeSeconds = accumulatedTime;
            accumulatedTime += parseDuration(item.audio_specs?.duration) || 0;
        });

        return items;
    }, [queue, currentTrack, getProgress, curIdx]);

    const filteredQueueDisplay = useMemo(() => {
        let items = [...queueDisplay];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(t =>
                trackTitle(t).toLowerCase().includes(q) ||
                t.metadata?.artists?.some((a: string) => a.toLowerCase().includes(q)) ||
                (Array.isArray(t.metadata?.genre)
                    ? t.metadata.genre.join(' ').toLowerCase()
                    : String(t.metadata?.genre || '').toLowerCase()
                ).includes(q)
            );
        }

        if (sortBy === 'duration') {
            items.sort((a, b) => parseDuration(a.audio_specs?.duration) - parseDuration(b.audio_specs?.duration));
        } else if (sortBy === 'name') {
            items.sort((a, b) => trackTitle(a).localeCompare(trackTitle(b)));
        }

        return items;
    }, [queueDisplay, searchQuery, sortBy]);

    const totalQueueDuration = useMemo(() => {
        const currentDuration = currentTrack ? parseDuration(currentTrack.audio_specs?.duration) : 0;
        const progressRaw = getProgress();
        const progress = Number.isFinite(progressRaw) ? progressRaw : 0;
        const remainingCurrent = currentTrack ? Math.max(0, currentDuration - progress) : 0;
        const upcomingDuration = queueDisplay.reduce((sum, t) => sum + parseDuration(t.audio_specs?.duration), 0);
        return remainingCurrent + upcomingDuration;
    }, [queueDisplay, currentTrack, getProgress, clockTick]);

    const isDragEnabled = !searchQuery && sortBy === 'index' && filteredQueueDisplay.length <= 120;

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = filteredQueueDisplay.findIndex((item) => item.id === active.id);
            const newIndex = filteredQueueDisplay.findIndex((item) => item.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return;

            const absoluteOldIndex = curIdx + 1 + filteredQueueDisplay[oldIndex].originalIndex;
            const absoluteNewIndex = curIdx + 1 + filteredQueueDisplay[newIndex].originalIndex;

            reorderQueue(absoluteOldIndex, absoluteNewIndex);
            showToast(t('queueView.queueReordered'), 'info', { subtle: true });
        }
    };

    const handleExport = () => {
        const data = JSON.stringify(sanitizeExportPayload(playerState.queue), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('queueView.queueExported'), 'success');
    };

    const handleSaveAsPlaylist = () => {
        const name = prompt(t('queueView.enterPlaylistName'), t('queueView.defaultPlaylistName'));
        if (name) {
            saveQueueAsPlaylist(name);
            showToast(t('queueView.savedTracksToPlaylist').replace('{count}', String(queue.length)).replace('{name}', name), 'success');
        }
    };

    const clearHistory = () => {
        persistenceService.clearHistory();
        showToast(t('queueView.playbackHistoryCleared'), 'success');
        setClockTick(prev => prev + 1);
    };

    const repeatLabel = getRepeatModeLabel(playerState.repeat);

    if (isMobile) {
        return (
            <div className="h-full overflow-y-auto custom-scrollbar pt-0 px-3 sm:px-4 pb-28 bg-surface-primary">
                <div className="mb-3">
                    <h1 className="text-lg font-black tracking-tight text-white">{t('queueView.title')}</h1>
                    <p className="text-gray-500 text-[11px] mt-1 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><ListMusic size={12} /> {queueDisplay.length} {t('player.upcoming')}</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {formatDuration(totalQueueDuration)} {t('player.left')}</span>
                    </p>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setActiveTab('queue')}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'queue' ? 'bg-dominant text-on-dominant' : 'bg-white/5 text-gray-300 border border-white/10'}`}
                    >
                        <ListMusic size={13} /> {t('queueView.queueTab')}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-dominant text-on-dominant' : 'bg-white/5 text-gray-300 border border-white/10'}`}
                    >
                        <History size={13} /> {t('queueView.historyTab')}
                    </button>
                </div>

                <div className="mb-3 relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input
                        type="text"
                        placeholder={t('queueView.filterPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-3 text-xs text-white outline-none focus:border-dominant"
                    />
                </div>

                <div className="mb-3 flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setSortBy('index')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${sortBy === 'index' ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                    >{t('queueView.sortDefault')}</button>
                    <button
                        onClick={() => setSortBy('name')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${sortBy === 'name' ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                    >{t('queueView.sortName')}</button>
                    <button
                        onClick={() => setSortBy('duration')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${sortBy === 'duration' ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-400 border border-white/10'}`}
                    >{t('queueView.sortDuration')}</button>
                </div>

                <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <button
                        onClick={toggleShuffle}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${playerState.shuffle ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        aria-label={playerState.shuffle ? t('player.shuffleOff') : t('player.shuffleOn')}
                    >{t('player.shuffle')} {playerState.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}</button>
                    <button
                        onClick={() => setRepeat(playerState.repeat === RepeatMode.None ? RepeatMode.All : playerState.repeat === RepeatMode.All ? RepeatMode.One : RepeatMode.None)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${playerState.repeat !== RepeatMode.None ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        aria-label={`${t('player.repeatMode')} ${repeatLabel}`}
                    >{repeatLabel}</button>
                    <button
                        onClick={() => setShuffleMode(playerState.shuffleMode === 'standard' ? 'weighted' : playerState.shuffleMode === 'weighted' ? 'discovery' : playerState.shuffleMode === 'discovery' ? 'recent' : 'standard')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${playerState.shuffleMode !== 'standard' ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        aria-label={`${t('player.shuffle')}: ${playerState.shuffleMode}`}
                        title={t('queueView.shuffleCycle')}
                    >{t('player.shuffle')}: {playerState.shuffleMode}</button>
                    <button
                        onClick={() => setAutoplay(!playerState.autoplay)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${playerState.autoplay ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-white/5 border-white/10 text-gray-400'}`}
                        aria-label={playerState.autoplay ? t('player.autoplayOff') : t('player.autoplayOn')}
                    >{t('player.autoplay')}: {playerState.autoplay ? t('common.on') : t('common.off')}</button>
                    <button onClick={handleExport} className="p-2 bg-white/5 rounded-xl border border-white/10 text-gray-300" aria-label={t('queueView.exportQueue')}><Download size={14} /></button>
                    <button onClick={handleSaveAsPlaylist} className="p-2 bg-white/5 rounded-xl border border-white/10 text-gray-300" aria-label={t('queueView.saveAsPlaylist')}><Save size={14} /></button>
                    <button onClick={clearQueue} className="p-2 bg-red-500/10 rounded-xl border border-red-500/30 text-red-400" aria-label={t('queueView.clearQueue')}><Trash2 size={14} /></button>
                </div>

                {activeTab === 'queue' ? (
                    <div className="space-y-2 pb-4">
                        {filteredQueueDisplay.length === 0 ? (
                            <EmptyState
                                icon={<ListMusic size={36} />}
                                title={t('queueView.queueEmpty')}
                                className="h-44 border border-dashed border-white/10 rounded-2xl"
                                iconClassName="opacity-20 mb-2"
                                titleClassName="text-sm font-bold text-white/30"
                            />
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={filteredQueueDisplay.map(t => t.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {filteredQueueDisplay.map((track, index) => (
                                        <QueueTrackItem
                                            key={track.id}
                                            track={track}
                                            index={index}
                                            sortableId={track.id}
                                            layout="full-mobile"
                                            originalIndex={curIdx + 1 + track.originalIndex}
                                            onPlay={(t) => playTrack(t, playerState.queue)}
                                            onRemove={removeFromQueue}
                                            onContextMenu={(e) => openItemContextMenu(e, track as unknown as TrackItem, playerState.queue, undefined)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2 pb-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30">{t('queueView.recentlyPlayed')}</h2>
                            <button onClick={clearHistory} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400">{t('common.clear')}</button>
                        </div>
                        {history.length === 0 ? (
                            <EmptyState
                                icon={<History size={32} />}
                                title={t('queueView.noHistoryYet')}
                                className="h-40 rounded-2xl border border-dashed border-white/10"
                                iconClassName="opacity-20 mb-2"
                                titleClassName="text-xs text-gray-500"
                            />
                        ) : (
                            history.map((track: any, index: number) => (
                                <QueueTrackItem
                                    key={`${track.logic.hash_sha256}-${index}`}
                                    track={track}
                                    index={index}
                                    isDraggable={false}
                                    layout="full-mobile"
                                    isHistory={true}
                                    onPlay={playTrack}
                                    onRemove={() => {}}
                                    onContextMenu={(e) => openItemContextMenu(e, track as unknown as TrackItem, history, undefined)}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-3 md:p-6 pt-0 md:pt-24 overflow-hidden relative z-10 bg-surface-primary">
            <div className="flex flex-col gap-4 md:gap-6 mb-4 md:mb-8">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-white">{t('queueView.title')}</h1>
                        <p className="text-gray-500 text-xs md:text-sm mt-1 flex items-center gap-3 md:gap-4 flex-wrap">
                             <span className="flex items-center gap-1.5"><ListMusic size={14} /> {queueDisplay.length} {t('player.upcoming')}</span>
                             <span className="flex items-center gap-1.5"><Clock size={14} /> {formatDuration(totalQueueDuration)} {t('player.remaining')}</span>
                            <span className={`text-xs font-black uppercase tracking-wider ${playerState.shuffle ? 'text-dominant-light' : 'text-gray-600'}`}>
                                {t('player.shuffle')} {playerState.shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
                            </span>
                            <span className={`text-xs font-black uppercase tracking-wider ${playerState.repeat !== 'none' ? 'text-dominant-light' : 'text-gray-600'}`}>
                                {repeatLabel}
                            </span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleExport} title={t('queueView.exportQueue')} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 text-gray-400 hover:text-white h-10 w-10 flex items-center justify-center active:scale-95" aria-label={t('queueView.exportQueue')}>
                            <Download size={18} />
                        </button>
                        <button onClick={handleSaveAsPlaylist} title={t('queueView.saveAsPlaylist')} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 text-gray-400 hover:text-white h-10 w-10 flex items-center justify-center active:scale-95" aria-label={t('queueView.saveAsPlaylist')}>
                            <Save size={18} />
                        </button>
                        <button onClick={clearQueue} className="flex items-center justify-center gap-2 px-3 md:px-5 py-2 hover:bg-red-500/20 rounded-xl text-xs md:text-sm font-bold transition-all border border-transparent hover:border-red-500/20 text-red-500 ml-1 md:ml-2 h-10 active:scale-95">
                            <Trash2 size={16} />
                            <span className="hidden sm:inline">{t('queueView.clearQueue')}</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                        <button
                            onClick={() => setActiveTab('queue')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all h-10 ${activeTab === 'queue' ? 'bg-dominant text-on-dominant shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <ListMusic size={16} /> {t('queueView.queueTab')}
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all h-10 ${activeTab === 'history' ? 'bg-dominant text-on-dominant shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <History size={16} /> {t('queueView.historyTab')}
                        </button>
                    </div>

                    <div className="flex-1 min-w-[220px] max-w-md relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-dominant transition-colors" size={18} />
                        <input
                            type="text"
                                placeholder={t('queueView.filterPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-2 pl-12 pr-4 text-sm text-white outline-none focus:border-dominant focus:bg-white/10 transition-all font-medium h-12"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center bg-white/5 rounded-xl border border-white/5 overflow-hidden h-12">
                            <button
                                onClick={() => setSortBy('index')}
                                className={`h-full px-3.5 flex items-center justify-center ${sortBy === 'index' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                title={t('queueView.sortDefault')}
                                aria-label={t('queueView.sortDefault')}
                            >
                                <Zap size={16} />
                            </button>
                            <button
                                onClick={() => setSortBy('name')}
                                className={`h-full px-3.5 border-l border-white/5 flex items-center justify-center ${sortBy === 'name' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                title={t('queueView.sortName')}
                                aria-label={t('queueView.sortName')}
                            >
                                <Filter size={16} />
                            </button>
                            <button
                                onClick={() => setSortBy('duration')}
                                className={`h-full px-3.5 border-l border-white/5 flex items-center justify-center ${sortBy === 'duration' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                title={t('queueView.sortDuration')}
                                aria-label={t('queueView.sortDuration')}
                            >
                                <Clock size={16} />
                            </button>
                        </div>

                        <button
                            onClick={toggleShuffle}
                            className={`flex items-center justify-center gap-2 px-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border h-12 ${playerState.shuffle ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/5 text-gray-500 hover:text-white'}`}
                            title={t('player.shuffle')}
                        >
                            <Shuffle size={14} />
                            {t('player.shuffle')}
                        </button>

                        <button
                            onClick={() => setRepeat(playerState.repeat === RepeatMode.None ? RepeatMode.All : playerState.repeat === RepeatMode.All ? RepeatMode.One : RepeatMode.None)}
                            className={`flex items-center justify-center gap-2 px-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border h-12 ${playerState.repeat !== RepeatMode.None ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/5 text-gray-500 hover:text-white'}`}
                            title={`${t('player.repeatMode')} ${repeatLabel}`}
                        >
                            {playerState.repeat === RepeatMode.One ? <Repeat1 size={14} /> : <Repeat size={14} />}
                            {repeatLabel}
                        </button>

                        <button
                            onClick={() => setShuffleMode(playerState.shuffleMode === 'standard' ? 'weighted' : playerState.shuffleMode === 'weighted' ? 'discovery' : playerState.shuffleMode === 'discovery' ? 'recent' : 'standard')}
                            className={`flex items-center justify-center gap-2 px-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border h-12 ${playerState.shuffleMode !== 'standard' ? 'bg-dominant/20 border-dominant/40 text-dominant-light' : 'bg-white/5 border-white/5 text-gray-500 hover:text-white'}`}
                            title={t('queueView.shuffleCycle')}
                        >
                            <Shuffle size={14} />
                            {t('player.shuffle')}: {playerState.shuffleMode}
                        </button>

                        <button
                            onClick={() => setAutoplay(!playerState.autoplay)}
                            className={`flex items-center justify-center gap-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border h-12 ${playerState.autoplay ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-white/5 border-white/5 text-gray-500 hover:text-white'}`}
                        >
                            {t('player.autoplay')}: {playerState.autoplay ? t('common.on') : t('common.off')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
                {activeTab === 'queue' ? (
                    <div className="space-y-8">
                        {currentTrack && (
                            <section className="hidden md:block">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 px-2">{t('queueView.nowSpinning')}</h2>
                                <div className="bg-white/5 border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-6 flex items-center gap-4 md:gap-8 shadow-2xl overflow-hidden relative group">
                                    <div className="absolute inset-0 bg-dominant/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 ring-1 ring-white/10 relative z-10">
                                        <ArtworkImage details={getBestArtwork(currentTrack)} alt={trackTitle(currentTrack)} />
                                    </div>
                                    <div className="flex-1 min-w-0 relative z-10">
                                        <h3 className="text-xl md:text-3xl font-black text-white truncate leading-tight">{trackTitle(currentTrack)}</h3>
                                        <p className="text-dominant-light text-sm md:text-lg font-bold truncate mt-1.5 flex items-center gap-2 md:gap-3">
                                            {currentTrack.metadata?.artists?.join(', ')}
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>
                                            <span className="text-gray-500 text-xs md:text-sm font-medium">{currentTrack.metadata?.album}</span>
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 relative z-10">
                                        <NowPlayingIndicator variant="bars" isAnimating={playerState.isPlaying} />
                                    </div>
                                </div>
                            </section>
                        )}

                        <section>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 px-2">{t('queueView.nextUp')}</h2>
                            {filteredQueueDisplay.length === 0 ? (
                                <EmptyState
                                    icon={<ListMusic size={64} />}
                                    title={t('queueView.queueEmpty')}
                                    className="h-64 border-2 border-dashed border-white/5 rounded-3xl"
                                    iconClassName="opacity-10 mb-4"
                                    titleClassName="text-xl font-bold text-white/20"
                                />
                            ) : isDragEnabled ? (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={filteredQueueDisplay.map(t => t.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2">
                                            {filteredQueueDisplay.map((track, index) => (
                                                <QueueTrackItem
                                                    key={track.id}
                                                    track={track}
                                                    index={index}
                                                    sortableId={track.id}
                                                    layout="full-desktop"
                                                    originalIndex={curIdx + 1 + track.originalIndex}
                                                    onPlay={(t) => playTrack(t, playerState.queue)}
                                                    onRemove={removeFromQueue}
                                                    onContextMenu={(e) => openItemContextMenu(e, track as unknown as TrackItem, playerState.queue, undefined)}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            ) : (
                                <div className="h-[min(70vh,720px)] rounded-2xl border border-white/5 overflow-hidden">
                                    <VirtualList
                                        items={filteredQueueDisplay}
                                        rowHeight={74}
                                        renderRow={(track: QueueDisplayItem, index: number) => (
                                            <div className="px-1 py-1">
                                                <QueueTrackItem
                                                    track={track}
                                                    index={index}
                                                    isDraggable={false}
                                                    layout="full-desktop"
                                                    originalIndex={curIdx + 1 + track.originalIndex}
                                                    onPlay={(t) => playTrack(t, playerState.queue)}
                                                    onRemove={removeFromQueue}
                                                    onContextMenu={(e) => openItemContextMenu(e, track as unknown as TrackItem, playerState.queue, undefined)}
                                                />
                                            </div>
                                        )}
                                        overscan={8}
                                    />
                                </div>
                            )}
                        </section>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 px-2">{t('queueView.recentlyPlayed')}</h2>
                            <button onClick={clearHistory} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-colors">{t('queueView.clearHistory')}</button>
                        </div>
                        {history.length === 0 ? (
                            <EmptyState
                                icon={<History size={40} />}
                                title={t('queueView.noHistoryYet')}
                                className="h-56 rounded-3xl border border-dashed border-white/10"
                                iconClassName="opacity-20 mb-3"
                                titleClassName="text-sm text-gray-500"
                            />
                        ) : (
                            <div className="h-[min(70vh,720px)] rounded-2xl border border-white/5 overflow-hidden">
                                <VirtualList
                                    items={history}
                                    rowHeight={60}
                                    renderRow={(track: any, index: number) => (
                                        <div className="px-1 py-1">
                                            <div
                                                key={`${track.logic.hash_sha256}-${index}`}
                                                className="group flex items-center gap-4 p-3 rounded-2xl bg-white/2 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 cursor-pointer"
                                                onClick={() => playTrack(track, history)}
                                                onContextMenu={(e) => openItemContextMenu(e, track as unknown as TrackItem, history, undefined)}
                                            >
                                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 border border-white/5">
                                                    <ArtworkImage details={getBestArtwork(track)} alt={trackTitle(track)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-white truncate">{trackTitle(track)}</div>
                                                    <div className="text-xs text-gray-500 truncate">{track.metadata?.artists?.join(', ')}</div>
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono">{track.audio_specs?.duration}</div>
                                            </div>
                                        </div>
                                    )}
                                    overscan={10}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

