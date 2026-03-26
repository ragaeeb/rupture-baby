import type {
    AppMetaResponse,
    ArabicLeakCorrectionExcerpt,
    DashboardStatsResponse,
    TranslationAssistRequest,
    TranslationAssistResponse,
    TranslationFileResponse,
    TranslationStats,
    TranslationTreeResponse,
} from '@/lib/shell-types';
import type { RupturePatch, RupturePatchMetadata } from '@/lib/translation-patches';

let cachedTranslationTree: TranslationTreeResponse | null = null;
let cachedDashboardStats: DashboardStatsResponse | null = null;

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

export const getCachedTranslationTree = () => cachedTranslationTree;

export const fetchTranslationTree = async (options?: { force?: boolean }): Promise<TranslationTreeResponse> => {
    if (!options?.force && cachedTranslationTree) {
        return cachedTranslationTree;
    }

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/translations/files`, { cache: 'no-store' });
    const tree = await readJson<TranslationTreeResponse>(response);
    cachedTranslationTree = tree;
    return tree;
};

export const fetchTranslationFile = async (relativePath: string): Promise<TranslationFileResponse> => {
    const baseUrl = getBaseUrl();
    const query = new URLSearchParams({ path: relativePath });
    const response = await fetch(`${baseUrl}/api/translations/file?${query.toString()}`, { cache: 'no-store' });
    return readJson<TranslationFileResponse>(response);
};

export const updateTranslationFilePatch = async (
    relativePath: string,
    excerptId: string,
    patch: RupturePatch | null,
    patchMetadata?: RupturePatchMetadata,
): Promise<TranslationFileResponse> => {
    const baseUrl = getBaseUrl();
    const query = new URLSearchParams({ path: relativePath });
    const response = await fetch(`${baseUrl}/api/translations/file?${query.toString()}`, {
        body: JSON.stringify({ excerptId, patch, patchMetadata }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
    });
    return readJson<TranslationFileResponse>(response);
};

export const requestTranslationAssist = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/translations/assist`, {
        body: JSON.stringify(request),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });
    return readJson<TranslationAssistResponse>(response);
};

export const requestArabicLeakCorrections = async (
    excerpts: ArabicLeakCorrectionExcerpt[],
): Promise<TranslationAssistResponse> => {
    return requestTranslationAssist({ excerpts, scope: 'file', task: 'arabic_leak_correction' });
};

export const getCachedDashboardStats = () => cachedDashboardStats;

export const fetchDashboardStats = async (options?: { force?: boolean }): Promise<DashboardStatsResponse> => {
    if (!options?.force && cachedDashboardStats) {
        return cachedDashboardStats;
    }

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/dashboard/stats`, { cache: 'no-store' });
    const stats = await readJson<DashboardStatsResponse>(response);
    cachedDashboardStats = stats;
    return stats;
};

export const fetchTranslationStats = async (): Promise<TranslationStats> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/dashboard/stats`, { cache: 'no-store' });
    const data = await readJson<DashboardStatsResponse & { translationStats?: TranslationStats }>(response);
    return (
        data.translationStats || {
            files: [],
            invalidByModel: {},
            invalidFiles: 0,
            modelBreakdown: {},
            totalFiles: 0,
            validFiles: 0,
        }
    );
};

export const fetchAppMeta = async (): Promise<AppMetaResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/meta`, { cache: 'no-store' });
    return readJson<AppMetaResponse>(response);
};

export type PromptStateResponse = {
    options: Array<{ content: string; id: string; name: string }>;
    selectedPromptContent: string;
    selectedPromptId: string;
};

export const fetchPromptState = async (): Promise<PromptStateResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/compilation/prompt`, { cache: 'no-store' });
    return readJson<PromptStateResponse>(response);
};

export const setPrompt = async (promptId: string): Promise<{ selectedPromptId: string }> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/compilation/prompt`, {
        body: JSON.stringify({ promptId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });
    return readJson<{ selectedPromptId: string }>(response);
};
