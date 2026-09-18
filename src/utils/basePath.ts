const PRODUCTION_HOSTNAME = 'wartets.github.io';
const PRODUCTION_BASE_PATH = '/music';

export const getDeploymentBasePath = (): string => {
    if (typeof window !== 'undefined' && window.location.hostname === PRODUCTION_HOSTNAME) {
        return PRODUCTION_BASE_PATH;
    }

    const envBase = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    return envBase;
};
