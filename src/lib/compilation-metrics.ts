import type { CompilationAnalyticsResponse } from '@/lib/shell-types';
import { roundToDecimal } from '@/lib/time';
import { getTranslationModelById } from '@/lib/translation-models';
import type { PatchedTranslationMetadata } from '@/types/compilation';

type TimelineGranularity = CompilationAnalyticsResponse['timelineGranularity'];
type TimelineBucket = { excerpts: number; headings: number };
type PatchType = PatchedTranslationMetadata['type'];

export type CountBucket = { total: number; translated: number; untranslated: number };
export type CompilationStats = {
    createdAt: number | null;
    excerpts: CountBucket;
    headings: CountBucket;
    lastUpdatedAt: number | null;
    totalSegments: number;
    translatedSegments: number;
    untranslatedSegments: number;
    uniqueTranslators: number;
    workDurationMs: number | null;
};

const MAX_VISIBLE_TRANSLATOR_SLICES = 8;
const MS_PER_DAY = 86_400_000;
const dayLabelFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabelFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC', year: 'numeric' });

const toUtcDate = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);

const formatDayLabel = (dayKey: string) => dayLabelFormatter.format(toUtcDate(dayKey));

const formatWeekLabel = (dayKey: string) => `Week of ${dayLabelFormatter.format(toUtcDate(dayKey))}`;

const formatMonthLabel = (dayKey: string) => monthLabelFormatter.format(toUtcDate(dayKey));

const getTimelineGranularity = (dailyBuckets: Map<string, TimelineBucket>): TimelineGranularity => {
    const dayKeys = [...dailyBuckets.keys()].sort((left, right) => left.localeCompare(right));
    if (dayKeys.length <= 1) {
        return 'day';
    }

    const firstDay = toUtcDate(dayKeys[0]).getTime();
    const lastDay = toUtcDate(dayKeys.at(-1) ?? dayKeys[0]).getTime();
    const spanDays = Math.floor((lastDay - firstDay) / MS_PER_DAY) + 1;

    if (spanDays > 365) {
        return 'month';
    }

    if (spanDays > 90) {
        return 'week';
    }

    return 'day';
};

const getWeekStartDayKey = (dayKey: string) => {
    const date = toUtcDate(dayKey);
    const dayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayOffset);
    return date.toISOString().slice(0, 10);
};

const getMonthStartDayKey = (dayKey: string) => {
    const date = toUtcDate(dayKey);
    date.setUTCDate(1);
    return date.toISOString().slice(0, 10);
};

const downsampleTimelineBuckets = (
    dailyBuckets: Map<string, TimelineBucket>,
    granularity: TimelineGranularity,
): Map<string, TimelineBucket> => {
    if (granularity === 'day') {
        return dailyBuckets;
    }

    const groupedBuckets = new Map<string, TimelineBucket>();

    for (const [dayKey, bucket] of dailyBuckets.entries()) {
        const groupedKey = granularity === 'week' ? getWeekStartDayKey(dayKey) : getMonthStartDayKey(dayKey);
        const groupedBucket = groupedBuckets.get(groupedKey) ?? { excerpts: 0, headings: 0 };
        groupedBucket.excerpts += bucket.excerpts;
        groupedBucket.headings += bucket.headings;
        groupedBuckets.set(groupedKey, groupedBucket);
    }

    return groupedBuckets;
};

const formatTimelineLabel = (dayKey: string, granularity: TimelineGranularity) => {
    if (granularity === 'week') {
        return formatWeekLabel(dayKey);
    }

    if (granularity === 'month') {
        return formatMonthLabel(dayKey);
    }

    return formatDayLabel(dayKey);
};

const buildTranslatorDistribution = (translatorCounts: Map<string, number>) => {
    const totalTranslatorUses = [...translatorCounts.values()].reduce((sum, count) => sum + count, 0);
    const sortedEntries = [...translatorCounts.entries()].sort(
        ([leftId, leftCount], [rightId, rightCount]) => rightCount - leftCount || leftId.localeCompare(rightId),
    );
    const visibleEntries =
        sortedEntries.length > MAX_VISIBLE_TRANSLATOR_SLICES
            ? [
                  ...sortedEntries.slice(0, MAX_VISIBLE_TRANSLATOR_SLICES - 1),
                  [
                      'other',
                      sortedEntries.slice(MAX_VISIBLE_TRANSLATOR_SLICES - 1).reduce((sum, [, count]) => sum + count, 0),
                  ] as const,
              ]
            : sortedEntries;

    return visibleEntries.map(([id, count]) => {
        if (id === 'other') {
            const hiddenTranslatorCount = Math.max(0, sortedEntries.length - (MAX_VISIBLE_TRANSLATOR_SLICES - 1));
            return {
                count,
                id,
                label: `Other (${hiddenTranslatorCount})`,
                percent: totalTranslatorUses > 0 ? roundToDecimal((count / totalTranslatorUses) * 100, 1) : 0,
            };
        }

        const model = getTranslationModelById(id);
        return {
            count,
            id,
            label: model?.label ?? `Translator ${id}`,
            percent: totalTranslatorUses > 0 ? roundToDecimal((count / totalTranslatorUses) * 100, 1) : 0,
        };
    });
};

