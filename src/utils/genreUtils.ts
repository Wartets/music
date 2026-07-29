export function parseGenres(genre: string | null | undefined): string[] {
    if (!genre) return [];
    return genre.split(' / ').map(g => g.trim()).filter(g => g.length > 0);
}
