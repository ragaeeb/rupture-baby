export type ThinkingTimeRange = '10_to_30s' | '1m_plus' | '30_to_60s' | 'all' | 'lt_10s';

export const THINKING_TIME_RANGE_OPTIONS: Array<{ label: string; value: ThinkingTimeRange }> = [
    { label: 'All', value: 'all' },
    { label: '< 10s', value: 'lt_10s' },
    { label: '10s to 30s', value: '10_to_30s' },
    { label: '30s to 1m', value: '30_to_60s' },
    { label: '1m+', value: '1m_plus' },
];

export const THINKING_TIME_BUCKETS = THINKING_TIME_RANGE_OPTIONS.filter(
    (option): option is { label: string; value: Exclude<ThinkingTimeRange, 'all'> } => option.value !== 'all',
);

export const getThinkingTimeRange = (durationSeconds: number | undefined): Exclude<ThinkingTimeRange, 'all'> | null => {
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
        return null;
    }

    if (durationSeconds < 10) {
        return 'lt_10s';
    }

    if (durationSeconds < 30) {
        return '10_to_30s';
    }

    if (durationSeconds < 60) {
        return '30_to_60s';
    }

    return '1m_plus';
};
