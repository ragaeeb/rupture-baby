import type { ArabicLeakCorrection } from './shell-types';
import type { RuptureHighlight } from './translation-patches';
import type { Range } from './validation/types';

const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]/;

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
): {
    nextText: string;
    replacementCount: number;
    replacementHighlights: RuptureHighlight[];
    replacementRanges: Range[];
} => {
    if (!searchValue) {
        return {
            nextText: text,
            replacementCount: 0,
            replacementHighlights: [] as RuptureHighlight[],
            replacementRanges: [] as Range[],
        };
    }

    let cursor = 0;
    let nextText = '';
    let replacementCount = 0;
    const replacementRanges: Range[] = [];
    const replacementHighlights: RuptureHighlight[] = [];

    while (cursor <= text.length) {
        const matchIndex = text.indexOf(searchValue, cursor);
        if (matchIndex === -1) {
            nextText += text.slice(cursor);
            return { nextText, replacementCount, replacementHighlights, replacementRanges };
        }

        nextText += text.slice(cursor, matchIndex);
        const replacementStart = nextText.length;
        nextText += replaceValue;
        const range = { end: replacementStart + replaceValue.length, start: replacementStart };
        replacementRanges.push(range);
        replacementHighlights.push({ range, title: searchValue });
        replacementCount += 1;
        cursor = matchIndex + searchValue.length;
    }

    return { nextText, replacementCount, replacementHighlights, replacementRanges };
};

const containsArabicScript = (text: string) => ARABIC_SCRIPT_PATTERN.test(text.replace(/ﷺ/g, ''));

const matchesAnyLeakHint = (match: string, leakHints: string[]) => {
    if (leakHints.length === 0) {
        return true;
    }

    return leakHints.some((hint) => {
        const normalizedHint = hint.trim();
        return normalizedHint.length > 0 && (match.includes(normalizedHint) || normalizedHint.includes(match));
    });
};

export const applyArabicLeakCorrectionsToText = (
    excerptId: string,
    text: string,
    corrections: ArabicLeakCorrection[],
    leakHints: string[] = [],
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

        if (!containsArabicScript(correction.match)) {
            issues.push(`Skipping non-Arabic correction "${correction.match}" in excerpt ${excerptId}.`);
            continue;
        }

        if (!matchesAnyLeakHint(correction.match, leakHints)) {
            issues.push(`Skipping unmatched Arabic correction "${correction.match}" in excerpt ${excerptId}.`);
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
