'use client';

import { ChevronDown } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import type { PromptStateResponse } from '@/lib/shell-api';
import { fetchPromptState, setPrompt } from '@/lib/shell-api';

const PromptsPage = () => {
    const [promptState, setPromptState] = useState<PromptStateResponse | null>(null);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('');
    const [selectedPromptContent, setSelectedPromptContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const loadPrompts = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const state = await fetchPromptState();
                setPromptState(state);
                setSelectedPromptId(state.selectedPromptId);
                setSelectedPromptContent(state.selectedPromptContent);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load prompts.');
            } finally {
                setIsLoading(false);
            }
        };

        loadPrompts();
    }, []);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPromptId = e.target.value;
        setSelectedPromptId(newPromptId);

        // Update content immediately for preview
        if (promptState) {
            const selected = promptState.options.find((o) => o.id === newPromptId);
            if (selected) {
                setSelectedPromptContent(selected.content);
            }
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setSuccess(false);
            setError(null);

            await setPrompt(selectedPromptId);
            setSuccess(true);

            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save prompt.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SidebarProvider>
            <Suspense fallback={null}>
                <AppSidebar entries={[]} rootName="translations" />
            </Suspense>
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Prompts</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </header>

                <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-lg">Select Prompt</h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Choose a prompt template and save it as the active prompt.
                        </p>

                        <div className="mt-4 flex items-center gap-4">
                            <div className="relative w-full max-w-xs">
                                <select
                                    value={selectedPromptId}
                                    onChange={handleSelectChange}
                                    className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <option>Loading...</option>
                                    ) : (
                                        promptState?.options.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            </div>

                            <Button onClick={handleSave} disabled={isSaving || isLoading}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>

                        {success && (
                            <div className="mt-4 rounded-md bg-green-50 p-3 text-green-700 text-sm">
                                Prompt saved successfully!
                            </div>
                        )}

                        {error && (
                            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-lg">Prompt Content</h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Preview of the selected prompt (master + specialized prompt combined).
                        </p>

                        <div className="mt-4">
                            {isLoading ? (
                                <p className="text-muted-foreground text-sm">Loading prompt content...</p>
                            ) : (
                                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                                    {selectedPromptContent || 'No prompt selected.'}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
                <AppFooter />
            </SidebarInset>
        </SidebarProvider>
    );
};

export default PromptsPage;
