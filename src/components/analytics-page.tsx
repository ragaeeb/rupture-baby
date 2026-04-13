'use client';

import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from 'recharts';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { AnalyticsPageData } from '@/lib/shell-types';
import { formatUnixSecondsToUtcString } from '@/lib/time';

type AnalyticsPageProps = { data: AnalyticsPageData };

const formatDurationSeconds = (durationSeconds: number | null | undefined) => {
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
        return '...';
    }

    const totalMinutes = Math.max(0, Math.floor(durationSeconds / 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    return [
        days > 0 ? `${days}d` : null,
        hours > 0 ? `${hours}h` : null,
        minutes > 0 || (days === 0 && hours === 0) ? `${minutes}m` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

const progressChartConfig = {
    completionPercent: { color: 'var(--chart-3)', label: 'Completion %' },
    excerpts: { color: 'var(--chart-1)', label: 'Excerpts' },
    headings: { color: 'var(--chart-2)', label: 'Headings' },
} satisfies ChartConfig;

const translatorColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const MetricCard = ({
    helper,
    label,
    value,
    valueClassName = '',
}: {
    helper?: string;
    label: string;
    value: string;
    valueClassName?: string;
}) => (
    <div className="rounded-xl border bg-card p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`mt-1 font-semibold text-2xl ${valueClassName}`.trim()}>{value}</p>
        {helper ? <p className="mt-1 text-muted-foreground text-xs">{helper}</p> : null}
    </div>
);

const ProgressChartCard = ({ analytics }: { analytics: NonNullable<AnalyticsPageData['analytics']> | null }) => (
    <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold text-base">Translation Progress Over Time</h2>
        <p className="mt-1 text-muted-foreground text-sm">
            Translation activity is bucketed by lastUpdatedAt across excerpts and headings with a cumulative completion
            line. Current granularity: {analytics?.timelineGranularity ?? '...'}.
        </p>

        {analytics && analytics.timeline.length > 0 ? (
            <ChartContainer className="mt-4 h-[360px] w-full" config={progressChartConfig}>
                <ComposedChart accessibilityLayer data={analytics.timeline}>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="label" minTickGap={24} tickLine={false} tickMargin={10} />
                    <YAxis axisLine={false} tickLine={false} tickMargin={10} yAxisId="left" />
                    <YAxis
                        axisLine={false}
                        domain={[0, 100]}
                        orientation="right"
                        tickFormatter={(value) => `${value}%`}
                        tickLine={false}
                        tickMargin={10}
                        yAxisId="right"
                    />
                    <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                        dataKey="excerpts"
                        fill="var(--color-excerpts)"
                        radius={[4, 4, 0, 0]}
                        stackId="activity"
                        yAxisId="left"
                    />
                    <Bar
                        dataKey="headings"
                        fill="var(--color-headings)"
                        radius={[4, 4, 0, 0]}
                        stackId="activity"
                        yAxisId="left"
                    />
                    <Line
                        dataKey="completionPercent"
                        dot={false}
                        stroke="var(--color-completionPercent)"
                        strokeWidth={2}
                        type="monotone"
                        yAxisId="right"
                    />
                </ComposedChart>
            </ChartContainer>
        ) : (
            <div className="mt-4 rounded-lg border bg-muted/20 p-6 text-muted-foreground text-sm">
                No translation activity found yet.
            </div>
        )}
    </div>
);

const TranslatorDistributionCard = ({
    analytics,
}: {
    analytics: NonNullable<AnalyticsPageData['analytics']> | null;
}) => {
    const translatorChartData =
        analytics?.translators.map((translator, index) => ({
            ...translator,
            fill: translatorColors[index % translatorColors.length],
        })) ?? [];

    return (
        <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold text-base">Translator Distribution</h2>
            <p className="mt-1 text-muted-foreground text-sm">
                Counts translated segments across excerpts, headings, and footnotes by translator. Long-tail translators
                are grouped into <code>Other</code> for readability.
            </p>

            {analytics && translatorChartData.length > 0 ? (
                <>
                    <ChartContainer className="mt-4 h-[300px] w-full" config={{ count: { label: 'Segments' } }}>
                        <PieChart accessibilityLayer>
                            <ChartTooltip
                                content={<ChartTooltipContent hideIndicator labelKey="label" nameKey="label" />}
                            />
                            <Pie
                                data={translatorChartData}
                                dataKey="count"
                                innerRadius={62}
                                nameKey="label"
                                outerRadius={100}
                                paddingAngle={2}
                            >
                                {translatorChartData.map((entry) => (
                                    <Cell key={entry.id} fill={entry.fill} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ChartContainer>

                    <div className="mt-4 space-y-2">
                        {translatorChartData.map((entry) => (
                            <div
                                key={entry.id}
                                className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: entry.fill }}
                                    />
                                    <span className="font-medium">{entry.label}</span>
                                </div>
                                <span className="text-muted-foreground">
                                    {entry.count.toLocaleString()} ({entry.percent.toFixed(1)}%)
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="mt-4 rounded-lg border bg-muted/20 p-6 text-muted-foreground text-sm">
                    No translator distribution available yet.
                </div>
            )}
        </div>
    );
};

const DuplicateTranslationsCard = ({
    analytics,
}: {
    analytics: NonNullable<AnalyticsPageData['analytics']> | null;
}) => {
    const duplicateChartData = analytics?.duplicateTranslationAltCountDistribution ?? [];

    return (
        <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold text-base">Duplicate Translation Distribution</h2>
            <p className="mt-1 text-muted-foreground text-sm">
                Tracks compilation targets with alternative translations stored in <code>meta.alt</code>.
            </p>

            {analytics && duplicateChartData.length > 0 ? (
                <>
                    <ChartContainer className="mt-4 h-[280px] w-full" config={{ segments: { label: 'Segments' } }}>
                        <ComposedChart accessibilityLayer data={duplicateChartData}>
                            <CartesianGrid vertical={false} />
                            <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={10} />
                            <ChartTooltip content={<ChartTooltipContent hideIndicator labelKey="label" />} />
                            <Bar dataKey="segments" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                    </ChartContainer>

                    <div className="mt-4 space-y-2">
                        {duplicateChartData.map((entry) => (
                            <div
                                key={entry.altCount}
                                className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                            >
                                <span className="font-medium">{entry.label}</span>
                                <span className="text-muted-foreground">
                                    {entry.segments.toLocaleString()} segments
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="mt-4 rounded-lg border bg-muted/20 p-6 text-muted-foreground text-sm">
                    No duplicate translations stored yet.
                </div>
            )}
        </div>
    );
};

const PatchDistributionCard = ({ analytics }: { analytics: NonNullable<AnalyticsPageData['analytics']> | null }) => {
    const patchChartData = analytics?.patchTypeDistribution ?? [];

    return (
        <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold text-base">Patch Type Distribution</h2>
            <p className="mt-1 text-muted-foreground text-sm">
                Counts compilation targets with <code>meta.patched</code>, grouped by patch type.
            </p>

            {analytics && patchChartData.length > 0 ? (
                <>
                    <ChartContainer className="mt-4 h-[280px] w-full" config={{ count: { label: 'Patches' } }}>
                        <ComposedChart accessibilityLayer data={patchChartData}>
                            <CartesianGrid vertical={false} />
                            <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={10} />
                            <ChartTooltip content={<ChartTooltipContent hideIndicator labelKey="label" />} />
                            <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                    </ChartContainer>

                    <div className="mt-4 space-y-2">
                        {patchChartData.map((entry) => (
                            <div
                                key={entry.type}
                                className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                            >
                                <span className="font-medium">{entry.label}</span>
                                <span className="text-muted-foreground">{entry.count.toLocaleString()} patches</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="mt-4 rounded-lg border bg-muted/20 p-6 text-muted-foreground text-sm">
                    No patch metadata stored yet.
                </div>
            )}
        </div>
    );
};

const AnalyticsPage = ({ data }: AnalyticsPageProps) => {
    const analytics = data.analytics;
    const translatedPercent =
        analytics && analytics.totalSegments > 0
            ? ((analytics.translatedSegments / analytics.totalSegments) * 100).toFixed(1)
            : analytics
              ? '0.0'
              : '...';

    return (
        <>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Analytics</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
                {data.error ? <p className="text-destructive text-sm">{data.error}</p> : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        helper={analytics ? `${translatedPercent}% complete` : undefined}
                        label="Translated Segments"
                        value={analytics?.translatedSegments.toLocaleString() ?? '...'}
                        valueClassName="text-green-700"
                    />
                    <MetricCard
                        label="Remaining Untranslated"
                        value={analytics?.untranslatedSegments.toLocaleString() ?? '...'}
                        valueClassName="text-amber-700"
                    />
                    <MetricCard
                        helper="Across the compilation"
                        label="Unique Translators"
                        value={analytics?.uniqueTranslators.toLocaleString() ?? '...'}
                    />
                    <MetricCard
                        helper={
                            analytics
                                ? `${analytics.timeline.length.toLocaleString()} active ${analytics.timelineGranularity}${analytics.timeline.length === 1 ? '' : 's'}`
                                : undefined
                        }
                        label="Total Segments"
                        value={analytics?.totalSegments.toLocaleString() ?? '...'}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        helper="Compilation targets with meta.alt"
                        label="Segments With Duplicates"
                        value={analytics?.duplicateTranslationSegmentCount.toLocaleString() ?? '...'}
                    />
                    <MetricCard
                        helper="Total alternative translations stored"
                        label="Duplicate Translations"
                        value={analytics?.duplicateTranslationsTotal.toLocaleString() ?? '...'}
                    />
                    <MetricCard
                        helper="Compilation targets with meta.patched"
                        label="Patched Segments"
                        value={analytics?.patchCount.toLocaleString() ?? '...'}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <ProgressChartCard analytics={analytics} />
                    <TranslatorDistributionCard analytics={analytics} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <DuplicateTranslationsCard analytics={analytics} />
                    <PatchDistributionCard analytics={analytics} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard label="Created" value={formatUnixSecondsToUtcString(analytics?.createdAt)} />
                    <MetricCard label="Last Updated" value={formatUnixSecondsToUtcString(analytics?.lastUpdatedAt)} />
                    <MetricCard
                        label="Elapsed Work Span"
                        value={formatDurationSeconds(analytics?.workDurationSeconds)}
                    />
                </div>
            </div>
        </>
    );
};

export default AnalyticsPage;
