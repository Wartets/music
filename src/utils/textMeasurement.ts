let measureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = (): CanvasRenderingContext2D | null => {
    if (measureContext !== undefined) return measureContext;
    if (typeof document === 'undefined') {
        measureContext = null;
        return measureContext;
    }
    const canvas = document.createElement('canvas');
    measureContext = canvas.getContext('2d');
    return measureContext;
};

const fallbackWidth = (text: string): number => text.length * 6.5;

export const measureTextWidth = (text: string, font: string): number => {
    const ctx = getMeasureContext();
    if (!ctx || !text) return fallbackWidth(text);
    ctx.font = font;
    return ctx.measureText(text).width;
};
