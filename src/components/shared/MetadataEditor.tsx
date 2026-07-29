import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MetadataWriteTarget, persistenceService } from '../../services/persistence';
import { Heart, Star, Disc, Hash, Type, Save, X, Image as ImageIcon, Trash2, Edit2, Globe, Tag, Calendar, Mic, Link, Users, Building, ShieldCheck, Bookmark, FileText, Activity } from 'lucide-react';
import { TrackItem, TrackMetadata } from '../../types/music';
import { ArtworkImage } from './ArtworkImage';
import { normalizeArtists } from '../../utils/artistUtils';
import { useTranslation } from '../../i18n/I18nContext';

interface MetadataEditorSnapshot {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    genre: string;
    year: string;
    composer: string;
    trackNumber: string;
    totalTracks: string;
    discNumber: string;
    totalDiscs: string;
    bpm: string;
    lyrics: string;
    comment: string;
    description: string;
    artworkUrl: string;
    rating: number | 'mixed';
    isFav: boolean | 'mixed';
    producer: string;
    label: string;
    publisher: string;
    isrc: string;
    upc: string;
    mood: string;
    language: string;
    category: string;
    tags: string;
    remixArtist: string;
    edition: string;
    recordingYear: string;
    videoLink: string;
    streamingLink: string;
    writeTarget: MetadataWriteTarget;
    mixedFields: string[];
}

