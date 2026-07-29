export enum RepeatMode {
    None = 'none',
    All = 'all',
    One = 'one'
}

export const getNextRepeatMode = (mode: RepeatMode): RepeatMode => {
    switch (mode) {
        case RepeatMode.None:
            return RepeatMode.All;
        case RepeatMode.All:
            return RepeatMode.One;
        default:
            return RepeatMode.None;
    }
};

export const getRepeatModeLabel = (mode: RepeatMode): string => {
    switch (mode) {
        case RepeatMode.One:
            return 'Repeat One';
        case RepeatMode.All:
            return 'Repeat All';
        default:
            return 'Repeat Off';
    }
};
