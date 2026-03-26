'use client';

import { type ReactNode, useEffect, useRef } from 'react';

type ClickToEditTextProps = {
    ariaLabel: string;
    buttonClassName: string;
    displayValue: ReactNode;
    editable: boolean;
    isEditing: boolean;
    onCommit: (nextText: string) => void;
    onStartEditing: () => void;
    onStopEditing: () => void;
    textClassName: string;
    textareaClassName: string;
    value: string;
};

export const ClickToEditText = ({
    ariaLabel,
    buttonClassName,
    displayValue,
    editable,
    isEditing,
    onCommit,
    onStartEditing,
    onStopEditing,
    textClassName,
    textareaClassName,
    value,
}: ClickToEditTextProps) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!isEditing || !textarea) {
            return;
        }

        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, [isEditing]);

    if (!editable) {
        return <div className={textClassName}>{displayValue}</div>;
    }

    if (isEditing) {
        return (
            <textarea
                ref={textareaRef}
                aria-label={ariaLabel}
                className={textareaClassName}
                defaultValue={value}
                onBlur={(event) => {
                    onCommit(event.currentTarget.value);
                    onStopEditing();
                }}
                onInput={(event) => {
                    const textarea = event.currentTarget;
                    textarea.style.height = 'auto';
                    textarea.style.height = `${textarea.scrollHeight}px`;
                }}
                rows={1}
            />
        );
    }

    return (
        <button aria-label={ariaLabel} className={buttonClassName} onClick={onStartEditing} type="button">
            <div className={textClassName}>{displayValue}</div>
        </button>
    );
};
