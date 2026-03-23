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
            const idempotencyDirectory = path.join(outputDir, IDENTITY_DIR_NAME);
            await mkdir(idempotencyDirectory, { recursive: true });
            const idempotencyPath = path.join(idempotencyDirectory, `${hashIdempotencyKey(idempotencyKey)}.json`);
            const existingRecord = await readJsonIfExists<IdempotencyRecord>(idempotencyPath);

            if (existingRecord) {
                return NextResponse.json(
                    {
                        duplicate: true,
                        id,
                        idempotencyKey,
                        saved: true,
                        path: path.join(outputDir, `${id}.json`),
                        blackiyaSeq: existingRecord.blackiyaSeq,
                        blackiyaCreatedAt: existingRecord.blackiyaCreatedAt,
                    },
                    { status: 409 },
                );
            }

            if (shouldSkipStaleWrite(blackiyaSeq, existingMeta?.blackiyaSeq ?? null)) {
                return NextResponse.json({
                    id,
                    path: outputPath,
                    saved: true,
                    duplicate: false,
                    stale: true,
                    blackiyaSeq: existingMeta?.blackiyaSeq ?? blackiyaSeq,
                    blackiyaCreatedAt: existingMeta?.blackiyaCreatedAt ?? blackiyaCreatedAt,
                });
            }

            await Bun.write(outputPath, rawConversation);

            const writeMeta: TranslationWriteMeta = {
                conversationId: id,
                payloadSha256,
                savedAtIso: new Date().toISOString(),
                idempotencyKey,
                blackiyaSeq,
                blackiyaCreatedAt,
            };
            await Bun.write(metaPath, JSON.stringify(writeMeta, null, 2));

            const idempotencyRecord: IdempotencyRecord = {
                idempotencyKey,
                conversationId: id,
                payloadSha256,
                firstSeenAtIso: writeMeta.savedAtIso,
                blackiyaSeq,
                blackiyaCreatedAt,
            };
            await Bun.write(idempotencyPath, JSON.stringify(idempotencyRecord, null, 2));

            return NextResponse.json({ id, path: outputPath, saved: true, duplicate: false, blackiyaSeq, blackiyaCreatedAt });
        }

        if (shouldSkipStaleWrite(blackiyaSeq, existingMeta?.blackiyaSeq ?? null)) {
            return NextResponse.json({
                id,
                path: outputPath,
                saved: true,
                duplicate: false,
                stale: true,
                blackiyaSeq: existingMeta?.blackiyaSeq ?? blackiyaSeq,
                blackiyaCreatedAt: existingMeta?.blackiyaCreatedAt ?? blackiyaCreatedAt,
            });
        }

        await Bun.write(outputPath, rawConversation);

        const writeMeta: TranslationWriteMeta = {
            conversationId: id,
            payloadSha256,
            savedAtIso: new Date().toISOString(),
            idempotencyKey,
            blackiyaSeq,
            blackiyaCreatedAt,
        };
        await Bun.write(metaPath, JSON.stringify(writeMeta, null, 2));

        return NextResponse.json({ id, path: outputPath, saved: true, duplicate: false, blackiyaSeq, blackiyaCreatedAt });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to save translation.' }, { status: 500 });
    }
};
