import {
    getConversationSourceSegments,
    parseTranslationToCommon,
    validateExcerptsAgainstSourceSegments,
} from './translation-parser';
import { applyRupturePatchesToSegments, normalizeRupturePatchesForSegments } from './translation-patches';
import { parseTranslationsInOrder } from './validation/textUtils';

export type TranslationValidityAnalysis = {
    baseTranslatedById: Map<string, string>;
    model: string | undefined;
    parsed: ReturnType<typeof parseTranslationToCommon>;
    patchedExcerptIds: Set<string>;
    skippedExcerptIds: Set<string>;
    translatedById: Map<string, string>;
    validation: ReturnType<typeof validateExcerptsAgainstSourceSegments>;
};

export const getSkippedExcerptIds = (parsed: ReturnType<typeof parseTranslationToCommon>) =>
    new Set(
        Array.isArray(parsed.__rupture?.skip)
            ? parsed.__rupture.skip.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            : [],
    );

export const analyzeTranslationValidity = (content: string): TranslationValidityAnalysis => {
    const parsed = parseTranslationToCommon(JSON.parse(content));
    const baseTranslatedSegments = parseTranslationsInOrder(parsed.response);
    const baseTranslatedById = new Map(baseTranslatedSegments.map((segment) => [segment.id, segment.text] as const));
    const sourceSegments = getConversationSourceSegments(parsed, baseTranslatedSegments);
    const patchTargetSegments = sourceSegments.map((segment) => ({
        id: segment.id,
        text: baseTranslatedById.get(segment.id) ?? '',
    }));
    const savedPatches = normalizeRupturePatchesForSegments(patchTargetSegments, parsed.__rupture?.patches);
    const patchedExcerptIds = new Set(Object.keys(savedPatches ?? {}));
    const skippedExcerptIds = getSkippedExcerptIds(parsed);
    const translatedSegments = applyRupturePatchesToSegments(patchTargetSegments, savedPatches);
    // Include a segment for validation if it is not skipped, OR if it is skipped but has
    // non-empty translated content so content errors (e.g. arabic_leak) are still captured.
    const segmentsForValidation = new Set(
        translatedSegments
            .filter((segment) => !skippedExcerptIds.has(segment.id) || segment.text.length > 0)
            .map((segment) => segment.id),
    );
    const validationArabicSegments = sourceSegments.filter((segment) => segmentsForValidation.has(segment.id));
    const validationTranslatedSegments = translatedSegments.filter((segment) => segmentsForValidation.has(segment.id));
    const patchedResponse = validationTranslatedSegments
        .map((segment) => `${segment.id} - ${segment.text}`)
        .join('\n\n');
    const validation = validateExcerptsAgainstSourceSegments(validationArabicSegments, patchedResponse, parsed);

    return {
        baseTranslatedById,
        model: parsed.model,
        parsed,
        patchedExcerptIds,
        skippedExcerptIds,
        translatedById: new Map(translatedSegments.map((segment) => [segment.id, segment.text] as const)),
        validation,
    };
};

export const getVisibleTranslationValidityErrors = (analysis: TranslationValidityAnalysis) =>
    analysis.validation.validationErrors.filter(
        (error) =>
            !error.id || (!analysis.patchedExcerptIds.has(error.id) && !analysis.skippedExcerptIds.has(error.id)),
    );

export const getPlayableTranslationExcerpts = (analysis: TranslationValidityAnalysis) =>
    analysis.validation.excerpts.filter((excerpt) => !analysis.skippedExcerptIds.has(excerpt.id));

export const isTranslationValidityAnalysisInvalid = (analysis: TranslationValidityAnalysis) =>
    getVisibleTranslationValidityErrors(analysis).length > 0;
