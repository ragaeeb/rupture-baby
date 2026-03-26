import { NextResponse } from 'next/server';

import { MissingPathConfigError } from '@/lib/data-paths';
import { getDashboardStats, getTranslationStats } from '@/lib/translations-browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async () => {
    try {
        const [dashboardPayload, translationStats] = await Promise.all([getDashboardStats(), getTranslationStats()]);

        return NextResponse.json({ ...dashboardPayload, translationStats });
    } catch (error) {
        if (error instanceof MissingPathConfigError) {
            return NextResponse.json({ error: error.message, key: error.key }, { status: 400 });
        }

        return NextResponse.json({ error: 'Failed to read dashboard stats.' }, { status: 500 });
    }
};
