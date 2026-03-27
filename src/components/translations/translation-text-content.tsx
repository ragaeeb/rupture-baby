import type { ReactNode } from 'react';

import type { Range } from '@/lib/validation/types';

type HighlightTone = 'amber' | 'destructive';

type TextHighlight = { range: Range; tone: HighlightTone };

const renderHighlightedText = (text: string, highlights: TextHighlight[]): ReactNode => {
    const activeHighlights = highlights.filter((highlight) => highlight.range.start < highlight.range.end);

    if (activeHighlights.length === 0) {
        return text;
    }

    const boundaries = new Set<number>([0, text.length]);
    for (const highlight of activeHighlights) {
        boundaries.add(highlight.range.start);
        boundaries.add(highlight.range.end);
    }

    const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
    const nodes: ReactNode[] = [];

    for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
        const start = orderedBoundaries[index];
        const end = orderedBoundaries[index + 1];

        if (start === undefined || end === undefined || start === end) {
            continue;
        }

        const slice = text.slice(start, end);
        const activeTone = activeHighlights.find(
            (highlight) => highlight.range.start <= start && highlight.range.end >= end,
        )?.tone;

        if (!activeTone) {
            nodes.push(slice);
            continue;
        }

        const className =
            activeTone === 'destructive'
                ? 'rounded-sm bg-destructive/15 px-0.5 font-semibold text-destructive ring-1 ring-destructive/30 ring-inset'
                : 'rounded-sm bg-amber-200/60 px-0.5 font-semibold text-amber-950 ring-1 ring-amber-400/40 ring-inset';

        nodes.push(
            <span key={`${start}-${end}-${slice}`} className={className}>
                {slice}
            </span>,
        );
    }

    return nodes;
};

type TranslationTextContentProps = {
    patchHighlightRanges?: Range[];
    text: string;
    textClassName?: string;
    validationHighlightRanges?: Range[];
};

export const TranslationTextContent = ({
    patchHighlightRanges = [],
    text,
    textClassName = 'whitespace-pre-wrap',
    validationHighlightRanges = [],
}: TranslationTextContentProps) => {
    return (
        <div className={textClassName}>
            {renderHighlightedText(text, [
                ...validationHighlightRanges.map((range) => ({ range, tone: 'destructive' as const })),
                ...patchHighlightRanges.map((range) => ({ range, tone: 'amber' as const })),
            ])}
        </div>
    );
};
