import '@tanstack/react-start/server-only';

import { stat } from 'node:fs/promises';

import {
    getActiveCompilationConfigPath,
    listCompilationFileOptions,
    MissingPathConfigError,
    requireCompilationFilePath,
    requireCompilationFolder,
    setActiveCompilationFileName,
} from '@/lib/data-paths';
import type { CompilationSelectionState } from '@/lib/shell-types';

export const getCompilationSelectionState = async (): Promise<CompilationSelectionState> => {
    const compilationFolder = requireCompilationFolder();
    const options = await listCompilationFileOptions(compilationFolder);
    const activeFilePath = options.length > 0 ? await requireCompilationFilePath() : null;
    const activeOption = options.find((option) => option.filePath === activeFilePath) ?? null;

    return {
        activeFileName: activeOption?.fileName ?? null,
        activeFilePath,
        folderPath: compilationFolder,
        options,
        selectionPath: getActiveCompilationConfigPath(compilationFolder),
    };
};

export const getCompilationSelectionHealth = async () => {
    let compilationFolderConfigured = true;
    let compilationFolderExists = true;
    let compilationFolderPath: string | null = null;
    let activeCompilationConfigured = true;
    let activeCompilationExists = true;
    let activeCompilationFilePath: string | null = null;
    let compilationSelection: CompilationSelectionState = {
        activeFileName: null,
        activeFilePath: null,
        folderPath: null,
        options: [],
        selectionPath: null,
    };

    try {
        compilationFolderPath = requireCompilationFolder();
        await stat(compilationFolderPath);
        compilationSelection = await getCompilationSelectionState();
        activeCompilationFilePath = compilationSelection.activeFilePath;
        activeCompilationConfigured = compilationSelection.options.length > 0;
        activeCompilationExists = Boolean(activeCompilationFilePath);
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            if (error.key === 'compilationFolder') {
                compilationFolderConfigured = false;
                compilationFolderExists = false;
            } else {
                activeCompilationConfigured = false;
                activeCompilationExists = false;
            }
        } else {
            compilationFolderExists = false;
            activeCompilationExists = false;
        }
    }

    return {
        compilationSelection,
        health: {
            activeCompilationConfigured,
            activeCompilationExists,
            activeCompilationFilePath,
            compilationFolderConfigured,
            compilationFolderExists,
            compilationFolderPath,
        },
    };
};

export const saveActiveCompilationSelection = async (fileName: string): Promise<CompilationSelectionState> => {
    await setActiveCompilationFileName(fileName);
    return getCompilationSelectionState();
};
