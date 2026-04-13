import '@tanstack/react-start/server-only';

import { getAppSettings } from '@/lib/app-settings';
import { getCompilationAnalytics } from '@/lib/compilation-analytics';
import { getCompilationPlaybackSimulation, saveCompilationPlayback } from '@/lib/compilation-playback';
import { getCompilationStats } from '@/lib/compilation-stats';
import { withPerfSpan } from '@/lib/perf-log';
import { getPromptOptions, getSelectedPrompt, setSelectedPrompt } from '@/lib/prompt-state';
import type {
    AnalyticsPageData,
    BrowseShellData,
    CompilationPlaybackSimulationResponse,
    DashboardPageData,
    DashboardStatsResponse,
    DeleteTranslationResponse,
    DeleteTranslationsResponse,
    InvalidExcerptsResponse,
    PackCompilationResponse,
    PromptStateResponse,
    PromptsPageData,
    SaveCompilationPlaybackResponse,
    SettingsPageData,
    TranslationAssistRequest,
    TranslationAssistResponse,
} from '@/lib/shell-types';
import { requestTranslationAssistance } from '@/lib/translation-assistance';
import {
    deleteTranslationJsonFile,
    getDashboardStats,
    getInvalidExcerpts,
    getTranslationStats,
    getTranslationTree,
    writeTranslationSkip,
} from '@/lib/translations-browser';
import { getAppMeta } from './app-meta';
import { getErrorMessage } from './error-utils';

export const getDashboardStatsResponse = async (): Promise<DashboardStatsResponse> => {
    return withPerfSpan('app-services', 'get_dashboard_stats_response', async () => {
        const [dashboardPayload, translationStats, compilationStats] = await Promise.all([
            getDashboardStats(),
            getTranslationStats(),
            getCompilationStats().catch(() => null),
        ]);
        return { ...dashboardPayload, compilationStats, translationStats };
    });
};

export const getTranslationStatsResponse = async () => getTranslationStats();

export const getDashboardPageData = async (): Promise<DashboardPageData> => {
    return withPerfSpan('app-services', 'get_dashboard_page_data', async () => {
        try {
            return { stats: await getDashboardStatsResponse(), statsError: null };
        } catch (error) {
            return { stats: null, statsError: getErrorMessage(error, 'Failed to load dashboard stats.') };
        }
    });
};

export const getPromptStateResponse = async (): Promise<PromptStateResponse> => {
    const [selected, options] = await Promise.all([getSelectedPrompt(), getPromptOptions()]);

    return { options, selectedPromptContent: selected.content, selectedPromptId: selected.id };
};

export const setPromptStateResponse = async (promptId: string, content: string) => {
    const selected = await setSelectedPrompt({ content, promptId });

    if (!selected) {
        const options = await getPromptOptions();
        throw new Error(
            `Invalid promptId "${promptId}". Valid promptIds: ${options.map((prompt) => prompt.id).join(', ')}`,
        );
    }

    return { selectedPromptId: selected.id };
};

export const getBrowseShellData = async (): Promise<BrowseShellData> => {
    return withPerfSpan('app-services', 'get_browse_shell_data', async () => {
        const [metaResult, treeResult, translationStatsResult] = await Promise.allSettled([
            getAppMeta(),
            getTranslationTree(),
            getTranslationStatsResponse(),
        ]);

        return {
            meta: metaResult.status === 'fulfilled' ? metaResult.value : null,
            translationStats: translationStatsResult.status === 'fulfilled' ? translationStatsResult.value : null,
            translationStatsError:
                translationStatsResult.status === 'rejected'
                    ? getErrorMessage(translationStatsResult.reason, 'Failed to load translation stats.')
                    : null,
            tree: treeResult.status === 'fulfilled' ? treeResult.value : null,
            treeError:
                treeResult.status === 'rejected'
                    ? getErrorMessage(treeResult.reason, 'Failed to load translation files.')
                    : null,
        };
    });
};

export const getPromptsPageData = async (): Promise<PromptsPageData> => {
    const [metaResult, promptStateResult] = await Promise.allSettled([getAppMeta(), getPromptStateResponse()]);

    return {
        error:
            promptStateResult.status === 'rejected'
                ? getErrorMessage(promptStateResult.reason, 'Failed to load prompts.')
                : null,
        meta: metaResult.status === 'fulfilled' ? metaResult.value : null,
        promptState: promptStateResult.status === 'fulfilled' ? promptStateResult.value : null,
    };
};

export const getSettingsPageData = async (): Promise<SettingsPageData> => {
    const [metaResult, settingsResult] = await Promise.allSettled([getAppMeta(), getAppSettings()]);

    return {
        error:
            settingsResult.status === 'rejected'
                ? getErrorMessage(settingsResult.reason, 'Failed to load settings.')
                : null,
        meta: metaResult.status === 'fulfilled' ? metaResult.value : null,
        settings: settingsResult.status === 'fulfilled' ? settingsResult.value : null,
    };
};

export const requestTranslationAssistResponse = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => requestTranslationAssistance(request);

export const getInvalidExcerptsResponse = async (): Promise<InvalidExcerptsResponse> => getInvalidExcerpts();

export const getCompilationPlaybackSimulationResponse = async (): Promise<CompilationPlaybackSimulationResponse> =>
    getCompilationPlaybackSimulation();

export const saveCompilationPlaybackResponse = async (): Promise<SaveCompilationPlaybackResponse> =>
    saveCompilationPlayback();

export const packCompilationFileResponse = async (): Promise<PackCompilationResponse> => {
    const compilationStats = await getCompilationStats();
    if (compilationStats.untranslatedSegments > 0) {
        throw new Error('Compilation still has untranslated segments and cannot be packed yet.');
    }

    const { packCompilationFile } = await import('./compilation-pack');
    return packCompilationFile();
};

export const getAnalyticsPageData = async (): Promise<AnalyticsPageData> => {
    return withPerfSpan('app-services', 'get_analytics_page_data', async () => {
        try {
            return { analytics: await getCompilationAnalytics(), error: null };
        } catch (error) {
            return { analytics: null, error: getErrorMessage(error, 'Failed to load analytics.') };
        }
    });
};

export const deleteTranslationFileResponse = async (relativePath: string): Promise<DeleteTranslationResponse> => {
    await deleteTranslationJsonFile(relativePath);
    return { deletedPath: relativePath, success: true };
};

export const deleteTranslationFilesResponse = async (relativePaths: string[]): Promise<DeleteTranslationsResponse> => {
    for (const relativePath of relativePaths) {
        await deleteTranslationJsonFile(relativePath);
    }

    return { deletedPaths: relativePaths, success: true };
};

export const setTranslationSkipResponse = async (relativePath: string, excerptId: string, skipped: boolean) =>
    writeTranslationSkip(relativePath, excerptId, skipped);
