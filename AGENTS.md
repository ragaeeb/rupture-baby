# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Summary

`rupture-baby` is a Bun-based Next.js App Router server for an Arabic translation workflow.

It does two main jobs:

- serves untranslated excerpts out of a very large compilation JSON file
- acts as the canonical editor/review surface for saved translation JSON files in `TRANSLATIONS_DIR`

The current app is not just an API for a browser extension anymore. It also includes:

- a dashboard at `/`
- a sidebar-driven translation file browser
- inline editing and patch staging for translation excerpts
- validation and review UX for LLM translation output
- Gemini-powered Arabic leak correction that stages changes as patches for human review

## Runtime and Tooling

- Use `bun` for all commands.
- Do not use `npm`/`yarn`/`pnpm`.
- Main framework: Next.js App Router.
- Language: TypeScript.
- React version: 19.x.
- React Compiler is enabled in `next.config.ts`.

## Key Environment Variables

- `COMPILATION_FILE_PATH` required
- `TRANSLATIONS_DIR` required
- `GOOGLE_API_KEY` required for Arabic leak auto-fix via Gemini

## High-Level Architecture

### Compilation pipeline

This is the large source corpus path.

- `src/app/api/compilation/excerpts/route.ts`
  Returns paginated untranslated excerpts only.
- `src/app/api/compilation/excerpts/shift/route.ts`
  Returns shift-oriented excerpt payloads.
- `src/app/api/compilation/excerpts/payload/route.ts`
  Returns prompt/model payloads for translation runs.
- `src/lib/untranslated-cache.ts`
- `src/lib/shift-cache.ts`
- `src/lib/prompt-state.ts`

Important:

- `COMPILATION_FILE_PATH` can be very large, often hundreds of MB.
- Do not read the full compilation JSON into memory on each request.
- Prefer streaming/filtering logic.
- If you touch compilation routes, keep memory usage bounded.

### Translation file workflow

This is the main review/edit UI path.

- `src/app/translations/[fileNameId]/page.tsx`
  Thin page shell for fetch/state/commit.
- `src/components/translations/translation-table-view.tsx`
  Main review table UI.
- `src/components/translations/click-to-edit-text.tsx`
  Inline edit control for translation cells.
- `src/lib/translation-file-view-model.ts`
  Business logic for table rows, patch merging, pending edits, and auto-fix staging.
- `src/lib/translation-patches.ts`
  Patch schema, playback, normalization, and highlight helpers.
- `src/lib/translations-browser.ts`
  Read/write translation JSON files and persist `__rupture` metadata atomically.
- `src/app/api/translations/file/route.ts`
  File read/patch write route.

### Validation

- `src/lib/translation-parser.ts`
  Normalizes file formats and validates response segments.
- `src/lib/validation/utils.ts`
  Canonical validation rules.
- `src/lib/validation/types.ts`
  Stable error types and shared range types.
- `src/lib/validation/textUtils.ts`
  Parsing and normalization helpers for `ID - text` segment responses.

Validation is response-centric:

- Arabic source is treated as canonical.
- Validation errors are attached to translated response segments.
- `segmentRange` is the preferred way to drive UI highlights.

### Gemini assistance

- `src/app/api/translations/assist/route.ts`
- `src/lib/translation-assistance.ts`
- `src/lib/llm/index.ts`
- `src/lib/llm/types.ts`
- `src/lib/llm/providers/google.ts`

Current supported task:

- file-level `arabic_leak_correction`

The LLM returns structured corrections which are converted into staged local patches. The user reviews them, then explicitly commits them.

### Shell / app data access

- `src/lib/shell-api.ts`
- `src/lib/shell-types.ts`

These are the main client-facing fetch helpers and wire contracts for the app shell.

## Important Data Shapes

### Common normalized translation file

Most file editing logic should reason in terms of `CommonConversationExport` from `src/lib/translation-types.ts`.

Key fields:

- `prompt`
- `response`
- `reasoning`
- `model`
- `__rupture`

### `__rupture`

Current persisted patch shape:

```ts
__rupture: {
  patches?: Record<string, RupturePatch>;
  patchMetadata?: Record<string, RupturePatchMetadata>;
}
```

Keep these responsibilities separate:

- `patches` stores only patch ops
- `patchMetadata` stores provenance and explicit highlight ranges

Do not mix transport metadata into the patch op format itself.

### `RupturePatchMetadata`

Current AI-generated patch metadata includes:

- `appliedAt`
- `source.kind`
- `source.provider`
- `source.task`
- `source.model`
- `source.modelVersion`
- optional `highlightRanges`

For AI-generated corrections, prefer storing exact highlight ranges in metadata rather than reconstructing them later from the diff.

## Key Routes

### App pages

- `/` dashboard
- `/dashboard` dashboard alias
- `/translations/[fileNameId]` translation file review/editor
- `/prompts` prompt selection UI

### API routes

- `GET /api/dashboard/stats`
- `GET /api/meta`
- `GET /api/config/paths`
- `GET /api/translations/files`
- `GET /api/translations/file?path=...`
- `PATCH /api/translations/file?path=...`
- `POST /api/translations/assist`
- `GET /api/translations/validate`
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
- Clicking an errored translation cell enters inline edit mode.
- Blur stages a local pending patch only.
- `Commit` is the only action that persists patches.
- Arabic leak auto-fix stages AI suggestions as pending edits first.

## Performance Expectations

- Keep memory usage bounded on compilation routes.
- Avoid repeated heavy file I/O where practical.
- Translation tree/dashboard shell data may be cached client-side for navigation smoothness.
- Translation tree cache must invalidate when files or nested directories change.

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

- `tsconfig.json` includes `.next/dev/types/**/*.ts`. If `.next` is missing, `bunx tsc --noEmit` can fail before reaching real source errors. In normal development, prefer leaving `.next` alone unless you have a reason to regenerate it.
- Translation highlight rendering is best driven from validator `segmentRange` or explicit stored metadata ranges. Reconstructing highlight intent from diffs alone is often lossy.
- If you change `__rupture` persistence, keep `patches` and `patchMetadata` in sync. Deleting a patch should also delete its metadata entry.
- Prompt selection is persisted in the compilation file itself, not in a standalone cache.
- The translation page should stay thin. Business logic belongs in `src/lib/translation-file-view-model.ts` and related utility modules.
- When fixing lint findings, check whether the repo already has a simpler abstraction before adding state or hooks. This codebase prefers pragmatic, explicit data flow over extra indirection.

## Change Safety

- Do not run destructive git commands.
- Do not force push or rewrite history unless explicitly requested.
- If unexpected unrelated file changes appear mid-task, pause and ask the user.
