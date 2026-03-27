import type { AppMetaResponse } from '@/lib/shell-types';
import packageJsonData from '../../package.json';

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

export const getAppMeta = async (): Promise<AppMetaResponse> => {
    const packageJson = packageJsonData as PackageJson;
    const author = parseAuthor(packageJson.author);

    return {
        authorName: author.name,
        authorUrl: author.url,
        homepage: packageJson.homepage || null,
        name: packageJson.name || null,
        version: packageJson.version || null,
    };
};
