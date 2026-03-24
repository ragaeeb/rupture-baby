import type {
    AppMetaResponse,
    DashboardStatsResponse,
    TranslationFileResponse,
    TranslationTreeResponse,
} from '@/lib/shell-types';

const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
        return '';
    }
    const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
    if (vercelUrl) {
        return `https://${vercelUrl}`;
    }
    return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9000';
};

const readJson = async <T>(response: Response): Promise<T> => {
    const data = (await response.json()) as { error?: string } & T;

    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }

    return data;
};

export const fetchTranslationTree = async (): Promise<TranslationTreeResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/translations/files`, { cache: 'no-store' });
    return readJson<TranslationTreeResponse>(response);
};

export const fetchTranslationFile = async (relativePath: string): Promise<TranslationFileResponse> => {
    const baseUrl = getBaseUrl();
    const query = new URLSearchParams({ path: relativePath });
    const response = await fetch(`${baseUrl}/api/translations/file?${query.toString()}`, { cache: 'no-store' });
    return readJson<TranslationFileResponse>(response);
};

export const fetchDashboardStats = async (): Promise<DashboardStatsResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/dashboard/stats`, { cache: 'no-store' });
    return readJson<DashboardStatsResponse>(response);
};

export const fetchAppMeta = async (): Promise<AppMetaResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/meta`, { cache: 'no-store' });
    return readJson<AppMetaResponse>(response);
};
