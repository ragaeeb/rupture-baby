import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

let didRunStartupLogging = false;

const runStartupLogging = async () => {
    if (didRunStartupLogging) {
        return;
    }

    didRunStartupLogging = true;

    const { getTranslationAssistProviderInfo } = await import('./lib/llm');
    console.info('[llm] startup', await getTranslationAssistProviderInfo());
};

export default createServerEntry({
    async fetch(request, options) {
        await runStartupLogging();
        return handler.fetch(request, options);
    },
});
