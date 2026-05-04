# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Summary

`rupture-baby` is a Bun-based TanStack Start app for Arabic translation review, repair, and compilation playback workflows.

It currently does five main jobs:

- serves untranslated excerpts from a very large compilation JSON file
- builds prompt-aware translation payloads and shift-oriented excerpt batches
- acts as the canonical review/editor surface for saved translation JSON files in `TRANSLATIONS_DIR`
- validates saved translations and stages human or AI-generated fixes as local patches
- simulates and saves playback of valid translation files back into the compilation corpus

The current app includes:

- a dashboard at `/` with a `/dashboard` alias
- analytics, compilation browser, valid playback, and shift control pages
- a sidebar-driven translation file browser with model, status, and thinking-time filters
- inline excerpt editing, skip/unskip, bulk skip, and patch staging
- batch repair UX for invalid files
- LLM-powered Arabic leak and all-caps correction that stage changes for human review
- prompt selection and assist-provider settings UIs

## Runtime and Tooling

- Use `bun` for all commands.
- Do not use `npm`/`yarn`/`pnpm`.
- Main framework: TanStack Start with TanStack Router on Vite/Nitro.
- Language: TypeScript.
- React version: 19.x.
- React Compiler is enabled in `vite.config.ts` via `reactCompilerPreset()`.
- Route files live under `src/app` and use `createFileRoute`; do not apply Next.js `page.tsx` or `route.ts` assumptions here.

## Key Environment Variables

Required:

- `COMPILATION_FILE_PATH`
- `TRANSLATIONS_DIR`

Assist providers and defaults:

- `NVIDIA_API_KEY` or `NVIDIA_NIM_API_KEY`
- `GOOGLE_API_KEY`
- `HF_MODEL_TOKEN`
- `HF_MODEL_ID` optional Hugging Face model override
- `CLOUDFLARE_WORKERS_AI_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LLM_ASSIST_PROVIDER` optional server-side default provider override

Optional assist tuning:

- `LLM_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `GEMINI_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `NVIDIA_ASSIST_MAX_EXCERPTS_PER_REQUEST`
- `NVIDIA_ASSIST_MAX_OUTPUT_TOKENS`

## High-Level Architecture

### App shell and navigation

The browse shell is a pathless TanStack layout, not a URL segment.

- `src/app/_browse.tsx`
  Loads app meta, translation stats, and the translation tree for most app pages.
- `src/components/app-sidebar.tsx`
  Main sidebar navigation, translation filters, and bulk delete flow.
- `src/components/dashboard-page.tsx`
- `src/components/analytics-page.tsx`
- `src/components/compilation-browser-page.tsx`
- `src/components/shift-settings-page.tsx`
- `src/components/valid-playback-page.tsx`
- `src/components/invalid-excerpts-page.tsx`

Important:

- `_browse` is pathless. Public URLs are `/analytics`, `/compilation`, `/shift`, `/valid`, `/invalid`, and `/translations/...`, not `/_browse/...`.
- Route changes may regenerate `src/routeTree.gen.ts`. Treat that file as generated.

### Compilation pipeline

This is the large source corpus path.

- `src/app/api/compilation/excerpts.ts`
  Returns paginated untranslated excerpts plus picker metadata.
- `src/app/api/compilation/excerpts/payload.ts`
  Builds a prompt-prefixed payload constrained by model token budget.
- `src/app/api/compilation/excerpts/shift.ts`
  Builds a text payload from the current shift checkpoint and advances that checkpoint.
- `src/app/api/compilation/prompt.ts`
  Reads or writes the selected prompt stored in the compilation file itself.
- `src/lib/untranslated-cache.ts`
- `src/lib/compilation-browser.ts`
- `src/lib/compilation-browser-selection.ts`
- `src/lib/compilation-browser-shared.ts`
- `src/lib/shift-cache.ts`
- `src/lib/shift-payload.ts`
- `src/lib/prompt-state.ts`

Important:

- `COMPILATION_FILE_PATH` can be very large, often hundreds of MB.
- Do not load the full compilation JSON into memory on each request.
- Prefer the existing streaming helpers and caches in `prompt-state`, `shift-cache`, and `untranslated-cache`.
- If you touch compilation routes, keep memory usage bounded.

