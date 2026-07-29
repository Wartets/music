const positiveModulo = (value: number, mod: number): number => {
    return ((value % mod) + mod) % mod;
};

const hashString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

export const seedFromText = (value: string): number => {
    return hashString((value || 'unknown').trim().toLowerCase());
};

export const seedFromYear = (yearLabel: string): number => {
    const yearMatch = yearLabel.match(/\d{3,4}/);
    if (yearMatch) {
        return parseInt(yearMatch[0], 10);
    }
    return seedFromText(yearLabel);
};

export const seedFromArtistName = (artistName: string): number => {
    const normalized = (artistName || 'unknown artist').trim().toLowerCase();
    const nameSeed = hashString(normalized);
    const numericSeed = (normalized.match(/\d/g) || []).reduce((acc, digit) => (acc * 31) + parseInt(digit, 10), 0);
    return nameSeed + (numericSeed * 97);
};

export const getMutedVisualStyle = (seed: number) => {
    const hue = positiveModulo(seed * 37, 360);
    const saturation = 26 + positiveModulo(seed * 11, 14);
    const startLightness = 37 + positiveModulo(seed * 7, 8);
    const endLightness = 22 + positiveModulo(seed * 5, 8);

    return {
        background: `linear-gradient(145deg, hsla(${hue}, ${saturation}%, ${startLightness}%, 0.88) 0%, hsla(${positiveModulo(hue + 28, 360)}, ${Math.max(20, saturation - 8)}%, ${endLightness}%, 0.92) 100%)`,
        borderColor: `hsla(${hue}, ${Math.min(52, saturation + 10)}%, ${Math.min(70, startLightness + 20)}%, 0.35)`,
        accentColor: `hsl(${hue}, ${Math.min(56, saturation + 12)}%, ${Math.min(78, startLightness + 30)}%)`,
        mutedTextColor: `hsl(${positiveModulo(hue + 10, 360)}, ${Math.max(20, saturation - 8)}%, 91%)`
    };
};

export const getInitials = (value: string, maxLetters?: number): string => {
    const stopWords = new Set(['and', '&', 'feat', 'ft', 'featuring', 'the', 'x', 'vs']);
    const tokens = ((value || '').match(/[\p{L}\p{N}]+/gu) || [])
        .map(token => token.trim())
        .filter((token, index) => {
            if (!token) return false;
            if (index === 0) return true;
            return !stopWords.has(token.toLowerCase());
        });

    if (tokens.length === 0) {
        return '?';
    }

    const selectedTokens = typeof maxLetters === 'number' && maxLetters > 0
        ? tokens.slice(0, maxLetters)
        : tokens;

    const initials = selectedTokens.map(token => Array.from(token)[0] || '').join('');
    return initials.toUpperCase();
};
