import '@tanstack/react-start/server-only';

import { createFileRoute } from '@tanstack/react-router';

import { MissingPathConfigError } from '@/lib/data-paths';
import { isRupturePatch, isRupturePatchMetadata } from '@/lib/translation-patches';
import { readTranslationJsonFile, writeTranslationPatch, writeTranslationPatches } from '@/lib/translations-browser';

type PatchOperationBody = {
    excerptId: string;
    patch: Parameters<typeof writeTranslationPatch>[2];
    patchMetadata?: Parameters<typeof writeTranslationPatch>[3];
};

const getDuplicateExcerptIdError = (excerptId: string) =>
    Response.json(
        { error: `Duplicate excerptId "${excerptId}" is not allowed in a batch patch request.` },
        { status: 400 },
    );

const parsePatchOperation = (value: unknown, fieldPrefix: string): PatchOperationBody => {
    if (typeof value !== 'object' || value === null) {
        throw new Error(`${fieldPrefix} must be an object.`);
    }

    const candidate = value as { excerptId?: unknown; patch?: unknown; patchMetadata?: unknown };
    if (typeof candidate.excerptId !== 'string' || candidate.excerptId.trim().length === 0) {
        throw new Error(`Field "${fieldPrefix}.excerptId" is required.`);
    }

    if (candidate.patch !== null && !isRupturePatch(candidate.patch)) {
        throw new Error(`Field "${fieldPrefix}.patch" must be a patch object or null.`);
    }

    if (typeof candidate.patchMetadata !== 'undefined' && !isRupturePatchMetadata(candidate.patchMetadata)) {
        throw new Error(`Field "${fieldPrefix}.patchMetadata" must be a valid patch metadata object.`);
    }

    return { excerptId: candidate.excerptId.trim(), patch: candidate.patch, patchMetadata: candidate.patchMetadata };
};

const parseBatchPatchOperations = (batchOperations: unknown[]) => {
    const seenExcerptIds = new Set<string>();
    const operations: PatchOperationBody[] = [];

    for (const [index, operation] of batchOperations.entries()) {
        const parsedOperation = parsePatchOperation(operation, `operations[${index}]`);
        if (seenExcerptIds.has(parsedOperation.excerptId)) {
            return { error: getDuplicateExcerptIdError(parsedOperation.excerptId) };
        }

        seenExcerptIds.add(parsedOperation.excerptId);
        operations.push(parsedOperation);
    }

    return { operations };
};

const getInvalidRequestError = (message: string) => Response.json({ error: message }, { status: 400 });

const parseSinglePatchRequestBody = (body: { excerptId?: unknown; patch?: unknown; patchMetadata?: unknown }) => {
    const { excerptId, patch, patchMetadata } = body;

    if (typeof excerptId !== 'string' || excerptId.trim().length === 0) {
        return { error: getInvalidRequestError('Field "excerptId" is required.') };
    }

    if (patch !== null && !isRupturePatch(patch)) {
        return { error: getInvalidRequestError('Field "patch" must be a patch object or null.') };
    }

    if (typeof patchMetadata !== 'undefined' && !isRupturePatchMetadata(patchMetadata)) {
        return { error: getInvalidRequestError('Field "patchMetadata" must be a valid patch metadata object.') };
    }

    return { excerptId: excerptId.trim(), patch, patchMetadata };
};

const parseBatchPatchRequestBody = (batchOperations: unknown[]) => {
    if (batchOperations.length === 0) {
        return { error: getInvalidRequestError('Field "operations" must be a non-empty array.') };
    }

    try {
        return parseBatchPatchOperations(batchOperations);
    } catch (error) {
        return {
            error: getInvalidRequestError(error instanceof Error ? error.message : 'Invalid batch patch request.'),
        };
    }
};

const parsePatchRequestBody = (body: unknown) => {
    if (typeof body !== 'object' || body === null) {
        return { error: getInvalidRequestError('Request body must be a JSON object.') };
    }

    const batchOperations = (body as { operations?: unknown }).operations;
    if (Array.isArray(batchOperations)) {
        return parseBatchPatchRequestBody(batchOperations);
    }

    return parseSinglePatchRequestBody(body as { excerptId?: unknown; patch?: unknown; patchMetadata?: unknown });
};

export const GET = async (request: Request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path')?.trim();

    if (!filePath) {
        return Response.json({ error: 'Query parameter "path" is required.' }, { status: 400 });
    }

    try {
        return Response.json(await readTranslationJsonFile(filePath));
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if (error instanceof SyntaxError) {
            return Response.json({ error: 'Translation file is not valid JSON.' }, { status: 422 });
        }

        if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 404 });
        }

        return Response.json({ error: 'Failed to read translation file.' }, { status: 500 });
    }
};

export const PATCH = async (request: Request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path')?.trim();

    if (!filePath) {
        return Response.json({ error: 'Query parameter "path" is required.' }, { status: 400 });
    }

    try {
        const parsedBody = parsePatchRequestBody((await request.json()) as unknown);
        if ('error' in parsedBody) {
            return parsedBody.error;
        }

        if ('operations' in parsedBody && Array.isArray(parsedBody.operations)) {
            return Response.json(await writeTranslationPatches(filePath, parsedBody.operations));
        }

        const singleOperation = parsedBody as PatchOperationBody;
        return Response.json(
            await writeTranslationPatch(
                filePath,
                singleOperation.excerptId,
                singleOperation.patch,
                singleOperation.patchMetadata,
            ),
        );
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return Response.json({ error: error.message, key: error.key }, { status: 400 });
        }

        if (error instanceof SyntaxError) {
            return Response.json({ error: 'Translation file is not valid JSON.' }, { status: 422 });
        }

        if (error instanceof Error) {
            return Response.json({ error: error.message }, { status: 404 });
        }

        return Response.json({ error: 'Failed to update translation patch.' }, { status: 500 });
    }
};

export const Route = createFileRoute('/api/translations/file')({
    server: { handlers: { GET: ({ request }) => GET(request), PATCH: ({ request }) => PATCH(request) } },
});