export const MetadataEditor: React.FC = () => {
    const { editingTracks, setEditingTracks, updateTrackMetadata, updateArtworkOverride } = useLibrary();
    const { t } = useTranslation();

    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [album, setAlbum] = useState('');
    const [albumArtist, setAlbumArtist] = useState('');
    const [genre, setGenre] = useState('');
    const [year, setYear] = useState('');
    const [composer, setComposer] = useState('');
    const [trackNumber, setTrackNumber] = useState('');
    const [totalTracks, setTotalTracks] = useState('');
    const [discNumber, setDiscNumber] = useState('');
    const [totalDiscs, setTotalDiscs] = useState('');
    const [bpm, setBpm] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [comment, setComment] = useState('');
    const [description, setDescription] = useState('');
    const [artworkUrl, setArtworkUrl] = useState('');
    const [rating, setRating] = useState<number | 'mixed'>(0);
    const [isFav, setIsFav] = useState<boolean | 'mixed'>(false);

    // Expanded fields
    const [producer, setProducer] = useState('');
    const [label, setLabel] = useState('');
    const [publisher, setPublisher] = useState('');
    const [isrc, setIsrc] = useState('');
    const [upc, setUpc] = useState('');
    const [mood, setMood] = useState('');
    const [language, setLanguage] = useState('');
    const [category, setCategory] = useState('');
    const [tags, setTags] = useState('');
    const [remixArtist, setRemixArtist] = useState('');
    const [edition, setEdition] = useState('');
    const [recordingYear, setRecordingYear] = useState('');
    const [videoLink, setVideoLink] = useState('');
    const [streamingLink, setStreamingLink] = useState('');
    const [writeTarget, setWriteTarget] = useState<MetadataWriteTarget>(() => persistenceService.getPreferences().metadataWriteTarget || 'musicbib');

    const [activeTab, setActiveTab] = useState<'general' | 'professional' | 'organization' | 'lyrics' | 'external'>('general');

    // Mixed value placeholders
    const [mixedFields, setMixedFields] = useState<Set<string>>(new Set());
    const [history, setHistory] = useState<MetadataEditorSnapshot[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [isArtworkDialogOpen, setIsArtworkDialogOpen] = useState(false);
    const [artworkDraftUrl, setArtworkDraftUrl] = useState('');
    const [artworkDraftError, setArtworkDraftError] = useState<string | null>(null);

    const isApplyingSnapshotRef = useRef(false);
    const { containerRef, handleKeyDown } = useFocusTrap<HTMLDivElement>({
        active: Boolean(editingTracks && editingTracks.length > 0),
        onEscape: () => setEditingTracks(null),
    });
    const { containerRef: artworkDialogRef, handleKeyDown: handleArtworkDialogKeyDown } = useFocusTrap<HTMLDivElement>({
        active: isArtworkDialogOpen,
        onEscape: () => setIsArtworkDialogOpen(false),
    });

    const createSnapshot = useCallback((overrides: Partial<MetadataEditorSnapshot> = {}): MetadataEditorSnapshot => ({
        title,
        artist,
        album,
        albumArtist,
        genre,
        year,
        composer,
        trackNumber,
        totalTracks,
        discNumber,
        totalDiscs,
        bpm,
        lyrics,
        comment,
        description,
        artworkUrl,
        rating,
        isFav,
        producer,
        label,
        publisher,
        isrc,
        upc,
        mood,
        language,
        category,
        tags,
        remixArtist,
        edition,
        recordingYear,
        videoLink,
        streamingLink,
        writeTarget,
        mixedFields: Array.from(mixedFields),
        ...overrides,
    }), [
        title,
        artist,
        album,
        albumArtist,
        genre,
        year,
        composer,
        trackNumber,
        totalTracks,
        discNumber,
        totalDiscs,
        bpm,
        lyrics,
        comment,
        description,
        artworkUrl,
        rating,
        isFav,
        producer,
        label,
        publisher,
        isrc,
        upc,
        mood,
        language,
        category,
        tags,
        remixArtist,
        edition,
        recordingYear,
        videoLink,
        streamingLink,
        writeTarget,
        mixedFields,
    ]);

    const applySnapshot = useCallback((snapshot: MetadataEditorSnapshot) => {
        isApplyingSnapshotRef.current = true;
        setTitle(snapshot.title);
        setArtist(snapshot.artist);
        setAlbum(snapshot.album);
        setAlbumArtist(snapshot.albumArtist);
        setGenre(snapshot.genre);
        setYear(snapshot.year);
        setComposer(snapshot.composer);
        setTrackNumber(snapshot.trackNumber);
        setTotalTracks(snapshot.totalTracks);
        setDiscNumber(snapshot.discNumber);
        setTotalDiscs(snapshot.totalDiscs);
        setBpm(snapshot.bpm);
        setLyrics(snapshot.lyrics);
        setComment(snapshot.comment);
        setDescription(snapshot.description);
        setArtworkUrl(snapshot.artworkUrl);
        setRating(snapshot.rating);
        setIsFav(snapshot.isFav);
        setProducer(snapshot.producer);
        setLabel(snapshot.label);
        setPublisher(snapshot.publisher);
        setIsrc(snapshot.isrc);
        setUpc(snapshot.upc);
        setMood(snapshot.mood);
        setLanguage(snapshot.language);
        setCategory(snapshot.category);
        setTags(snapshot.tags);
        setRemixArtist(snapshot.remixArtist);
        setEdition(snapshot.edition);
        setRecordingYear(snapshot.recordingYear);
        setVideoLink(snapshot.videoLink);
        setStreamingLink(snapshot.streamingLink);
        setWriteTarget(snapshot.writeTarget);
        setMixedFields(new Set(snapshot.mixedFields));

        window.setTimeout(() => {
            isApplyingSnapshotRef.current = false;
        }, 0);
    }, []);

    const pushHistorySnapshot = useCallback((snapshot: MetadataEditorSnapshot) => {
        if (isApplyingSnapshotRef.current) return;

        setHistory(prev => {
            const base = prev.slice(0, historyIndex + 1);
            const next = [...base, snapshot];
            const bounded = next.length > 100 ? next.slice(next.length - 100) : next;
            const nextIndex = bounded.length - 1;
            setHistoryIndex(nextIndex);
            return bounded;
        });
    }, [historyIndex]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

    const undo = useCallback(() => {
        if (!canUndo) return;
        const nextIndex = historyIndex - 1;
        const snapshot = history[nextIndex];
        if (!snapshot) return;
        setHistoryIndex(nextIndex);
        applySnapshot(snapshot);
    }, [applySnapshot, canUndo, history, historyIndex]);

    const redo = useCallback(() => {
        if (!canRedo) return;
        const nextIndex = historyIndex + 1;
        const snapshot = history[nextIndex];
        if (!snapshot) return;
        setHistoryIndex(nextIndex);
        applySnapshot(snapshot);
    }, [applySnapshot, canRedo, history, historyIndex]);

    useEffect(() => {
        if (editingTracks && editingTracks.length > 0) {
            const getSharedValue = (getter: (t: TrackItem) => any) => {
                const values = editingTracks.map(t => getter(t));
                const allSame = values.every(v => v === values[0]);
                return { value: allSame ? values[0] : '', isMixed: !allSame };
            };

            const titleInfo = getSharedValue(t => t.metadata?.title || t.logic?.track_name || '');
            const artistInfo = getSharedValue(t => t.metadata?.artists?.join(', ') || '');
            const albumInfo = getSharedValue(t => t.metadata?.album || '');
            const albumArtistInfo = getSharedValue(t => t.metadata?.album_artist || '');
            const genreInfo = getSharedValue(t => {
                const g = t.metadata?.genre;
                return Array.isArray(g) ? g.join(', ') : g || '';
            });
            const yearInfo = getSharedValue(t => t.metadata?.year || '');
            const composerInfo = getSharedValue(t => t.metadata?.composer || '');
            const trackNumInfo = getSharedValue(t => t.metadata?.track_number || '');
            const totalTracksInfo = getSharedValue(t => t.metadata?.total_tracks || '');
            const discNumInfo = getSharedValue(t => t.metadata?.disc_number || '');
            const totalDiscsInfo = getSharedValue(t => t.metadata?.total_discs || '');
            const bpmInfo = getSharedValue(t => t.metadata?.bpm || '');
            const lyricsInfo = getSharedValue(t => t.metadata?.lyrics || '');
            const commentInfo = getSharedValue(t => t.metadata?.comment || '');
            const descriptionInfo = getSharedValue(t => t.metadata?.description || '');
            const artworkUrlInfo = getSharedValue(t => t.artworks?.track_artwork?.[0]?.path || '');

            // Expanded initializations
            const producerInfo = getSharedValue(t => t.metadata?.producer || '');
            const labelInfo = getSharedValue(t => t.metadata?.label || '');
            const publisherInfo = getSharedValue(t => t.metadata?.publisher || '');
            const isrcInfo = getSharedValue(t => t.metadata?.isrc || '');
            const upcInfo = getSharedValue(t => t.metadata?.upc || '');
            const moodInfo = getSharedValue(t => t.metadata?.mood || '');
            const languageInfo = getSharedValue(t => t.metadata?.language || '');
            const categoryInfo = getSharedValue(t => t.metadata?.category || '');
            const tagsInfo = getSharedValue(t => t.metadata?.tags?.join(', ') || '');
            const remixArtistInfo = getSharedValue(t => t.metadata?.remix_artist || '');
            const editionInfo = getSharedValue(t => t.metadata?.edition || '');
            const recordingYearInfo = getSharedValue(t => t.metadata?.recording_year || '');
            const videoLinkInfo = getSharedValue(t => t.metadata?.video_link || '');
            const streamingLinkInfo = getSharedValue(t => t.metadata?.streaming_link || '');

            const ratingValues = editingTracks.map(t => persistenceService.getRating(t.logic.hash_sha256));
            const ratingMixed = !ratingValues.every(v => v === ratingValues[0]);

            const favValues = editingTracks.map(t => persistenceService.isFavorite(t.logic.hash_sha256));
            const favMixed = !favValues.every(v => v === favValues[0]);

            setTitle(titleInfo.value);
            setArtist(artistInfo.value);
            setAlbum(albumInfo.value);
            setAlbumArtist(albumArtistInfo.value);
            setGenre(genreInfo.value);
            setYear(yearInfo.value);
            setComposer(composerInfo.value);
            setTrackNumber(trackNumInfo.value);
            setTotalTracks(totalTracksInfo.value);
            setDiscNumber(discNumInfo.value);
            setTotalDiscs(totalDiscsInfo.value);
            setBpm(bpmInfo.value);
            setLyrics(lyricsInfo.value);
            setComment(commentInfo.value);
            setDescription(descriptionInfo.value);
            setArtworkUrl(artworkUrlInfo.value);
            setRating(ratingMixed ? 'mixed' : ratingValues[0]);
            setIsFav(favMixed ? 'mixed' : favValues[0]);

            // Set expanded state
            setProducer(producerInfo.value);
            setLabel(labelInfo.value);
            setPublisher(publisherInfo.value);
            setIsrc(isrcInfo.value);
            setUpc(upcInfo.value);
            setMood(moodInfo.value);
            setLanguage(languageInfo.value);
            setCategory(categoryInfo.value);
            setTags(tagsInfo.value);
            setRemixArtist(remixArtistInfo.value);
            setEdition(editionInfo.value);
            setRecordingYear(recordingYearInfo.value);
            setVideoLink(videoLinkInfo.value);
            setStreamingLink(streamingLinkInfo.value);

            const mixed = new Set<string>();
            if (titleInfo.isMixed) mixed.add('title');
            if (artistInfo.isMixed) mixed.add('artist');
            if (albumInfo.isMixed) mixed.add('album');
            if (albumArtistInfo.isMixed) mixed.add('albumArtist');
            if (genreInfo.isMixed) mixed.add('genre');
            if (yearInfo.isMixed) mixed.add('year');
            if (composerInfo.isMixed) mixed.add('composer');
            if (trackNumInfo.isMixed) mixed.add('trackNumber');
            if (totalTracksInfo.isMixed) mixed.add('totalTracks');
            if (discNumInfo.isMixed) mixed.add('discNumber');
            if (totalDiscsInfo.isMixed) mixed.add('totalDiscs');
            if (bpmInfo.isMixed) mixed.add('bpm');
            if (lyricsInfo.isMixed) mixed.add('lyrics');
            if (commentInfo.isMixed) mixed.add('comment');
            if (descriptionInfo.isMixed) mixed.add('description');
            if (artworkUrlInfo.isMixed) mixed.add('artworkUrl');

            // Add expanded mixed states
            if (producerInfo.isMixed) mixed.add('producer');
            if (labelInfo.isMixed) mixed.add('label');
            if (publisherInfo.isMixed) mixed.add('publisher');
            if (isrcInfo.isMixed) mixed.add('isrc');
            if (upcInfo.isMixed) mixed.add('upc');
            if (moodInfo.isMixed) mixed.add('mood');
            if (languageInfo.isMixed) mixed.add('language');
            if (categoryInfo.isMixed) mixed.add('category');
            if (tagsInfo.isMixed) mixed.add('tags');
            if (remixArtistInfo.isMixed) mixed.add('remixArtist');
            if (editionInfo.isMixed) mixed.add('edition');
            if (recordingYearInfo.isMixed) mixed.add('recordingYear');
            if (videoLinkInfo.isMixed) mixed.add('videoLink');
            if (streamingLinkInfo.isMixed) mixed.add('streamingLink');

            setMixedFields(mixed);

            const initialSnapshot: MetadataEditorSnapshot = {
                title: titleInfo.value,
                artist: artistInfo.value,
                album: albumInfo.value,
                albumArtist: albumArtistInfo.value,
                genre: genreInfo.value,
                year: yearInfo.value,
                composer: composerInfo.value,
                trackNumber: trackNumInfo.value,
                totalTracks: totalTracksInfo.value,
                discNumber: discNumInfo.value,
                totalDiscs: totalDiscsInfo.value,
                bpm: bpmInfo.value,
                lyrics: lyricsInfo.value,
                comment: commentInfo.value,
                description: descriptionInfo.value,
                artworkUrl: artworkUrlInfo.value,
                rating: ratingMixed ? 'mixed' : ratingValues[0],
                isFav: favMixed ? 'mixed' : favValues[0],
                producer: producerInfo.value,
                label: labelInfo.value,
                publisher: publisherInfo.value,
                isrc: isrcInfo.value,
                upc: upcInfo.value,
                mood: moodInfo.value,
                language: languageInfo.value,
                category: categoryInfo.value,
                tags: tagsInfo.value,
                remixArtist: remixArtistInfo.value,
                edition: editionInfo.value,
                recordingYear: recordingYearInfo.value,
                videoLink: videoLinkInfo.value,
                streamingLink: streamingLinkInfo.value,
                writeTarget,
                mixedFields: Array.from(mixed),
            };

            setHistory([initialSnapshot]);
            setHistoryIndex(0);
            setSaveError(null);
        }
    }, [editingTracks]);

    useEffect(() => {
        if (!editingTracks || editingTracks.length === 0) return;

        const onKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            const isModifier = event.ctrlKey || event.metaKey;
            if (!isModifier) return;

            if (key === 'z' && event.shiftKey) {
                event.preventDefault();
                redo();
                return;
            }

            if (key === 'z') {
                event.preventDefault();
                undo();
                return;
            }

            if (key === 'y') {
                event.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [editingTracks, redo, undo]);

    if (!editingTracks || editingTracks.length === 0) return null;

    const mixedPlaceholder = (label: string) => `--- ${t('metadataEditor.mixed')} ${label} ---`;

    const handleSave = async () => {
        if (isSaving) return;

        const update: Partial<TrackMetadata> = {};
        if (!mixedFields.has('title')) update.title = title.trim();
        if (!mixedFields.has('artist')) update.artists = normalizeArtists(artist);
        if (!mixedFields.has('album')) update.album = album.trim();
        if (!mixedFields.has('albumArtist')) update.album_artist = albumArtist.trim();
        if (!mixedFields.has('genre')) update.genre = genre ? genre.trim() : null;
        if (!mixedFields.has('year')) update.year = year.trim() || null;
        if (!mixedFields.has('composer')) update.composer = composer.trim();
        if (!mixedFields.has('trackNumber')) update.track_number = trackNumber.trim() || null;
        if (!mixedFields.has('totalTracks')) update.total_tracks = totalTracks.trim() || null;
        if (!mixedFields.has('discNumber')) update.disc_number = discNumber.trim() || null;
        if (!mixedFields.has('totalDiscs')) update.total_discs = totalDiscs.trim() || null;
        if (!mixedFields.has('bpm')) update.bpm = bpm.trim() || null;
        if (!mixedFields.has('lyrics')) update.lyrics = lyrics.trim() || null;
        if (!mixedFields.has('comment')) update.comment = comment.trim() || null;
        if (!mixedFields.has('description')) update.description = description.trim() || null;

        // Expanded saves
        if (!mixedFields.has('producer')) update.producer = producer.trim() || null;
        if (!mixedFields.has('label')) update.label = label.trim() || null;
        if (!mixedFields.has('publisher')) update.publisher = publisher.trim() || null;
        if (!mixedFields.has('isrc')) update.isrc = isrc.trim() || null;
        if (!mixedFields.has('upc')) update.upc = upc.trim() || null;
        if (!mixedFields.has('mood')) update.mood = mood.trim() || null;
        if (!mixedFields.has('language')) update.language = language.trim() || null;
        if (!mixedFields.has('category')) update.category = category.trim() || null;
        if (!mixedFields.has('tags')) update.tags = tags ? tags.split(',').map(t => t.trim()) : null;
        if (!mixedFields.has('remixArtist')) update.remix_artist = remixArtist.trim() || null;
        if (!mixedFields.has('edition')) update.edition = edition.trim() || null;
        if (!mixedFields.has('recordingYear')) update.recording_year = recordingYear.trim() || null;
        if (!mixedFields.has('videoLink')) update.video_link = videoLink.trim() || null;
        if (!mixedFields.has('streamingLink')) update.streaming_link = streamingLink.trim() || null;

        const batchSize = 20;
        const chunks: TrackItem[][] = [];
        for (let i = 0; i < editingTracks.length; i += batchSize) {
            chunks.push(editingTracks.slice(i, i + batchSize));
        }

        setSaveError(null);
        setIsSaving(true);

        try {
            persistenceService.updatePreferences({ metadataWriteTarget: writeTarget });

            for (const batch of chunks) {
                await Promise.all(batch.map(async track => {
                    const hash = track.logic?.hash_sha256;
                    if (!hash) return;

                    await updateTrackMetadata(hash, update, writeTarget);

                    if (!mixedFields.has('artworkUrl')) {
                        if (artworkUrl !== (track.artworks?.track_artwork?.[0]?.path || '')) {
                            if (artworkUrl === '') {
                                updateArtworkOverride(hash, []);
                            } else {
                                updateArtworkOverride(hash, [{
                                    name: 'Custom Artwork',
                                    type: 'URL',
                                    path: artworkUrl,
                                    size_bytes: 0,
                                    dimensions: 'Unknown',
                                    aspect_ratio: 'Square',
                                    dominant_color: '#888888'
                                }]);
                            }
                        }
                    }

                    if (rating !== 'mixed') {
                        persistenceService.setRating(hash, rating);
                    }
                    if (isFav !== 'mixed' && isFav !== persistenceService.isFavorite(hash)) {
                        persistenceService.toggleFavorite(hash);
                    }
                }));
            }

            setEditingTracks(null);
        } catch (error) {
            console.error('Failed to save metadata edits', error);
            setSaveError('Unable to save metadata changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass = (fieldName: string) => `w-full bg-black/50 border ${mixedFields.has(fieldName) ? 'border-yellow-500/30' : 'border-white/10'} rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-dominant focus:ring-1 focus:ring-dominant transition-all`;

    const handleInputChange = (
        field: string,
        value: string,
        setter: (v: string) => void,
        snapshotKey?: keyof MetadataEditorSnapshot,
    ) => {
        const targetKey = (snapshotKey || field) as keyof MetadataEditorSnapshot;
        const nextMixed = new Set(mixedFields);
        if (nextMixed.has(field)) {
            nextMixed.delete(field);
            setMixedFields(nextMixed);
        }

        setter(value);
        pushHistorySnapshot(createSnapshot({ [targetKey]: value, mixedFields: Array.from(nextMixed) }));
    };

    const handleRatingChange = (nextRating: number | 'mixed') => {
        setRating(nextRating);
        pushHistorySnapshot(createSnapshot({ rating: nextRating }));
    };

    const handleFavoriteChange = (nextFav: boolean | 'mixed') => {
        setIsFav(nextFav);
        pushHistorySnapshot(createSnapshot({ isFav: nextFav }));
    };

    const handleWriteTargetChange = (nextTarget: MetadataWriteTarget) => {
        setWriteTarget(nextTarget);
        pushHistorySnapshot(createSnapshot({ writeTarget: nextTarget }));
    };

    const openArtworkUrlDialog = () => {
        setArtworkDraftError(null);
        setArtworkDraftUrl(artworkUrl);
        setIsArtworkDialogOpen(true);
    };

    const closeArtworkUrlDialog = () => {
        setArtworkDraftError(null);
        setIsArtworkDialogOpen(false);
    };

    const applyArtworkUrlDraft = () => {
        const normalized = artworkDraftUrl.trim();
        if (
            normalized.length > 0 &&
            !/^https?:\/\//i.test(normalized) &&
            !/^data:image\//i.test(normalized) &&
            !/^\//.test(normalized)
        ) {
            setArtworkDraftError(t('metadataEditor.artworkUrlError'));
            return;
        }

        handleInputChange('artworkUrl', normalized, setArtworkUrl, 'artworkUrl');
        closeArtworkUrlDialog();
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={() => setEditingTracks(null)}>
            <div
                ref={containerRef}
                className="bg-[#111] border border-white/10 rounded-2xl shadow-3xl w-full max-w-4xl p-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar relative"
                role="dialog"
                aria-modal="true"
                aria-labelledby="metadata-editor-title"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 id="metadata-editor-title" className="text-2xl font-black text-white tracking-tight">
                            {editingTracks.length > 1 ? t('metadataEditor.editMultipleTracks').replace('{count}', String(editingTracks.length)) : t('metadataEditor.editMetadata')}
                        </h2>
                        {editingTracks.length > 1 && (
                            <p className="text-yellow-500/70 text-[10px] font-bold uppercase tracking-widest mt-1">
                                {t('metadataEditor.mixedNote')}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            className="px-3 min-h-11 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                            title={t('metadataEditor.undo')}
                            aria-label={t('metadataEditor.undo')}
                        >
                            {t('metadataEditor.undo')}
                        </button>
                        <button
                            onClick={redo}
                            disabled={!canRedo}
                            className="px-3 min-h-11 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
                            title={t('metadataEditor.redo')}
                            aria-label={t('metadataEditor.redo')}
                        >
                            {t('metadataEditor.redo')}
                        </button>
                        <button onClick={() => setEditingTracks(null)} className="p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all active:scale-95" aria-label={t('metadataEditor.closeEditor')}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Top Section: Artwork & Ratings */}
                <div className="mb-6 p-4 rounded-2xl border border-white/10 bg-black/30">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                        {t('metadataEditor.writeTarget')}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'musicbib', label: 'musicBib.json' },
                            { id: 'file', label: 'Audio File' },
                            { id: 'both', label: 'Both' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => handleWriteTargetChange(opt.id as MetadataWriteTarget)}
                                className={`py-2 min-h-11 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${writeTarget === opt.id ? 'bg-dominant text-on-dominant border-dominant' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                            >
                                {opt.id === 'musicbib' ? t('metadataEditor.musicBibJson') : opt.id === 'file' ? t('metadataEditor.audioFile') : t('metadataEditor.both')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-8 mb-10">
                    {/* Artwork Preview */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group">
                            <div className="w-40 h-40 rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 group-hover:border-dominant transition-all duration-300">
                                {mixedFields.has('artworkUrl') ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-yellow-500 bg-yellow-500/5 text-center p-4">
                                        <ImageIcon size={32} className="mb-2 opacity-50" />
                                        <span className="text-[10px] font-black uppercase tracking-widest underline decoration-2 underline-offset-4">{t('metadataEditor.mixedArtworks')}</span>
                                    </div>
                                ) : (
                                    <ArtworkImage
                                        src={artworkUrl}
                                        className="w-full h-full object-cover"
                                    />
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2 backdrop-blur-sm">
                                    <button
                                        onClick={openArtworkUrlDialog}
                                        className="p-2 min-h-11 min-w-11 flex items-center justify-center bg-dominant text-black rounded-lg hover:scale-110 active:scale-95 transition-transform"
                                        title={t('metadataEditor.editArtworkUrl')}
                                        aria-label={t('metadataEditor.editArtworkUrl')}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleInputChange('artworkUrl', '', setArtworkUrl)}
                                        className="p-2 min-h-11 min-w-11 flex items-center justify-center bg-red-500 text-white rounded-lg hover:scale-110 active:scale-95 transition-transform"
                                        title={t('metadataEditor.removeArtworkOverride')}
                                        aria-label={t('metadataEditor.removeArtworkOverride')}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <span className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">{t('metadataEditor.artworkPreview')}</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        {/* Rating Row */}
                        <div className="mb-4 p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mr-4">{t('metadataEditor.rating')}</span>
                                {[1, 2, 3, 4, 5].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => handleRatingChange(s === (rating as number) ? 0 : s)}
                                        className={`group relative transition-all ${rating === 'mixed' ? 'text-yellow-500/20' : (s <= (rating as number) ? 'text-yellow-400 scale-110' : 'text-gray-700 hover:text-yellow-400/50')}`}
                                        aria-label={rating === 'mixed' ? t('metadataEditor.mixedRatingLabel', { count: s }) : `${t('metadataEditor.ratingStars', { count: s, suffix: s > 1 ? 's' : '' })}`}
                                    >
                                        <Star size={20} fill={(rating !== 'mixed' && s <= (rating as number)) ? 'currentColor' : 'none'} strokeWidth={2.5} />
                                        {rating === 'mixed' && s === 1 && (
                                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded uppercase">{t('metadataEditor.mixed')}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Favorite Row */}
                        <button
                            onClick={() => handleFavoriteChange(isFav === 'mixed' ? true : !isFav)}
                            className={`flex items-center justify-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black transition-all border w-full uppercase tracking-[0.25em] ${isFav === 'mixed'
                                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                                : (isFav ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-gray-500 border-white/5 hover:text-red-400')
                                }`}
                        >
                            <Heart size={14} fill={isFav === true ? 'currentColor' : 'none'} strokeWidth={2.5} />
                            {isFav === 'mixed' ? t('metadataEditor.mixedFavorites') : (isFav ? t('metadataEditor.inFavorites') : t('metadataEditor.addToFavorites'))}
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 mb-8 p-1 bg-white/5 rounded-xl border border-white/10">
                    {[
                        { id: 'general', label: t('metadataEditor.tabInfo'), icon: <Type size={14} /> },
                        { id: 'professional', label: t('metadataEditor.tabCredits'), icon: <ShieldCheck size={14} /> },
                        { id: 'organization', label: t('metadataEditor.tabOrganize'), icon: <Tag size={14} /> },
                        { id: 'lyrics', label: t('metadataEditor.tabLyrics'), icon: <FileText size={14} /> },
                        { id: 'external', label: t('metadataEditor.tabLinks'), icon: <Globe size={14} /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-0.5 sm:gap-2 py-2.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                                ? 'bg-dominant text-on-dominant shadow-lg shadow-dominant/20'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                }`}
                        >
                            {tab.icon}
                            <span className="truncate">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Contents */}
                <div className="min-h-[400px]">
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-left-4 duration-300">
                            <div className="md:col-span-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Type size={12} /> {t('metadataEditor.fieldTitle')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('title')}
                                    value={title}
                                    onChange={e => handleInputChange('title', e.target.value, setTitle)}
                                    placeholder={mixedFields.has('title') ? mixedPlaceholder(t('metadataEditor.fieldTitle')) : t('metadataEditor.fieldTitle')}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Mic size={12} /> {t('metadataEditor.fieldArtists')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('artist')}
                                    value={artist}
                                    onChange={e => handleInputChange('artist', e.target.value, setArtist)}
                                    placeholder={mixedFields.has('artist') ? mixedPlaceholder(t('metadataEditor.fieldArtists')) : t('metadataEditor.fieldArtists')}
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Disc size={12} /> {t('metadataEditor.fieldAlbum')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('album')}
                                    value={album}
                                    onChange={e => handleInputChange('album', e.target.value, setAlbum)}
                                    placeholder={mixedFields.has('album') ? mixedPlaceholder(t('metadataEditor.fieldAlbum')) : t('metadataEditor.fieldAlbum')}
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Users size={12} /> {t('metadataEditor.fieldAlbumArtist')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('albumArtist')}
                                    value={albumArtist}
                                    onChange={e => handleInputChange('albumArtist', e.target.value, setAlbumArtist)}
                                    placeholder={mixedFields.has('albumArtist') ? mixedPlaceholder(t('metadataEditor.fieldAlbumArtist')) : t('metadataEditor.fieldAlbumArtist')}
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Tag size={12} /> {t('metadataEditor.fieldGenre')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('genre')}
                                    value={genre}
                                    onChange={e => handleInputChange('genre', e.target.value, setGenre)}
                                    placeholder={mixedFields.has('genre') ? mixedPlaceholder(t('metadataEditor.fieldGenre')) : t('metadataEditor.fieldGenre')}
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Calendar size={12} /> {t('metadataEditor.fieldYear')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('year')}
                                    value={year}
                                    onChange={e => handleInputChange('year', e.target.value, setYear)}
                                    placeholder={mixedFields.has('year') ? mixedPlaceholder(t('metadataEditor.fieldYear')) : t('metadataEditor.yearPlaceholder')}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                        <Hash size={12} /> {t('metadataEditor.fieldTrackNo')}
                                    </label>
                                    <input
                                        type="text"
                                        className={inputClass('trackNumber')}
                                        value={trackNumber}
                                        onChange={e => handleInputChange('trackNumber', e.target.value, setTrackNumber)}
                                        placeholder={mixedFields.has('trackNumber') ? '---' : '1'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">{t('metadataEditor.fieldTotalTracks')}</label>
                                    <input
                                        type="text"
                                        className={inputClass('totalTracks')}
                                        value={totalTracks}
                                        onChange={e => handleInputChange('totalTracks', e.target.value, setTotalTracks)}
                                        placeholder={mixedFields.has('totalTracks') ? '---' : '12'}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">{t('metadataEditor.fieldDiscNo')}</label>
                                    <input
                                        type="text"
                                        className={inputClass('discNumber')}
                                        value={discNumber}
                                        onChange={e => handleInputChange('discNumber', e.target.value, setDiscNumber)}
                                        placeholder={mixedFields.has('discNumber') ? '---' : '1'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">{t('metadataEditor.fieldTotalDiscs')}</label>
                                    <input
                                        type="text"
                                        className={inputClass('totalDiscs')}
                                        value={totalDiscs}
                                        onChange={e => handleInputChange('totalDiscs', e.target.value, setTotalDiscs)}
                                        placeholder={mixedFields.has('totalDiscs') ? '---' : '1'}
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">{t('metadataEditor.fieldComment')}</label>
                                <input
                                    type="text"
                                    className={inputClass('comment')}
                                    value={comment}
                                    onChange={e => handleInputChange('comment', e.target.value, setComment)}
                                    placeholder={mixedFields.has('comment') ? mixedPlaceholder(t('metadataEditor.fieldComment')) : t('metadataEditor.commentPlaceholder')}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">{t('metadataEditor.fieldDescription')}</label>
                                <input
                                    type="text"
                                    className={inputClass('description')}
                                    value={description}
                                    onChange={e => handleInputChange('description', e.target.value, setDescription)}
                                    placeholder={mixedFields.has('description') ? mixedPlaceholder(t('metadataEditor.fieldDescription')) : t('metadataEditor.descriptionPlaceholder')}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'professional' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Users size={12} /> {t('metadataEditor.fieldProducer')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('producer')}
                                    value={producer}
                                    onChange={e => handleInputChange('producer', e.target.value, setProducer)}
                                    placeholder={mixedFields.has('producer') ? mixedPlaceholder(t('metadataEditor.fieldProducer')) : t('metadataEditor.producerPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Mic size={12} /> {t('metadataEditor.fieldRemixArtist')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('remixArtist')}
                                    value={remixArtist}
                                    onChange={e => handleInputChange('remixArtist', e.target.value, setRemixArtist)}
                                    placeholder={mixedFields.has('remixArtist') ? mixedPlaceholder(t('metadataEditor.fieldRemixArtist')) : t('metadataEditor.remixPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Building size={12} /> {t('metadataEditor.fieldLabel')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('label')}
                                    value={label}
                                    onChange={e => handleInputChange('label', e.target.value, setLabel)}
                                    placeholder={mixedFields.has('label') ? mixedPlaceholder(t('metadataEditor.fieldLabel')) : t('metadataEditor.labelPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Building size={12} /> {t('metadataEditor.fieldPublisher')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('publisher')}
                                    value={publisher}
                                    onChange={e => handleInputChange('publisher', e.target.value, setPublisher)}
                                    placeholder={mixedFields.has('publisher') ? mixedPlaceholder(t('metadataEditor.fieldPublisher')) : t('metadataEditor.publisherPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <ShieldCheck size={12} /> {t('metadataEditor.fieldIsrc')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('isrc')}
                                    value={isrc}
                                    onChange={e => handleInputChange('isrc', e.target.value, setIsrc)}
                                    placeholder={mixedFields.has('isrc') ? mixedPlaceholder(t('metadataEditor.fieldIsrc')) : t('metadataEditor.isrcPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <ShieldCheck size={12} /> {t('metadataEditor.fieldUpc')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('upc')}
                                    value={upc}
                                    onChange={e => handleInputChange('upc', e.target.value, setUpc)}
                                    placeholder={mixedFields.has('upc') ? mixedPlaceholder(t('metadataEditor.fieldUpc')) : t('metadataEditor.upcPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Bookmark size={12} /> {t('metadataEditor.fieldEdition')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('edition')}
                                    value={edition}
                                    onChange={e => handleInputChange('edition', e.target.value, setEdition)}
                                    placeholder={mixedFields.has('edition') ? mixedPlaceholder(t('metadataEditor.fieldEdition')) : t('metadataEditor.editionPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Calendar size={12} /> {t('metadataEditor.fieldRecordingYear')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('recordingYear')}
                                    value={recordingYear}
                                    onChange={e => handleInputChange('recordingYear', e.target.value, setRecordingYear)}
                                    placeholder={mixedFields.has('recordingYear') ? mixedPlaceholder(t('metadataEditor.fieldRecordingYear')) : '2023'}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'organization' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Activity size={12} /> {t('metadataEditor.fieldBpm')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('bpm')}
                                    value={bpm}
                                    onChange={e => handleInputChange('bpm', e.target.value, setBpm)}
                                    placeholder={mixedFields.has('bpm') ? '---' : '120'}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Heart size={12} /> {t('metadataEditor.fieldMood')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('mood')}
                                    value={mood}
                                    onChange={e => handleInputChange('mood', e.target.value, setMood)}
                                    placeholder={mixedFields.has('mood') ? mixedPlaceholder(t('metadataEditor.fieldMood')) : t('metadataEditor.moodPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Globe size={12} /> {t('metadataEditor.fieldLanguage')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('language')}
                                    value={language}
                                    onChange={e => handleInputChange('language', e.target.value, setLanguage)}
                                    placeholder={mixedFields.has('language') ? mixedPlaceholder(t('metadataEditor.fieldLanguage')) : t('metadataEditor.languagePlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Tag size={12} /> {t('metadataEditor.fieldCategory')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('category')}
                                    value={category}
                                    onChange={e => handleInputChange('category', e.target.value, setCategory)}
                                    placeholder={mixedFields.has('category') ? mixedPlaceholder(t('metadataEditor.fieldCategory')) : t('metadataEditor.categoryPlaceholder')}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Hash size={12} /> {t('metadataEditor.fieldCustomTags')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('tags')}
                                    value={tags}
                                    onChange={e => handleInputChange('tags', e.target.value, setTags)}
                                    placeholder={mixedFields.has('tags') ? mixedPlaceholder(t('metadataEditor.fieldCustomTags')) : t('metadataEditor.customTagsPlaceholder')}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'lyrics' && (
                        <div className="animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
                            <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                <FileText size={12} /> {t('metadataEditor.fieldLyrics')}
                            </label>
                            <textarea
                                className={`${inputClass('lyrics')} resize-none flex-1 min-h-[350px] leading-relaxed custom-scrollbar text-base font-medium p-6`}
                                value={lyrics}
                                onChange={e => handleInputChange('lyrics', e.target.value, setLyrics)}
                                placeholder={mixedFields.has('lyrics') ? mixedPlaceholder(t('metadataEditor.fieldLyrics')) : t('metadataEditor.lyricsPlaceholder')}
                            />
                        </div>
                    )}

                    {activeTab === 'external' && (
                        <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Link size={12} /> {t('metadataEditor.fieldVideoLink')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('videoLink')}
                                    value={videoLink}
                                    onChange={e => handleInputChange('videoLink', e.target.value, setVideoLink)}
                                    placeholder={mixedFields.has('videoLink') ? mixedPlaceholder(t('metadataEditor.fieldVideoLink')) : t('metadataEditor.urlPlaceholder')}
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Link size={12} /> {t('metadataEditor.fieldStreamingLink')}
                                </label>
                                <input
                                    type="text"
                                    className={inputClass('streamingLink')}
                                    value={streamingLink}
                                    onChange={e => handleInputChange('streamingLink', e.target.value, setStreamingLink)}
                                    placeholder={mixedFields.has('streamingLink') ? mixedPlaceholder(t('metadataEditor.fieldStreamingLink')) : t('metadataEditor.urlPlaceholder')}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {isArtworkDialogOpen && (
                    <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeArtworkUrlDialog}>
                        <div
                            ref={artworkDialogRef}
                            className="w-full max-w-xl bg-[#121212] border border-white/10 rounded-2xl p-6"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="artwork-url-dialog-title"
                            tabIndex={-1}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={handleArtworkDialogKeyDown}
                        >
                            <h3 id="artwork-url-dialog-title" className="text-white text-lg font-black tracking-tight mb-2">{t('metadataEditor.fieldArtworkUrl')}</h3>
                             <p className="text-gray-400 text-xs mb-4">{t('metadataEditor.artworkUrlDesc')}</p>
                            <input
                                type="text"
                                value={artworkDraftUrl}
                                onChange={(e) => {
                                    setArtworkDraftUrl(e.target.value);
                                    if (artworkDraftError) setArtworkDraftError(null);
                                }}
                                placeholder={t('metadataEditor.urlPlaceholder')}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-dominant"
                                autoFocus
                            />
                            {artworkDraftError && (
                                <p className="mt-2 text-red-400 text-xs font-bold">{artworkDraftError}</p>
                            )}
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    onClick={closeArtworkUrlDialog}
                                    className="px-4 min-h-11 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300 hover:text-white active:scale-95 transition-transform"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={applyArtworkUrlDraft}
                                    className="px-5 min-h-11 rounded-xl text-xs font-black uppercase tracking-widest bg-dominant text-on-dominant hover:bg-dominant-light active:scale-95 transition-transform"
                                >
                                    {t('metadataEditor.applyUrl')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sticky Actions */}
                <div className="sticky bottom-0 bg-[#111] pt-6 border-t border-white/10 mt-4 pb-2 z-10">
                    <div className="flex justify-between items-center gap-4">
                        <div className="max-w-[55%]">
                            <p className="text-[10px] text-gray-500 font-bold leading-relaxed uppercase tracking-widest">
                            * {t('metadataEditor.target')} {writeTarget === 'musicbib' ? t('metadataEditor.musicBibJson') : writeTarget === 'file' ? t('metadataEditor.audioFile') : t('metadataEditor.both')}.
                            </p>
                            {saveError && <p className="mt-2 text-xs text-red-400 font-bold">{saveError}</p>}
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setEditingTracks(null)}
                                disabled={isSaving}
                                className="px-6 py-3 min-h-11 rounded-xl text-xs font-black text-gray-500 hover:text-white hover:bg-white/5 transition-all uppercase tracking-[0.2em] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-3 px-10 py-3 min-h-11 bg-dominant text-on-dominant rounded-xl text-xs font-black hover:bg-dominant-light transition-all shadow-2xl shadow-dominant/40 uppercase tracking-[0.2em] disabled:opacity-70 disabled:cursor-wait active:scale-95"
                            >
                                <Save size={16} />
                                {isSaving ? t('common.saving') : t('metadataEditor.saveChanges').replace('{count}', String(editingTracks.length)).replace('{suffix}', editingTracks.length > 1 ? 's' : '')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
