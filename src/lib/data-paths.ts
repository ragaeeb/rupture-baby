type PathConfigKey = 'compilationFilePath' | 'translationsDir';

export class MissingPathConfigError extends Error {
    key: PathConfigKey;

    constructor(key: PathConfigKey) {
        super(`${key} is not set on the server.`);
        this.name = 'MissingPathConfigError';
        this.key = key;
    }
}

const getCompilationFilePathFromEnv = () => process.env.COMPILATION_FILE_PATH?.trim() || null;
const getTranslationsDirFromEnv = () => process.env.TRANSLATIONS_DIR?.trim() || null;

export const requireCompilationFilePath = (): string => {
    const compilationFilePath = getCompilationFilePathFromEnv();
    if (!compilationFilePath) {
        throw new MissingPathConfigError('compilationFilePath');
    }
    return compilationFilePath;
};

export const requireTranslationsDir = (): string => {
    const translationsDir = getTranslationsDirFromEnv();
    if (!translationsDir) {
        throw new MissingPathConfigError('translationsDir');
    }
    return translationsDir;
};
