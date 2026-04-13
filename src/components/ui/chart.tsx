'use client';

import * as React from 'react';
import { Legend, type LegendProps, ResponsiveContainer, Tooltip, type TooltipProps } from 'recharts';

import { cn } from '@/lib/utils';

export type ChartConfig = Record<
    string,
    {
        color?: string;
        icon?: React.ComponentType<{ className?: string }>;
        label?: React.ReactNode;
        theme?: { dark?: string; light?: string };
    }
>;

type ChartContextValue = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextValue | null>(null);

const useChart = () => {
    const context = React.useContext(ChartContext);

    if (!context) {
        throw new Error('Chart components must be rendered inside <ChartContainer>.');
    }

    return context;
};

type ChartContainerProps = React.ComponentProps<'div'> & { config: ChartConfig };

type ChartDatum = {
    color?: string;
    dataKey?: string | number;
    name?: string | number;
    payload?: Record<string, unknown>;
    value?: number | string;
};

const getChartItemFill = (item: ChartDatum, configEntry?: ChartConfig[string]) => {
    const payloadFill =
        item.payload && 'fill' in item.payload && typeof item.payload.fill === 'string' ? item.payload.fill : undefined;

    return item.color ?? payloadFill ?? configEntry?.color ?? 'currentColor';
};

const getChartItemLabel = ({
    configEntry,
    item,
    nameKey,
}: {
    configEntry?: ChartConfig[string];
    item: ChartDatum;
    nameKey?: string;
}) => {
    const nameOverride = nameKey && item.payload ? item.payload[nameKey] : undefined;

    return nameOverride ?? configEntry?.label ?? item.name ?? item.dataKey ?? 'Value';
};

const ChartTooltipRow = ({
    hideIndicator,
    indicator,
    item,
    nameKey,
}: {
    hideIndicator: boolean;
    indicator: 'dashed' | 'dot' | 'line';
    item: ChartDatum;
    nameKey?: string;
}) => {
    const { config } = useChart();
    const itemKey = String(item.dataKey ?? item.name ?? '');
    const configEntry = config[itemKey];
    const fill = getChartItemFill(item, configEntry);
    const label = getChartItemLabel({ configEntry, item, nameKey });
    const indicatorClass =
        indicator === 'line'
            ? 'h-2 w-4 rounded-full'
            : indicator === 'dashed'
              ? 'h-0.5 w-4 border-t border-dashed bg-transparent'
              : 'h-2 w-2 rounded-full';
    const indicatorStyle = indicator === 'dashed' ? { borderTopColor: fill } : { backgroundColor: fill };
    const value = typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value ?? '');

    return (
        <div className="flex items-center gap-2">
            {!hideIndicator ? <span className={cn(indicatorClass)} style={indicatorStyle} /> : null}
            <span className="text-muted-foreground">{String(label)}</span>
            <span className="ml-auto font-medium">{value}</span>
        </div>
    );
};

const ChartLegendEntry = ({ item, nameKey }: { item: ChartDatum; nameKey?: string }) => {
    const { config } = useChart();
    const itemKey = String(item.dataKey ?? item.value ?? '');
    const configEntry = config[itemKey];
    const label = getChartItemLabel({ configEntry, item, nameKey });
    const fill = getChartItemFill(item, configEntry);

    return (
        <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fill }} />
            <span className="text-muted-foreground">{String(label)}</span>
        </div>
    );
};

export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
    ({ children, className, config, style, ...props }, ref) => {
        const [isMounted, setIsMounted] = React.useState(false);
        const [size, setSize] = React.useState({ height: 0, width: 0 });
        const localRef = React.useRef<HTMLDivElement | null>(null);
        const cssVars = Object.fromEntries(
            Object.entries(config).map(([key, value]) => [
                `--color-${key}`,
                value.color ?? value.theme?.light ?? 'var(--chart-1)',
            ]),
        ) as React.CSSProperties;

        React.useEffect(() => {
            setIsMounted(true);
        }, []);

        React.useEffect(() => {
            const element = localRef.current;
            if (!element || typeof ResizeObserver === 'undefined') {
                return;
            }

            const updateSize = () => {
                const nextWidth = element.clientWidth;
                const nextHeight = element.clientHeight;
                setSize((current) =>
                    current.width === nextWidth && current.height === nextHeight
                        ? current
                        : { height: nextHeight, width: nextWidth },
                );
            };

            updateSize();
            const observer = new ResizeObserver(() => {
                updateSize();
            });
            observer.observe(element);

            return () => {
                observer.disconnect();
            };
        }, []);

        const setRefs = (node: HTMLDivElement | null) => {
            localRef.current = node;

            if (typeof ref === 'function') {
                ref(node);
                return;
            }

            if (ref) {
                ref.current = node;
            }
        };

        const canRenderChart = isMounted && size.width > 0 && size.height > 0;

        return (
            <ChartContext.Provider value={{ config }}>
                <div
                    ref={setRefs}
                    className={cn('relative min-w-0', className)}
                    style={{ ...cssVars, ...style }}
                    {...props}
                >
                    {canRenderChart ? (
                        <ResponsiveContainer width="100%" height="100%">
                            {children}
                        </ResponsiveContainer>
                    ) : null}
                </div>
            </ChartContext.Provider>
        );
    },
);

ChartContainer.displayName = 'ChartContainer';

type ChartTooltipProps = TooltipProps<any, any> & { content?: React.ReactElement };

export const ChartTooltip = ({ content, cursor = false, ...props }: ChartTooltipProps) => (
    <Tooltip content={content} cursor={cursor} {...props} />
);

type ChartTooltipContentProps = {
    active?: boolean;
    hideIndicator?: boolean;
    hideLabel?: boolean;
    indicator?: 'dashed' | 'dot' | 'line';
    label?: number | string;
    labelKey?: string;
    nameKey?: string;
    payload?: ChartDatum[];
};

export const ChartTooltipContent = ({
    active,
    hideIndicator = false,
    hideLabel = false,
    indicator = 'dot',
    label,
    labelKey,
    nameKey,
    payload,
}: ChartTooltipContentProps) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const firstPayload = payload[0];
    const labelValue =
        labelKey && firstPayload?.payload && typeof firstPayload.payload === 'object'
            ? (firstPayload.payload as Record<string, unknown>)[labelKey]
            : label;
    const labelText = typeof labelValue === 'string' || typeof labelValue === 'number' ? String(labelValue) : null;

    return (
        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
            {!hideLabel && labelText ? <p className="mb-2 font-medium text-muted-foreground">{labelText}</p> : null}
            <div className="space-y-1">
                {payload.map((item) => (
                    <ChartTooltipRow
                        hideIndicator={hideIndicator}
                        indicator={indicator}
                        item={item as ChartDatum}
                        key={String(item.dataKey ?? item.name ?? '') || String(item.name)}
                        nameKey={nameKey}
                    />
                ))}
            </div>
        </div>
    );
};

type ChartLegendProps = LegendProps & { content?: React.ReactElement };

export const ChartLegend = ({ content, ...props }: ChartLegendProps) => <Legend content={content} {...props} />;

type ChartLegendContentProps = { payload?: ChartDatum[]; nameKey?: string };

export const ChartLegendContent = ({ payload, nameKey }: ChartLegendContentProps) => {
    if (!payload || payload.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-3 text-sm">
            {payload.map((item) => {
                return (
                    <ChartLegendEntry
                        item={item as ChartDatum}
                        key={String(item.dataKey ?? item.value ?? '') || String(item.value)}
                        nameKey={nameKey}
                    />
                );
            })}
        </div>
    );
};
