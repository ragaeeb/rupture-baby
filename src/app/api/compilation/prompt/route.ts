import { NextResponse } from 'next/server';

import { getPromptOptions, getSelectedPrompt, setSelectedPromptById } from '@/lib/prompt-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () => {
    const selected = getSelectedPrompt();
    return NextResponse.json({
        selectedPromptId: selected.id,
    });
};

export const POST = async (request: Request) => {
    try {
        const body = (await request.json()) as { promptId?: string };
        const promptId = body.promptId?.trim();

        if (!promptId) {
            return NextResponse.json({ error: 'promptId is required.' }, { status: 400 });
        }

        const selected = setSelectedPromptById(promptId);
        if (!selected) {
            return NextResponse.json(
                {
                    error: `Invalid promptId "${promptId}".`,
                    validPromptIds: getPromptOptions().map((prompt) => prompt.id),
                },
                { status: 400 },
            );
        }

        return NextResponse.json({
            selectedPromptId: selected.id,
        });
    } catch {
        return NextResponse.json({ error: 'Failed to set prompt.' }, { status: 500 });
    }
};
