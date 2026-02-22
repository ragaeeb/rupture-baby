import { TRANSLATION_MODELS } from '@/lib/translation-models';

import type { PromptOption } from '@/app/_lib/translation-picker-types';

type ConfigPanelProps = {
    modelId: string;
    maxIds: number;
    promptId: string;
    promptOptions: PromptOption[];
    onModelChange: (nextValue: string) => void;
    onMaxIdsChange: (rawValue: string) => void;
    onPromptChange: (nextValue: string) => void;
};

const ConfigPanel = ({
    modelId,
    maxIds,
    promptId,
    promptOptions,
    onModelChange,
    onMaxIdsChange,
    onPromptChange,
}: ConfigPanelProps) => (
    <div className="mt-6 grid gap-4 rounded border bg-white p-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
            Model
            <select className="rounded border px-3 py-2" value={modelId} onChange={(event) => onModelChange(event.target.value)}>
                {TRANSLATION_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                        [{model.id}] {model.label}
                    </option>
                ))}
            </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
            Max IDs to display
            <input
                type="number"
                min={1}
                max={2000}
                className="rounded border px-3 py-2"
                value={maxIds}
                onChange={(event) => onMaxIdsChange(event.target.value)}
            />
        </label>

        <label className="flex flex-col gap-2 text-sm md:col-span-2">
            Prompt
            <select className="rounded border px-3 py-2" value={promptId} onChange={(event) => onPromptChange(event.target.value)}>
                {promptOptions.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                        [{prompt.id}] {prompt.name}
                    </option>
                ))}
            </select>
        </label>
    </div>
);

export default ConfigPanel;
