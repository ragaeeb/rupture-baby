"use client";

import { useEffect, useState } from "react";

import type { Excerpt } from "@/lib/compilation";

type ApiResponse = {
  data: Excerpt[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

const PAGE_SIZE = 5;

const Home = () => {
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/compilation/excerpts?page=${page}&pageSize=${PAGE_SIZE}`,
        );

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const json = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setResponse(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Compilation Excerpts API Demo</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Endpoint: <code>/api/compilation/excerpts?page=1&pageSize=5</code>
      </p>

      {loading ? <p className="mt-6">Loading...</p> : null}
      {error ? <p className="mt-6 text-red-600">{error}</p> : null}

      {!loading && !error && response ? (
        <>
          <ul className="mt-6 space-y-4">
            {response.data.map((excerpt) => (
              <li key={excerpt.id} className="rounded border p-4">
                <p className="text-sm text-neutral-500">
                  {excerpt.id} | {excerpt.from}-{excerpt.to}
                </p>
                <p className="mt-2 font-medium">{excerpt.nass}</p>
                <p className="mt-1 text-neutral-700">{excerpt.text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              className="rounded border px-3 py-2 disabled:opacity-40"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!response.pagination.hasPreviousPage}
            >
              Previous
            </button>
            <span className="text-sm">
              Page {response.pagination.page} of {response.pagination.totalPages}
            </span>
            <button
              type="button"
              className="rounded border px-3 py-2 disabled:opacity-40"
              onClick={() => setPage((current) => current + 1)}
              disabled={!response.pagination.hasNextPage}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
};

export default Home;
