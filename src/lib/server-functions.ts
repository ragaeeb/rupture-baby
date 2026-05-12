import { createServerFn } from '@tanstack/react-start';

import { isAssistProviderId } from '@/lib/assist-provider-ids';
import {
    DEFAULT_COMPILATION_BROWSE_COLLECTION,
    DEFAULT_COMPILATION_BROWSE_PAGE,
    DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
    isCompilationCollectionKey,
    MAX_COMPILATION_BROWSE_PAGE_SIZE,
} from '@/lib/compilation-browser-shared';
import {
    DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_COMPILATION_EXPORT_PROVIDER,
    DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
    isCompilationExportProviderId,
    MAX_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    MAX_COMPILATION_EXPORT_RESERVED_TOKENS,
} from '@/lib/compilation-export-shared';
import type {
    AnalyticsPageData,
    CompilationBrowsePageData,
    CompilationExportPageData,
    CompilationPlaybackSimulationResponse,
    CompilationSelectionState,
    DashboardPageData,
    DeleteTranslationsResponse,
    PackCompilationResponse,
    SaveCompilationPlaybackResponse,
    ShiftSettingsPageData,
    ShiftSettingsResponse,
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

const assertUniqueBatchExcerptIds = (operations: Array<{ excerptId: string }>, operationKind: 'patch' | 'skip') => {
    const seenExcerptIds = new Set<string>();

    for (const operation of operations) {
        if (seenExcerptIds.has(operation.excerptId)) {
            throw new Error(
                `Duplicate excerptId "${operation.excerptId}" is not allowed in a batch ${operationKind} request.`,
            );
        }

        seenExcerptIds.add(operation.excerptId);
    }
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

const validateActiveCompilationInput = (value: unknown) => ({
    fileName: getNonEmptyString((value as { fileName?: unknown })?.fileName, 'fileName'),
});

const validateCompilationBrowseInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const candidate = value as { collection?: unknown; page?: unknown; pageSize?: unknown };
    const parsedPage =
        typeof candidate.page === 'number' && Number.isFinite(candidate.page)
            ? Math.floor(candidate.page)
            : DEFAULT_COMPILATION_BROWSE_PAGE;
    const parsedPageSize =
        typeof candidate.pageSize === 'number' && Number.isFinite(candidate.pageSize)
            ? Math.floor(candidate.pageSize)
            : DEFAULT_COMPILATION_BROWSE_PAGE_SIZE;

    return {
        collection: isCompilationCollectionKey(candidate.collection)
            ? candidate.collection
            : DEFAULT_COMPILATION_BROWSE_COLLECTION,
        page: Math.max(1, parsedPage),
        pageSize: Math.min(MAX_COMPILATION_BROWSE_PAGE_SIZE, Math.max(1, parsedPageSize)),
    };
};

const validateCompilationExportInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const candidate = value as { contextWindowTokens?: unknown; provider?: unknown; reservedTokens?: unknown };
    const parsedContextWindowTokens =
        typeof candidate.contextWindowTokens === 'number' && Number.isFinite(candidate.contextWindowTokens)
            ? Math.floor(candidate.contextWindowTokens)
            : DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS;
    const parsedReservedTokens =
        typeof candidate.reservedTokens === 'number' && Number.isFinite(candidate.reservedTokens)
            ? Math.floor(candidate.reservedTokens)
            : DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS;
    const provider = isCompilationExportProviderId(candidate.provider)
        ? candidate.provider
        : DEFAULT_COMPILATION_EXPORT_PROVIDER;
    const contextWindowTokens = Math.min(
        MAX_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
        Math.max(1, parsedContextWindowTokens),
    );
    const reservedTokens = Math.min(MAX_COMPILATION_EXPORT_RESERVED_TOKENS, Math.max(0, parsedReservedTokens));

    if (reservedTokens >= contextWindowTokens) {
        throw new Error('Reserved tokens must be smaller than the context window token budget.');
    }

    return { contextWindowTokens, provider, reservedTokens };
};

const validateShiftSettingsInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const shiftedCount = (value as { shiftedCount?: unknown }).shiftedCount;
    if (typeof shiftedCount !== 'number' || !Number.isFinite(shiftedCount)) {
        throw new Error('Field "shiftedCount" must be a finite number.');
    }

    return { shiftedCount: Math.max(0, Math.floor(shiftedCount)) };
};

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

const validatePatchBatchInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const relativePath = getNonEmptyString((value as { relativePath?: unknown }).relativePath, 'relativePath');
    const operations = (value as { operations?: unknown }).operations;

    if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error('Field "operations" must be a non-empty array.');
    }

    const normalizedOperations = operations.map((operation, index) => {
        if (typeof operation !== 'object' || operation === null) {
            throw new Error(`operations[${index}] must be an object.`);
        }

        const candidate = operation as { excerptId?: unknown; patch?: unknown; patchMetadata?: unknown };
        if (candidate.patch !== null && !isRupturePatch(candidate.patch)) {
            throw new Error(`operations[${index}].patch must be a patch object or null.`);
        }

        if (typeof candidate.patchMetadata !== 'undefined' && !isRupturePatchMetadata(candidate.patchMetadata)) {
            throw new Error(`operations[${index}].patchMetadata must be a valid patch metadata object.`);
        }

        return {
            excerptId: getNonEmptyString(candidate.excerptId, `operations[${index}].excerptId`),
            patch: candidate.patch,
            patchMetadata: candidate.patchMetadata,
        };
    });
    assertUniqueBatchExcerptIds(normalizedOperations, 'patch');

    return { operations: normalizedOperations, relativePath };
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

const validateSkipBatchInput = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
        throw new Error('Request body must be a JSON object.');
    }

    const relativePath = getNonEmptyString((value as { relativePath?: unknown }).relativePath, 'relativePath');
    const operations = (value as { operations?: unknown }).operations;

    if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error('Field "operations" must be a non-empty array.');
    }

    const normalizedOperations = operations.map((operation, index) => {
        if (typeof operation !== 'object' || operation === null) {
            throw new Error(`operations[${index}] must be an object.`);
        }

        const candidate = operation as { excerptId?: unknown; skipped?: unknown };
        return {
            excerptId: getNonEmptyString(candidate.excerptId, `operations[${index}].excerptId`),
            skipped:
                typeof candidate.skipped === 'boolean'
                    ? candidate.skipped
                    : (() => {
                          throw new Error(`operations[${index}].skipped must be a boolean.`);
                      })(),
        };
    });
    assertUniqueBatchExcerptIds(normalizedOperations, 'skip');

    return { operations: normalizedOperations, relativePath };
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

export const fetchCompilationBrowsePageData = createServerFn({ method: 'GET' })
    .inputValidator(validateCompilationBrowseInput)
    .handler(async ({ data }): Promise<CompilationBrowsePageData> => {
        const { getCompilationBrowsePageData } = await import('@/lib/app-services');
        return getCompilationBrowsePageData(data);
    });

export const fetchCompilationExportPageData = createServerFn({ method: 'GET' })
    .inputValidator(validateCompilationExportInput)
    .handler(async ({ data }): Promise<CompilationExportPageData> => {
        const { getCompilationExportPageData } = await import('@/lib/app-services');
        return getCompilationExportPageData(data);
    });

export const fetchPromptsPageData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getPromptsPageData } = await import('@/lib/app-services');
    return getPromptsPageData();
});

export const fetchPromptStateData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getPromptStateResponse } = await import('@/lib/app-services');
    return getPromptStateResponse();
});

export const fetchSettingsPageData = createServerFn({ method: 'GET' }).handler(async () => {
    const { getSettingsPageData } = await import('@/lib/app-services');
    return getSettingsPageData();
});

export const fetchShiftSettingsPageData = createServerFn({ method: 'GET' }).handler(
    async (): Promise<ShiftSettingsPageData> => {
        const { getShiftSettingsPageData } = await import('@/lib/app-services');
        return getShiftSettingsPageData();
    },
);

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

export const saveActiveCompilationSelectionData = createServerFn({ method: 'POST' })
    .inputValidator(validateActiveCompilationInput)
    .handler(async ({ data }): Promise<CompilationSelectionState> => {
        const { setActiveCompilationSelectionResponse } = await import('@/lib/app-services');
        return setActiveCompilationSelectionResponse(data.fileName);
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

export const commitTranslationPatches = createServerFn({ method: 'POST' })
    .inputValidator(validatePatchBatchInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { writeTranslationPatchesResponse } = await import('@/lib/app-services');
        return writeTranslationPatchesResponse(data.relativePath, data.operations);
    });

export const setTranslationSkip = createServerFn({ method: 'POST' })
    .inputValidator(validateSkipInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { setTranslationSkipResponse } = await import('@/lib/app-services');
        return setTranslationSkipResponse(data.relativePath, data.excerptId, data.skipped);
    });

export const setTranslationSkips = createServerFn({ method: 'POST' })
    .inputValidator(validateSkipBatchInput)
    .handler(async ({ data }): Promise<TranslationFileResponse> => {
        const { setTranslationSkipsResponse } = await import('@/lib/app-services');
        return setTranslationSkipsResponse(data.relativePath, data.operations);
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

export const updateShiftCheckpointPosition = createServerFn({ method: 'POST' })
    .inputValidator(validateShiftSettingsInput)
    .handler(async ({ data }): Promise<ShiftSettingsResponse> => {
        const { setShiftCheckpointPositionResponse } = await import('@/lib/app-services');
        return setShiftCheckpointPositionResponse(data.shiftedCount);
    });