### Translation file workflow

This is the main review/edit UI path.

- `src/app/_browse/translations/$fileNameId.tsx`
  Stateful route shell for fetch, local pending edits, commit, skip, and assist actions.
- `src/components/translations/translation-table-view.tsx`
  Main review table UI with row selection and bulk skip controls.
- `src/components/translations/editable-translation-content.tsx`
- `src/components/translations/click-to-edit-text.tsx`
- `src/lib/translation-file-view-model.ts`
  Business logic for table rows, pending edits, patch merging, skip state, and assist staging.
- `src/lib/translation-patches.ts`
  Patch schema, normalization, and display highlight helpers.
- `src/lib/translations-browser.ts`
  Read/write translation JSON files, manage `__rupture`, and persist changes atomically.
- `src/app/api/translations/file.ts`
  File read and patch write route.

### Validation and repair

- `src/app/_browse/invalid.tsx`
- `src/components/invalid-excerpts-page.tsx`
- `src/lib/invalid-excerpts-fixes.ts`
- `src/lib/translation-parser.ts`
- `src/lib/translation-validity.ts`
- `src/lib/validation/utils.ts`
- `src/lib/validation/types.ts`
- `src/lib/validation/textUtils.ts`

Validation is response-centric:

- Arabic source is treated as canonical.
- Validation errors attach to translated response segments.
- `segmentRange` is the preferred way to drive UI highlights.
- The invalid excerpts page can batch-fix `arabic_leak` and `all_caps` issues, then commit them back as ordinary `__rupture` patches.

### LLM assistance

- `src/app/api/translations/assist.ts`
- `src/lib/translation-assistance.ts`
- `src/lib/app-settings.ts`
- `src/lib/assist-provider-ids.ts`
- `src/lib/llm/index.ts`
- `src/lib/llm/types.ts`
- `src/lib/llm/providers/google.ts`
- `src/lib/llm/providers/nvidia.ts`
- `src/lib/llm/providers/huggingface.ts`
- `src/lib/llm/providers/cloudflare.ts`

Current supported tasks:

- `arabic_leak_correction`
- `all_caps_correction`

Current supported scopes:

- `file` from the translation detail page
- `batch` from the invalid excerpts page

The LLM returns structured corrections which are converted into staged local patches. The user reviews them, then explicitly commits them.

### Playback, stats, and legacy ingest

- `src/app/_browse/valid.tsx`
  Valid playback simulation page for reviewing what would be applied to the compilation file.
- `src/lib/compilation-playback.ts`
  Computes playback effects and can save a played compilation JSON.
- `src/lib/compilation-analytics.ts`
  Aggregates patch/task/provider activity for the analytics page.
- `src/app/api/translations/$id.ts`
  Legacy external save endpoint with idempotency and stale-write protection for direct client uploads.

## Important Data Shapes

### Common normalized translation file

Most file editing logic should reason in terms of `CommonConversationExport` from `src/lib/translation-types.ts`.

Key fields:

- `prompt`
- `response`
- `reasoning`
- `model`
- `reasoning_duration_sec`
- `__rupture`

### `__rupture`

Current persisted shape:

```ts
__rupture: {
  patches?: Record<string, RupturePatch>;
  patchMetadata?: Record<string, RupturePatchMetadata>;
  skip?: string[];
}
```

Keep these responsibilities separate:

- `patches` stores only patch ops
- `patchMetadata` stores provenance and explicit highlight data
- `skip` stores skipped excerpt IDs only

Do not mix transport metadata into the patch op format itself.

### `RupturePatchMetadata`

Current AI-generated patch metadata includes:

- `appliedAt`
- `source.kind`
- `source.provider`
- `source.task`
- `source.model`
- optional `source.modelVersion`
- optional `highlightRanges`
- optional `highlights`

For AI-generated corrections, prefer storing exact highlight ranges in metadata rather than reconstructing them later from the diff.

### Legacy ingest sidecar files

The legacy `POST /api/translations/$id` route may write:

