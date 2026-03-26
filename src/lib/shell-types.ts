export type TranslationTreeNode = {
    kind: 'directory' | 'file';
    name: string;
    relativePath: string;
    children?: TranslationTreeNode[];
};

export type TranslationTreeResponse = { rootName: string; rootRelativePath: ''; entries: TranslationTreeNode[] };

export type TranslationFileResponse = {
    content: unknown;
    modifiedAt: string;
    name: string;
    relativePath: string;
    sizeBytes: number;
};

export type DashboardStatsResponse = {
    checkedAt: string;
    health: {
        compilationFileConfigured: boolean;
        compilationFileExists: boolean;
        ok: boolean;
        translationsDirectoryConfigured: boolean;
        translationsDirectoryExists: boolean;
    };
    stats: { port: string; translationFilesCount: number; translationsDirectoryName: string };
    translationStats?: TranslationStats;
};

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
