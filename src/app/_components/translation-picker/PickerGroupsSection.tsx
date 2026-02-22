import type { TranslationApiResponse } from '@/app/_lib/translation-picker-types';

type PickerGroupsSectionProps = {
    picker: TranslationApiResponse['picker'];
    selectedIdsLookup: Set<string>;
    onClearSelection: () => void;
    onSelectEndIndex: (index: number) => void;
};

const PickerGroupsSection = ({ picker, selectedIdsLookup, onClearSelection, onSelectEndIndex }: PickerGroupsSectionProps) => (
    <section className="rounded border p-4">
        <h2 className="font-semibold text-lg">Picker Groups</h2>
        <p className="mt-1 text-neutral-600 text-sm">
            {picker.availableTotal.toLocaleString()} untranslated items, showing {picker.displayedTotal.toLocaleString()}.
        </p>
        <p className="mt-1 font-mono text-blue-700 text-sm">
            Selected: {picker.selectedCount} • ~{picker.selectedTokenCount.toLocaleString()} tokens
        </p>
        <div className="mt-3">
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={onClearSelection}>
                Clear Selection
            </button>
        </div>

        <div className="mt-4 overflow-hidden rounded border">
            <table className="w-full">
                <tbody>
                    {picker.tokenGroups.map((group) => (
                        <tr key={group.label} className="border-b last:border-b-0">
                            <td className="w-28 border-r bg-neutral-50 px-3 py-2 align-top text-sm">{group.label}</td>
                            <td className="p-3">
                                <div className="flex flex-wrap gap-2">
                                    {group.ids.map((id) => {
                                        const index = picker.displayedIds.indexOf(id);
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                className={`rounded border px-2 py-1 font-mono text-xs ${
                                                    selectedIdsLookup.has(id)
                                                        ? 'border-blue-500 bg-blue-100'
                                                        : 'border-neutral-300 bg-white'
                                                }`}
                                                onClick={() => onSelectEndIndex(index)}
                                            >
                                                {id}
                                            </button>
                                        );
                                    })}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

export default PickerGroupsSection;
