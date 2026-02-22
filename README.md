# rupture-baby

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-f9f1e1?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893)
[![codecov](https://codecov.io/gh/ragaeeb/rupture-baby/graph/badge.svg?token=B2LMQ3CK4K)](https://codecov.io/gh/ragaeeb/rupture-baby)

`rupture-baby` is a Next.js server that acts as the single source of truth for Arabic excerpt translation workflows used by a browser extension.

The extension can:
- read untranslated excerpts from this API,
- send them to LLMs (ChatGPT, Gemini, Grok) for translation,
- write updated translations back to the server,
- keep data consistent across browser profiles/devices.

## Core Purpose

This service centralizes translation state so end users do not depend on local browser storage per profile. The backend owns the canonical data.

## API (Current MVP)

- `GET /api/compilation/excerpts?page=1&pageSize=5`
- Returns only untranslated excerpts (`text` is missing/null).
- Pagination response includes `page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, `hasPreviousPage`.
- `GET /api/compilation/excerpts/shift?provider=...&maxTokens=...`
- `GET /api/compilation/excerpts/payload?modelId=...&maxTokens=...`
- `GET /api/compilation/prompt`
- `POST /api/compilation/prompt`
- `GET /api/config/paths`
- `POST /api/translations/:id`

## Server Path Config

Path configuration is environment-driven:
- `COMPILATION_FILE_PATH`
- `TRANSLATIONS_DIR`

`GET /api/config/paths` returns the current env-backed values.
`POST /api/config/paths` is disabled and returns `400`.

If these env vars are not configured on the server, compilation/shift and translation routes return `400`.

## Performance Notes

- The excerpts route uses streaming JSON parsing (`stream-json`) to avoid loading the full compilation payload into memory on each request.
- Untranslated excerpts are cached in memory after first load.
- Cache is automatically refreshed when the source file changes (`mtime` check).

## Development

Prerequisites:
- Bun `>=1.3.9`

Install:

```bash
bun install
```

Run dev server:

```bash
bun dev
```

Environment:

```bash
COMPILATION_FILE_PATH=/Users/rhaq/workspace/compilations/1119.json
TRANSLATIONS_DIR=/Users/rhaq/workspace/compilations/translations
```

Type-check:

```bash
bunx tsc --noEmit
```

## Tech Stack

- Next.js (App Router + Route Handlers)
- React
- TypeScript
- Bun

## Repository

- GitHub: [github.com/ragaeeb/rupture-baby](https://github.com/ragaeeb/rupture-baby)
- Issues: [github.com/ragaeeb/rupture-baby/issues](https://github.com/ragaeeb/rupture-baby/issues)
