# rupture-baby

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-React-f59e0b?logo=react)](https://tanstack.com/start)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-f9f1e1?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/9dfb2637-887c-482b-814f-e2998faa5893)
[![codecov](https://codecov.io/gh/ragaeeb/rupture-baby/graph/badge.svg?token=B2LMQ3CK4K)](https://codecov.io/gh/ragaeeb/rupture-baby)

`rupture-baby` is a Bun + TanStack Start translation workbench for Arabic compilation and review workflows.

It serves untranslated excerpts from a large compilation file, browses saved translation JSON files, validates LLM output, stages human and AI-assisted edits as patches, simulates playback into the compilation corpus, and persists reviewed changes as the source of truth.

## What It Does

- streams untranslated excerpts out of a very large compilation JSON file
- builds prompt-aware translation payloads and shift-oriented excerpt batches
- stores the active translation prompt in the compilation file itself
- provides a dashboard, analytics page, compilation browser, valid playback page, and shift control page
- provides a sidebar-driven translation file browser with model, status, and thinking-time filters
- validates translated responses against source excerpt IDs and content rules
- supports inline excerpt editing with staged local patches
- supports skip/unskip and bulk skip controls for excerpt rows
- supports Arabic leak correction and all-caps correction through Nvidia, Gemini, Hugging Face, and Cloudflare providers
- supports batch repair of invalid excerpts before commit
- persists excerpt patches atomically into translation files
- exposes a legacy ingestion endpoint for direct translation uploads with idempotency and stale-write protection

## Main Pages

- `/` dashboard
- `/dashboard` dashboard alias
- `/analytics` compilation and patch analytics
- `/compilation` paginated compilation browser with row selection and copy-with-prompt
- `/shift` persisted shift checkpoint control
- `/valid` valid playback simulation and save flow
- `/invalid` invalid excerpt triage and batch repair
- `/translations/:fileNameId` translation review/editor
- `/prompts` prompt selection and editing
- `/settings` assist-provider selection

Note: the browse shell lives in the pathless TanStack route `src/app/_browse.tsx`, so public URLs omit `/_browse`.

## Translation Files and `__rupture`

Translation files live under `TRANSLATIONS_DIR`.

The app normalizes supported single-conversation export formats into a common shape and exposes them in:

- `Table` view for review/editing
- `JSON` view for raw inspection
- `Normal` view for reconstructed conversation rendering

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
    },
    "skip": ["P999"]
  }
}
```

Notes:

- `patches` contains only patch data
- `patchMetadata` contains provenance and optional highlight data
- `skip` contains skipped excerpt IDs only
- writes are atomic: the server writes to a temp file and renames into place

## LLM Assistance

Two repair tasks are currently supported:

- `arabic_leak_correction`
- `all_caps_correction`

The same assist contract is used in two places:

- `scope: "file"` from the translation detail page
- `scope: "batch"` from the invalid excerpts page

Current provider options:

- NVIDIA GLM-4.7: `z-ai/glm4.7`
- NVIDIA Kimi K2 Thinking: `moonshotai/kimi-k2-thinking`
- Google Gemini API: `gemini-3.1-flash-lite-preview`
- Hugging Face router: `HF_MODEL_ID` or `meta-llama/Llama-3.3-70B-Instruct`
- Cloudflare Workers AI: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

Flow:

1. validation flags `arabic_leak`, `all_caps`, or other response issues
2. the translation page or invalid-excerpts page exposes repair actions
3. the selected provider returns structured `match` / `replacement` corrections
4. the app stages those corrections as local pending patches
5. the user reviews them and clicks `Commit`
6. the patch and its metadata are persisted to the translation file

The settings page stores the selected provider in browser local storage. `LLM_ASSIST_PROVIDER` can still define the server-side default when no local override exists.

## Compilation and Playback

The compilation file is the large corpus source configured by `COMPILATION_FILE_PATH`.

Key behavior:

- compilation routes should not load the full JSON file into memory per request
- excerpt extraction, prompt lookup, and shift state use streaming parsing where practical
- untranslated excerpt subsets can be cached in memory, but cache invalidation must respect source file changes
- valid playback is simulated first and only saved to disk after explicit confirmation
- shift progress is persisted in a checkpoint file beside the compilation JSON

## API Routes

### Compilation

- `GET /api/compilation/excerpts?page=1&pageSize=50&maxIds=500&modelId=879`
- `GET /api/compilation/excerpts/payload?maxTokens=4000&maxItems=10000&modelId=879`
- `GET /api/compilation/excerpts/shift?provider=openai&maxTokens=7000`
- `GET /api/compilation/prompt`
- `POST /api/compilation/prompt`

### Translation files

- `GET /api/translations/files`
- `GET /api/translations/file?path=...`
- `PATCH /api/translations/file?path=...`
- `DELETE /api/translations/delete?path=...`
- `POST /api/translations/assist`
- `GET /api/translations/validate`
- `POST /api/translations/:id`

### Shell/meta

- `GET /api/dashboard/stats`
- `GET /api/meta`
- `GET /api/config/paths`
- `POST /api/config/paths`

Notes:

- `POST /api/config/paths` intentionally returns an error. Runtime path updates are disabled; configure paths through env vars.
- `POST /api/translations/:id` is the legacy direct-ingest route. It writes the raw payload plus sidecar metadata and supports idempotency headers.

## Environment Variables

Required:

- `COMPILATION_FILE_PATH`
- `TRANSLATIONS_DIR`

Assist providers:

- `NVIDIA_API_KEY` or `NVIDIA_NIM_API_KEY`
- `GOOGLE_API_KEY`
- `HF_MODEL_TOKEN`
- `HF_MODEL_ID` optional model override
- `CLOUDFLARE_WORKERS_AI_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LLM_ASSIST_PROVIDER` optional default provider override

Optional assist tuning:

- `LLM_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `GEMINI_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `NVIDIA_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `NVIDIA_ASSIST_MAX_OUTPUT_TOKENS`

Example:

```bash
COMPILATION_FILE_PATH=/Users/user/workspace/compilations/1119.json
TRANSLATIONS_DIR=/Users/user/workspace/compilations/translations
NVIDIA_API_KEY=your_nvidia_api_key
GOOGLE_API_KEY=your_google_api_key
LLM_ASSIST_PROVIDER=nvidia-glm47
```

## Development

Prerequisites:

- Bun `>=1.3.11`

Install:

```bash
bun install
```

Run the dev server on port `9000`:

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

- Root page is the dashboard. There is no redirect from `/` to `/dashboard`.
- Prompt selection is persisted back into the compilation JSON, not a standalone local cache.
- Translation page commit is explicit. Blur only stages pending local edits.
- Translation table rows support skip/unskip without deleting source text.
- Invalid excerpt repair uses the same assist pipeline as the file view, but in `batch` scope.
- Valid playback is a dry-run until `Save Played Compilation` is used.
- Highlighting for validation should prefer `segmentRange`.
- Highlighting for AI-generated patch replacements should prefer exact ranges stored in `__rupture.patchMetadata`.
- `src/routeTree.gen.ts` is generated by TanStack Router; do not edit it manually.

## Utility Script

Mass-export Grok conversation arrays should be normalized before browsing them in the app.

- [`scripts/README.md`](./scripts/README.md)

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
- NVIDIA Integrate API
- Google GenAI SDK

## Repository

- GitHub: [github.com/ragaeeb/rupture-baby](https://github.com/ragaeeb/rupture-baby)
- Issues: [github.com/ragaeeb/rupture-baby/issues](https://github.com/ragaeeb/rupture-baby/issues)
