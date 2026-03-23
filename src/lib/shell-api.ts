import type {
    AppMetaResponse,
    DashboardStatsResponse,
    TranslationFileResponse,
    TranslationTreeResponse,
} from '@/lib/shell-types';

const readJson = async <T>(response: Response): Promise<T> => {
    const data = (await response.json()) as { error?: string } & T;

    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }

    return data;
};

export const fetchTranslationTree = async (): Promise<TranslationTreeResponse> => {
    const response = await fetch('/api/translations/files', { cache: 'no-store' });
    return readJson<TranslationTreeResponse>(response);
};

export const fetchTranslationFile = async (relativePath: string): Promise<TranslationFileResponse> => {
    const query = new URLSearchParams({ path: relativePath });
    const response = await fetch(`/api/translations/file?${query.toString()}`, { cache: 'no-store' });
    return readJson<TranslationFileResponse>(response);
};

export const fetchDashboardStats = async (): Promise<DashboardStatsResponse> => {
    const response = await fetch('/api/dashboard/stats', { cache: 'no-store' });
    return readJson<DashboardStatsResponse>(response);
};

export const fetchAppMeta = async (): Promise<AppMetaResponse> => {
    const response = await fetch('/api/meta', { cache: 'no-store' });
    return readJson<AppMetaResponse>(response);
};
