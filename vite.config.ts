import { defineConfig, Plugin, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

function isPathInside(parent: string, child: string) {
    const rel = relative(parent, child);
    return !!rel && !rel.startsWith('..') && !resolve(parent).includes('..');
}

function copyPublicAssets(): Plugin {
    return {
        name: 'copy-public-assets',
        apply: 'build',
        closeBundle() {
            const publicDir = resolve(currentDir, 'public');
            const distDir = resolve(currentDir, 'dist');
            const filesToCopy = ['robots.txt', 'sitemap.xml', 'browserconfig.xml', 'schema.json'];

            filesToCopy.forEach(file => {
                const source = resolve(publicDir, file);
                const destination = resolve(distDir, file);

                if (existsSync(source)) {
                    copyFileSync(source, destination);
                } else {
                    console.warn(`${file} not found in public/; skipping copy.`);
                }
            });
        },
    };
}

function copyMusicBibJson(): Plugin {
    return {
        name: 'copy-musicbib-json',
        apply: 'build',
        closeBundle() {
            const source = resolve(currentDir, 'musicBib.json');
            const destination = resolve(currentDir, 'dist', 'musicBib.json');

            if (!existsSync(source)) {
                console.warn('musicBib.json not found at project root; dist/musicBib.json was not generated.');
                return;
            }

            copyFileSync(source, destination);
        },
    };
}

function musicFilesMiddleware(): Plugin {
    return {
        name: 'music-files-middleware',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
                const url = req.url || '';
                if (!url) {
                    return next();
                }

                const urlPath = url.split('?')[0];
                let musicPath: string;
                try {
                    musicPath = decodeURIComponent(urlPath).replace(/\\/g, '/').replace(/^\/+/, '');
                } catch {
                    musicPath = urlPath.replace(/%2F/g, '/').replace(/%5C/g, '/').replace(/^\/+/, '');
                }
                
                // Strip 'assets/' prefix for feature detection
                const subPath = musicPath.toLowerCase().startsWith('assets/') 
                    ? musicPath.substring(6) 
                    : musicPath;

                const isAlbumAsset = /^Album[\s]/i.test(subPath);
                const isSingleAsset = /^Single\//i.test(subPath);
                if (!isAlbumAsset && !isSingleAsset) {
                    return next();
                }

                const ext = musicPath.toLowerCase().split('.').pop() || '';
                const allowedExtensions = new Set(['m4a', 'mp3', 'wav', 'flac', 'ogg', 'opus', 'aac', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg']);
                if (!allowedExtensions.has(ext)) {
                    return next();
                }

                // Only serve files from the repository `assets/` folder. This prevents
                // accidental exposure of files outside the project root.
                const assetsRoot = resolve(currentDir, 'assets');
                const candidatePath = resolve(assetsRoot, subPath);

                if (!isPathInside(assetsRoot, candidatePath) || !existsSync(candidatePath)) {
                    return next();
                }

                try {
                    const content = readFileSync(candidatePath);
                    const contentType = ext === 'm4a' ? 'audio/mp4' 
                        : ext === 'mp3' ? 'audio/mpeg'
                        : ext === 'wav' ? 'audio/wav'
                        : ext === 'flac' ? 'audio/flac'
                        : ext === 'ogg' ? 'audio/ogg'
                        : ext === 'opus' ? 'audio/ogg'
                        : ext === 'aac' ? 'audio/aac'
                        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                        : ext === 'png' ? 'image/png'
                        : ext === 'webp' ? 'image/webp'
                        : ext === 'gif' ? 'image/gif'
                        : ext === 'bmp' ? 'image/bmp'
                        : ext === 'svg' ? 'image/svg+xml'
                        : 'application/octet-stream';
                    
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    res.end(content);
                } catch {
                    next();
                }
            });
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    base: mode === 'production' ? '/Music-Library/' : '/',
    plugins: [react(), copyPublicAssets(), copyMusicBibJson(), musicFilesMiddleware()],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;

                    if (id.includes('react') || id.includes('scheduler')) {
                        return 'vendor-react';
                    }

                    if (id.includes('framer-motion')) {
                        return 'vendor-motion';
                    }

                    if (id.includes('@dnd-kit')) {
                        return 'vendor-dnd';
                    }

                    if (id.includes('@tanstack/react-virtual')) {
                        return 'vendor-virtual';
                    }

                    if (id.includes('lucide-react')) {
                        return 'vendor-icons';
                    }

                    return 'vendor-misc';
                },
            },
        },
    },
    server: {
        // Allow the project root so Vite can serve `index.html`, while still keeping
        // access confined to the repository root and its `assets/` folder.
        fs: {
            strict: true,
            allow: [currentDir, resolve(currentDir, 'assets')],
        },
    },
    worker: {
        format: 'es',
    },
}));
