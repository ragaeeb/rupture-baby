import { createServerFn } from '@tanstack/react-start';

import { isAssistProviderId } from '@/lib/assist-provider-ids';
import type {
    AnalyticsPageData,
    CompilationPlaybackSimulationResponse,
    DashboardPageData,
    DeleteTranslationsResponse,
    PackCompilationResponse,
    SaveCompilationPlaybackResponse,
    TranslationAssistRequest,
    TranslationFileResponse,
} from '@/lib/shell-types';
import { isRupturePatch, isRupturePatchMetadata } from '@/lib/translation-patches';

const getNonEmptyString = (value: unknown, fieldName: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Field "${fieldName}" is required.`);
    }

    return value.trim();
};

const validateTranslationFileInput = (value: unknown) => ({
    relativePath: getNonEmptyString((value as { relativePath?: unknown })?.relativePath, 'relativePath'),
});

const validateTranslationFilesInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const relativePaths = (value as { relativePaths?: unknown }).relativePaths;
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
        throw new Error('Field "relativePaths" must be a non-empty array.');
    }

    return {
        relativePaths: relativePaths.map((relativePath, index) =>
            getNonEmptyString(relativePath, `relativePaths[${index}]`),
        ),
    };
};

const validatePromptInput = (value: unknown) => ({
    content:
        typeof (value as { content?: unknown })?.content === 'string'
            ? (value as { content: string }).content
            : (() => {
                  throw new Error('Field "content" is required.');
              })(),
    promptId: getNonEmptyString((value as { promptId?: unknown })?.promptId, 'promptId'),
});

const validatePatchInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const candidate = value as {
        excerptId?: unknown;
        patch?: unknown;
        patchMetadata?: unknown;
        relativePath?: unknown;
    };

    if (candidate.patch !== null && !isRupturePatch(candidate.patch)) {
        throw new Error('Field "patch" must be a patch object or null.');
    }

    if (typeof candidate.patchMetadata !== 'undefined' && !isRupturePatchMetadata(candidate.patchMetadata)) {
        throw new Error('Field "patchMetadata" must be a valid patch metadata object.');
    }

    return {
        excerptId: getNonEmptyString(candidate.excerptId, 'excerptId'),
        patch: candidate.patch,
        patchMetadata: candidate.patchMetadata,
        relativePath: getNonEmptyString(candidate.relativePath, 'relativePath'),
    };
};

const validateSkipInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const candidate = value as { excerptId?: unknown; relativePath?: unknown; skipped?: unknown };

    return {
        excerptId: getNonEmptyString(candidate.excerptId, 'excerptId'),
        relativePath: getNonEmptyString(candidate.relativePath, 'relativePath'),
        skipped:
            typeof candidate.skipped === 'boolean'
                ? candidate.skipped
                : (() => {
                      throw new Error('Field "skipped" must be a boolean.');
                  })(),
    };
};

const isValidAssistRequest = (value: unknown): value is TranslationAssistRequest => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<TranslationAssistRequest>;

    return (
        (typeof candidate.providerId === 'undefined' || isAssistProviderId(candidate.providerId)) &&
        (candidate.scope === 'file' || candidate.scope === 'batch') &&
        (candidate.task === 'arabic_leak_correction' || candidate.task === 'all_caps_correction') &&
        Array.isArray(candidate.excerpts) &&
        candidate.excerpts.length > 0 &&
        candidate.excerpts.every(
            (excerpt) =>
                typeof excerpt === 'object' &&
                excerpt !== null &&
                typeof excerpt.id === 'string' &&
                excerpt.id.trim().length > 0 &&
                typeof excerpt.filePath === 'string' &&
                excerpt.filePath.trim().length > 0 &&
                typeof excerpt.arabic === 'string' &&
                excerpt.arabic.trim().length > 0 &&
                typeof excerpt.translation === 'string',
        )
    );
};

const validateAssistInput = (value: unknown) => {
    if (!isValidAssistRequest(value)) {
        throw new Error(
            'Invalid translation assist request. Expected { providerId?: "hf" | "gemini" | "cloudflare" | "nvidia-glm47" | "nvidia-kimi-k2-thinking", scope: "file" | "batch", task: "arabic_leak_correction" | "all_caps_correction", excerpts: [{ filePath, id, arabic, translation }] }.',
        );
    }

    return value;
};

export const fetchBrowseShellData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getBrowseShellData } = await import('@/lib/app-services');
    return getBrowseShellData();
});

export const fetchDashboardStatsData = createServerFn({ method: 'GET' }).handler(
    async (): Promise<DashboardPageData> => {
        const { getDashboardPageData } = await import('@/lib/app-services');
        return getDashboardPageData();
    },
);

export const fetchAnalyticsPageData = createServerFn({ method: 'GET' }).handler(
    async (): Promise<AnalyticsPageData> => {
        const { getAnalyticsPageData } = await import('@/lib/app-services');
        return getAnalyticsPageData();
    },
);

export const fetchPromptsPageData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getPromptsPageData } = await import('@/lib/app-services');
    return getPromptsPageData();
});

export const fetchSettingsPageData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getSettingsPageData } = await import('@/lib/app-services');
    return getSettingsPageData();
});

export const fetchInvalidExcerptsData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getInvalidExcerptsResponse } = await import('@/lib/app-services');
    return getInvalidExcerptsResponse();
});

export const fetchCompilationPlaybackSimulationData = createServerFn({ method: 'GET' }).handler(
    async (): Promise<CompilationPlaybackSimulationResponse> => {
        const { getCompilationPlaybackSimulationResponse } = await import('@/lib/app-services');
        return getCompilationPlaybackSimulationResponse();
    },
);

export const saveCompilationPlaybackData = createServerFn({ method: 'POST' }).handler(
    async (): Promise<SaveCompilationPlaybackResponse> => {
        const { saveCompilationPlaybackResponse } = await import('@/lib/app-services');
        return saveCompilationPlaybackResponse();
    },
);

export const packCompilationFileData = createServerFn({ method: 'POST' }).handler(
    async (): Promise<PackCompilationResponse> => {
        const { packCompilationFileResponse } = await import('@/lib/app-services');
        return packCompilationFileResponse();
    },
);

export const savePromptSelection = createServerFn({ method: 'POST' })
    .inputValidator(validatePromptInput)
    .handler(async ({ data }) => {
        const { setPromptStateResponse } = await import('@/lib/app-services');
        return setPromptStateResponse(data.promptId, data.content);
    });

export const fetchTranslationFileData = createServerFn({ method: 'GET' })
    .inputValidator(validateTranslationFileInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { readTranslationJsonFile } = await import('@/lib/translations-browser');
        return readTranslationJsonFile(data.relativePath);
    });

export const commitTranslationPatch = createServerFn({ method: 'POST' })
    .inputValidator(validatePatchInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { writeTranslationPatch } = await import('@/lib/translations-browser');
        return writeTranslationPatch(data.relativePath, data.excerptId, data.patch, data.patchMetadata);
    });

export const setTranslationSkip = createServerFn({ method: 'POST' })
    .inputValidator(validateSkipInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { setTranslationSkipResponse } = await import('@/lib/app-services');
        return setTranslationSkipResponse(data.relativePath, data.excerptId, data.skipped);
    });

export const deleteTranslationFile = createServerFn({ method: 'POST' })
    .inputValidator(validateTranslationFileInput)
    .handler(async ({ data }) => {
        const { deleteTranslationFileResponse } = await import('@/lib/app-services');
        return deleteTranslationFileResponse(data.relativePath);
    });

export const deleteTranslationFiles = createServerFn({ method: 'POST' })
    .inputValidator(validateTranslationFilesInput)
    .handler(async ({ data }): Promise<DeleteTranslationsResponse> => {
        const { deleteTranslationFilesResponse } = await import('@/lib/app-services');
        return deleteTranslationFilesResponse(data.relativePaths);
    });

export const requestArabicLeakCorrections = createServerFn({ method: 'POST' })
    .inputValidator(validateAssistInput)
    .handler(async ({ data }) => {
        const { requestTranslationAssistResponse } = await import('@/lib/app-services');
        return requestTranslationAssistResponse(data);
    });
