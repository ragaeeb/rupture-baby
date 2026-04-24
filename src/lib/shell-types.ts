import type { AssistProviderId } from '@/lib/assist-provider-ids';
import type { ThinkingTimeRange } from '@/lib/reasoning-time';
import type { RuptureHighlight, RupturePatchMetadata } from '@/lib/translation-patches';
import type { Range } from '@/lib/validation/types';

export type { AssistProviderId } from '@/lib/assist-provider-ids';

export type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

export type TranslationTreeNode = {
    kind: 'directory' | 'file';
    name: string;
    relativePath: string;
    children?: TranslationTreeNode[];
};

export type TranslationTreeResponse = { rootName: string; rootRelativePath: ''; entries: TranslationTreeNode[] };

export type TranslationFileResponse = {
    content: JsonValue;
    modifiedAt: string;
    name: string;
    relativePath: string;
    sizeBytes: number;
};

export type DashboardStatsResponse = {
    checkedAt: string;
    compilationStats?: {
        createdAt: number | null;
        excerpts: { total: number; translated: number; untranslated: number };
        headings: { total: number; translated: number; untranslated: number };
        lastUpdatedAt: number | null;
        totalSegments: number;
        translatedSegments: number;
        untranslatedSegments: number;
        uniqueTranslators: number;
        workDurationMs: number | null;
    } | null;
    health: {
        compilationFilePath: string | null;
        compilationFileConfigured: boolean;
        compilationFileExists: boolean;
        ok: boolean;
        translationsDirectoryPath: string | null;
        translationsDirectoryConfigured: boolean;
        translationsDirectoryExists: boolean;
    };
    stats: { port: string; translationFilesCount: number; translationsDirectoryName: string };
    translationStats?: TranslationStats;
};

export type CompilationAnalyticsResponse = {
    createdAt: number | null;
    duplicateTranslationAltCountDistribution: Array<{ altCount: number; label: string; segments: number }>;
    duplicateTranslationSegmentCount: number;
    duplicateTranslationsTotal: number;
    lastUpdatedAt: number | null;
    patchCount: number;
    patchTypeDistribution: Array<{
        count: number;
        label: string;
        type: 'all_caps_correction' | 'arabic_leak_correction';
    }>;
    timeline: Array<{
        completionPercent: number;
        cumulativeTranslated: number;
        date: string;
        excerpts: number;
        headings: number;
        label: string;
        translated: number;
    }>;
    timelineGranularity: 'day' | 'month' | 'week';
    totalSegments: number;
    translatedSegments: number;
    translators: Array<{ count: number; id: string; label: string; percent: number }>;
    untranslatedSegments: number;
    uniqueTranslators: number;
    workDurationSeconds: number | null;
};

export type CompilationPlaybackSimulationResponse = {
    appliedExcerptCount: number;
    blockedByCompilationDuplicates: boolean;
    compilationFilePath: string;
    compilationDuplicateTargetIds: Array<{
        id: string;
        targets: Array<{ collection: 'excerpts' | 'footnotes' | 'headings'; index: number }>;
    }>;
    compilationStatsAfter: NonNullable<DashboardStatsResponse['compilationStats']>;
    compilationStatsBefore: NonNullable<DashboardStatsResponse['compilationStats']>;
    duplicateExcerptIds: Array<{ filePaths: string[]; id: string }>;
    invalidFileCount: number;
    invalidFilePaths: string[];
    skippedAlreadyTranslatedExcerptIds: Array<{ filePaths: string[]; id: string }>;
    totalCandidateExcerptCount: number;
    unknownCompilationExcerptIds: Array<{ filePaths: string[]; id: string }>;
    validFileCount: number;
    validFilePaths: string[];
};

export type SaveCompilationPlaybackResponse = { appliedExcerptCount: number; outputPath: string };
export type PackCompilationResponse = {
    compressedSizeBytes: number;
    outputPath: string;
    sizeBytes: number;
    sourcePath: string;
};

export type InvalidExcerptRow = {
    allCapsHints: string[];
    arabic: string | null;
    arabicLeakHints: string[];
    baseTranslation: string | null;
    errorTypes: string[];
    filePath: string;
    id: string | null;
    messages: string[];
    model?: string;
    patchHighlights: RuptureHighlight[];
    translation: string | null;
    validationHighlightRanges: Range[];
};

export type InvalidExcerptsResponse = { invalidFileCount: number; rowCount: number; rows: InvalidExcerptRow[] };

export type TranslationStats = {
    files: Array<{
        isValid: boolean;
        model: string | undefined;
        path: string;
        reasoningDurationSec: number | undefined;
    }>;
    invalidByModel: Record<string, number>;
    invalidFiles: number;
    modelBreakdown: Record<string, number>;
    patchesApplied: number;
    thinkingTimeBreakdown: Record<Exclude<ThinkingTimeRange, 'all'>, number>;
    totalFiles: number;
    validFiles: number;
};

export type AppMetaResponse = {
    authorName: string | null;
    authorUrl: string | null;
    homepage: string | null;
    name: string | null;
    version: string | null;
};

export type PromptOption = { content: string; id: string; name: string };

export type PromptStateResponse = { options: PromptOption[]; selectedPromptContent: string; selectedPromptId: string };
export type AssistProviderOption = { id: AssistProviderId; isConfigured: boolean; label: string; model: string };
export type AppSettingsResponse = { providers: AssistProviderOption[]; selectedAssistProvider: AssistProviderId };

export type BrowseShellData = {
    meta: AppMetaResponse | null;
    tree: TranslationTreeResponse | null;
    treeError: string | null;
    translationStats: TranslationStats | null;
    translationStatsError: string | null;
};

export type DashboardPageData = { stats: DashboardStatsResponse | null; statsError: string | null };

export type AnalyticsPageData = { analytics: CompilationAnalyticsResponse | null; error: string | null };

export type PromptsPageData = {
    error: string | null;
    meta: AppMetaResponse | null;
    promptState: PromptStateResponse | null;
};

export type SettingsPageData = {
    error: string | null;
    meta: AppMetaResponse | null;
    settings: AppSettingsResponse | null;
};

export type DeleteTranslationResponse = { deletedPath: string; success: true };
export type DeleteTranslationsResponse = { deletedPaths: string[]; success: true };

export type TranslationCorrectionExcerpt = {
    arabic: string;
    filePath: string;
    id: string;
    matchHints?: string[];
    translation: string;
};

export type TranslationTextCorrection = { filePath: string; id: string; match: string; replacement: string };
export type ArabicLeakCorrectionExcerpt = TranslationCorrectionExcerpt;
export type ArabicLeakCorrection = TranslationTextCorrection;
export type AllCapsCorrectionExcerpt = TranslationCorrectionExcerpt;
export type AllCapsCorrection = TranslationTextCorrection;

export type TranslationAssistScope = 'batch' | 'file';
export type TranslationAssistTask = 'all_caps_correction' | 'arabic_leak_correction';

export type TranslationAssistRequest = {
    excerpts: TranslationCorrectionExcerpt[];
    providerId?: AssistProviderId;
    scope: TranslationAssistScope;
    task: TranslationAssistTask;
};

export type TranslationAssistResponse = {
    corrections: TranslationTextCorrection[];
    model: string;
    modelVersion?: string;
    patchMetadata: RupturePatchMetadata;
    provider: 'cloudflare' | 'google' | 'huggingface' | 'nvidia';
    scope: TranslationAssistScope;
    task: TranslationAssistTask;
};
