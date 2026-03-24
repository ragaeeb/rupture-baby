import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getTranslationTree } from '@/lib/translations-browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () => {
    try {
        const tree = await getTranslationTree();
        return NextResponse.json(tree);
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to read translation files.' }, { status: 500 });
    }
};
