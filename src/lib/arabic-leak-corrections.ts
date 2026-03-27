import type { ArabicLeakCorrection } from './shell-types';
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

const replaceAllLiteral = (text: string, searchValue: string, replaceValue: string) => {
    if (!searchValue) {
        return { nextText: text, replacementCount: 0, replacementRanges: [] as Range[] };
    }

    let cursor = 0;
    let nextText = '';
    let replacementCount = 0;
    const replacementRanges: Range[] = [];

    while (cursor <= text.length) {
        const matchIndex = text.indexOf(searchValue, cursor);
        if (matchIndex === -1) {
            nextText += text.slice(cursor);
            return { nextText, replacementCount, replacementRanges };
        }

        nextText += text.slice(cursor, matchIndex);
        const replacementStart = nextText.length;
        nextText += replaceValue;
        replacementRanges.push({ end: replacementStart + replaceValue.length, start: replacementStart });
        replacementCount += 1;
        cursor = matchIndex + searchValue.length;
    }

    return { nextText, replacementCount, replacementRanges };
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
) => {
    let nextText = text;
    let rowChanged = false;
    const replacementRanges: Range[] = [];
    const issues: string[] = [];

    for (const correction of corrections) {
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
        replacementRanges.push(...replacementResult.replacementRanges);
        rowChanged = true;
    }

    return { issues, nextText, replacementRanges, rowChanged };
};
