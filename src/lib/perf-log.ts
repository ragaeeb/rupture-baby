import '@tanstack/react-start/server-only';

type PerfLogLevel = 'error' | 'info';
type PerfLogPayload = Record<string, unknown>;

const PERF_LOG_ENV = 'RUPTURE_PERF_LOG';
const PERF_LOG_FILTER_ENV = 'RUPTURE_PERF_LOG_FILTER';

const isTruthy = (value: string | undefined) => {
    if (!value) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const getScopeFilter = () => {
    const rawFilter = process.env[PERF_LOG_FILTER_ENV];
    if (!rawFilter) {
        return null;
    }

    const values = rawFilter
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    return values.length > 0 ? new Set(values) : null;
};

export const isPerfLoggingEnabled = (scope?: string) => {
    if (!isTruthy(process.env[PERF_LOG_ENV])) {
        return false;
    }

    const filter = getScopeFilter();
    if (!filter || !scope) {
        return true;
    }

    return filter.has(scope);
};

export const perfLog = (scope: string, event: string, payload: PerfLogPayload = {}, level: PerfLogLevel = 'info') => {
    if (!isPerfLoggingEnabled(scope)) {
        return;
    }

    const logger = level === 'error' ? console.error : console.log;
    logger('[perf]', { ...payload, event, pid: process.pid, scope, ts: new Date().toISOString() });
};

export const createPerfTimer = (scope: string, event: string, payload: PerfLogPayload = {}) => {
    const enabled = isPerfLoggingEnabled(scope);
    const startedAt = enabled ? performance.now() : 0;

    if (enabled) {
        perfLog(scope, `${event}:start`, payload);
    }

    return {
        end(extra: PerfLogPayload = {}, level: PerfLogLevel = 'info') {
            if (!enabled) {
                return;
            }

            perfLog(
                scope,
                `${event}:end`,
                { ...payload, ...extra, durationMs: Math.round(performance.now() - startedAt) },
                level,
            );
        },
    };
};

export const withPerfSpan = async <T>(
    scope: string,
    event: string,
    run: () => Promise<T>,
    payload: PerfLogPayload = {},
): Promise<T> => {
    const timer = createPerfTimer(scope, event, payload);

    try {
        const result = await run();
        timer.end();
        return result;
    } catch (error) {
        timer.end({ error: error instanceof Error ? error.message : String(error) }, 'error');
        throw error;
    }
};
