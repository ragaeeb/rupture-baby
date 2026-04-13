'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type DeleteConfirmDialogProps = {
    fileNames: string[];
    title?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isDeleting: boolean;
    confirmLabel?: string;
};

export const DeleteConfirmDialog = ({
    fileNames,
    title,
    open,
    onOpenChange,
    onConfirm,
    isDeleting,
    confirmLabel,
}: DeleteConfirmDialogProps) => {
    const isMultiple = fileNames.length > 1;
    const resolvedTitle = title ?? (isMultiple ? 'Delete Files' : 'Delete File');
    const resolvedConfirmLabel = confirmLabel ?? 'Delete';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{resolvedTitle}</DialogTitle>
                    <DialogDescription className="space-y-2">
                        <p>
                            {isMultiple
                                ? `Are you sure you want to delete these ${fileNames.length} files?`
                                : 'Are you sure you want to delete this file?'}
                        </p>
                        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-muted px-3 py-2">
                            {fileNames.map((fileName) => (
                                <p key={fileName} className="break-all font-mono text-foreground text-xs">
                                    {fileName}
                                </p>
                            ))}
                        </div>
                        <p>This action cannot be undone.</p>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-wrap gap-2 sm:justify-end sm:space-x-0">
                    <Button
                        className="sm:min-w-24"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button className="sm:min-w-24" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : resolvedConfirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

type DeleteButtonProps = { fileName: string; onDelete: () => Promise<void> };

export const DeleteButton = ({ fileName, onDelete }: DeleteButtonProps) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);

        try {
            await onDelete();
            setIsDeleteDialogOpen(false);
        } catch (error) {
            console.error('Failed to delete file:', error);
            alert(error instanceof Error ? error.message : 'Failed to delete file');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                Delete
            </Button>
            <DeleteConfirmDialog
                fileNames={[fileName]}
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                onConfirm={handleDelete}
                isDeleting={isDeleting}
            />
        </>
    );
};
