import { NextResponse } from 'next/server';

import type { TranslationAssistRequest } from '@/lib/shell-types';
import { requestTranslationAssistance } from '@/lib/translation-assistance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isValidAssistRequest = (value: unknown): value is TranslationAssistRequest => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<TranslationAssistRequest>;
    if (candidate.scope !== 'file' || candidate.task !== 'arabic_leak_correction') {
        return false;
    }

    return (
        Array.isArray(candidate.excerpts) &&
        candidate.excerpts.length > 0 &&
        candidate.excerpts.every(
            (excerpt) =>
                typeof excerpt === 'object' &&
                excerpt !== null &&
                typeof excerpt.id === 'string' &&
                excerpt.id.trim().length > 0 &&
                typeof excerpt.arabic === 'string' &&
                excerpt.arabic.trim().length > 0 &&
                typeof excerpt.translation === 'string',
        )
    );
};

export const POST = async (request: Request) => {
    try {
        const body = (await request.json()) as unknown;
        if (!isValidAssistRequest(body)) {
            return NextResponse.json(
                {
                    error: 'Invalid translation assist request. Expected { scope: "file", task: "arabic_leak_correction", excerpts: [{ id, arabic, translation }] }.',
                },
                { status: 400 },
            );
        }

        const response = await requestTranslationAssistance(body);
        return NextResponse.json(response);
    } catch (error) {
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ error: 'Failed to request translation assistance.' }, { status: 500 });
    }
};
