import type { RuptureHighlight, RupturePatchMetadata } from '@/lib/translation-patches';
import type { Range } from '@/lib/validation/types';

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

export type InvalidExcerptRow = {
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
    files: Array<{ isValid: boolean; model: string | undefined; path: string }>;
    invalidByModel: Record<string, number>;
    invalidFiles: number;
    modelBreakdown: Record<string, number>;
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
export type AssistProviderId = 'cloudflare' | 'gemini' | 'hf';
export type AssistProviderOption = { id: AssistProviderId; isConfigured: boolean; label: string; model: string };
export type AppSettingsResponse = { providers: AssistProviderOption[]; selectedAssistProvider: AssistProviderId };

export type BrowseShellData = {
    meta: AppMetaResponse | null;
    stats: DashboardStatsResponse | null;
    statsError: string | null;
    tree: TranslationTreeResponse | null;
    treeError: string | null;
};

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

export type ArabicLeakCorrectionExcerpt = {
    arabic: string;
    filePath: string;
    id: string;
    leakHints?: string[];
    translation: string;
};

export type ArabicLeakCorrection = { filePath: string; id: string; match: string; replacement: string };

export type TranslationAssistScope = 'batch' | 'file';
export type TranslationAssistTask = 'arabic_leak_correction';

export type TranslationAssistRequest = {
    excerpts: ArabicLeakCorrectionExcerpt[];
    providerId?: AssistProviderId;
    scope: TranslationAssistScope;
    task: 'arabic_leak_correction';
};

export type TranslationAssistResponse = {
    corrections: ArabicLeakCorrection[];
    model: string;
    modelVersion?: string;
    patchMetadata: RupturePatchMetadata;
    provider: 'cloudflare' | 'google' | 'huggingface';
    scope: TranslationAssistScope;
    task: 'arabic_leak_correction';
};
