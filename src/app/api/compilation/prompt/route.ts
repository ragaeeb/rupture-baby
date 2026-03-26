import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getPromptOptions, getSelectedPrompt, setSelectedPromptById } from '@/lib/prompt-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () => {
    try {
        const selected = await getSelectedPrompt();
        const options = await getPromptOptions();

        return NextResponse.json({ options, selectedPromptContent: selected.content, selectedPromptId: selected.id });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to load prompt state.' }, { status: 500 });
    }
};

export const POST = async (request: Request) => {
    try {
        const body = (await request.json()) as { promptId?: string };
        const promptId = body.promptId?.trim();

        if (!promptId) {
            return NextResponse.json({ error: 'promptId is required.' }, { status: 400 });
        }

        const selected = await setSelectedPromptById(promptId);
        if (!selected) {
            const options = await getPromptOptions();
            return NextResponse.json(
                { error: `Invalid promptId "${promptId}".`, validPromptIds: options.map((prompt) => prompt.id) },
                { status: 400 },
            );
        }

        return NextResponse.json({ selectedPromptId: selected.id });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to set prompt.' }, { status: 500 });
    }
};
