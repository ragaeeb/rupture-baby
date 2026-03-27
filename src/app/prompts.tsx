import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { getErrorMessage } from '@/lib/error-utils';
import { fetchPromptsPageData, savePromptSelection } from '@/lib/server-functions';

export const Route = createFileRoute('/prompts')({
    component: PromptsPage,
    loader: async () => fetchPromptsPageData(),
});

function PromptsPage() {
    const router = useRouter();
    const loaderData = Route.useLoaderData();
    const [selectedPromptId, setSelectedPromptId] = useState(loaderData.promptState?.selectedPromptId ?? '');
    const [selectedPromptContent, setSelectedPromptContent] = useState(
        loaderData.promptState?.selectedPromptContent ?? '',
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(loaderData.error);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setError(loaderData.error);
        setSelectedPromptId(loaderData.promptState?.selectedPromptId ?? '');
        setSelectedPromptContent(loaderData.promptState?.selectedPromptContent ?? '');
    }, [loaderData.error, loaderData.promptState]);

    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const newPromptId = event.target.value;
        setSelectedPromptId(newPromptId);

        if (!loaderData.promptState) {
            return;
        }

        const selectedOption = loaderData.promptState.options.find((option) => option.id === newPromptId);
        if (selectedOption) {
            setSelectedPromptContent(selectedOption.content);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setSuccess(false);
            setError(null);

            await savePromptSelection({ data: { promptId: selectedPromptId } });
            await router.invalidate({ sync: true });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (saveError) {
            setError(getErrorMessage(saveError, 'Failed to save prompt.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SidebarProvider>
            <AppSidebar entries={[]} rootName="translations" />
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
                                    className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!loaderData.promptState || isSaving}
                                    onChange={handleSelectChange}
                                    value={selectedPromptId}
                                >
                                    {!loaderData.promptState ? (
                                        <option>Loading...</option>
                                    ) : (
                                        loaderData.promptState.options.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            </div>

                            <Button onClick={handleSave} disabled={isSaving || !loaderData.promptState}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>

                        {success ? (
                            <div className="mt-4 rounded-md bg-green-50 p-3 text-green-700 text-sm">
                                Prompt saved successfully!
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                                {error}
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-lg">Prompt Content</h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            Preview of the selected prompt (master + specialized prompt combined).
                        </p>

                        <div className="mt-4">
                            {!loaderData.promptState ? (
                                <p className="text-muted-foreground text-sm">Loading prompt content...</p>
                            ) : (
                                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-5 [overflow-wrap:anywhere]">
                                    {selectedPromptContent || 'No prompt selected.'}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
                <AppFooter meta={loaderData.meta} />
            </SidebarInset>
        </SidebarProvider>
    );
}
