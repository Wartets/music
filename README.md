# Music Library

A local-first, offline-capable web application for managing and playing strictly organized, high-resolution music collections. The application is designed for audiophiles and music enthusiasts who require lossless audio playback, gapless transition between tracks, and an adaptive user interface that responds to album artwork colors. It operates as a single-page application built with React and TypeScript, with all data stored and processed locally in the browser.

## Introduction

Music Library is a browser-based music management system that indexes local audio files through a pre-generated database. The application uses a three-tier architecture consisting of an ingestion layer that creates the master index, a service layer for data processing and search, and a presentation layer built with React. The design philosophy prioritizes performance with large collections (10,000+ tracks), offline capability, and a responsive interface that adapts to both desktop and mobile environments.

The data model relies on a JSON database file named `musicBib.json` that serves as the single source of truth. This file contains comprehensive metadata for each track, including audio specifications, hierarchical organization, and color analysis derived from album artwork. The application reads this file into memory at startup and uses normalized data structures for efficient lookups and filtering operations.

## Features

### Core Architecture

- **Local First Operation**: All data processing occurs in the browser; no server-side components are required for playback or library management.
- **Hybrid Storage Model**: Authoritative database stored in `musicBib.json` with user preferences and state maintained in browser localStorage.
- **Index-Based Search**: Web Worker implementation provides non-blocking search with relevance scoring and boolean query support.
- **Memory Optimization**: Virtualized rendering for large track lists ensures smooth performance with extensive libraries.

### Audio Playback

- **Gapless Playback**: Dual audio buffer implementation allows seamless transition between consecutive tracks.
- **Lossless Format Support**: Native support for high-resolution audio formats including FLAC, WAV, DSD, and ALAC through browser media codecs.
- **Audio Processing**: Ten-band equalizer with preset configurations, crossfade between tracks, and RMS-based volume normalization.
- **Speed Control**: Variable playback speed adjustment independent of pitch.
- **Preloading Strategy**: Automatic preloading of the next track into an inactive buffer to minimize gaps.
- **Playback Modes**: Sequential, shuffled, and repeat modes with support for single-track and full-queue looping.

### Library Organization

- **Multiple Browsing Perspectives**: Tracks can be viewed and sorted by Albums, Artists, Genres, Years, Formats, and Folder hierarchy.
- **Smart Playlists**: Rule-based dynamic playlists with nested boolean conditions; rules evaluate on the client side with operators for equality, containment, prefixes, suffixes, range comparisons, and numeric thresholds.
- **Manual Playlists**: User-created collections that can be ordered manually or sorted automatically.
- **Version Management**: Tracks with multiple versions (remasters, reissues) are grouped; the best version is selected automatically based on file naming patterns, modification dates, and audio quality metrics.
- **Duplicate Detection**: Algorithms identify exact and approximate duplicate tracks based on audio fingerprints and metadata similarity.

### Metadata Management

- **Track Editing**: In-place modification of title, artist, album, genre, year, and other standard fields.
- **Lyrics Support**: Per-track lyrics storage and display synchronized with playback.
- **Rating System**: Five-star rating with quick-select interface.
- **Artwork Customization**: Support for embedded and external album artwork with automatic extraction during indexing.
- **Metadata Overrides**: User modifications can override indexed values without altering source files.
- **Color Analysis**: Dominant colors extracted from album artwork to drive theme adaptation.

### User Interface

- **Adaptive Theming**: UI colors dynamically adjust based on dominant colors extracted from currently playing album artwork.
- **Immersive Mode**: Full-screen visualizer with real-time frequency spectrum analysis, animated grain effects, and large artwork display.
- **Responsive Layout**: Interface automatically adapts between mobile and desktop viewports with touch-optimized controls on smaller screens.
- **Drag-and-Drop**: Queue reordering and playlist management through drag-and-drop interactions.
- **Keyboard Navigation**: Keyboard shortcuts for common playback and navigation actions.
- **Context Menus**: Right-click and long-press menus provide quick access to track actions.

### Data Management

- **Persistence Layer**: Compression, chunking, and locking mechanisms for reliable localStorage writes across 13 managed data segments.
- **Diff-Based Saving**: Only changed sections are written to localStorage to minimize storage operations.
- **History Tracking**: Automatic recording of playback history with configurable retention.
- **Favorites Collection**: Curated list of marked tracks accessible from dedicated view.
- **Import/Export**: Data can be exported as JSON for backup or transfer between installations.

