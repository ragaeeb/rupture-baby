import '@tanstack/react-start/server-only';

import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { estimateTokenCount } from 'bitaboom';
import { strToU8, zipSync } from 'fflate';
import { parser } from 'stream-json';

import {
    type CompilationExportProviderId,
    DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_COMPILATION_EXPORT_PROVIDER,
    DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
} from '@/lib/compilation-export-shared';
import { requireCompilationFilePath } from '@/lib/data-paths';
import { withPerfSpan } from '@/lib/perf-log';
import { getSelectedPrompt } from '@/lib/prompt-state';
import type {
    CompilationExportChunkSummary,
    CompilationExportPageData,
    CompilationExportPlan,
} from '@/lib/shell-types';

type ExportCollectionKey = 'excerpts' | 'headings';
type JsonToken = { name: string; value?: string };
type JsonAssembler = { consume: (chunk: JsonToken) => unknown; current: unknown; done: boolean };
type ExportAttachmentItem = { id: string; nass: string };
type ExportStreamItem = ExportAttachmentItem & { collection: ExportCollectionKey };
type ExportChunk = {
    estimatedTokens: number;
    excerptCount: number;
    excerpts?: ExportAttachmentItem[];
    firstId: string | null;
    headingCount: number;
    headings?: ExportAttachmentItem[];
    itemCount: number;
    lastId: string | null;
};
type ExportChunkBuilder = ExportChunk & { tokenCount: number };
type ExportArtifacts = { chunks?: ExportChunk[]; plan: CompilationExportPlan };

const EXPORT_PROMPT_FILENAME_SUFFIX = 'translation-prompt.txt';
const EXPORT_MANIFEST_FILENAME_SUFFIX = 'translation-export-manifest.json';
const EXPORT_ZIP_FILENAME_SUFFIX = 'translation-export.zip';

class SimpleJsonAssembler implements JsonAssembler {
    current: unknown = null;
    done = true;
    private key: string | null = null;
    private stack: Array<{ current: Record<string, unknown> | unknown[]; key: string | null }> = [];

    consume(chunk: JsonToken) {
        switch (chunk.name) {
            case 'keyValue':
                this.key = chunk.value ?? null;
                return;
            case 'startObject':
                this.startContainer({});
                return;
            case 'startArray':
                this.startContainer([]);
                return;
            case 'stringValue':
                this.saveValue(chunk.value ?? '');
                return;
            case 'numberValue':
                this.saveValue(Number(chunk.value ?? 0));
                return;
            case 'nullValue':
                this.saveValue(null);
                return;
            case 'trueValue':
                this.saveValue(true);
                return;
            case 'falseValue':
                this.saveValue(false);
                return;
            case 'endObject':
            case 'endArray':
                this.finishContainer();
                return;
        }
    }

    private startContainer(value: Record<string, unknown> | unknown[]) {
        if (this.done) {
            this.current = value;
            this.done = false;
            this.key = null;
            return;
        }

        this.stack.push({ current: this.current as Record<string, unknown> | unknown[], key: this.key });
        this.current = value;
        this.key = null;
    }

    private finishContainer() {
        if (this.stack.length === 0) {
            this.done = true;
            return;
        }

        const value = this.current;
        const parent = this.stack.pop();
        if (!parent) {
            this.done = true;
            return;
        }

        this.current = parent.current;
        this.key = parent.key;
        this.saveValue(value);
    }

    private saveValue(value: unknown) {
        if (this.done) {
            this.current = value;
            return;
        }

        if (Array.isArray(this.current)) {
            this.current.push(value);
            return;
        }

        if (this.key) {
            (this.current as Record<string, unknown>)[this.key] = value;
            this.key = null;
        }
    }
}

const isExportCollectionKey = (value: string | null): value is ExportCollectionKey =>
    value === 'excerpts' || value === 'headings';

const getBunFileStream = (filePath: string): Readable | null => {
    const bunRuntime = (
        globalThis as unknown as { Bun?: { file: (target: string) => { stream: () => ReadableStream<Uint8Array> } } }
    ).Bun;

    if (!process.versions.bun || !bunRuntime?.file) {
        return null;
    }

    return Readable.fromWeb(bunRuntime.file(filePath).stream() as unknown as NodeReadableStream);
};

