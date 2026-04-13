'use client';

import { useState } from 'react';

import { packCompilationFileData } from '@/lib/server-functions';

const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return '...';
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = -1;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

export const PackCompilationButton = () => {
    const [error, setError] = useState<string | null>(null);
    const [isPacking, setIsPacking] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-green-700/20 bg-green-50 px-3 font-medium text-green-800 text-sm shadow-sm transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPacking}
                onClick={() => {
                    setIsPacking(true);
                    setError(null);
                    setSuccessMessage(null);
                    void packCompilationFileData()
                        .then((result) => {
                            setSuccessMessage(
                                `Packed ${formatBytes(result.sizeBytes)} to ${formatBytes(result.compressedSizeBytes)} at ${result.outputPath}.`,
                            );
                        })
                        .catch((nextError: unknown) => {
                            setError(nextError instanceof Error ? nextError.message : 'Failed to pack compilation.');
                        })
                        .finally(() => {
                            setIsPacking(false);
                        });
                }}
                type="button"
            >
                {isPacking ? 'Packing...' : 'Pack'}
            </button>
            {successMessage ? <p className="max-w-md text-right text-green-800 text-xs">{successMessage}</p> : null}
            {error ? <p className="max-w-md text-right text-destructive text-xs">{error}</p> : null}
        </div>
    );
};
