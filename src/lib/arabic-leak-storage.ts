import type { ArabicLeakCorrection } from './shell-types';
import type { RupturePatchMetadata } from './translation-patches';

export const ARABIC_LEAK_STORAGE_KEY = 'rupture.arabicLeakCorrections';

type ArabicLeakObservationMetadata = RupturePatchMetadata & {
    excerptId: string;
    filePath: string;
    match: string;
};

type ArabicLeakObservation = {
    metadata: ArabicLeakObservationMetadata;
    response: string;
};

type ArabicLeakCacheEntry = {
    observations: ArabicLeakObservation[];
    responses: string[];
};

type ArabicLeakCacheMap = Record<string, ArabicLeakCacheEntry>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeArabicLeakKey = (value: string) => value.trim();

const isArabicLeakObservationMetadata = (value: unknown): value is ArabicLeakObservationMetadata => {
    if (!isRecord(value) || !isRecord(value.source)) {
        return false;
    }

    return (
        typeof value.appliedAt === 'string' &&
        typeof value.excerptId === 'string' &&
        typeof value.filePath === 'string' &&
        typeof value.match === 'string' &&
        value.source.kind === 'llm' &&
        typeof value.source.model === 'string' &&
        (value.source.provider === 'cloudflare' ||
            value.source.provider === 'google' ||
            value.source.provider === 'huggingface' ||
            value.source.provider === 'openrouter') &&
        value.source.task === 'arabic_leak_correction' &&
        (typeof value.source.modelVersion === 'string' || typeof value.source.modelVersion === 'undefined')
    );
};

const readArabicLeakCache = (): ArabicLeakCacheMap => {
    if (typeof window === 'undefined') {
        return {};
    }

    const rawValue = window.localStorage.getItem(ARABIC_LEAK_STORAGE_KEY);
    if (!rawValue) {
        return {};
    }

    try {
        const parsed = JSON.parse(rawValue) as unknown;
        if (!isRecord(parsed)) {
            return {};
        }

        const entries = Object.entries(parsed).flatMap(([match, entry]) => {
            const normalizedMatch = normalizeArabicLeakKey(match);
            if (normalizedMatch.length === 0 || !isRecord(entry)) {
                return [];
            }

            const responses = Array.isArray(entry.responses)
                ? entry.responses.filter((response): response is string => typeof response === 'string' && response.trim().length > 0)
                : [];
            const observations = Array.isArray(entry.observations)
                ? entry.observations
                      .filter(
                          (observation): observation is ArabicLeakObservation =>
                              isRecord(observation) &&
                              typeof observation.response === 'string' &&
                              observation.response.trim().length > 0 &&
                              isArabicLeakObservationMetadata(observation.metadata),
                      )
                      .map((observation) => ({
                          metadata: observation.metadata,
                          response: observation.response.trim(),
                      }))
                : [];

            if (responses.length === 0 && observations.length === 0) {
                return [];
            }

            return [
                [
                    normalizedMatch,
                    {
                        observations,
                        responses: [...new Set([...responses.map((response) => response.trim()), ...observations.map((observation) => observation.response)])],
                    },
                ] as const,
            ];
        });

        return Object.fromEntries(entries) as ArabicLeakCacheMap;
    } catch {
        return {};
    }
};

const writeArabicLeakCache = (cache: ArabicLeakCacheMap) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(ARABIC_LEAK_STORAGE_KEY, JSON.stringify(cache));
};

export const storeArabicLeakCorrections = ({
    corrections,
    patchMetadata,
}: {
    corrections: ArabicLeakCorrection[];
    patchMetadata: RupturePatchMetadata;
}) => {
    if (typeof window === 'undefined' || corrections.length === 0) {
        return;
    }

    const nextCache = { ...readArabicLeakCache() };

    for (const correction of corrections) {
        const normalizedMatch = normalizeArabicLeakKey(correction.match);
        const normalizedResponse = correction.replacement.trim();

        if (normalizedMatch.length === 0 || normalizedResponse.length === 0) {
            continue;
        }

        const currentEntry: ArabicLeakCacheEntry = nextCache[normalizedMatch] ?? { observations: [], responses: [] };
        const metadata: ArabicLeakObservationMetadata = {
            ...patchMetadata,
            excerptId: correction.id,
            filePath: correction.filePath,
            match: normalizedMatch,
        };

        currentEntry.observations = [...currentEntry.observations, { metadata, response: normalizedResponse }];
        currentEntry.responses = [...new Set([...currentEntry.responses, normalizedResponse])];
        nextCache[normalizedMatch] = currentEntry;
    }

    writeArabicLeakCache(nextCache);
};