const getInputStream = (filePath: string): Readable => {
    const bunStream = getBunFileStream(filePath);
    if (bunStream) {
        return bunStream;
    }

    return createReadStream(filePath);
};

const toAttachmentItem = (value: unknown): ExportAttachmentItem | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const candidate = value as { id?: unknown; nass?: unknown };
    if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
        return null;
    }

    if (typeof candidate.nass !== 'string') {
        return null;
    }

    return { id: candidate.id.trim(), nass: candidate.nass };
};

type ExportTraversalState = {
    activeCollection: ExportCollectionKey | null;
    currentTopLevelKey: string | null;
    depth: number;
    itemAssembler: JsonAssembler | null;
    itemCollection: ExportCollectionKey | null;
};

const createExportTraversalState = (): ExportTraversalState => ({
    activeCollection: null,
    currentTopLevelKey: null,
    depth: 0,
    itemAssembler: null,
    itemCollection: null,
});

const finalizeExportItem = (state: ExportTraversalState, chunk: JsonToken, visit: (item: ExportStreamItem) => void) => {
    state.itemAssembler?.consume(chunk);
    if (!state.itemAssembler?.done || !state.itemCollection) {
        return;
    }

    const item = toAttachmentItem(state.itemAssembler.current);
    if (item) {
        visit({ ...item, collection: state.itemCollection });
    }
    state.itemAssembler = null;
    state.itemCollection = null;
};

const handleExportTraversalChunk = (
    state: ExportTraversalState,
    chunk: JsonToken,
    visit: (item: ExportStreamItem) => void,
) => {
    if (state.itemAssembler) {
        finalizeExportItem(state, chunk, visit);
        return;
    }

    if (chunk.name === 'keyValue' && state.depth === 1) {
        state.currentTopLevelKey = chunk.value ?? null;
        return;
    }

    if (chunk.name === 'startArray' && state.depth === 1 && isExportCollectionKey(state.currentTopLevelKey)) {
        state.activeCollection = state.currentTopLevelKey;
        state.currentTopLevelKey = null;
        return;
    }

    if (chunk.name === 'startObject' && state.activeCollection && state.depth === 2) {
        state.itemAssembler = new SimpleJsonAssembler();
        state.itemCollection = state.activeCollection;
        state.itemAssembler.consume(chunk);
    }
};

const updateExportTraversalDepth = (state: ExportTraversalState, chunk: JsonToken) => {
    if (chunk.name === 'startObject' || chunk.name === 'startArray') {
        state.depth += 1;
        return;
    }

    if (chunk.name === 'endObject' || chunk.name === 'endArray') {
        state.depth -= 1;
        if (chunk.name === 'endArray' && state.activeCollection && state.depth === 1) {
            state.activeCollection = null;
        }
    }
};

const iterateCompilationExportItems = async (
    filePath: string,
    visit: (item: ExportStreamItem) => void,
): Promise<void> => {
    const tokenStream = getInputStream(filePath).pipe(parser.asStream());
    const traversalState = createExportTraversalState();

    for await (const chunk of tokenStream as AsyncIterable<JsonToken>) {
        handleExportTraversalChunk(traversalState, chunk, visit);
        updateExportTraversalDepth(traversalState, chunk);
    }
};

const createChunkPayload = ({
    chunkIndex,
    excerpts,
    headings,
    promptId,
}: {
    chunkIndex: number;
    excerpts: ExportAttachmentItem[];
    headings: ExportAttachmentItem[];
    promptId: string;
}) => ({ chunkIndex, excerpts, headings, promptId });

const estimateChunkBaseTokens = (promptId: string, provider: CompilationExportProviderId, promptTokens: number) =>
    promptTokens +
    estimateTokenCount(
        JSON.stringify(createChunkPayload({ chunkIndex: 1, excerpts: [], headings: [], promptId })),
        provider,
    );

const estimateItemTokens = (item: ExportAttachmentItem, provider: CompilationExportProviderId) =>
    estimateTokenCount(JSON.stringify(item), provider) + 1;

const createChunkBuilder = (includeItems: boolean): ExportChunkBuilder => ({
    estimatedTokens: 0,
    excerptCount: 0,
    ...(includeItems ? { excerpts: [] as ExportAttachmentItem[] } : {}),
    firstId: null,
    headingCount: 0,
    ...(includeItems ? { headings: [] as ExportAttachmentItem[] } : {}),
    itemCount: 0,
    lastId: null,
    tokenCount: 0,
});

