import type { LLMProvider } from 'bitaboom';
import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getShiftCache } from '@/lib/shift-cache';
import { buildShiftPayload, shiftFirstN } from '@/lib/shift-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (request: Request) => {
    try {
        const { searchParams } = new URL(request.url);
        const maxTokens = Number.parseInt(searchParams.get('maxTokens') as string, 10);
        const provider = searchParams.get('provider') as LLMProvider;

        const shiftCache = await getShiftCache();
        const result = buildShiftPayload({
            excerpts: shiftCache.queue,
            maxTokens,
            prompt: shiftCache.prompt,
            provider,
        });

        shiftFirstN(shiftCache.queue, result.shiftCount);

        return new NextResponse(result.payload, {
            headers: {
                'content-type': 'text/plain; charset=utf-8',
            },
            status: 200,
        });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to build shift payload.' }, { status: 500 });
    }
};