export const summarizeCompilationStats = ({
    createdAt,
    excerptStats,
    headingStats,
    lastUpdatedAt,
    uniqueTranslators,
}: {
    createdAt: number | null;
    excerptStats: CountBucket;
    headingStats: CountBucket;
    lastUpdatedAt: number | null;
    uniqueTranslators: number;
}): CompilationStats => {
    const translatedSegments = excerptStats.translated + headingStats.translated;
    const untranslatedSegments = excerptStats.untranslated + headingStats.untranslated;
    const totalSegments = excerptStats.total + headingStats.total;

    return {
        createdAt,
        excerpts: excerptStats,
        headings: headingStats,
        lastUpdatedAt,
        totalSegments,
        translatedSegments,
        uniqueTranslators,
        untranslatedSegments,
        workDurationMs: createdAt !== null && lastUpdatedAt !== null ? Math.max(0, lastUpdatedAt - createdAt) : null,
    };
};

export const summarizeCompilationAnalytics = ({
    createdAt,
    dailyBuckets,
    duplicateAltCountDistribution,
    duplicateTranslationSegmentCount,
    duplicateTranslationsTotal,
    headingsSummary,
    lastUpdatedAt,
    patchCount,
    patchTypeCounts,
    excerptsSummary,
    translatorCounts,
}: {
    createdAt: number | null;
    dailyBuckets: Map<string, TimelineBucket>;
    duplicateAltCountDistribution: Map<number, number>;
    duplicateTranslationSegmentCount: number;
    duplicateTranslationsTotal: number;
    headingsSummary: CountBucket;
    lastUpdatedAt: number | null;
    patchCount: number;
    patchTypeCounts: Map<PatchType, number>;
    excerptsSummary: CountBucket;
    translatorCounts: Map<string, number>;
}): CompilationAnalyticsResponse => {
    const totalSegments = excerptsSummary.total + headingsSummary.total;
    const translatedSegments = excerptsSummary.translated + headingsSummary.translated;
    const untranslatedSegments = excerptsSummary.untranslated + headingsSummary.untranslated;
    const timelineGranularity = getTimelineGranularity(dailyBuckets);
    const timelineBuckets = downsampleTimelineBuckets(dailyBuckets, timelineGranularity);

    let cumulativeTranslated = 0;
    const timeline = [...timelineBuckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, bucket]) => {
            const translated = bucket.excerpts + bucket.headings;
            cumulativeTranslated += translated;

            return {
                completionPercent:
                    totalSegments > 0 ? roundToDecimal((cumulativeTranslated / totalSegments) * 100, 1) : 0,
                cumulativeTranslated,
                date,
                excerpts: bucket.excerpts,
                headings: bucket.headings,
                label: formatTimelineLabel(date, timelineGranularity),
                translated,
            };
        });

    const duplicateTranslationAltCountDistribution = [...duplicateAltCountDistribution.entries()]
        .sort(([leftAltCount], [rightAltCount]) => leftAltCount - rightAltCount)
        .map(([altCount, segments]) => ({ altCount, label: `${altCount} alt${altCount === 1 ? '' : 's'}`, segments }));

    const patchTypeDistribution = [...patchTypeCounts.entries()]
        .sort(
            ([leftType, leftCount], [rightType, rightCount]) =>
                rightCount - leftCount || leftType.localeCompare(rightType),
        )
        .map(([type, count]) => ({
            count,
            label: type === 'arabic_leak_correction' ? 'Arabic Leak' : 'All Caps',
            type,
        }));

    return {
        createdAt,
        duplicateTranslationAltCountDistribution,
        duplicateTranslationSegmentCount,
        duplicateTranslationsTotal,
        lastUpdatedAt,
        patchCount,
        patchTypeDistribution,
        timeline,
        timelineGranularity,
        totalSegments,
        translatedSegments,
        translators: buildTranslatorDistribution(translatorCounts),
        uniqueTranslators: translatorCounts.size,
        untranslatedSegments,
        workDurationSeconds:
            createdAt !== null && lastUpdatedAt !== null ? Math.max(0, lastUpdatedAt - createdAt) : null,
    };
};
