import { createFileRoute } from '@tanstack/react-router';
import { ChevronDown, Settings2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';

import { AppFooter } from '@/components/app-footer';
import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { getStoredAssistProvider, setStoredAssistProvider } from '@/lib/assist-provider-storage';
import { getErrorMessage } from '@/lib/error-utils';
import { fetchSettingsPageData } from '@/lib/server-functions';
import type { AssistProviderId } from '@/lib/shell-types';

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
    loader: async () => fetchSettingsPageData(),
});

function SettingsPage() {
    const loaderData = Route.useLoaderData();
    const [selectedProviderId, setSelectedProviderId] = useState<AssistProviderId | ''>(
        loaderData.settings?.selectedAssistProvider ?? '',
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(loaderData.error);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setError(loaderData.error);
        setSelectedProviderId(getStoredAssistProvider() ?? loaderData.settings?.selectedAssistProvider ?? '');
    }, [loaderData.error, loaderData.settings]);

    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setSelectedProviderId(event.target.value as AssistProviderId);
    };

    const handleSave = async () => {
        if (!selectedProviderId) {
            return;
        }

        try {
            setIsSaving(true);
            setSuccess(false);
            setError(null);

            setStoredAssistProvider(selectedProviderId);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (saveError) {
            setError(getErrorMessage(saveError, 'Failed to save settings.'));
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
                                <BreadcrumbPage>Settings</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </header>

                <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-md bg-muted p-2">
                                <Settings2 className="size-4" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-lg">LLM Provider</h2>
                                <p className="mt-1 text-muted-foreground text-sm">
                                    Choose which provider and model power Arabic leak correction.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-4">
                            <div className="relative w-full max-w-sm">
                                <select
                                    className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!loaderData.settings || isSaving}
                                    onChange={handleSelectChange}
                                    value={selectedProviderId}
                                >
                                    {!loaderData.settings ? (
                                        <option>Loading...</option>
                                    ) : (
                                        loaderData.settings.providers.map((provider) => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.label} {!provider.isConfigured ? '(Missing env)' : ''}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            </div>

                            <Button
                                disabled={isSaving || !loaderData.settings || !selectedProviderId}
                                onClick={handleSave}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>

                        {success ? (
                            <div className="mt-4 rounded-md bg-green-50 p-3 text-green-700 text-sm">
                                Settings saved successfully.
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                                {error}
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="font-semibold text-lg">Provider Status</h2>
                        <div className="mt-4 space-y-3">
                            {loaderData.settings?.providers.map((provider) => (
                                <div
                                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                                    key={provider.id}
                                >
                                    <div>
                                        <p className="font-medium">{provider.label}</p>
                                        <p className="text-muted-foreground text-xs">{provider.model}</p>
                                    </div>
                                    <span
                                        className={
                                            provider.isConfigured
                                                ? 'rounded-full bg-green-50 px-2 py-1 font-medium text-[11px] text-green-700'
                                                : 'rounded-full bg-amber-50 px-2 py-1 font-medium text-[11px] text-amber-800'
                                        }
                                    >
                                        {provider.isConfigured ? 'Configured' : 'Missing env'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <p className="mt-4 text-muted-foreground text-xs">
                            The selected provider is stored in your browser local storage.
                        </p>
                    </div>
                </div>
                <AppFooter meta={loaderData.meta} />
            </SidebarInset>
        </SidebarProvider>
    );
}
