import React, { useState, useEffect } from 'react';
import { persistenceService, Playlist } from '../../services/persistence';
import { X, Save, Image as ImageIcon, Type, FileText, Trash2 } from 'lucide-react';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../i18n/I18nContext';

interface PlaylistEditorProps {
    playlist: Playlist;
    onSave: (updated: Playlist) => void;
    onCancel: () => void;
    onDelete?: (id: string) => void;
}

export const PlaylistEditor: React.FC<PlaylistEditorProps> = ({ playlist, onSave, onCancel, onDelete }) => {
    const { t } = useTranslation();
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description || '');
    const [customImage, setCustomImage] = useState(playlist.customImage || '');
    const { containerRef, handleKeyDown } = useFocusTrap<HTMLDivElement>({
        active: true,
        onEscape: onCancel,
    });

    useEffect(() => {
        setName(playlist.name);
        setDescription(playlist.description || '');
        setCustomImage(playlist.customImage || '');
    }, [playlist]);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        const updates: Partial<Playlist> = {
            name: name.trim(),
            description: description.trim(),
            customImage: customImage.trim() || undefined
        };

        persistenceService.updatePlaylist(playlist.id, updates);
        onSave({ ...playlist, ...updates });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onCancel}>
            <div
                ref={containerRef}
                className="bg-[#111] border border-white/10 rounded-3xl shadow-3xl w-full max-w-xl p-8 animate-in zoom-in-95 duration-300 relative overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="playlist-editor-title"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-dominant/10 blur-[100px] rounded-full"></div>

                <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                        <h2 id="playlist-editor-title" className="text-2xl font-black text-white tracking-tight">{t('playlistEditor.title')}</h2>
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">{t('playlistEditor.description')}</p>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all" aria-label="Close playlist editor">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSave} className="space-y-6 relative z-10">
                    <div className="flex gap-8">
                        {/* Artwork Preview/Edit */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative group overflow-hidden rounded-2xl w-32 h-32 border border-white/10 bg-black/50 shadow-2xl">
                                {customImage ? (
                                    <ArtworkImage src={customImage} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-white/10">
                                        <ImageIcon size={32} />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const url = prompt(t('playlistEditor.enterImageUrl'), customImage);
                                            if (url !== null) setCustomImage(url);
                                        }}
                                        className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white text-xs font-bold uppercase"
                                        aria-label="Edit cover image URL"
                                    >
                                        {t('playlistEditor.edit')}
                                    </button>
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{t('playlistEditor.coverArt')}</span>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <Type size={12} /> {t('playlistEditor.playlistName')}
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-dominant transition-all"
                                    placeholder={t('playlistEditor.namePlaceholder')}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                                    <ImageIcon size={12} /> {t('playlistEditor.coverUrl')}
                                </label>
                                <input
                                    type="text"
                                    value={customImage}
                                    onChange={e => setCustomImage(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-dominant transition-all"
                                    placeholder={t('playlistEditor.coverUrlPlaceholder')}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">
                            <FileText size={12} /> {t('playlistEditor.descriptionField')}
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-dominant transition-all h-24 resize-none text-sm"
                            placeholder={t('playlistEditor.descriptionPlaceholder')}
                        />
                    </div>

                    <div className="pt-4 flex items-center justify-between">
                        {onDelete && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (confirm(t('playlistEditor.deleteConfirm').replace('{name}', playlist.name))) {
                                        onDelete(playlist.id);
                                    }
                                }}
                                className="flex items-center gap-2 text-red-500/50 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all px-4 py-2 hover:bg-red-500/5 rounded-lg"
                            >
                                <Trash2 size={14} /> {t('playlistEditor.deletePlaylist')}
                            </button>
                        )}
                        <div className="flex gap-4 ml-auto">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-6 py-3 rounded-xl text-xs font-black text-gray-500 hover:text-white transition-all uppercase tracking-widest"
                            >
                                {t('playlistEditor.discard')}
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 px-8 py-3 bg-dominant text-on-dominant rounded-xl text-xs font-black hover:bg-dominant-light transition-all shadow-xl shadow-dominant/20 uppercase tracking-widest"
                            >
                                <Save size={16} /> {t('playlistEditor.saveChanges')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

