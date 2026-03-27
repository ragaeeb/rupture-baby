import '@tanstack/react-start/server-only';

import { getPromptOptions, getSelectedPrompt, setSelectedPromptById } from '@/lib/prompt-state';
import type {
    BrowseShellData,
    DashboardStatsResponse,
    DeleteTranslationResponse,
    InvalidExcerptsResponse,
    PromptStateResponse,
    PromptsPageData,
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
} from '@/lib/translations-browser';
import { getAppMeta } from './app-meta';
import { getErrorMessage } from './error-utils';

export const getDashboardStatsResponse = async (): Promise<DashboardStatsResponse> => {
    const [dashboardPayload, translationStats] = await Promise.all([getDashboardStats(), getTranslationStats()]);
    return { ...dashboardPayload, translationStats };
};

export const getPromptStateResponse = async (): Promise<PromptStateResponse> => {
    const [selected, options] = await Promise.all([getSelectedPrompt(), getPromptOptions()]);

    return { options, selectedPromptContent: selected.content, selectedPromptId: selected.id };
};

export const setPromptStateResponse = async (promptId: string) => {
    const selected = await setSelectedPromptById(promptId);

    if (!selected) {
        const options = await getPromptOptions();
        throw new Error(
            `Invalid promptId "${promptId}". Valid promptIds: ${options.map((prompt) => prompt.id).join(', ')}`,
        );
    }

    return { selectedPromptId: selected.id };
};

export const getBrowseShellData = async (): Promise<BrowseShellData> => {
    const [metaResult, treeResult, statsResult] = await Promise.allSettled([
        getAppMeta(),
        getTranslationTree(),
        getDashboardStatsResponse(),
    ]);

    return {
        meta: metaResult.status === 'fulfilled' ? metaResult.value : null,
        stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
        statsError:
            statsResult.status === 'rejected'
                ? getErrorMessage(statsResult.reason, 'Failed to load dashboard stats.')
                : null,
        tree: treeResult.status === 'fulfilled' ? treeResult.value : null,
        treeError:
            treeResult.status === 'rejected'
                ? getErrorMessage(treeResult.reason, 'Failed to load translation files.')
                : null,
    };
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

export const requestTranslationAssistResponse = async (
    request: TranslationAssistRequest,
): Promise<TranslationAssistResponse> => requestTranslationAssistance(request);

export const getInvalidExcerptsResponse = async (): Promise<InvalidExcerptsResponse> => getInvalidExcerpts();

export const deleteTranslationFileResponse = async (relativePath: string): Promise<DeleteTranslationResponse> => {
    await deleteTranslationJsonFile(relativePath);
    return { deletedPath: relativePath, success: true };
};