const appendItemToChunk = ({
    chunk,
    item,
    itemTokens,
}: {
    chunk: ExportChunkBuilder;
    item: ExportStreamItem;
    itemTokens: number;
}) => {
    chunk.firstId ??= item.id;
    chunk.lastId = item.id;
    chunk.itemCount += 1;
    chunk.tokenCount += itemTokens;

    if (item.collection === 'excerpts') {
        chunk.excerptCount += 1;
        chunk.excerpts?.push({ id: item.id, nass: item.nass });
        return;
    }

    chunk.headingCount += 1;
    chunk.headings?.push({ id: item.id, nass: item.nass });
};

const finalizeChunk = ({
    chunk,
    chunkBaseTokens,
}: {
    chunk: ExportChunkBuilder;
    chunkBaseTokens: number;
}): ExportChunk => ({
    estimatedTokens: chunkBaseTokens + chunk.tokenCount,
    excerptCount: chunk.excerptCount,
    ...(chunk.excerpts ? { excerpts: chunk.excerpts } : {}),
    firstId: chunk.firstId,
    headingCount: chunk.headingCount,
    ...(chunk.headings ? { headings: chunk.headings } : {}),
    itemCount: chunk.itemCount,
    lastId: chunk.lastId,
});

const getExportAssetBaseName = (compilationFilePath: string) => path.parse(compilationFilePath).name;

const getChunkFilename = (baseName: string, chunkIndex: number, chunkCount: number) =>
    `${baseName}-translation-chunk-${String(chunkIndex).padStart(String(chunkCount).length, '0')}.json`;

const buildQueryString = ({
    asset,
    chunkIndex,
    contextWindowTokens,
    provider,
    reservedTokens,
}: {
    asset: 'chunk' | 'manifest' | 'prompt' | 'zip';
    chunkIndex?: number;
    contextWindowTokens: number;
    provider: CompilationExportProviderId;
    reservedTokens: number;
}) => {
    const searchParams = new URLSearchParams({
        asset,
        contextWindowTokens: String(contextWindowTokens),
        provider,
        reservedTokens: String(reservedTokens),
    });

    if (typeof chunkIndex === 'number') {
        searchParams.set('chunkIndex', String(chunkIndex));
    }

    return searchParams.toString();
};

const buildChunkSummaries = ({
    baseName,
    chunks,
    contextWindowTokens,
    provider,
    reservedTokens,
}: {
    baseName: string;
    chunks: ExportChunk[];
    contextWindowTokens: number;
    provider: CompilationExportProviderId;
    reservedTokens: number;
}): CompilationExportChunkSummary[] =>
    chunks.map((chunk, index) => {
        const chunkIndex = index + 1;
        return {
            chunkIndex,
            downloadUrl: `/api/compilation/export?${buildQueryString({
                asset: 'chunk',
                chunkIndex,
                contextWindowTokens,
                provider,
                reservedTokens,
            })}`,
            estimatedTokens: chunk.estimatedTokens,
            excerptCount: chunk.excerptCount,
            filename: getChunkFilename(baseName, chunkIndex, chunks.length),
            firstId: chunk.firstId,
            headingCount: chunk.headingCount,
            itemCount: chunk.itemCount,
            lastId: chunk.lastId,
        };
    });

const buildPlan = ({
    chunkSummaries,
    compilationFilePath,
    contextWindowTokens,
    excerptCount,
    headingCount,
    prompt,
    promptId,
    promptTokens,
    provider,
    reservedTokens,
}: {
    chunkSummaries: CompilationExportChunkSummary[];
    compilationFilePath: string;
    contextWindowTokens: number;
    excerptCount: number;
    headingCount: number;
    prompt: string;
    promptId: string;
    promptTokens: number;
    provider: CompilationExportProviderId;
    reservedTokens: number;
}): CompilationExportPlan => {
    const baseName = getExportAssetBaseName(compilationFilePath);
    const availableChunkTokens = contextWindowTokens - reservedTokens;

    return {
        availableChunkTokens,
        chunkCount: chunkSummaries.length,
        chunks: chunkSummaries,
        compilationFilePath,
        contextWindowTokens,
        excerptCount,
        headingCount,
        manifestDownloadUrl: `/api/compilation/export?${buildQueryString({
            asset: 'manifest',
            contextWindowTokens,
            provider,
            reservedTokens,
        })}`,
        manifestFilename: `${baseName}-${EXPORT_MANIFEST_FILENAME_SUFFIX}`,
        prompt,
        promptDownloadUrl: `/api/compilation/export?${buildQueryString({
            asset: 'prompt',
            contextWindowTokens,
            provider,
            reservedTokens,
        })}`,
        promptFilename: `${baseName}-${EXPORT_PROMPT_FILENAME_SUFFIX}`,
        promptId,
        promptTokens,
        provider,
        reservedTokens,
        totalItemCount: excerptCount + headingCount,
        zipDownloadUrl: `/api/compilation/export?${buildQueryString({
            asset: 'zip',
            contextWindowTokens,
            provider,
            reservedTokens,
        })}`,
        zipFilename: `${baseName}-${EXPORT_ZIP_FILENAME_SUFFIX}`,
    };
};

