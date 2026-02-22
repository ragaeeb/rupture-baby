import type { Excerpt } from '@/lib/compilation';

type SelectionPreviewSectionProps = {
    promptTokens: number;
    selectedItems: Excerpt[];
};

const SelectionPreviewSection = ({ promptTokens, selectedItems }: SelectionPreviewSectionProps) => (
    <aside className="rounded border p-4">
        <h2 className="font-semibold text-lg">Selection Preview</h2>
        <p className="mt-1 text-neutral-600 text-sm">Prompt tokens: ~{promptTokens.toLocaleString()}</p>
        <ul className="mt-4 space-y-3">
            {selectedItems.slice(0, 8).map((item) => (
                <li key={item.id} className="rounded border p-3">
                    <p className="font-mono text-neutral-500 text-xs">{item.id}</p>
                    <p className="mt-1 line-clamp-4 text-sm">{item.nass}</p>
                </li>
            ))}
        </ul>
        {selectedItems.length > 8 ? (
            <p className="mt-3 text-neutral-500 text-xs">Showing first 8 of {selectedItems.length} selected.</p>
        ) : null}
    </aside>
);

export default SelectionPreviewSection;
