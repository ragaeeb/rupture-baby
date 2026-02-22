# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Summary

`rupture-baby` is a Next.js backend API used by a browser extension.  
It serves Arabic excerpts that need translation and stores translation updates as the source of truth across browser profiles.

## Runtime and Tooling

- Use `bun` for all commands.
- Do not use `npm`/`yarn`/`pnpm`.
- Main framework: Next.js App Router.
- Language: TypeScript.

## Key Paths

- API route: `/Users/rhaq/workspace/rupture-baby/src/app/api/compilation/excerpts/route.ts`
- Types: `/Users/rhaq/workspace/rupture-baby/src/lib/compilation.ts`
- Main page (health check): `/Users/rhaq/workspace/rupture-baby/src/app/page.tsx`
- Data file env: `COMPILATION_FILE_PATH` (required)
- Translations dir env: `TRANSLATIONS_DIR` (required)

## Data Constraints

- `COMPILATION_FILE_PATH` target can be very large (>270MB).
- Do not read the entire file into memory per request.
- Do not dump or inspect the full JSON content in terminal output.
- Prefer streaming reads and filtering only required data.

## Excerpts API Contract (Current)

- Endpoint: `GET /api/compilation/excerpts`
- Query params:
  - `page` (1-based)
  - `pageSize`
- Response should return only untranslated excerpts (`text` missing or null).
- Pagination metadata must reflect untranslated subset only.

## Performance Expectations

- Keep memory usage bounded.
- Avoid repeated heavy file I/O when possible.
- Lazy in-memory caching of filtered untranslated excerpts is acceptable.
- Cache must refresh when source file changes.

## Coding Style

- Prefer arrow functions over `function` declarations.
- Keep changes focused and minimal.
- Preserve bright-theme-only UI behavior.
- Respond with minimal explanation and commentary unless asked for more details.
- Always prefer `bun` for package management and runtime commands; avoid `npm`/`node` unless absolutely necessary.
- Prefer TypeScript `type` over `interface`.
- Use ESNext conventions, except in performance-critical business logic where classic loops are preferred.
- For tests, always use `bun:test` and the `it('should...')` naming convention.
- Tests should always be adjacent to their implementation files.

## Validation

- Safe checks:
  - `bunx tsc --noEmit`
  - `bun run lint` (if requested or relevant)
- Do not run:
  - `bun test` unless explicitly requested
  - `bun run build` unless explicitly requested

## Change Safety

- Do not run destructive git commands.
- Do not force push or rewrite history unless explicitly requested by the user.
- If unexpected unrelated file changes appear mid-task, pause and ask the user.
