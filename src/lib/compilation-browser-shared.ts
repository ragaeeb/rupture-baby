export type CompilationCollectionKey = 'excerpts' | 'footnotes' | 'headings';

export const DEFAULT_COMPILATION_BROWSE_COLLECTION: CompilationCollectionKey = 'excerpts';
export const DEFAULT_COMPILATION_BROWSE_PAGE = 1;
export const DEFAULT_COMPILATION_BROWSE_PAGE_SIZE = 100;
export const MAX_COMPILATION_BROWSE_PAGE_SIZE = 250;
export const COMPILATION_BROWSE_PAGE_SIZE_OPTIONS = [50, 100, 250] as const;

export const isCompilationCollectionKey = (value: unknown): value is CompilationCollectionKey =>
    value === 'excerpts' || value === 'footnotes' || value === 'headings';
