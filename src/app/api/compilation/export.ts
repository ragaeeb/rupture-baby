import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';
import {
    getCompilationExportChunkAsset,
    getCompilationExportManifestAsset,
    getCompilationExportPromptAsset,
    getCompilationExportZipAsset,
} from '@/lib/compilation-export';
import {
    type CompilationExportProviderId,
    DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_COMPILATION_EXPORT_PROVIDER,
    DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS,
    isCompilationExportProviderId,
    MAX_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
    MAX_COMPILATION_EXPORT_RESERVED_TOKENS,
} from '@/lib/compilation-export-shared';
import { MissingPathConfigError } from '@/lib/data-paths';

type ExportAssetKind = 'chunk' | 'manifest' | 'prompt' | 'zip';

const parsePositiveInt = (value: string | null, fallback: number) => {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isExportAssetKind = (value: string | null): value is ExportAssetKind =>
    value === 'chunk' || value === 'manifest' || value === 'prompt' || value === 'zip';

const buildDownloadHeaders = (contentType: string, filename: string) => ({
    'content-disposition': `attachment; filename="${filename}"`,
    'content-type': contentType,
});

const parseExportRequest = (request: Request) => {
    const { searchParams } = new URL(request.url);
    const asset = isExportAssetKind(searchParams.get('asset')) ? searchParams.get('asset') : 'zip';
    const provider = isCompilationExportProviderId(searchParams.get('provider'))
        ? (searchParams.get('provider') as CompilationExportProviderId)
        : DEFAULT_COMPILATION_EXPORT_PROVIDER;
    const contextWindowTokens = Math.min(
        MAX_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS,
        Math.max(
            1,
            parsePositiveInt(searchParams.get('contextWindowTokens'), DEFAULT_COMPILATION_EXPORT_CONTEXT_WINDOW_TOKENS),
        ),
    );
    const reservedTokens = Math.min(
        MAX_COMPILATION_EXPORT_RESERVED_TOKENS,
        Math.max(0, parsePositiveInt(searchParams.get('reservedTokens'), DEFAULT_COMPILATION_EXPORT_RESERVED_TOKENS)),
    );

    if (reservedTokens >= contextWindowTokens) {
        return {
            error: Response.json(
                { error: 'Reserved tokens must be smaller than the context window token budget.' },
                { status: 400 },
            ),
        };
    }

    const rawChunkIndex = searchParams.get('chunkIndex');
    const chunkIndex = asset === 'chunk' && rawChunkIndex ? Math.max(1, parsePositiveInt(rawChunkIndex, 0)) : null;

    if (asset === 'chunk' && !chunkIndex) {
        return {
            error: Response.json(
                { error: 'Query parameter "chunkIndex" is required for chunk downloads.' },
                { status: 400 },
            ),
        };
    }

    return { asset, chunkIndex, contextWindowTokens, provider, reservedTokens };
};

export const GET = async (request: Request) => {
    const parsed = parseExportRequest(request);
    if ('error' in parsed) {
        return parsed.error;
    }

    try {
        if (parsed.asset === 'prompt') {
            const plan = await getCompilationExportPromptAsset(parsed);
            return new Response(plan.prompt, {
                headers: buildDownloadHeaders('text/plain; charset=utf-8', plan.promptFilename),
                status: 200,
            });
        }

        if (parsed.asset === 'manifest') {
            const plan = await getCompilationExportManifestAsset(parsed);
            return Response.json(
                {
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
                },
                {
                    headers: buildDownloadHeaders('application/json; charset=utf-8', plan.manifestFilename),
                    status: 200,
                },
            );
        }

        if (parsed.asset === 'chunk') {
            const chunk = await getCompilationExportChunkAsset({ ...parsed, chunkIndex: parsed.chunkIndex ?? 1 });
            return Response.json(chunk.content, {
                headers: buildDownloadHeaders('application/json; charset=utf-8', chunk.filename),
                status: 200,
            });
        }

        const zipAsset = await getCompilationExportZipAsset(parsed);
        return new Response(Buffer.from(zipAsset.buffer), {
            headers: buildDownloadHeaders('application/zip', zipAsset.filename),
            status: 200,
        });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Chunk not found.') {
            return Response.json({ error: error.message }, { status: 404 });
        }

        return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to export compilation chunks.' },
            { status: 500 },
        );
    }
};

export const Route = createFileRoute('/api/compilation/export')({
    server: { handlers: { GET: ({ request }) => GET(request) } },
});
