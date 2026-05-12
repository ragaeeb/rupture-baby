'use client';

import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { updateShiftCheckpointPosition } from '@/lib/server-functions';
import type { ShiftSettingsPageData } from '@/lib/shell-types';

type ShiftSettingsPageProps = { data: ShiftSettingsPageData };

const getCheckpointStatusLabel = (data: ShiftSettingsPageData) => {
    if (!data.settings) {
        return '...';
    }

    if (data.settings.checkpointValid) {
        return 'Valid';
    }

    return data.settings.hasCheckpoint ? 'Present but stale' : 'Not created yet';
};

const ShiftSummaryCards = ({ data }: ShiftSettingsPageProps) => (
    <div className="mt-4 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Shifted</p>
            <p className="mt-1 font-semibold text-2xl">{data.settings?.shiftedCount.toLocaleString() ?? '...'}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Remaining</p>
            <p className="mt-1 font-semibold text-2xl">{data.settings?.remainingCount.toLocaleString() ?? '...'}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Total Queue</p>
            <p className="mt-1 font-semibold text-2xl">{data.settings?.totalCount.toLocaleString() ?? '...'}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-muted-foreground text-xs">Next ID</p>
            <p className="mt-1 font-mono text-sm">{data.settings?.nextId ?? 'None'}</p>
        </div>
    </div>
);

const ShiftCheckpointDetails = ({ data }: ShiftSettingsPageProps) => (
    <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold text-base">Checkpoint Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">Compilation File</p>
                <p className="mt-1 break-all text-muted-foreground">{data.settings?.compilationFilePath ?? '...'}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">Checkpoint File</p>
                <p className="mt-1 break-all text-muted-foreground">{data.settings?.checkpointPath ?? '...'}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">Last Shifted ID</p>
                <p className="mt-1 font-mono text-muted-foreground">{data.settings?.lastShiftedId ?? 'None'}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">Checkpoint Status</p>
                <p className="mt-1 text-muted-foreground">{getCheckpointStatusLabel(data)}</p>
            </div>
        </div>
    </div>
);

export const ShiftSettingsPage = ({ data }: ShiftSettingsPageProps) => {
    const router = useRouter();
    const [shiftedCount, setShiftedCount] = useState(String(data.settings?.shiftedCount ?? 0));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(data.error);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        setShiftedCount(String(data.settings?.shiftedCount ?? 0));
        setError(data.error);
    }, [data.error, data.settings?.shiftedCount]);

    const handleSave = async () => {
        if (isSaving) {
            return;
        }

        const parsedShiftedCount = Number.parseInt(shiftedCount, 10);
        if (!Number.isFinite(parsedShiftedCount)) {
            setError('Shift index must be a whole number.');
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            setSuccess(null);
            await updateShiftCheckpointPosition({ data: { shiftedCount: parsedShiftedCount } });
            await router.invalidate({ sync: true });
            setSuccess('Shift position updated.');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to update shift position.');
        } finally {
            setIsSaving(false);
        }
    };

    const totalCount = data.settings?.totalCount ?? 0;

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Shift Control</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-xl border bg-card p-4">
                    <h2 className="font-semibold text-lg">Current Shift Position</h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                        Adjust the persisted checkpoint used by <code>/api/compilation/excerpts/shift</code>. Setting
                        the index to <code>0</code> restarts from the beginning of the untranslated queue.
                    </p>

                    {error ? (
                        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-destructive text-sm">{error}</div>
                    ) : null}

                    {success ? (
                        <div className="mt-4 rounded-md bg-green-50 p-3 text-green-700 text-sm">{success}</div>
                    ) : null}

                    <ShiftSummaryCards data={data} />

                    <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/10 p-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <label
                                className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide"
                                htmlFor="shift-position"
                            >
                                Shift Index
                            </label>
                            <input
                                className="h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                id="shift-position"
                                max={totalCount}
                                min={0}
                                onChange={(event) => setShiftedCount(event.target.value)}
                                type="number"
                                value={shiftedCount}
                            />
                            <p className="text-muted-foreground text-xs">
                                Valid range: 0 to {totalCount.toLocaleString()}.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => setShiftedCount('0')} type="button" variant="outline">
                                Reset
                            </Button>
                            <Button onClick={() => setShiftedCount(String(totalCount))} type="button" variant="outline">
                                Skip To End
                            </Button>
                            <Button disabled={isSaving || !data.settings} onClick={handleSave} type="button">
                                {isSaving ? 'Saving...' : 'Save Position'}
                            </Button>
                        </div>
                    </div>
                </div>

                <ShiftCheckpointDetails data={data} />
            </div>
        </>
    );
};

export default ShiftSettingsPage;