const buildManifestPayload = (plan: CompilationExportPlan) => ({
    availableChunkTokens: plan.availableChunkTokens,
    chunkCount: plan.chunkCount,
    chunks: plan.chunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        estimatedTokens: chunk.estimatedTokens,
        excerptCount: chunk.excerptCount,
        filename: chunk.filename,
        firstId: chunk.firstId,
        headingCount: chunk.headingCount,
        itemCount: chunk.itemCount,
        lastId: chunk.lastId,
    })),
    compilationFilePath: plan.compilationFilePath,
    contextWindowTokens: plan.contextWindowTokens,
    excerptCount: plan.excerptCount,
    headingCount: plan.headingCount,
    promptId: plan.promptId,
    promptTokens: plan.promptTokens,
    provider: plan.provider,
    reservedTokens: plan.reservedTokens,
    totalItemCount: plan.totalItemCount,
});

const buildZipBuffer = ({ chunks, plan }: { chunks: ExportChunk[]; plan: CompilationExportPlan }) => {
    const zipEntries: Record<string, Uint8Array> = {
        [plan.manifestFilename]: strToU8(`${JSON.stringify(buildManifestPayload(plan), null, 2)}\n`),
        [plan.promptFilename]: strToU8(plan.prompt),
    };

    for (const chunkSummary of plan.chunks) {
        const chunk = chunks[chunkSummary.chunkIndex - 1];
        zipEntries[chunkSummary.filename] = strToU8(
            `${JSON.stringify(
                createChunkPayload({
                    chunkIndex: chunkSummary.chunkIndex,
                    excerpts: chunk.excerpts ?? [],
                    headings: chunk.headings ?? [],
                    promptId: plan.promptId,
                }),
                null,
                2,
            )}\n`,
        );
    }

    return zipSync(zipEntries, { level: 0 });
};

const normalizePlanRequest = ({
    contextWindowTokens = DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    provider = DEFAULT_COMPILATION_EXPORT_PROVIDER,
    reservedTokens = DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
}: Partial<{ contextWindowTokens: number; provider: CompilationExportProviderId; reservedTokens: number }>) => ({
    contextWindowTokens,
    provider,
    reservedTokens,
});

