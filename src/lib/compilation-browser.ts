import '@tanstack/react-start/server-only';

import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parser } from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';

import {
    type CompilationCollectionKey,
    DEFAULT_COMPILATION_BROWSE_PAGE,
    DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
    MAX_COMPILATION_BROWSE_PAGE_SIZE,
} from '@/lib/compilation-browser-shared';
import { getCompilationSnapshot } from '@/lib/compilation-cache';
import { requireCompilationFilePath } from '@/lib/data-paths';
import type { CompilationBrowseResponse, CompilationBrowseRow } from '@/lib/shell-types';
import type { Excerpt, Heading } from '@/types/compilation';

type CollectionEntry = Excerpt | Heading;

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

const clampPageSize = (pageSize: number) =>
    Math.min(
        MAX_COMPILATION_BROWSE_PAGE_SIZE,
        Math.max(1, Math.floor(pageSize || DEFAULT_COMPILATION_BROWSE_PAGE_SIZE)),
    );

const clampPage = (page: number) => Math.max(1, Math.floor(page || DEFAULT_COMPILATION_BROWSE_PAGE));

const isTranslated = (entry: { text?: string | null }) => Boolean(entry.text);

const mapEntryToRow = (
    collection: CompilationCollectionKey,
    entry: CollectionEntry,
    index: number,
): CompilationBrowseRow => ({
    collection,
    from: typeof entry.from === 'number' ? entry.from : null,
    id: entry.id,
    index,
    isTranslated: isTranslated(entry),
    lastUpdatedAt: typeof entry.lastUpdatedAt === 'number' ? entry.lastUpdatedAt : null,
    nass: entry.nass,
    num: typeof entry.meta?.num === 'string' ? entry.meta.num : null,
    parent: 'parent' in entry && typeof entry.parent === 'string' ? entry.parent : null,
    text: typeof entry.text === 'string' ? entry.text : null,
    to: 'to' in entry && typeof entry.to === 'number' ? entry.to : null,
    translator: typeof entry.translator === 'number' ? entry.translator : null,
});

export const getCompilationBrowsePage = async ({
    collection,
    page = DEFAULT_COMPILATION_BROWSE_PAGE,
    pageSize = DEFAULT_COMPILATION_BROWSE_PAGE_SIZE,
}: {
    collection: CompilationCollectionKey;
    page?: number;
    pageSize?: number;
}): Promise<CompilationBrowseResponse> => {
    const filePath = await requireCompilationFilePath();
    await fs.stat(filePath);

    const snapshot = await getCompilationSnapshot();
    const summary = snapshot.browseSummary[collection];
    const safePageSize = clampPageSize(pageSize);
    const totalItems = summary.total;
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const normalizedPage = Math.min(clampPage(page), totalPages);
    const startIndex = (normalizedPage - 1) * safePageSize;
    const endIndex = startIndex + safePageSize;
    const rows: CompilationBrowseRow[] = [];

    if (totalItems > 0) {
        const excerptStream = getInputStream(filePath)
            .pipe(parser.asStream())
            .pipe(pick.asStream({ filter: collection }))
            .pipe(streamArray.asStream());

        for await (const entry of excerptStream as AsyncIterable<{ key: number; value: CollectionEntry }>) {
            const currentIndex = entry.key;

            if (currentIndex < startIndex) {
                continue;
            }

            if (currentIndex >= endIndex) {
                break;
            }

            rows.push(mapEntryToRow(collection, entry.value, currentIndex));
        }
    }

    return {
        collection,
        pagination: {
            hasNextPage: normalizedPage < totalPages,
            hasPreviousPage: normalizedPage > 1,
            page: normalizedPage,
            pageSize: safePageSize,
            totalItems,
            totalPages,
        },
        rows,
        summary,
    };
};
