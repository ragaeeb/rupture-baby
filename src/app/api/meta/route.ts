import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PackageJsonAuthor = string | { email?: string; name?: string; url?: string };

type PackageJson = { author?: PackageJsonAuthor; homepage?: string; name?: string; version?: string };

const parseAuthor = (author: PackageJsonAuthor | undefined): { name: string | null; url: string | null } => {
    if (!author) {
        return { name: null, url: null };
    }

    if (typeof author === 'string') {
        return { name: author, url: null };
    }

    return { name: author.name || null, url: author.url || null };
};

export const GET = async () => {
    try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJsonText = await Bun.file(packageJsonPath).text();
        const packageJson = JSON.parse(packageJsonText) as PackageJson;

        const author = parseAuthor(packageJson.author);

        return NextResponse.json({
            authorName: author.name,
            authorUrl: author.url,
            homepage: packageJson.homepage || null,
            name: packageJson.name || null,
            version: packageJson.version || null,
        });
    } catch {
        return NextResponse.json({ error: 'Failed to read application metadata.' }, { status: 500 });
    }
};
