'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { mapConversationToExcerpts } from '@/lib/translation-parser';
import type { CommonConversationExport } from '@/lib/translation-types';

type ValidateDialogProps = { conversation: CommonConversationExport };

export const ValidateDialog = ({ conversation }: ValidateDialogProps) => {
    const excerpts = mapConversationToExcerpts(conversation);
    const isValid = excerpts.length > 0;

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
                        {isValid ? `Validated (${excerpts.length} excerpts)` : 'Validation Failed'}
                    </DialogTitle>
                </DialogHeader>

                {isValid ? (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-background">
                                <tr className="border-b">
                                    <th className="w-16 px-4 py-2 text-left font-medium text-xs">ID</th>
                                    <th className="w-1/2 px-4 py-2 text-left font-medium">Arabic</th>
                                    <th className="w-1/2 px-4 py-2 text-left font-medium text-xs">Translation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {excerpts.map((excerpt) => (
                                    <tr key={excerpt.id} className="border-b last:border-b-0">
                                        <td className="px-4 py-3 align-top font-mono text-[10px] text-muted-foreground">
                                            {excerpt.id}
                                        </td>
                                        <td className="whitespace-pre-wrap px-4 py-3 align-top text-sm" dir="rtl">
                                            {excerpt.nass}
                                        </td>
                                        <td className="whitespace-pre-wrap px-4 py-3 align-top text-[10px]">
                                            {excerpt.text}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">
                        <p className="text-sm">Failed to validate: Arabic and translation segments do not match.</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
