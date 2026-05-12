import { ChevronDown, FolderOpen } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/error-utils';
import type { CompilationSelectionState } from '@/lib/shell-types';

type ActiveCompilationPanelProps = {
    data: CompilationSelectionState | null;
    description: string;
    title: string;
    onSave: (fileName: string) => Promise<void>;
};

const formatFileSize = (sizeBytes: number) => {
    if (sizeBytes >= 1024 * 1024) {
        return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (sizeBytes >= 1024) {
        return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    }

    return `${sizeBytes} B`;
};

const getSelectedFileSummary = (data: CompilationSelectionState | null, selectedFileName: string) => ({
    hasOptions: Boolean(data && data.options.length > 0),
    selectedOption: data?.options.find((option) => option.fileName === selectedFileName) ?? null,
});

export const ActiveCompilationPanel = ({ data, description, onSave, title }: ActiveCompilationPanelProps) => {
    const [selectedFileName, setSelectedFileName] = useState(data?.activeFileName ?? '');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setSelectedFileName(data?.activeFileName ?? data?.options[0]?.fileName ?? '');
        setError(null);
        setSuccess(false);
    }, [data]);

    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setSelectedFileName(event.target.value);
        setError(null);
        setSuccess(false);
    };

    const handleSave = async () => {
        if (!selectedFileName) {
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            setSuccess(false);
            await onSave(selectedFileName);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (saveError) {
            setError(getErrorMessage(saveError, 'Failed to update the active compilation.'));
        } finally {
            setIsSaving(false);
        }
    };

    const { hasOptions, selectedOption } = getSelectedFileSummary(data, selectedFileName);

    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                    <FolderOpen className="size-4" />
                </div>
                <div>
                    <h2 className="font-semibold text-lg">{title}</h2>
                    <p className="mt-1 text-muted-foreground text-sm">{description}</p>
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative w-full max-w-xl">
                    <select
                        className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!hasOptions || isSaving}
                        onChange={handleSelectChange}
                        value={selectedFileName}
                    >
                        {!hasOptions ? (
                            <option>No compilation files available</option>
                        ) : (
                            (data?.options ?? []).map((option) => (
                                <option key={option.fileName} value={option.fileName}>
                                    {option.fileName}
                                </option>
                            ))
                        )}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>

                <Button
                    disabled={!hasOptions || isSaving || !selectedFileName || selectedFileName === data?.activeFileName}
                    onClick={handleSave}
                    type="button"
                >
                    {isSaving ? 'Saving...' : 'Set Active'}
                </Button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
                <div>
                    <p className="text-muted-foreground text-xs">Compilation Folder</p>
                    <p className="mt-1 break-all">{data?.folderPath ?? 'Not configured'}</p>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">Active File</p>
                    <p className="mt-1 break-all">{data?.activeFilePath ?? 'No active compilation selected'}</p>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">Visible JSON Files</p>
                    <p className="mt-1">
                        {data ? `${data.options.length} file${data.options.length === 1 ? '' : 's'}` : '...'}
                    </p>
                </div>
                {selectedOption ? (
                    <p className="text-muted-foreground text-xs">
                        Selected file size: {formatFileSize(selectedOption.sizeBytes)}. Updated{' '}
                        {selectedOption.modifiedAt}
                    </p>
                ) : null}
            </div>

            {success ? (
                <div className="mt-4 rounded-md bg-green-50 p-3 text-green-700 text-sm">
                    Active compilation updated.
                </div>
            ) : null}

            {error ? (
                <div className="mt-4 rounded-md bg-destructive/10 p-3 text-destructive text-sm">{error}</div>
            ) : null}
        </div>
    );
};
