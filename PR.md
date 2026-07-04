# Add ticket filtering and SLA status

Support agents asked for two things on the main ticket list: the ability to
filter it, and an at-a-glance signal for which tickets are breaching their SLA.
This wires both through the stack, and fixes an adjacent data bug the SLA work
surfaced.

## What changed

**SLA status**

- New pure module [`api/src/sla.ts`](api/src/sla.ts) — `computeSlaStatus()` derives
  one of `on_track | breached | met | none`. It branches on **status**:
  open/in_progress are judged live against `now`; resolved/closed are judged on
  their actual `resolved_at` (so historical breaches survive resolution).
- [`mappers.ts`](api/src/mappers.ts) now includes `slaStatus` on every `TicketDto`
  (computed in `toTicketDto`, with an injectable `now` for deterministic tests).

**Filtering**

- [`tickets.repository.ts`](api/src/tickets/tickets.repository.ts) `listTickets()`
  takes optional `status` / `assigneeId` / `unassigned` filters and builds a
  parameterised `WHERE` from only the ones present (no filters ⇒ same result as
  before). `unassigned` maps to `assignee_id IS NULL`.
- New `listTicketsQuerySchema` in [`tickets.schema.ts`](api/src/tickets/tickets.schema.ts)
  validates `?status=&assignee=`; `assignee` accepts an agent id or the literal
  `unassigned`. The `GET /tickets` handler parses it, so bad input returns a 400.

**Assignee dropdown data**

- New `GET /users` endpoint ([`users.routes.ts`](api/src/users/users.routes.ts) +
  `listUsers()`), so the assignee filter can list all agents, not just those who
  currently own a ticket.

**Adjacent bug fix (see DECISIONS.md)**

- [`updateStatus`](api/src/tickets/tickets.repository.ts) now clears `resolved_at`
  when a ticket is reopened (and preserves it on close), and bumps `updated_at` on
  every status change. Previously a resolved→reopened ticket kept a stale
  `resolved_at` — visible in the seed data as an in-progress ticket showing "Met".

**Frontend**

- [`TicketList.tsx`](web/src/TicketList.tsx) gains Status and Assignee dropdowns
  (Assignee includes an "Unassigned" option; refetches on change) and an SLA badge
  column via a small `SlaBadge`.
- [`types.ts`](web/src/types.ts) adds `SlaStatus` / `slaStatus` / `Agent`;
  [`styles.css`](web/src/styles.css) adds badge colours and filter layout, reusing
  the existing `.badge` convention.
- [`vite.config.ts`](web/vite.config.ts) proxies `/users` to the API (dev only) —
  without it the new endpoint fell through to the SPA and the dropdown was empty.

## How to review

Read in this order — each layer stands on its own:

1. `api/src/sla.ts` + `api/test/sla.test.ts` — the SLA rules and their proof.
2. `tickets.repository.ts` — the dynamic WHERE, the N+1 removal, and the
   `updateStatus` fix.
3. `tickets.schema.ts` + `tickets.routes.ts` — query validation.
4. `users.*` + `server.ts` — the new endpoint.
5. `web/src/*` — the UI.

## Testing

`npm test` from the repo root (needs the Docker Postgres running:
`docker compose up -d`). **22 tests pass.** Highlights:

- `api/test/sla.test.ts` — the SLA matrix, including a reopened ticket judged live
  (ignoring a stale `resolved_at`) and the on-the-dot boundary.
- `api/test/tickets.test.ts` — filter by status, assignee, unassigned, combined,
  invalid status ⇒ 400, `slaStatus` in responses, reopen clears `resolved_at`, and
  `GET /users`.

Also verified `npm run typecheck` (api) and `tsc --noEmit` (web) are clean.

## Out of scope (see DECISIONS.md)

No "at risk / due soon" state, filters aren't persisted in the URL, no frontend
test harness, no shared types package, and no migration to scrub the already-stale
`resolved_at` rows in the seed (the code fix stops new corruption).