## Installation

### Prerequisites

- Node.js version 20 or later (LTS recommended)
- npm version 9 or later
- A directory of audio files organized in the structure `assets/Group/Project/Folder/audio-files`
- PowerShell 5.1 or later (Windows only, for the indexing script)

### Cloning the Repository

```bash
git clone https://github.com/wartets/Music-Library.git
cd Music-Library
```

### Dependency Installation

Install project dependencies using npm:

```bash
npm install
```

This installs both runtime dependencies and development tools listed in `package.json`.

### Environment Configuration

The application can optionally load media from remote sources. Create a `.env.local` file in the project root for remote URL configuration:

```
VITE_MEDIA_BASE_URL=https://your-cdn-or-network-share-url
```

This variable enables loading audio files from a remote location while keeping metadata local. The default behavior serves files from the local `assets/` directory via Vite's development server.

### Indexing Your Music Collection

Before the application can play your music, the library must be indexed to create `musicBib.json`.

**On Windows**:
Run the provided PowerShell script:
```powershell
.\indexation.bat
```

The script performs the following operations:
- Recursively crawls the `assets/` directory for supported audio formats
- Extracts metadata using Windows Shell COM API and FFprobe
- Analyzes album artwork to extract dominant colors
- Detects audio specifications (sample rate, bit depth, codec, bitrate)
- Identifies lossless vs. lossy encoding
- Generates hierarchical grouping based on folder structure
- Runs in parallel across multiple PowerShell runspaces for performance

**On macOS and Linux**: The Windows-specific indexing script will not run. Alternative indexing methods may be required; consult the project repository for platform-specific instructions.

**Supported Audio Formats**: MP3, AAC, OGG, FLAC, WAV, ALAC, DSD, Opus, and other formats supported by FFmpeg/FFprobe.

### Development Server

Start the development server with hot module replacement:

```bash
npm run dev
```

Open a browser to `http://localhost:5173` to access the application. The development server proxies requests for audio files to the parent Music-Library directory, allowing playback of files outside the project workspace.

## Usage

### Initial Setup

After starting the application for the first time, the interface will load the library database from `musicBib.json`. If the file does not exist or is empty, a message will prompt you to run the indexing script.

### Navigation

The primary navigation is located in the sidebar on desktop devices and in a collapsible menu on mobile. Available views include:

- **Dashboard**: Overview of library statistics, recent additions, and currently playing track.
- **Albums**: Grid display of all albums with artwork; click to view tracks within an album.
- **Artists**: Alphabetical list of artists; expand to see associated albums.
- **Genres**: Grouped listing by genre with track counts.
- **Years**: Decade and year-based organization.
- **Formats**: Grouping by audio format and codec. (hidden by default)
- **Folders**: Filesystem-like view of the original directory structure.
- **All Tracks**: Comprehensive searchable and sortable table of every track.
- **Playlists**: User-created and smart playlists.
- **Favorites**: Collection of favorited tracks.
- **History**: Playback history with timestamps.
- **Settings**: Configuration options for playback, appearance, and data management.

### Playback Controls

The player bar at the bottom of the screen provides:

- Play/pause, next/previous track buttons
- Shuffle and repeat mode toggles
- Volume slider with mute option
- Progress bar with seek functionality
- Current track information display with link to album view
- Expandable queue panel showing upcoming tracks

Keyboard shortcuts (when focus is not on an input field):

| Key | Action |
|-----|--------|
| Space | Play/pause |
| Right Arrow | Next track |
| Left Arrow | Previous track |
| Up Arrow | Volume increase |
| Down Arrow | Volume decrease |
| M | Mute toggle |

### Queue Management

The queue displays the playback sequence. Tracks can be reordered by dragging items on desktop or using long-press drag handles on mobile. Right-clicking a track opens a context menu with actions such as remove, move to position, or add to playlist.

Saving the current queue as a playlist is available through the queue panel menu.

### Search and Filtering

The search input at the top of most views accepts queries with optional field filters:

- `artist:Beatles` — matches tracks by artist "Beatles"
- `year:1970` — matches tracks released in 1970
- `genre:Rock` — matches tracks in the Rock genre
- `FLAC` — matches tracks where any field contains "FLAC"

Multiple conditions combine with implicit AND:
```
artist:Beatles year:1969
```

