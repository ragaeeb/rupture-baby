export const register = async () => {
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    const { getGoogleAssistModel } = await import('./lib/llm/providers/google');
    console.info('[google-genai] startup', { configuredModel: getGoogleAssistModel() });
};
