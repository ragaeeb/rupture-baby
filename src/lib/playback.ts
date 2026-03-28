import type { AITranslation, Compilation, Excerpt, ExcerptMetadata, Heading } from '@/types/compilation';

type CompilationCollectionKey = 'excerpts' | 'footnotes' | 'headings';
type PlaybackTarget = Excerpt | Heading;
export type PlaybackTargetLocator = { collection: CompilationCollectionKey; index: number };
type PlaybackTargetLocatorMap = Map<string, PlaybackTargetLocator[]>;

const getPlaybackTargetTranslation = (excerpt: Excerpt): AITranslation => ({
    lastUpdatedAt: excerpt.lastUpdatedAt,
    text: excerpt.text,
    translator: excerpt.translator,
});

const withAlternativeTranslation = (target: PlaybackTarget, alternative: AITranslation): PlaybackTarget => {
    const currentMeta: ExcerptMetadata = target.meta ?? {};
    return { ...target, meta: { ...currentMeta, alt: [...(currentMeta.alt ?? []), alternative] } };
};

export const buildPlaybackTargetLocatorMap = (compilation: Compilation): PlaybackTargetLocatorMap => {
    const locatorMap = new Map<string, PlaybackTargetLocator[]>();

    const registerTarget = (collection: CompilationCollectionKey, target: PlaybackTarget, index: number) => {
        const locators = locatorMap.get(target.id) ?? [];
        locators.push({ collection, index });
        locatorMap.set(target.id, locators);
    };

    compilation.excerpts.forEach((excerpt, index) => registerTarget('excerpts', excerpt, index));
    compilation.headings.forEach((heading, index) => registerTarget('headings', heading, index));
    compilation.footnotes.forEach((footnote, index) => registerTarget('footnotes', footnote, index));

    return locatorMap;
};

export const getCompilationDuplicateTargetIds = (compilation: Compilation) =>
    [...buildPlaybackTargetLocatorMap(compilation).entries()]
        .filter(([, locators]) => locators.length > 1)
        .map(([id, targets]) => ({ id, targets }))
        .sort((left, right) => left.id.localeCompare(right.id));

const getCompilationTarget = (
    compilation: Pick<Compilation, 'excerpts' | 'footnotes' | 'headings'>,
    locator: PlaybackTargetLocator,
): PlaybackTarget => compilation[locator.collection][locator.index];

const setCompilationTarget = (
    compilation: Pick<Compilation, 'excerpts' | 'footnotes' | 'headings'>,
    locator: PlaybackTargetLocator,
    target: PlaybackTarget,
) => {
    compilation[locator.collection][locator.index] = target as never;
};

export const applyExcerptsToCompilation = (compilation: Compilation, excerpts: Excerpt[]) => {
    const unknownTranslator = excerpts.find((excerpt) => !excerpt.translator);

    if (unknownTranslator) {
        throw new Error(`${unknownTranslator.id} has no translator`);
    }

    const nextCompilation: Compilation = {
        ...compilation,
        excerpts: [...compilation.excerpts],
        footnotes: [...compilation.footnotes],
        headings: [...compilation.headings],
    };
    const duplicateTargetIds = getCompilationDuplicateTargetIds(nextCompilation);
    if (duplicateTargetIds.length > 0) {
        throw new Error(
            `Compilation contains duplicate target IDs: ${duplicateTargetIds.map((item) => item.id).join(', ')}`,
        );
    }
    const targetLocatorMap = buildPlaybackTargetLocatorMap(nextCompilation);
    const seenPrimaryExcerptIds = new Set<string>();

    for (const excerpt of excerpts) {
        const locators = targetLocatorMap.get(excerpt.id);

        if (!locators || locators.length === 0) {
            throw new Error(`${excerpt.id} not found in compilation.`);
        }

        const locator = locators[0];
        const currentTarget = getCompilationTarget(nextCompilation, locator);

        if (!seenPrimaryExcerptIds.has(excerpt.id)) {
            if (currentTarget.text) {
                throw new Error(`${excerpt.id} is already translated!`);
            }

            setCompilationTarget(nextCompilation, locator, {
                ...currentTarget,
                lastUpdatedAt: excerpt.lastUpdatedAt,
                text: excerpt.text,
                translator: excerpt.translator,
            });
            seenPrimaryExcerptIds.add(excerpt.id);
            continue;
        }

        setCompilationTarget(
            nextCompilation,
            locator,
            withAlternativeTranslation(currentTarget, getPlaybackTargetTranslation(excerpt)),
        );
    }

    return nextCompilation;
};
