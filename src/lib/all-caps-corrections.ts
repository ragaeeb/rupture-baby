import type { AllCapsCorrection } from './shell-types';
import type { RuptureHighlight } from './translation-patches';
import type { Range } from './validation/types';

const UPPERCASE_LETTER_PATTERN = /\p{Lu}/u;
const LOWERCASE_LETTER_PATTERN = /\p{Ll}/u;

const countOccurrences = (text: string, needle: string) => {
    if (!needle) {
        return 0;
    }

    let count = 0;
    let startIndex = 0;

    while (startIndex <= text.length) {
        const matchIndex = text.indexOf(needle, startIndex);
        if (matchIndex === -1) {
            return count;
        }

        count += 1;
        startIndex = matchIndex + needle.length;
    }

    return count;
};

const replaceAllLiteral = (
    text: string,
    searchValue: string,
    replaceValue: string,
): { nextText: string; replacementHighlights: RuptureHighlight[]; replacementRanges: Range[] } => {
    if (!searchValue) {
        return { nextText: text, replacementHighlights: [], replacementRanges: [] };
    }

    let cursor = 0;
    let nextText = '';
    const replacementRanges: Range[] = [];
    const replacementHighlights: RuptureHighlight[] = [];

    while (cursor <= text.length) {
        const matchIndex = text.indexOf(searchValue, cursor);
        if (matchIndex === -1) {
            nextText += text.slice(cursor);
            return { nextText, replacementHighlights, replacementRanges };
        }

        nextText += text.slice(cursor, matchIndex);
        const replacementStart = nextText.length;
        nextText += replaceValue;
        const range = { end: replacementStart + replaceValue.length, start: replacementStart };
        replacementRanges.push(range);
        replacementHighlights.push({ range, title: searchValue });
        cursor = matchIndex + searchValue.length;
    }

    return { nextText, replacementHighlights, replacementRanges };
};

const looksLikeAllCaps = (text: string) => {
    if (!UPPERCASE_LETTER_PATTERN.test(text)) {
        return false;
    }

    return !LOWERCASE_LETTER_PATTERN.test(text);
};

const matchesAnyHint = (match: string, matchHints: string[]) => {
    if (matchHints.length === 0) {
        return true;
    }

    return matchHints.some((hint) => hint.trim().length > 0 && match.trim() === hint.trim());
};

export const applyAllCapsCorrectionsToText = (
    excerptId: string,
    text: string,
    corrections: AllCapsCorrection[],
    matchHints: string[] = [],
): {
    issues: string[];
    nextText: string;
    replacementHighlights: RuptureHighlight[];
    replacementRanges: Range[];
    rowChanged: boolean;
} => {
    let nextText = text;
    let rowChanged = false;
    const replacementHighlights: RuptureHighlight[] = [];
    const replacementRanges: Range[] = [];
    const issues: string[] = [];
    const seenCorrections = new Set<string>();

    for (const correction of corrections) {
        const correctionKey = `${correction.match}\u0000${correction.replacement}`;
        if (seenCorrections.has(correctionKey)) {
            continue;
        }
        seenCorrections.add(correctionKey);

        if (!looksLikeAllCaps(correction.match)) {
            issues.push(`Skipping non-ALL-CAPS correction "${correction.match}" in excerpt ${excerptId}.`);
            continue;
        }

        if (!matchesAnyHint(correction.match, matchHints)) {
            issues.push(`Skipping unmatched ALL-CAPS correction "${correction.match}" in excerpt ${excerptId}.`);
            continue;
        }

        const occurrenceCount = countOccurrences(nextText, correction.match);
        if (occurrenceCount === 0) {
            issues.push(`Could not find "${correction.match}" in excerpt ${excerptId}.`);
            continue;
        }

        const replacementResult = replaceAllLiteral(nextText, correction.match, correction.replacement);
        nextText = replacementResult.nextText;
        replacementHighlights.push(...replacementResult.replacementHighlights);
        replacementRanges.push(...replacementResult.replacementRanges);
        rowChanged = true;
    }

    return { issues, nextText, replacementHighlights, replacementRanges, rowChanged };
};