Boolean operators are supported:
```
(artist:Beatles OR artist:Stones) AND genre:Rock
```

Negation:
```
NOT genre:Pop
```

Search is performed in a Web Worker to maintain UI responsiveness and results update with a 300-millisecond debounce.

#### Field-Specific Search Weights

Relevance scoring prioritizes matches in certain fields:

| Field | Weight |
|-------|--------|
| Title | 1.0 |
| Artist | 0.9 |
| Album | 0.8 |
| Genre | 0.7 |
| Year | 0.6 |
| Format | 0.5 |

### Editing Metadata

Click the edit icon on a track row in the All Tracks view or within an album detail view. The inline editor allows modification of standard fields and lyrics. Changes are saved to localStorage immediately and persist across sessions.

### Creating Smart Playlists

1. Navigate to Playlists
2. Click "New Smart Playlist"
3. Add rule groups using the rule builder
4. Each rule consists of a field, an operator, and a value
5. Combine multiple rule groups with AND/OR logic
6. Save the playlist; it updates dynamically as the library changes

Supported operators:
- Equals
- Contains
- Starts With
- Ends With
- Greater Than (for numeric fields)
- Less Than (for numeric fields)
- Between (for numeric ranges)

### Immersive View

Press the fullscreen icon on the player bar to enter immersive mode. This displays:

- Large album artwork centered on screen
- Track title and artist overlaid
- Real-time audio visualizer with frequency bars
- Configurable animated grain overlay for texture
- Subtle playback controls accessible via mouse movement or tap

Press Escape or tap the screen to exit.

### Data Export and Backup

From Settings, use the Data Management section to:

- Export all user data (ratings, playlists, overrides) as JSON
- Import previously exported data
- Clear local storage to reset application state
- View storage usage breakdown

## Technical Specifications

### Data Format

The `musicBib.json` file conforms to the following structure:

```json
{
  "version": "1.1.0",
  "generated": "2026-05-04T01:52:38Z",
  "tracks": [
    {
      "logic": {
        "hash_sha256": "a1b2c3d4e5f6...",
        "hierarchy": {
          "group": "GroupName",
          "album": "AlbumName",
          "folder": "SpecificFolder"
        },
        "track_name": "Track Title",
        "track_number": 1,
        "disc_number": 1,
        "version": "Original Mix"
      },
      "artists": ["Primary Artist", "Featured Artist"],
      "album": {
        "name": "Album Title",
        "artist": "Album Artist",
        "artworks": [
          {
            "path": "C:\\path\\to\\artwork.jpg",
            "dominant_color": "#3a5fcd"
          }
        ]
      },
      "file": {
        "name": "track01.flac",
        "path": "C:\\Music\\Group\\Project\\Folder\\track01.flac",
        "size": 42145730,
        "ext": ".flac",
        "mtime": "2026-01-01T00:00:00Z"
      },
      "audio_specs": {
        "duration": 245.5,
        "sample_rate": 44100,
        "bit_depth": 16,
        "channels": 2,
        "codec": "FLAC",
        "bitrate": 1411,
        "is_lossless": true
      },
      "metadata": {
        "genre": "Electronic",
        "year": 2024,
        "comment": "",
        "lyrics": ""
      }
    }
  ]
}
```

The primary key for each track is the `logic.hash_sha256` value; this identifier should be used consistently when referencing tracks rather than array index or numeric ID.

### Path Normalization

All file paths in `musicBib.json` use Windows-style backslash separators. The application normalizes these to forward slashes for URL construction. When serving files from the local filesystem during development, the Vite configuration includes middleware to resolve paths from the parent Music-Library directory.

Three asset resolution strategies are employed, in order:

1. Remote URL from `VITE_MEDIA_BASE_URL`
2. Repository-relative path (`/assets/...`)
3. Direct filesystem access (development only)

### State Management

Application state is divided among several React contexts:

- **LibraryContext**: Track database, search results, filtering state, and metadata editing functions
- **PlayerContext**: Playback state, queue management, audio control functions, and playback callbacks
- **UIContext**: Layout state, sidebar visibility, mobile/desktop mode, and global UI flags
- **ThemeContext**: Current color theme values derived from artwork or user configuration

State mutations should follow immutability patterns using spread operators or array methods; direct mutation is reserved for localStorage write operations.

### Performance Considerations