const buildCompilationExportArtifacts = async ({
    contextWindowTokens,
    includeChunkItems,
    provider,
    reservedTokens,
}: {
    contextWindowTokens: number;
    includeChunkItems: boolean;
    provider: CompilationExportProviderId;
    reservedTokens: number;
}): Promise<ExportArtifacts> => {
    return withPerfSpan('compilation-export', includeChunkItems ? 'build_artifacts' : 'build_plan', async () => {
        const compilationFilePath = await requireCompilationFilePath();
        const selectedPrompt = await getSelectedPrompt();
        const prompt = selectedPrompt.content.trim();
        const promptTokens = estimateTokenCount(prompt, provider);
        const availableChunkTokens = contextWindowTokens - reservedTokens;
        const chunkBaseTokens = estimateChunkBaseTokens(selectedPrompt.id, provider, promptTokens);

        if (availableChunkTokens < 1) {
            throw new Error('Reserved tokens must be smaller than the context window token budget.');
        }

        if (chunkBaseTokens > availableChunkTokens) {
            throw new Error(
                'The prompt alone exceeds the usable token budget. Increase the context window or reduce reserved tokens.',
            );
        }

        let currentChunk = createChunkBuilder(includeChunkItems);
        const chunks: ExportChunk[] = [];
        let excerptCount = 0;
        let headingCount = 0;

        const flushChunk = () => {
            if (currentChunk.itemCount === 0) {
                return;
            }

            chunks.push(finalizeChunk({ chunk: currentChunk, chunkBaseTokens }));
            currentChunk = createChunkBuilder(includeChunkItems);
        };

        await iterateCompilationExportItems(compilationFilePath, (item) => {
            const itemTokens = estimateItemTokens(item, provider);

            if (chunkBaseTokens + itemTokens > availableChunkTokens) {
                throw new Error(
                    `The source item "${item.id}" is too large for the usable token budget. Increase the context window or reduce reserved tokens.`,
                );
            }

            if (
                currentChunk.itemCount > 0 &&
                chunkBaseTokens + currentChunk.tokenCount + itemTokens > availableChunkTokens
            ) {
                flushChunk();
            }

            appendItemToChunk({ chunk: currentChunk, item, itemTokens });

            if (item.collection === 'excerpts') {
                excerptCount += 1;
            } else {
                headingCount += 1;
            }
        });

        flushChunk();

        const chunkSummaries = buildChunkSummaries({
            baseName: getExportAssetBaseName(compilationFilePath),
            chunks,
            contextWindowTokens,
            provider,
            reservedTokens,
        });
        const plan = buildPlan({
            chunkSummaries,
            compilationFilePath,
            contextWindowTokens,
            excerptCount,
            headingCount,
            prompt,
            promptId: selectedPrompt.id,
            promptTokens,
            provider,
            reservedTokens,
        });

        return { ...(includeChunkItems ? { chunks } : {}), plan };
    });
};

export const getCompilationExportPageData = async (
    request: Partial<{
        contextWindowTokens: number;
        provider: CompilationExportProviderId;
        reservedTokens: number;
    }> = {},
): Promise<CompilationExportPageData> => {
    const normalizedRequest = normalizePlanRequest(request);

    try {
        return {
            error: null,
            plan: (await buildCompilationExportArtifacts({ ...normalizedRequest, includeChunkItems: false })).plan,
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Failed to build compilation export plan.',
            plan: null,
        };
    }
};

export const getCompilationExportPromptAsset = async (
    request: Partial<{
        contextWindowTokens: number;
        provider: CompilationExportProviderId;
        reservedTokens: number;
    }> = {},
) => {
    const normalizedRequest = normalizePlanRequest(request);
    return (await buildCompilationExportArtifacts({ ...normalizedRequest, includeChunkItems: false })).plan;
};

export const getCompilationExportManifestAsset = async (
    request: Partial<{
        contextWindowTokens: number;
        provider: CompilationExportProviderId;
        reservedTokens: number;
    }> = {},
) => {
    const normalizedRequest = normalizePlanRequest(request);
    return (await buildCompilationExportArtifacts({ ...normalizedRequest, includeChunkItems: false })).plan;
};

export const getCompilationExportChunkAsset = async ({
    chunkIndex,
    ...request
}: Partial<{ contextWindowTokens: number; provider: CompilationExportProviderId; reservedTokens: number }> & {
    chunkIndex: number;
}) => {
    const normalizedRequest = normalizePlanRequest(request);
    const artifacts = await buildCompilationExportArtifacts({ ...normalizedRequest, includeChunkItems: true });
    const chunkSummary = artifacts.plan.chunks[chunkIndex - 1];
    const chunk = artifacts.chunks?.[chunkIndex - 1];

    if (!chunkSummary || !chunk) {
        throw new Error('Chunk not found.');
    }

    return {
        content: createChunkPayload({
            chunkIndex,
            excerpts: chunk.excerpts ?? [],
            headings: chunk.headings ?? [],
            promptId: artifacts.plan.promptId,
        }),
        filename: chunkSummary.filename,
    };
};

export const getCompilationExportZipAsset = async (
    request: Partial<{
        contextWindowTokens: number;
        provider: CompilationExportProviderId;
        reservedTokens: number;
    }> = {},
) => {
    const normalizedRequest = normalizePlanRequest(request);
    const artifacts = await buildCompilationExportArtifacts({ ...normalizedRequest, includeChunkItems: true });

    return {
        buffer: buildZipBuffer({ chunks: artifacts.chunks ?? [], plan: artifacts.plan }),
        filename: artifacts.plan.zipFilename,
    };
};
