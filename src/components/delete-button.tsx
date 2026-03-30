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
    fileName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isDeleting: boolean;
};

export const DeleteConfirmDialog = ({
    fileName,
    open,
    onOpenChange,
    onConfirm,
    isDeleting,
}: DeleteConfirmDialogProps) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete File</DialogTitle>
                    <DialogDescription className="space-y-2">
                        <p>Are you sure you want to delete this file?</p>
                        <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-foreground text-xs">
                            {fileName}
                        </p>
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
                        {isDeleting ? 'Deleting...' : 'Delete'}
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
                fileName={fileName}
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                onConfirm={handleDelete}
                isDeleting={isDeleting}
            />
        </>
    );
};