- The track database is loaded entirely into memory at startup for O(1) access via hash lookup maps.
- Search operations run in a dedicated Web Worker to prevent blocking the main thread.
- The All Tracks view uses `@tanstack/react-virtual` for windowed rendering of large lists.
- Audio buffers are preloaded with a predictive algorithm that analyzes queue order and already-played patterns.
- Color extraction from artwork occurs during indexing, not at runtime.

## Dependencies

The project relies on the following runtime dependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.0.0 | User interface library |
| react-dom | ^19.0.0 | React renderer for the DOM |
| react-router-dom | ^6.22.3 | Client-side routing |
| react-error-boundary | ^6.1.1 | Error boundary component for React |
| framer-motion | ^11.0.24 | Animation and transition library |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop core utilities |
| @dnd-kit/sortable | ^8.0.0 | Sortable list implementation |
| @dnd-kit/utilities | ^3.2.2 | Helper functions for drag-and-drop |
| @tanstack/react-virtual | ^3.13.24 | Virtual list rendering |
| lucide-react | ^0.475.0 | Icon library |
| clsx | ^2.1.0 | Conditional class name utility |
| tailwind-merge | ^2.2.2 | Tailwind CSS class name merging |
| uuid | ^14.0.0 | Unique identifier generation |

Development dependencies used for building and tooling:

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.7.0 | Type system and compiler |
| vite | ^5.2.2 | Build tool and development server |
| @vitejs/plugin-react | ^4.2.1 | React integration for Vite |
| tailwindcss | ^3.4.3 | Utility-first CSS framework |
| autoprefixer | ^10.4.19 | CSS vendor prefix generation |
| postcss | ^8.4.38 | CSS transformation tooling |
| @types/node | ^25.6.0 | Node.js type definitions |
| @types/react | ^19.0.0 | React type definitions |
| @types/react-dom | ^19.0.0 | React DOM type definitions |

## Author and Content Licensing

**Author**: Colin Bossu Réaubourg (AKA Wartets)

**Music Content**: All musical compositions available through the deployed instance of this application are original works created and recorded by the author. The music is provided freely for listening and personal enjoyment.

**Usage Terms for Musical Works**:

- **Attribution Required**: Any reuse, redistribution, or public performance of the compositions must credit the author as "Colin Bossu Réaubourg" (Some music has co-authors who should be mentioned in this case).
- **Non-Commercial Use Only**: The musical works may not be used for commercial purposes, including but not limited to selling, licensing for profit, or inclusion in monetized content without explicit written permission from the author (Just ask me and I'll surely give you an agreement).
- **No Derivative Works**: Creation of remixes, samples, or other derivative musical works based on the provided compositions requires prior authorization from the author (I would most certainly say yes as well if asked).
- **Personal Use**: Unlimited personal listening, downloading for offline personal use, and sharing with individuals for non-commercial enjoyment are permitted under these terms.

The software itself is provided as-is; refer to the repository for licensing terms of the codebase.

## Deployment

The application is deployed as a static site on GitHub Pages at:

https://wartets.github.io/Music-Library/

The production build consists of static HTML, CSS, and JavaScript files that can be served from any static hosting provider. The build output is generated in the `dist/` directory.

### Production Build

Create a production-optimized build:

```bash
npm run build
```

The build process runs TypeScript type checking followed by Vite bundling with minification and tree-shaking. The resulting static files are placed in `dist/`.

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

This starts a local server serving the built assets, allowing verification of the production version before deployment.

### GitHub Pages Configuration

The repository is configured with GitHub Pages enabled on the `gh-pages` branch or the `/docs` folder depending on repository settings. The Vite base path is configured as `/Music-Library/` to accommodate GitHub Pages' subdirectory deployment model.

### Self-Hosting

The application can be hosted on any static file server. Ensure that:

- The server serves files with correct MIME types (HTML, CSS, JS, and audio formats)
- If hosting audio files on the same domain, configure CORS headers if necessary
- The `VITE_MEDIA_BASE_URL` environment variable can be set at build time to point to your media storage location

## System Requirements

The application requires a modern web browser with support for:

- ES2020 JavaScript features
- Web Audio API
- Web Workers
- LocalStorage API
- CSS Grid and Flexbox

Supported browsers include the latest versions of Chrome, Firefox, Safari, and Edge on Windows, macOS, Linux, iOS, and Android. Internet Explorer is not supported.
