import type { ThinkingTimeRange } from '@/lib/reasoning-time';
import { isFileViewMode } from '@/lib/translation-file-view-model';

export type BrowseStatusFilter = 'invalid' | 'valid';

export type RootSearch = Record<string, unknown> & {
    model?: string;
    status?: BrowseStatusFilter;
    thinkingTime?: Exclude<ThinkingTimeRange, 'all'>;
};

export type TranslationRouteSearch = RootSearch & { view?: 'json' | 'normal' | 'normalized' };

type SearchRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SearchRecord => typeof value === 'object' && value !== null;

export const toSearchRecord = (value: unknown): SearchRecord => (isRecord(value) ? { ...value } : {});

export const sanitizeSearch = <T extends SearchRecord>(value: T): T =>
    Object.fromEntries(
        Object.entries(value).filter(
            ([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '',
        ),
    ) as T;

export const parseBrowseSearch = (value: unknown): RootSearch => {
    const search = toSearchRecord(value) as RootSearch;
    const model = typeof search.model === 'string' && search.model.trim().length > 0 ? search.model.trim() : undefined;
    const status = search.status === 'valid' || search.status === 'invalid' ? search.status : undefined;
    const thinkingTime =
        search.thinkingTime === 'lt_10s' ||
        search.thinkingTime === '10_to_30s' ||
        search.thinkingTime === '30_to_60s' ||
        search.thinkingTime === '1m_plus'
            ? search.thinkingTime
            : undefined;

    if (model) {
        search.model = model;
    } else {
        delete search.model;
    }

    if (status) {
        search.status = status;
    } else {
        delete search.status;
    }

    if (thinkingTime) {
        search.thinkingTime = thinkingTime;
    } else {
        delete search.thinkingTime;
    }

    return sanitizeSearch(search);
};

export const pickBrowseFilters = (value: unknown) => {
    const search = parseBrowseSearch(value);
    return sanitizeSearch({ model: search.model, status: search.status, thinkingTime: search.thinkingTime });
};

export const mergeBrowseFilters = (
    value: unknown,
    nextFilters: {
        model?: string | 'all';
        status?: 'all' | BrowseStatusFilter;
        thinkingTime?: 'all' | Exclude<ThinkingTimeRange, 'all'>;
    },
) => {
    const search = parseBrowseSearch(value);

    if (nextFilters.model !== undefined) {
        if (nextFilters.model === 'all') {
            delete search.model;
        } else {
            search.model = nextFilters.model;
        }
    }

    if (nextFilters.status !== undefined) {
        if (nextFilters.status === 'all') {
            delete search.status;
        } else {
            search.status = nextFilters.status;
        }
    }

    if (nextFilters.thinkingTime !== undefined) {
        if (nextFilters.thinkingTime === 'all') {
            delete search.thinkingTime;
        } else {
            search.thinkingTime = nextFilters.thinkingTime;
        }
    }

    return sanitizeSearch(search);
};

export const parseTranslationRouteSearch = (value: unknown): TranslationRouteSearch => {
    const search = parseBrowseSearch(value) as TranslationRouteSearch;
    const rawSearch = toSearchRecord(value);

    const candidateView = typeof rawSearch.view === 'string' ? rawSearch.view : null;

    if (isFileViewMode(candidateView) && candidateView !== 'table') {
        search.view = candidateView;
    } else {
        delete search.view;
    }

    return sanitizeSearch(search);
};
