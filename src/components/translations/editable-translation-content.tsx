'use client';

import { ClickToEditText } from '@/components/translations/click-to-edit-text';
import { TranslationTextContent } from '@/components/translations/translation-text-content';
import type { Range } from '@/lib/validation/types';

type EditableTranslationContentProps = {
    ariaLabel: string;
    buttonClassName: string;
    editable: boolean;
    isEditing: boolean;
    onCommit: (nextText: string) => void;
    onStartEditing: () => void;
    onStopEditing: () => void;
    patchHighlightRanges?: Range[];
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
    patchHighlightRanges = [],
    text,
    textClassName,
    textareaClassName,
    validationHighlightRanges = [],
}: EditableTranslationContentProps) => {
    const displayValue = (
        <TranslationTextContent
            patchHighlightRanges={patchHighlightRanges}
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
