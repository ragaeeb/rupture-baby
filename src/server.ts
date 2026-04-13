import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

let didRunStartupLogging = false;

const runStartupLogging = async () => {
    if (didRunStartupLogging) {
        return;
    }

    didRunStartupLogging = true;

    const { getShiftSettingsInfo } = await import('./lib/shift-cache');
    console.info('[shift] settings', await getShiftSettingsInfo());
};

void runStartupLogging().catch((error) => {
    console.error('[shift] settings failed', error);
});

export default createServerEntry({
    async fetch(request, options) {
        return handler.fetch(request, options);
    },
});
