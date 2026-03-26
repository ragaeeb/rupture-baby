'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { validateConversationExcerpts } from '@/lib/translation-parser';
import type { CommonConversationExport } from '@/lib/translation-types';
import { VALIDATION_ERROR_TYPE_INFO } from '@/lib/validation/utils';

type ValidateDialogProps = { conversation: CommonConversationExport };

export const ValidateDialog = ({ conversation }: ValidateDialogProps) => {
    const validation = validateConversationExcerpts(conversation);
    const { arabicSegments, excerpts, translatedSegments, validationErrors } = validation;
    const isValid = validationErrors.length === 0;
    const hasAlignmentErrors = validationErrors.some((error) =>
        ['duplicate_id', 'invented_id', 'missing_id_gap'].includes(error.type),
    );
    const translatedById = new Map(translatedSegments.map((segment) => [segment.id, segment.text]));
    const errorsById = new Map<string, string[]>();

    for (const error of validationErrors) {
        if (!error.id) {
            continue;
        }

        const existing = errorsById.get(error.id) ?? [];
        existing.push(error.message);
        errorsById.set(error.id, existing);
    }

    const tableRows = arabicSegments.map((segment, index) => {
        const excerpt = excerpts[index];
        const translatedText = excerpt?.text ?? translatedById.get(segment.id) ?? '';
        const rowErrors = errorsById.get(segment.id) ?? [];

        return { arabic: segment.text, id: segment.id, translatedText, validationMessages: rowErrors };
    });

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    {isValid ? (
                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    ) : (
                        <XCircle className="mr-2 h-4 w-4 text-destructive" />
                    )}
                    Validate
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-none flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {isValid
                            ? `Validated (${excerpts.length} excerpts)`
                            : `Validation Failed (${tableRows.length} excerpts)`}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 flex-col gap-4 overflow-auto">
                    {!isValid ? (
                        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
                            {hasAlignmentErrors ? (
                                <>
                                    <p className="font-medium text-destructive">
                                        The translated response does not match the source excerpts.
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        Source IDs: {arabicSegments.map((segment) => segment.id).join(', ') || 'None'}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        Response IDs:{' '}
                                        {translatedSegments.map((segment) => segment.id).join(', ') || 'None'}
                                    </p>
                                </>
                            ) : (
                                <p className="font-medium text-destructive">
                                    The translated response has content validation issues, but its segment IDs still
                                    match the source.
                                </p>
                            )}
                        </div>
                    ) : null}

                    <div className="flex-1 overflow-auto rounded-md border">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-background">
                                <tr className="border-b">
                                    <th className="w-16 px-4 py-2 text-left font-medium text-xs">ID</th>
                                    <th className="w-1/2 px-4 py-2 text-left font-medium">Arabic</th>
                                    <th className="w-1/2 px-4 py-2 text-left font-medium text-xs">Translation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={
                                            row.validationMessages.length > 0
                                                ? 'border-b bg-destructive/5 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.35)] last:border-b-0'
                                                : 'border-b last:border-b-0'
                                        }
                                    >
                                        <td
                                            className={
                                                row.validationMessages.length > 0
                                                    ? 'px-4 py-3 align-top font-mono text-[10px] font-semibold text-destructive'
                                                    : 'px-4 py-3 align-top font-mono text-[10px] text-muted-foreground'
                                            }
                                        >
                                            {row.id}
                                        </td>
                                        <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                                            {row.arabic}
                                        </td>
                                        <td className="px-4 py-3 align-top text-[10px]">
                                            <div
                                                className={
                                                    row.validationMessages.length > 0
                                                        ? 'rounded border border-destructive/30 bg-background px-3 py-2 whitespace-pre-wrap font-medium text-destructive shadow-sm'
                                                        : 'whitespace-pre-wrap'
                                                }
                                            >
                                                {row.translatedText || '—'}
                                            </div>
                                            {row.validationMessages.length > 0 ? (
                                                <div className="mt-2 space-y-1 rounded border border-destructive/20 bg-destructive/5 px-3 py-2">
                                                    {row.validationMessages.map((message) => (
                                                        <p
                                                            key={`${row.id}-${message}`}
                                                            className="font-medium text-destructive text-xs"
                                                        >
                                                            {message}
                                                        </p>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!isValid ? (
                        <div className="rounded-md border">
                            <table className="w-full">
                                <thead className="bg-muted/40">
                                    <tr className="border-b">
                                        <th className="px-4 py-2 text-left font-medium text-xs">Type</th>
                                        <th className="px-4 py-2 text-left font-medium text-xs">ID</th>
                                        <th className="px-4 py-2 text-left font-medium text-xs">Message</th>
                                        <th className="px-4 py-2 text-left font-medium text-xs">Matched Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {validationErrors.map((error) => (
                                        <tr
                                            key={`${error.type}-${error.id ?? 'global'}-${error.message}-${error.matchText}`}
                                            className="border-b last:border-b-0"
                                        >
                                            <td className="px-4 py-3 align-top font-mono text-[10px] text-muted-foreground">
                                                {VALIDATION_ERROR_TYPE_INFO[error.type]?.description || error.type}
                                            </td>
                                            <td className="px-4 py-3 align-top font-mono text-[10px] text-muted-foreground">
                                                {error.id || '—'}
                                            </td>
                                            <td className="px-4 py-3 align-top text-sm">{error.message}</td>
                                            <td className="whitespace-pre-wrap px-4 py-3 align-top font-mono text-[10px]">
                                                {error.matchText || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};
