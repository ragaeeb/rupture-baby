'use client';

import { ClickToEditText } from '@/components/translations/click-to-edit-text';
import { TranslationTextContent } from '@/components/translations/translation-text-content';
import type { RuptureHighlight } from '@/lib/translation-patches';
import type { Range } from '@/lib/validation/types';

type EditableTranslationContentProps = {
    ariaLabel: string;
    buttonClassName: string;
    editable: boolean;
    isEditing: boolean;
    onCommit: (nextText: string) => void;
    onStartEditing: () => void;
    onStopEditing: () => void;
    patchHighlights?: RuptureHighlight[];
    text: string;
    textClassName: string;
    textareaClassName: string;
    validationHighlightRanges?: Range[];
};

export const EditableTranslationContent = ({
    ariaLabel,
    buttonClassName,
    editable,
    isEditing,
    onCommit,
    onStartEditing,
    onStopEditing,
    patchHighlights = [],
    text,
    textClassName,
    textareaClassName,
    validationHighlightRanges = [],
}: EditableTranslationContentProps) => {
    const displayValue = (
        <TranslationTextContent
            patchHighlights={patchHighlights}
            text={text}
            textClassName=""
            validationHighlightRanges={validationHighlightRanges}
        />
    );

    return (
        <ClickToEditText
            ariaLabel={ariaLabel}
            buttonClassName={buttonClassName}
            displayValue={displayValue}
            editable={editable}
            isEditing={isEditing}
            onCommit={onCommit}
            onStartEditing={onStartEditing}
            onStopEditing={onStopEditing}
            textClassName={textClassName}
            textareaClassName={textareaClassName}
            value={text}
        />
    );
};
