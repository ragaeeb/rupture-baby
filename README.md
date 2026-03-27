# rupture-baby

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-React-f59e0b?logo=react)](https://tanstack.com/start)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-f9f1e1?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893)
[![codecov](https://codecov.io/gh/ragaeeb/rupture-baby/graph/badge.svg?token=B2LMQ3CK4K)](https://codecov.io/gh/ragaeeb/rupture-baby)

`rupture-baby` is a Bun + TanStack Start server for Arabic translation workflows.

It serves untranslated excerpts from a large compilation file, browses saved translation JSON files, validates LLM output, stages human and AI-assisted edits as patches, and persists reviewed changes as the source of truth.

## What It Does

- streams untranslated excerpts out of a very large compilation JSON file
- generates prompt/payload data for translation runs
- stores the active translation prompt in the compilation file itself
- provides a dashboard and sidebar-driven translation file browser
- validates translated responses against source excerpt IDs and content rules
- supports inline excerpt editing with staged local patches
- supports Gemini-assisted Arabic leak correction
- persists excerpt patches atomically into translation files

## Main Concepts

### Compilation source

The compilation file is the large corpus source configured by `COMPILATION_FILE_PATH`.

Key behavior:

- compilation routes should not load the full JSON file into memory per request
- excerpt extraction uses streaming parsing
- untranslated excerpt subsets can be cached in memory, but cache invalidation must respect source file changes

### Translation files

Translation files live under `TRANSLATIONS_DIR`.

The app normalizes different saved formats into a common shape and exposes them in:

- `Table` view for review/editing
- `JSON` view for raw inspection
- `Normal` view for reconstructed conversation rendering

### `__rupture`

Reviewed or AI-generated edits are stored under top-level `__rupture`.

Current shape:

```json
{
  "__rupture": {
    "patches": {
      "P123": {
        "ops": [
          { "start": 10, "end": 15, "text": "replacement" }
        ]
      }
    },
    "patchMetadata": {
      "P123": {
        "appliedAt": "2026-03-26T12:34:56.000Z",
        "source": {
          "kind": "llm",
          "provider": "google",
          "task": "arabic_leak_correction",
          "model": "gemini-3.1-flash-lite-preview",
          "modelVersion": "optional-runtime-version"
        },
        "highlightRanges": [
          { "start": 10, "end": 21 }
        ]
      }
    }
  }
}
```

Notes:

- `patches` contains only patch data
- `patchMetadata` contains provenance and optional highlight ranges
- writes are atomic: the server writes to a temp file and renames into place

## Gemini Assistance

Arabic leak auto-fix is currently powered by `@google/genai`.

Current provider/model:

- provider: Google Gemini API
- model: `gemini-3.1-flash-lite-preview`

Flow:

1. the validator flags `arabic_leak` errors
2. the table banner exposes a `Fix Arabic leaks` action
3. Gemini returns structured `match` / `replacement` corrections
4. the app stages those corrections as local pending patches
5. the user reviews them and clicks `Commit`
6. the patch and its metadata are persisted to the translation file

## App Routes

- `/` dashboard
- `/dashboard` dashboard alias
- `/translations/:fileNameId` translation review/editor
- `/prompts` prompt management

## API Routes

### Compilation

- `GET /api/compilation/excerpts?page=1&pageSize=50`
- `GET /api/compilation/excerpts/shift`
- `GET /api/compilation/excerpts/payload`
- `GET /api/compilation/prompt`
- `POST /api/compilation/prompt`

### Translation files

- `GET /api/translations/files`
- `GET /api/translations/file?path=...`
- `PATCH /api/translations/file?path=...`
- `POST /api/translations/assist`
- `GET /api/translations/validate`

### Shell/meta

- `GET /api/dashboard/stats`
- `GET /api/meta`
- `GET /api/config/paths`

## Environment Variables

Required:

- `COMPILATION_FILE_PATH`
- `TRANSLATIONS_DIR`

Required for Gemini-assisted Arabic leak correction:

- `GOOGLE_API_KEY`

Example:

```bash
COMPILATION_FILE_PATH=/Users/user/workspace/compilations/1119.json
TRANSLATIONS_DIR=/Users/user/workspace/compilations/translations
GOOGLE_API_KEY=your_google_api_key
```

## Development

Prerequisites:

- Bun `>=1.3.11`

Install:

```bash
bun install
```

Run the dev server:

```bash
bun run dev
```

Build for production:

```bash
bun run build
```

Run the production server:

```bash
bun run start
```

Type-check:

```bash
bunx tsc --noEmit
```

Lint:

```bash
bun run lint
```

## Implementation Notes

- The root page is the dashboard. There is no redirect from `/` to `/dashboard`.
- Sidebar filter state lives in the URL query string and is preserved across navigation.
- Prompt selection is persisted back into the compilation JSON, not a standalone local cache.
- Translation page commit is explicit. Blur only stages pending local edits.
- Highlighting for validation should prefer `segmentRange`.
- Highlighting for AI-generated patch replacements should prefer exact ranges stored in `__rupture.patchMetadata`.

## Tech Stack

- TanStack Start
- TanStack Router
- Vite
- Nitro
- React 19
- TypeScript
- Bun
- stream-json
- Tailwind CSS
- shadcn/ui primitives
- Google GenAI SDK

## Repository

- GitHub: [github.com/ragaeeb/rupture-baby](https://github.com/ragaeeb/rupture-baby)
- Issues: [github.com/ragaeeb/rupture-baby/issues](https://github.com/ragaeeb/rupture-baby/issues)
