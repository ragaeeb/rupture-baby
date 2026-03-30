import {
    getConversationSourceSegments,
    parseTranslationToCommon,
    validateConversationExcerpts,
} from './translation-parser';
import { applyRupturePatchesToSegments, normalizeRupturePatchesForSegments } from './translation-patches';
import { parseTranslationsInOrder } from './validation/textUtils';

export type TranslationValidityAnalysis = {
    baseTranslatedById: Map<string, string>;
    model: string | undefined;
    parsed: ReturnType<typeof parseTranslationToCommon>;
    patchedExcerptIds: Set<string>;
    translatedById: Map<string, string>;
    validation: ReturnType<typeof validateConversationExcerpts>;
};

export const analyzeTranslationValidity = (content: string): TranslationValidityAnalysis => {
    const parsed = parseTranslationToCommon(JSON.parse(content));
    const baseTranslatedSegments = parseTranslationsInOrder(parsed.response);
    const sourceSegments = getConversationSourceSegments(parsed);
    const patchTargetSegments = sourceSegments.map((segment) => ({
        id: segment.id,
        text: baseTranslatedSegments.find((translated) => translated.id === segment.id)?.text ?? '',
    }));
    const savedPatches = normalizeRupturePatchesForSegments(patchTargetSegments, parsed.__rupture?.patches);
    const patchedExcerptIds = new Set(Object.keys(savedPatches ?? {}));
    const translatedSegments = applyRupturePatchesToSegments(patchTargetSegments, savedPatches);
    const patchedResponse = translatedSegments.map((segment) => `${segment.id} - ${segment.text}`).join('\n\n');
    const validation = validateConversationExcerpts({ ...parsed, response: patchedResponse });

    return {
        baseTranslatedById: new Map(baseTranslatedSegments.map((segment) => [segment.id, segment.text] as const)),
        model: parsed.model,
        parsed,
        patchedExcerptIds,
        translatedById: new Map(translatedSegments.map((segment) => [segment.id, segment.text] as const)),
        validation,
    };
};

export const getVisibleTranslationValidityErrors = (analysis: TranslationValidityAnalysis) =>
    analysis.validation.validationErrors.filter((error) => !error.id || !analysis.patchedExcerptIds.has(error.id));

export const isTranslationValidityAnalysisInvalid = (analysis: TranslationValidityAnalysis) =>
    getVisibleTranslationValidityErrors(analysis).length > 0;
