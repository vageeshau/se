# Decision Log

## Assumptions I made

- **Which statuses exist.** The brief said "Open/Closed/Pending", but the actual
  database uses `open`, `in_progress`, `resolved`, `closed`. I went with the real
  ones from the code.

- **How SLA is judged.** A ticket is due within `sla_hours` of being created
  (deadline = created time + SLA hours). How I judge it depends on the state:
  - Still being worked on (open / in progress) → compare the deadline to **now**.
  - Finished (resolved / closed) → compare the deadline to **when it was actually
    resolved**.

  This matters: if I always used "now", a ticket that missed its deadline would
  suddenly look fine the moment someone resolved it. Judging finished tickets by
  their resolution time keeps that history honest.

- **Exactly on the deadline counts as on time.** (A tiny edge case, but I wanted
  the code and tests to agree on it.)

- **A closed ticket that was never resolved shows no SLA badge** (just a dash).
  These are things like spam or duplicates that were never meant to be resolved,
  so marking them "breached" would just be noise.


## Design decisions

- **SLA is calculated on the server, not in the browser.** One place owns the
  rule, the UI just shows the result, and it's easy to test. It also avoids a
  timezone trap — if the browser did the math, two agents in different timezones
  could see different colours for the same ticket. Doing it on the server (in
  UTC) means everyone sees the same thing.

- **The SLA rule looks at a ticket's status, not just whether it has a resolved
  date.** This is deliberate — see the reopen bug below.

- **Filtering is done in the database, safely.** I only add a filter to the query
  when one is actually chosen (no filters = the original query, unchanged). All
  values are passed as query parameters, never glued into the SQL text, so
  there's no injection risk.

- **"Unassigned" is a real filter option.** Picking it finds tickets with no
  assignee. Bad input (a made-up status, a negative id) is rejected with a 400.

- **Added a small `GET /users` endpoint** to populate the assignee dropdown, so it
  lists every agent — not just ones who happen to own a ticket right now.

- **Kept the change small and in-style**, following the existing folder and file
  patterns instead of inventing new ones.

## Where I used AI

- I used AI (Claude) to draft the repetitive parts — the filter query, the input
  validation, the badge component, and test scaffolding — then checked each piece
  against the existing code style.
- I overrode it where it wanted to do the SLA math in React, glue user input into
  SQL, or add a new folder structure.
- The SLA rules and the tricky edge cases (the two-path judging, reopened tickets,
  closed-without-resolution) were my calls, decided up front — not accepted from a
  first draft.

## Things I noticed in the existing code

- **Reopened tickets kept a stale "resolved" date (fixed).** When a ticket was
  resolved and then moved back to open, the code never cleared its resolved date.
  The seed data actually has one of these — an in-progress ticket that showed
  "Met SLA" because of a leftover resolved date. I fixed it in two places: the SLA
  rule now ignores that stale date for active tickets (so existing bad rows still
  display correctly), and the status-update code now clears the date on reopen (so
  it stops happening).

- **The "last updated" time was never changing (fixed).** Status changes didn't
  touch `updated_at`; now they do.

- **The ticket list made lots of extra database calls (fixed).** It fetched every
  ticket, then looked up the assignee and comment count one ticket at a time. The
  single-ticket view already did this in one combined query, so I made the list do
  the same — fewer calls, and it hands me the SLA data in one go.

- **The dev server wasn't forwarding the new endpoint (fixed).** The frontend's
  `/users` request wasn't being passed through to the API, so the dropdown came up
  empty with no error. One line of config fixed it. (Local dev only.)

- **The ticket shape is written out twice** — once in the API, once in the
  frontend — with nothing keeping them in sync. I updated both, but a shared
  definition would be better. Flagged, not fixed (out of scope).

- **There's no login or authentication at all.** Anyone who can reach the API can
  read or change tickets. Not part of this task — just flagging it.

## What I'd do with more time

- A quick one-time database cleanup to fix the leftover resolved dates already in
  the seed data (my code fix stops new ones, but doesn't clean old rows).
- Frontend tests (there's currently no test setup on the web side).
- Remember the chosen filters in the URL, so a filtered view can be shared or
  survives a refresh.
- An "at risk / due soon" badge for tickets close to their deadline.
- A single shared ticket definition used by both the API and the frontend.
