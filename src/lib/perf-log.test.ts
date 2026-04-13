import { afterEach, describe, expect, it, mock } from 'bun:test';

import { createPerfTimer, isPerfLoggingEnabled, perfLog } from './perf-log';

const PERF_LOG_ENV = 'RUPTURE_PERF_LOG';
const PERF_LOG_FILTER_ENV = 'RUPTURE_PERF_LOG_FILTER';

describe('isPerfLoggingEnabled', () => {
    afterEach(() => {
        delete process.env[PERF_LOG_ENV];
        delete process.env[PERF_LOG_FILTER_ENV];
    });

    it('should stay disabled by default', () => {
        expect(isPerfLoggingEnabled()).toBe(false);
        expect(isPerfLoggingEnabled('analytics')).toBe(false);
    });

    it('should enable logging for all scopes when the env flag is truthy', () => {
        process.env[PERF_LOG_ENV] = '1';

        expect(isPerfLoggingEnabled()).toBe(true);
        expect(isPerfLoggingEnabled('analytics')).toBe(true);
        expect(isPerfLoggingEnabled('browse')).toBe(true);
    });

    it('should respect the scope filter when present', () => {
        process.env[PERF_LOG_ENV] = 'true';
        process.env[PERF_LOG_FILTER_ENV] = 'analytics, translations';

        expect(isPerfLoggingEnabled('analytics')).toBe(true);
        expect(isPerfLoggingEnabled('translations')).toBe(true);
        expect(isPerfLoggingEnabled('browse')).toBe(false);
    });
});

describe('perfLog', () => {
    afterEach(() => {
        delete process.env[PERF_LOG_ENV];
        delete process.env[PERF_LOG_FILTER_ENV];
        mock.restore();
    });

    it('should emit structured logs when enabled', () => {
        process.env[PERF_LOG_ENV] = '1';
        const logSpy = mock(() => {});
        console.log = logSpy as typeof console.log;

        perfLog('analytics', 'cache_hit', { cache: 'memory' });
        const calls = logSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(calls[0]?.[0]).toBe('[perf]');
        expect(calls[0]?.[1]).toMatchObject({ cache: 'memory', event: 'cache_hit', scope: 'analytics' });
    });

    it('should include duration when a timer ends', () => {
        process.env[PERF_LOG_ENV] = '1';
        const logSpy = mock(() => {});
        console.log = logSpy as typeof console.log;

        const timer = createPerfTimer('analytics', 'load_page', { route: '/analytics' });
        timer.end({ source: 'snapshot' });
        const calls = logSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;

        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(calls[1]?.[1]).toMatchObject({
            durationMs: expect.any(Number),
            event: 'load_page:end',
            route: '/analytics',
            scope: 'analytics',
            source: 'snapshot',
        });
    });
});
