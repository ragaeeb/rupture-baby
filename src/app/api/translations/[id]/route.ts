import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { MissingPathConfigError, requireTranslationsDir } from '@/lib/data-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

type TranslationWriteMeta = {
    conversationId: string;
    payloadSha256: string;
    savedAtIso: string;
    idempotencyKey: string | null;
    blackiyaSeq: number | null;
    blackiyaCreatedAt: number | null;
};

type IdempotencyRecord = {
    idempotencyKey: string;
    conversationId: string;
    payloadSha256: string;
    firstSeenAtIso: string;
    blackiyaSeq: number | null;
    blackiyaCreatedAt: number | null;
};

const IDENTITY_DIR_NAME = '.idempotency';

const parseOptionalNumber = (value: string | null): number | null => {
    if (!value) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.floor(parsed);
};

const hashPayload = (payload: string) => createHash('sha256').update(payload).digest('hex');

const hashIdempotencyKey = (idempotencyKey: string) => createHash('sha256').update(idempotencyKey).digest('hex');

const readJsonIfExists = async <T>(filePath: string): Promise<T | null> => {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
        return null;
    }
    return (await file.json()) as T;
};

const shouldSkipStaleWrite = (incomingSeq: number | null, existingSeq: number | null) => {
    if (incomingSeq === null || existingSeq === null) {
        return false;
    }
    return incomingSeq <= existingSeq;
};

const createSavedResponse = (payload: {
    blackiyaCreatedAt: number | null;
    blackiyaSeq: number | null;
    duplicate: boolean;
    id: string;
    idempotencyKey?: string | null;
    path: string;
    stale?: boolean;
}) => NextResponse.json({ ...payload, saved: true }, payload.duplicate ? { status: 409 } : undefined);

const writeMetaFile = async (
    metaPath: string,
    payload: Omit<TranslationWriteMeta, 'savedAtIso'> & { savedAtIso?: string },
) => {
    const writeMeta: TranslationWriteMeta = { ...payload, savedAtIso: payload.savedAtIso ?? new Date().toISOString() };
    await Bun.write(metaPath, JSON.stringify(writeMeta, null, 2));
    return writeMeta;
};

const handleStaleWrite = (
    id: string,
    outputPath: string,
    existingMeta: TranslationWriteMeta | null,
    blackiyaCreatedAt: number | null,
    blackiyaSeq: number | null,
) =>
    createSavedResponse({
        blackiyaCreatedAt: existingMeta?.blackiyaCreatedAt ?? blackiyaCreatedAt,
        blackiyaSeq: existingMeta?.blackiyaSeq ?? blackiyaSeq,
        duplicate: false,
        id,
        path: outputPath,
        stale: true,
    });

const handleIdempotentWrite = async (params: {
    blackiyaCreatedAt: number | null;
    blackiyaSeq: number | null;
    existingMeta: TranslationWriteMeta | null;
    id: string;
    idempotencyKey: string;
    metaPath: string;
    outputDir: string;
    outputPath: string;
    payloadSha256: string;
    rawConversation: string;
}) => {
    const idempotencyDirectory = path.join(params.outputDir, IDENTITY_DIR_NAME);
    await mkdir(idempotencyDirectory, { recursive: true });
    const idempotencyPath = path.join(idempotencyDirectory, `${hashIdempotencyKey(params.idempotencyKey)}.json`);
    const existingRecord = await readJsonIfExists<IdempotencyRecord>(idempotencyPath);

    if (existingRecord) {
        return createSavedResponse({
            blackiyaCreatedAt: existingRecord.blackiyaCreatedAt,
            blackiyaSeq: existingRecord.blackiyaSeq,
            duplicate: true,
            id: params.id,
            idempotencyKey: params.idempotencyKey,
            path: params.outputPath,
        });
    }

    if (shouldSkipStaleWrite(params.blackiyaSeq, params.existingMeta?.blackiyaSeq ?? null)) {
        return handleStaleWrite(
            params.id,
            params.outputPath,
            params.existingMeta,
            params.blackiyaCreatedAt,
            params.blackiyaSeq,
        );
    }

    await Bun.write(params.outputPath, params.rawConversation);
    const writeMeta = await writeMetaFile(params.metaPath, {
        blackiyaCreatedAt: params.blackiyaCreatedAt,
        blackiyaSeq: params.blackiyaSeq,
        conversationId: params.id,
        idempotencyKey: params.idempotencyKey,
        payloadSha256: params.payloadSha256,
    });

    const idempotencyRecord: IdempotencyRecord = {
        blackiyaCreatedAt: params.blackiyaCreatedAt,
        blackiyaSeq: params.blackiyaSeq,
        conversationId: params.id,
        firstSeenAtIso: writeMeta.savedAtIso,
        idempotencyKey: params.idempotencyKey,
        payloadSha256: params.payloadSha256,
    };
    await Bun.write(idempotencyPath, JSON.stringify(idempotencyRecord, null, 2));

    return createSavedResponse({
        blackiyaCreatedAt: params.blackiyaCreatedAt,
        blackiyaSeq: params.blackiyaSeq,
        duplicate: false,
        id: params.id,
        path: params.outputPath,
    });
};

export const POST = async (request: Request, context: RouteContext) => {
    try {
        const { id } = await context.params;
        const rawConversation = await request.text();
        const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() || null;
        const blackiyaSeq = parseOptionalNumber(request.headers.get('x-blackiya-seq'));
        const blackiyaCreatedAt = parseOptionalNumber(request.headers.get('x-blackiya-created-at'));
        const payloadSha256 = hashPayload(rawConversation);

        const outputDir = requireTranslationsDir();
        await mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${id}.json`);
        const metaPath = path.join(outputDir, `${id}.meta.json`);
        const existingMeta = await readJsonIfExists<TranslationWriteMeta>(metaPath);

        if (idempotencyKey) {
            return handleIdempotentWrite({
                blackiyaCreatedAt,
                blackiyaSeq,
                existingMeta,
                id,
                idempotencyKey,
                metaPath,
                outputDir,
                outputPath,
                payloadSha256,
                rawConversation,
            });
        }

        if (shouldSkipStaleWrite(blackiyaSeq, existingMeta?.blackiyaSeq ?? null)) {
            return handleStaleWrite(id, outputPath, existingMeta, blackiyaCreatedAt, blackiyaSeq);
        }

        await Bun.write(outputPath, rawConversation);
        await writeMetaFile(metaPath, {
            blackiyaCreatedAt,
            blackiyaSeq,
            conversationId: id,
            idempotencyKey,
            payloadSha256,
        });

        return createSavedResponse({ blackiyaCreatedAt, blackiyaSeq, duplicate: false, id, path: outputPath });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to save translation.' }, { status: 500 });
    }
};
