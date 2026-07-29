import { TrackItem } from '../types/music';

const EXTENSION_QUALITY_SCORE: Record<string, number> = {
    wav: 8,
    aiff: 7,
    flac: 7,
    alac: 6,
    m4a: 5,
    aac: 5,
    mp3: 4,
    ogg: 3,
    wma: 2,
};

const LIKELY_UNSUPPORTED_CODEC_REGEX = /(alac|ape|wvpack|tta|tak)/i;
const COMPATIBLE_LABEL_REGEX = /(compatible|browser|web|aac)/i;

const parseNumberLike = (value?: string | null): number => {
    if (!value) return 0;
    const match = value.match(/(\d+(\.\d+)?)/);
    if (!match) return 0;
    return Number(match[1]) || 0;
};

const normalizeEpochToSeconds = (value?: number | null): number => {
    if (!value || !Number.isFinite(value) || value <= 0) return 0;
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
};

const normalizeVersionSegments = (raw: string): number[] | null => {
    const semverLike = raw.match(/(?:^|[^\d])v?(\d+(?:\.\d+){1,5})(?:[^\d]|$)/i);
    if (semverLike) {
        return semverLike[1]
            .split('.')
            .map(part => Number(part))
            .filter(part => Number.isFinite(part));
    }

    const simpleVersion = raw.match(/(?:version|ver|v)\s*(\d+)\b/i) || raw.match(/\b(\d+)\s*$/);
    if (simpleVersion) {
        const value = Number(simpleVersion[1]);
        if (Number.isFinite(value)) {
            return [value];
        }
    }

    return null;
};

const extractVersionNameDateMs = (raw: string): number | null => {
    if (!raw) return null;

    // YYYY-MM-DD [HH[:.]MM[:.]SS]
    const iso = raw.match(/(\d{4})[-_/.](\d{1,2})[-_/.](\d{1,2})(?:[ T_-]?(\d{1,2})[:._-]?(\d{1,2})?(?:[:._-]?(\d{1,2}))?)?/);
    if (iso) {
        const [, y, m, d, hh, mm, ss] = iso;
        const date = new Date(
            Number(y),
            Math.max(0, Number(m) - 1),
            Number(d),
            Number(hh || 0),
            Number(mm || 0),
            Number(ss || 0),
        );
        const ms = date.getTime();
        if (!Number.isNaN(ms)) return ms;
    }

    // DD-MM-YYYY [HH[:.]MM[:.]SS]
    const eu = raw.match(/(\d{1,2})[-_/.](\d{1,2})[-_/.](\d{4})(?:[ T_-]?(\d{1,2})[:._-]?(\d{1,2})?(?:[:._-]?(\d{1,2}))?)?/);
    if (eu) {
        const [, d, m, y, hh, mm, ss] = eu;
        const date = new Date(
            Number(y),
            Math.max(0, Number(m) - 1),
            Number(d),
            Number(hh || 0),
            Number(mm || 0),
            Number(ss || 0),
        );
        const ms = date.getTime();
        if (!Number.isNaN(ms)) return ms;
    }

    return null;
};

const compareVersionSegmentsDesc = (a: number[], b: number[]): number => {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
        const aVal = a[i] || 0;
        const bVal = b[i] || 0;
        if (aVal !== bVal) return bVal - aVal;
    }
    return 0;
};

const getTrackQualityScore = (track: TrackItem): number => {
    const ext = (track.file?.ext || '').toLowerCase();
    const extScore = EXTENSION_QUALITY_SCORE[ext] || 0;
    const losslessScore = track.audio_specs?.is_lossless ? 1000 : 0;
    const sampleRateScore = parseNumberLike(track.audio_specs?.sample_rate);
    const bitrateScore = parseNumberLike(track.audio_specs?.bitrate);
    const label = `${track.logic?.version_name || ''} ${track.file?.name || ''}`.toLowerCase();
    const codec = String(track.audio_specs?.codec || '').toLowerCase();
    const compatibilityBonus = COMPATIBLE_LABEL_REGEX.test(label) ? 50_000 : 0;
    const unsupportedPenalty = LIKELY_UNSUPPORTED_CODEC_REGEX.test(codec) ? 200_000 : 0;
    return (extScore * 10_000) + losslessScore + sampleRateScore + bitrateScore + compatibilityBonus - unsupportedPenalty;
};

export const compareTrackVersions = (a: TrackItem, b: TrackItem): number => {
    const aLabel = `${a.logic?.version_name || ''} ${a.file?.name || ''}`.trim();
    const bLabel = `${b.logic?.version_name || ''} ${b.file?.name || ''}`.trim();

    const aVersionSegments = normalizeVersionSegments(aLabel);
    const bVersionSegments = normalizeVersionSegments(bLabel);

    if (aVersionSegments && bVersionSegments) {
        const semverCmp = compareVersionSegmentsDesc(aVersionSegments, bVersionSegments);
        if (semverCmp !== 0) return semverCmp;
    } else if (aVersionSegments || bVersionSegments) {
        // Prefer explicit version tags when available
        return aVersionSegments ? -1 : 1;
    }

    const aLabelDate = extractVersionNameDateMs(aLabel);
    const bLabelDate = extractVersionNameDateMs(bLabel);
    if (aLabelDate && bLabelDate && aLabelDate !== bLabelDate) {
        return bLabelDate - aLabelDate;
    }
    if (aLabelDate || bLabelDate) {
        return aLabelDate ? -1 : 1;
    }

    const createdCmp = normalizeEpochToSeconds(b.file?.epoch_created) - normalizeEpochToSeconds(a.file?.epoch_created);
    if (createdCmp !== 0) return createdCmp;

    const modifiedCmp = normalizeEpochToSeconds(b.file?.epoch_modified) - normalizeEpochToSeconds(a.file?.epoch_modified);
    if (modifiedCmp !== 0) return modifiedCmp;

    const qualityCmp = getTrackQualityScore(b) - getTrackQualityScore(a);
    if (qualityCmp !== 0) return qualityCmp;

    const sizeCmp = (b.file?.size_bytes || 0) - (a.file?.size_bytes || 0);
    if (sizeCmp !== 0) return sizeCmp;

    return (a.logic?.version_name || '').localeCompare(b.logic?.version_name || '');
};

export const rankTrackVersions = (versions: TrackItem[]): TrackItem[] => {
    return [...versions].sort(compareTrackVersions);
};
