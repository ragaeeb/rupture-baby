import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import type { Compilation } from "@/lib/compilation";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 100;

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const loadCompilation = async (): Promise<Compilation> => {
  const filePath = path.join(process.cwd(), "data", "compilation.sample.json");
  const raw = await fs.readFile(filePath, "utf-8");

  return JSON.parse(raw) as Compilation;
};

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
    const requestedPageSize = parsePositiveInt(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
    );
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    const compilation = await loadCompilation();
    const totalItems = compilation.excerpts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const data = compilation.excerpts.slice(startIndex, endIndex);

    return NextResponse.json({
      data,
      pagination: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      },
      meta: {
        contractVersion: compilation.contractVersion,
        createdAt: compilation.createdAt,
        lastUpdatedAt: compilation.lastUpdatedAt,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load compilation excerpts." },
      { status: 500 },
    );
  }
};
