import React, { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { usePlayer } from './contexts/PlayerContext';
import { useTranslation } from './i18n/I18nContext';
import { persistenceService } from './services/persistence';
import { audioEngine } from './services/audioEngine';
import { parseDuration } from './utils/formatters';
import { resolvePreferredAssetUrl } from './services/assetResolver';
import { getTrackDisplayName } from './utils/trackUtils';

const DEFAULT_APP_ICON = `${import.meta.env.BASE_URL}icon-192.svg`;

const resolveArtworkSrc = (rawPath?: string): string => {
    if (!rawPath) return '';
    return resolvePreferredAssetUrl(rawPath);
};

// Determine MIME type for artwork based on file extension (if available)
const mimeForArtwork = (src?: string): string | undefined => {
    if (!src) return undefined;
    try {
        const path = src.split('?')[0].split('#')[0];
        const parts = path.split('.');
        if (parts.length < 2) return undefined;
        const ext = parts.pop()!.toLowerCase();
        switch (ext) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'webp':
                return 'image/webp';
            case 'svg':
                return 'image/svg+xml';
            case 'gif':
                return 'image/gif';
            default:
                return undefined;
        }
    } catch (e) {
        return undefined;
    }
};

const App: React.FC = () => {
    const { state, togglePlay, playNext, playPrevious, seekForward, seekBackward, getProgress } = usePlayer();
    const { t } = useTranslation();
    const track = state.currentTrack;

    // Ensure critical persisted user data is flushed on page lifecycle events
    useEffect(() => {
        const flush = () => {
            try { persistenceService.flushNow(); } catch { }
        };

        // pagehide is reliable for background/tab close; beforeunload as a fallback
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        // Also flush when visibility changes to hidden (user switches away)
        const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('beforeunload', flush);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    useEffect(() => {
        // Update document title
        if (track) {
            const trackName = getTrackDisplayName(track, t('player.unknownTrack'));
            const artists = track.metadata?.artists?.join(', ') || t('player.unknownArtist');
            document.title = `${trackName} - ${artists}`;
        } else {
            document.title = t('common.appTitle');
        }

        // Update favicon
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (favicon) {
            const artworkPath = track?.artworks?.track_artwork?.[0]?.path || track?.artworks?.album_artwork?.[0]?.path;
            const artworkSrc = resolveArtworkSrc(artworkPath);
            if (artworkSrc) {
                favicon.href = artworkSrc;
            } else {
                // Revert to default favicon
                favicon.href = DEFAULT_APP_ICON;
            }
        }
    }, [track, t]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        if (!track) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
            return;
        }

        const artworkPath = track?.artworks?.track_artwork?.[0]?.path || track?.artworks?.album_artwork?.[0]?.path || '';
        const artworkSrc = resolveArtworkSrc(artworkPath);

        const artworkEntries = artworkSrc ? (() => {
            const mime = mimeForArtwork(artworkSrc);
            const entries = [
                { src: artworkSrc, sizes: '96x96' },
                { src: artworkSrc, sizes: '192x192' },
                { src: artworkSrc, sizes: '512x512' },
            ];
            return mime ? entries.map(e => ({ ...e, type: mime })) : entries;
        })() : undefined;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: getTrackDisplayName(track),
            artist: track.metadata?.artists?.join(', ') || t('player.unknownArtist'),
            album: track.metadata?.album || '',
            artwork: artworkEntries
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
        navigator.mediaSession.setActionHandler('seekbackward', () => seekBackward());
        navigator.mediaSession.setActionHandler('seekforward', () => seekForward());
    }, [track, togglePlay, playPrevious, playNext, seekBackward, seekForward, t]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = track ? (state.isPlaying ? 'playing' : 'paused') : 'none';
    }, [track?.logic.hash_sha256, state.isPlaying]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        if (!track || typeof navigator.mediaSession.setPositionState !== 'function') return;

        const updatePosition = () => {
            const duration = parseDuration(track.audio_specs?.duration);
            const position = Math.max(0, Math.min(duration, getProgress()));
            if (!Number.isFinite(duration) || duration <= 0) return;
            navigator.mediaSession.setPositionState({
                duration,
                position,
                playbackRate: audioEngine.getPlaybackRate()
            });
        };

        updatePosition();
        const timer = window.setInterval(updatePosition, 1000);
        return () => window.clearInterval(timer);
    }, [track?.logic.hash_sha256, getProgress]);

    useEffect(() => {
        const notificationsEnabled = persistenceService.get('ui_now_playing_notifications') === true;
        if (!notificationsEnabled || !track || !state.isPlaying) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (document.visibilityState !== 'hidden') return;

        const title = getTrackDisplayName(track);
        const artist = track.metadata?.artists?.join(', ') || t('player.unknownArtist');
        const artworkPath = track.artworks?.track_artwork?.[0]?.path || track.artworks?.album_artwork?.[0]?.path;
        const artworkSrc = resolveArtworkSrc(artworkPath);

        const notification = new Notification(title, {
            body: artist,
            icon: artworkSrc || DEFAULT_APP_ICON,
            tag: `now-playing-${track.logic.hash_sha256}`,
            silent: true
        });

        window.setTimeout(() => notification.close(), 5000);
    }, [track?.logic.hash_sha256, state.isPlaying, t]);

    return (
        <AppLayout />
    );
};

export default App;

