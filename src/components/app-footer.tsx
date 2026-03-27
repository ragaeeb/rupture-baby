import type { AppMetaResponse } from '@/lib/shell-types';

const AppFooter = ({ meta }: { meta: AppMetaResponse | null }) => {
    const appLabel = meta?.name && meta?.version ? `${meta.name} v${meta.version}` : null;

    return (
        <footer className="mt-auto border-t px-4 py-3 text-muted-foreground text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    {appLabel && meta?.homepage ? (
                        <a
                            className="underline underline-offset-2"
                            href={meta.homepage}
                            rel="noreferrer"
                            target="_blank"
                        >
                            {appLabel}
                        </a>
                    ) : (
                        appLabel || 'App metadata unavailable'
                    )}
                </div>
                <div>
                    {meta?.authorName && meta.authorUrl ? (
                        <a
                            className="underline underline-offset-2"
                            href={meta.authorUrl}
                            rel="noreferrer"
                            target="_blank"
                        >
                            Author: {meta.authorName}
                        </a>
                    ) : meta?.authorName ? (
                        `Author: ${meta.authorName}`
                    ) : null}
                </div>
            </div>
        </footer>
    );
};

export { AppFooter };
