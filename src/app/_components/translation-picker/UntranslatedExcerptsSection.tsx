import type { Excerpt } from '@/lib/compilation';

type Pagination = {
    page: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
};

type UntranslatedExcerptsSectionProps = {
    data: Excerpt[];
    pagination: Pagination;
    onPreviousPage: () => void;
    onNextPage: () => void;
};

const UntranslatedExcerptsSection = ({
    data,
    pagination,
    onPreviousPage,
    onNextPage,
}: UntranslatedExcerptsSectionProps) => (
    <section className="rounded border p-4 lg:col-span-2">
        <h2 className="font-semibold text-lg">Untranslated Excerpts (Paged)</h2>
        <ul className="mt-4 space-y-4">
            {data.map((excerpt) => (
                <li key={excerpt.id} className="rounded border p-4">
                    <p className="text-neutral-500 text-sm">
                        {excerpt.id} | {excerpt.from}-{excerpt.to}
                    </p>
                    <p className="mt-2 font-medium">{excerpt.nass}</p>
                    <p className="mt-1 text-neutral-700">Pending translation</p>
                </li>
            ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
            <button
                type="button"
                className="rounded border px-3 py-2 disabled:opacity-40"
                onClick={onPreviousPage}
                disabled={!pagination.hasPreviousPage}
            >
                Previous
            </button>
            <span className="text-sm">
                Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
                type="button"
                className="rounded border px-3 py-2 disabled:opacity-40"
                onClick={onNextPage}
                disabled={!pagination.hasNextPage}
            >
                Next
            </button>
        </div>
    </section>
);

export default UntranslatedExcerptsSection;
