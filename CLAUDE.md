# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DeskLine is a support-desk service split into two workspaces: `api/` (Fastify + PostgreSQL backend) and `web/` (React + Vite agent UI). The root `package.json` only orchestrates the two via `npm --prefix`; there is no shared build. Install dependencies in each workspace separately (`cd api && npm install`, `cd web && npm install`).

## Commands

Run from the repo root:

- `docker compose up -d` — start PostgreSQL 15 (localhost:5432, `postgres`/`postgres`/`deskline`) and Adminer (:8081). **The database must be running for the API, the seed script, and the tests.**
- `npm run seed` — drop/recreate tables from `api/db/schema.sql` and load `api/db/seed.sql`. Safe to re-run for a fresh dataset.
- `npm run dev:api` — API on :3000 (tsx watch).
- `npm run dev:web` — web on :5173, proxies `/tickets` → :3000.
- `npm test` — API test suite (Vitest).

Inside `api/`:

- `npm run typecheck` — `tsc --noEmit`. There is no linter; typecheck is the only static check.
- `npx vitest run test/tickets.test.ts` — run a single test file.
- `npx vitest run -t "returns all tickets"` — run tests matching a name.

Inside `web/`: `npm run build` runs `tsc --noEmit && vite build` (the only typecheck for the web app).

## Testing model

Tests run against a **separate `deskline_test` database** on the same Postgres instance; the dev DB is never touched. `test/helpers.ts` creates that database on first run (`ensureTestDatabase`) and `resetDatabase` drops/recreates all tables and loads inline fixtures before every test. Tests exercise the real Fastify app via `app.inject` against real SQL — there are no mocks, so Postgres must be up. `fileParallelism: false` (vitest.config.ts) because all files share one database.

## Backend architecture

Request flow: `tickets.routes.ts` (thin handlers) → `*.repository.ts` (all SQL) → `mappers.ts` (row → DTO). `buildServer()` in `server.ts` wires the error handler and routes and is used by both the entrypoint and tests.

Conventions that span files — follow these when adding features:

- **All SQL lives in `*.repository.ts`.** Route handlers only validate, call repositories, and shape the response.
- **Validation is zod in `*.schema.ts`**, `.parse()`d at the top of each handler. `ZodError` is turned into a 400 automatically by `errorHandler`.
- **Errors are thrown as `AppError(statusCode, message)`** (from `errors.ts`) and rendered centrally by `errorHandler`; anything else becomes a 500. Do not build error responses inline in handlers.
- **DB columns are `snake_case`; API responses are `camelCase`.** The boundary is `mappers.ts` (`toTicketDto` / `toCommentDto`) — every row returned to a client goes through a mapper, and mappers also serialize `Date` → ISO string.
- Adding a resource means a parallel `<name>/` folder with `.repository.ts`, `.routes.ts`, `.schema.ts`, plus DTO/mapper entries, registered in `server.ts`.

Note: `listTickets` in `tickets.repository.ts` does per-row lookups for assignee name and comment count (N+1), whereas `getTicketById` does the same work in one joined query. Prefer the joined approach for new list endpoints.

## Frontend architecture

`web/` is a minimal React SPA with no router library — `App.tsx` does hash routing by hand (`#/tickets/:id` → detail, otherwise the list). All HTTP goes through `request<T>()` in `api.ts`, which reads the `{ error }` shape produced by the API's error handler. In dev, Vite proxies `/tickets` to the API, so calls use relative paths.

## Configuration

The API reads `DATABASE_URL` and `PORT` from the environment (an `.env` in `api/` is loaded via dotenv). Defaults match the compose setup; see `api/.env.example`. Tests default to the `deskline_test` URL and honor `DATABASE_URL_TEST`.
