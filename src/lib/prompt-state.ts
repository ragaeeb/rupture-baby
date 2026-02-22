import { getPrompts } from 'wobble-bibble';

type PromptOption = {
    id: string;
    name: string;
    content: string;
    isMaster?: boolean;
};

const PROMPT_OPTIONS = getPrompts() as PromptOption[];

const DEFAULT_PROMPT =
    PROMPT_OPTIONS.find((prompt) => prompt.isMaster) ?? PROMPT_OPTIONS[0] ?? { id: 'none', name: 'None', content: '' };

let selectedPromptId = DEFAULT_PROMPT.id;
let selectedPromptContent = DEFAULT_PROMPT.content;

export const getPromptOptions = (): PromptOption[] => PROMPT_OPTIONS;

export const getSelectedPrompt = () => ({
    content: selectedPromptContent,
    id: selectedPromptId,
});

export const setSelectedPromptById = (promptId: string) => {
    const selected = PROMPT_OPTIONS.find((prompt) => prompt.id === promptId);
    if (!selected) {
        return null;
    }

    selectedPromptId = selected.id;
    selectedPromptContent = selected.content;
    return selected;
};
