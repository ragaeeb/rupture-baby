import '@tanstack/react-start/server-only';

import { getAppSettings } from '@/lib/app-settings';
import { getCompilationAnalytics } from '@/lib/compilation-analytics';
import { getCompilationBrowsePage } from '@/lib/compilation-browser';
import { getCompilationExportPageData as getCompilationExportPageDataResponse } from '@/lib/compilation-export';
import { getCompilationPlaybackSimulation, saveCompilationPlayback } from '@/lib/compilation-playback';
import { getCompilationSelectionState, saveActiveCompilationSelection } from '@/lib/compilation-selection';
import { getCompilationStats } from '@/lib/compilation-stats';
import { withPerfSpan } from '@/lib/perf-log';
import { getPromptOptions, getSelectedPrompt, setSelectedPrompt, setSelectedPromptById } from '@/lib/prompt-state';
import type {
    AnalyticsPageData,
    BrowseShellData,
    CompilationBrowsePageData,
    CompilationExportPageData,
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
    ShiftSettingsPageData,
    TranslationAssistRequest,
    TranslationAssistResponse,
} from '@/lib/shell-types';
import { getShiftSettingsInfo, setShiftCheckpointPosition } from '@/lib/shift-cache';
import { requestTranslationAssistance } from '@/lib/translation-assistance';
import {
    deleteTranslationJsonFile,
    getDashboardStats,
    getInvalidExcerpts,
    getTranslationStats,
    getTranslationTree,
    type TranslationPatchOperation,
    type TranslationSkipOperation,
    writeTranslationPatches,
    writeTranslationSkip,
    writeTranslationSkips,
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

export const setPromptStateResponse = async (promptId: string, content: string | null) => {
    const selected =
        content !== null ? await setSelectedPrompt({ content, promptId }) : await setSelectedPromptById(promptId);

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
    const [compilationSelectionResult, metaResult, settingsResult] = await Promise.allSettled([
        getCompilationSelectionState(),
        getAppMeta(),
        getAppSettings(),
    ]);

    return {
        compilationSelection:
            compilationSelectionResult.status === 'fulfilled' ? compilationSelectionResult.value : null,
        error:
            settingsResult.status === 'rejected'
                ? getErrorMessage(settingsResult.reason, 'Failed to load settings.')
                : compilationSelectionResult.status === 'rejected'
                  ? getErrorMessage(compilationSelectionResult.reason, 'Failed to load compilation settings.')
                  : null,
        meta: metaResult.status === 'fulfilled' ? metaResult.value : null,
        settings: settingsResult.status === 'fulfilled' ? settingsResult.value : null,
    };
};

export const setActiveCompilationSelectionResponse = async (fileName: string) =>
    saveActiveCompilationSelection(fileName);

export const requestTranslationAssistResponse = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => requestTranslationAssistance(request);

export const getInvalidExcerptsResponse = async (): Promise<InvalidExcerptsResponse> => getInvalidExcerpts();

export const getCompilationPlaybackSimulationResponse = async (): Promise<CompilationPlaybackSimulationResponse> =>
    getCompilationPlaybackSimulation();

export const saveCompilationPlaybackResponse = async (): Promise<SaveCompilationPlaybackResponse> =>
    saveCompilationPlayback();

export const packCompilationFileResponse = async (): Promise<PackCompilationResponse> => {
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

export const getCompilationBrowsePageData = async ({
    collection,
    page,
    pageSize,
}: {
    collection: Parameters<typeof getCompilationBrowsePage>[0]['collection'];
    page: number;
    pageSize: number;
}): Promise<CompilationBrowsePageData> => {
    return withPerfSpan('app-services', 'get_compilation_browse_page_data', async () => {
        try {
            return { browse: await getCompilationBrowsePage({ collection, page, pageSize }), error: null };
        } catch (error) {
            return { browse: null, error: getErrorMessage(error, 'Failed to load compilation rows.') };
        }
    });
};

export const getCompilationExportPageData = async ({
    contextWindowTokens,
    provider,
    reservedTokens,
}: {
    contextWindowTokens: number;
    provider: import('@/lib/compilation-export-shared').CompilationExportProviderId;
    reservedTokens: number;
}): Promise<CompilationExportPageData> => {
    return withPerfSpan('app-services', 'get_compilation_export_page_data', async () => {
        return getCompilationExportPageDataResponse({ contextWindowTokens, provider, reservedTokens });
    });
};

export const getShiftSettingsPageData = async (): Promise<ShiftSettingsPageData> => {
    return withPerfSpan('app-services', 'get_shift_settings_page_data', async () => {
        try {
            return { error: null, settings: await getShiftSettingsInfo() };
        } catch (error) {
            return { error: getErrorMessage(error, 'Failed to load shift settings.'), settings: null };
        }
    });
};

export const deleteTranslationFileResponse = async (relativePath: string): Promise<DeleteTranslationResponse> => {
    await deleteTranslationJsonFile(relativePath);
    return { deletedPath: relativePath, success: true };
};

export const deleteTranslationFilesResponse = async (relativePaths: string[]): Promise<DeleteTranslationsResponse> => {
    await Promise.all(relativePaths.map((relativePath) => deleteTranslationJsonFile(relativePath)));

    return { deletedPaths: relativePaths, success: true };
};

export const setTranslationSkipResponse = async (relativePath: string, excerptId: string, skipped: boolean) =>
    writeTranslationSkip(relativePath, excerptId, skipped);

export const setTranslationSkipsResponse = async (relativePath: string, operations: TranslationSkipOperation[]) =>
    writeTranslationSkips(relativePath, operations);

export const writeTranslationPatchesResponse = async (relativePath: string, operations: TranslationPatchOperation[]) =>
    writeTranslationPatches(relativePath, operations);

export const setShiftCheckpointPositionResponse = async (shiftedCount: number) =>
    setShiftCheckpointPosition(shiftedCount);
