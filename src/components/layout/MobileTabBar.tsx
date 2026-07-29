import React from 'react';
import { ViewType, resolvePrimaryTabView } from './viewRouting';
import { Calendar, FileAudio, FolderOpen, Grid3X3, Heart, Home, LayoutGrid, ListMusic, Mic2, MoreHorizontal, PlaySquare, Settings, Tags } from 'lucide-react';
import { useLibrary } from '../../contexts/LibraryContext';
import { useTranslation } from '../../i18n/I18nContext';

interface MobileTabBarProps {
    currentView: ViewType;
    onNavigate: (view: ViewType, data?: unknown) => void;
}

import type { TranslationKey } from '../../i18n/I18nContext';

const tabDefs: { id: ViewType; labelKey: TranslationKey; icon: React.ReactNode }[] = [
    { id: 'Dashboard', labelKey: 'nav.home', icon: <Home size={18} /> },
    { id: 'AllTracks', labelKey: 'nav.tracks', icon: <ListMusic size={18} /> },
    { id: 'Albums', labelKey: 'nav.albums', icon: <LayoutGrid size={18} /> },
    { id: 'Artists', labelKey: 'nav.artists', icon: <Mic2 size={18} /> },
    { id: 'Queue', labelKey: 'nav.queue', icon: <PlaySquare size={18} /> },
];

const extraTabDefs: { id: ViewType; labelKey: TranslationKey; icon: React.ReactNode }[] = [
    { id: 'Genres', labelKey: 'nav.genres', icon: <Tags size={16} /> },
    { id: 'Years', labelKey: 'nav.years', icon: <Calendar size={16} /> },
    { id: 'Folders', labelKey: 'nav.folders', icon: <FolderOpen size={16} /> },
    { id: 'Formats', labelKey: 'nav.formats', icon: <FileAudio size={16} /> },
    { id: 'Playlists', labelKey: 'nav.playlists', icon: <Grid3X3 size={16} /> },
    { id: 'Favorites', labelKey: 'nav.favorites', icon: <Heart size={16} /> },
    { id: 'DetailedHistory', labelKey: 'nav.history', icon: <ListMusic size={16} /> },
    { id: 'Settings', labelKey: 'nav.settings', icon: <Settings size={16} /> },
];

const primaryTabIds = tabDefs.map((tab) => tab.id);

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ currentView, onNavigate }) => {
    const { t } = useTranslation();
    const activeTab = React.useMemo(
        () => resolvePrimaryTabView(currentView, primaryTabIds),
        [currentView]
    );

    const [isMoreOpen, setIsMoreOpen] = React.useState(false);
    const [mobileSearchQuery, setMobileSearchQuery] = React.useState('');
    const isMoreActive = React.useMemo(() => extraTabDefs.some(tab => tab.id === currentView), [currentView]);
    const { state: libraryState, setSearchQuery } = useLibrary();

    const navigateToView = React.useCallback((view: ViewType) => {
        if (currentView === view && libraryState.searchQuery) {
            setSearchQuery('');
        }
        onNavigate(view);
    }, [currentView, libraryState.searchQuery, onNavigate, setSearchQuery]);

    React.useEffect(() => {
        if (isMoreOpen) {
            setMobileSearchQuery(libraryState.searchQuery || '');
        }
    }, [isMoreOpen, libraryState.searchQuery]);

    const submitMobileSearch = () => {
        const query = mobileSearchQuery.trim();
        if (!query) return;
        setSearchQuery(query);
        onNavigate('SearchResults', { query, sourceView: currentView });
        setIsMoreOpen(false);
    };

    return (
        <>
            <div
                className={`md:hidden fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm transition-opacity duration-250 ${isMoreOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsMoreOpen(false)}
                aria-hidden={!isMoreOpen}
            >
                <div
                    className={`absolute left-3 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.5rem)] rounded-2xl bg-[#121212]/95 border border-white/10 p-3.5 shadow-2xl transition-all duration-300 ease-out ${isMoreOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-[0.98] opacity-0'}`}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="mb-3">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 px-1">{t('search.searchLibrary')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={mobileSearchQuery}
                                onChange={(e) => setMobileSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        submitMobileSearch();
                                    }
                                }}
                                placeholder={t('search.mobilePlaceholder')}
                                inputMode="search"
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-gray-500 outline-none focus:border-dominant"
                            />
                            <button
                                onClick={submitMobileSearch}
                                className="px-3 py-2.5 rounded-xl bg-dominant text-on-dominant text-[10px] font-black uppercase tracking-widest active:scale-95"
                            >
                                {t('search.go')}
                            </button>
                        </div>
                    </div>

                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 px-1">{t('nav.moreViews')}</div>
                    <div className="grid grid-cols-2 gap-2.5 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
                        {extraTabDefs.map(tab => {
                            const isActive = currentView === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        navigateToView(tab.id);
                                        setIsMoreOpen(false);
                                    }}
                                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left transition-all min-h-12 active:scale-95 ${isActive ? 'bg-dominant/25 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                >
                                    {tab.icon}
                                    <span className="text-xs font-bold leading-none">{t(tab.labelKey)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-[70] border-t border-white/10 bg-black/85 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]"
                role="navigation"
                aria-label={t('aria.mobileNavigation')}
            >
                <div className="h-[4.5rem] grid grid-cols-6">
                    {tabDefs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => navigateToView(tab.id)}
                                className={`flex flex-col items-center justify-center gap-1.5 transition-all min-h-12 active:scale-95 ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <span className={isActive ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]' : ''}>
                                    {tab.icon}
                                </span>
                                <span className="text-[11px] sm:text-[12px] font-bold tracking-wide uppercase leading-none">
                                    {t(tab.labelKey)}
                                </span>
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setIsMoreOpen(prev => !prev)}
                        className={`flex flex-col items-center justify-center gap-1.5 transition-all min-h-12 active:scale-95 ${(isMoreOpen || isMoreActive) ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        aria-expanded={isMoreOpen}
                        aria-label={t('aria.toggleMoreViews')}
                    >
                        <MoreHorizontal size={18} />
                        <span className="text-[11px] sm:text-[12px] font-bold tracking-wide uppercase leading-none">{t('nav.more')}</span>
                    </button>
                </div>
            </nav>
        </>
    );
};