- `<id>.json`
- `<id>.meta.json`
- `.idempotency/<hash>.json`

Do not break these sidecar files if you touch the legacy ingest path.

## Key Routes

### App pages

- `/`
- `/dashboard`
- `/analytics`
- `/compilation`
- `/shift`
- `/valid`
- `/invalid`
- `/translations/$fileNameId`
- `/prompts`
- `/settings`

### API routes

- `GET /api/dashboard/stats`
- `GET /api/meta`
- `GET /api/config/paths`
- `POST /api/config/paths`
- `GET /api/translations/files`
- `GET /api/translations/file?path=...`
- `PATCH /api/translations/file?path=...`
- `DELETE /api/translations/delete?path=...`
- `POST /api/translations/assist`
- `GET /api/translations/validate`
- `POST /api/translations/$id`
- `GET /api/compilation/excerpts`
- `GET /api/compilation/excerpts/shift`
- `GET /api/compilation/excerpts/payload`
- `GET /api/compilation/prompt`
- `POST /api/compilation/prompt`

## Current UX Behavior

- Root page is the dashboard.
- Sidebar filters live in the sidebar, not on the dashboard page.
- Translation page supports `table`, `json`, and `normal` views.
- Table view is the main review surface.
- Validation stays inline in the table.
- Clicking a translation cell enters inline edit mode.
- Blur stages a local pending patch only.
- `Commit` is the only action that persists patches.
- Single-row and bulk skip/unskip are supported in the table view.
- Invalid excerpts can be batch-selected, auto-fixed, and committed from the `/invalid` page.
- Valid playback is a simulation first; saving it writes a played compilation file only after explicit action.
- Shift control edits the persisted checkpoint used by `/api/compilation/excerpts/shift`.
- Assist-provider selection is stored client-side in browser local storage.

## Performance Expectations

- Keep memory usage bounded on compilation routes.
- Avoid repeated heavy file I/O where practical.
- Translation tree and analysis data may be cached for navigation smoothness, but must invalidate on file writes, deletes, or directory changes.
- Prefer the existing stream-based helpers for prompt and shift state instead of ad hoc full-file JSON reads.

## Coding Style

- Prefer arrow functions over `function` declarations.
- Prefer TypeScript `type` over `interface`.
- Keep changes focused and minimal.
- Preserve bright-theme-only UI behavior.
- Follow existing shadcn/Tailwind patterns unless intentionally refactoring.
- Use ESNext conventions, except in performance-sensitive business logic where straightforward loops are fine.
- For tests, use `bun:test` and the `it('should...')` naming convention.
- Tests should live adjacent to implementation files.

## Validation and Commands

Safe checks:

- `bunx tsc --noEmit`
- `bun run lint` or `bunx biome check ...`

Do not run unless explicitly requested:

- `bun test`
- `bun run build`

## Repo-Specific Lessons

- `src/routeTree.gen.ts` is generated by TanStack Router. Do not hand-edit it.
- Prompt selection is persisted in the compilation file itself, not in a standalone cache.
- Shift progress is persisted beside the compilation file as `.<compilation-name>.settings.json`.
- Translation highlight rendering is best driven from validator `segmentRange` or explicit stored metadata ranges. Reconstructing highlight intent from diffs alone is often lossy.
- If you change `__rupture` persistence, keep `patches`, `patchMetadata`, and `skip` in sync. Deleting a patch should also delete its metadata entry without disturbing skip state.
- The invalid excerpts page and translation detail page share the same assist tasks. If you change assist request or response contracts, update both flows.
- The translation page should stay mostly orchestration-focused. Business logic belongs in `src/lib/translation-file-view-model.ts`, `src/lib/invalid-excerpts-fixes.ts`, and related utility modules.
- When fixing lint findings, check whether the repo already has a simpler abstraction before adding state or hooks. This codebase prefers pragmatic, explicit data flow over extra indirection.

## Change Safety

- Do not run destructive git commands.
- Do not force push or rewrite history unless explicitly requested.
- If unexpected unrelated file changes appear mid-task and conflict with your work, pause and ask the user.
