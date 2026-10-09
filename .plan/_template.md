# <Feature or task name>

- Status: draft <!-- draft | locked | in progress | done -->
- Created: <YYYY-MM-DD>
- Locked by user: no <!-- change to "yes, <date>" only after the user confirms -->

## Goal

One or two sentences: what changes and why.

## Requirements

Confirmed:

- ...

Open questions (must be empty before locking):

- ...

## Scope and non-goals

- In scope: ...
- Out of scope: ...

## Approach

- [ ] Step 1
- [ ] Step 2

## Edge cases and risks

Re-read the plan against the code and list what can go wrong: empty or invalid input, failures and retries, concurrency, idempotency, existing data and migrations, security and secrets, dev vs production, Docker and CI impact, rollback.

- ...

## Verification

- Commands and checks that prove it works (for example `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`).

## Outcome

Filled in when done: what shipped, deviations from the plan, follow-ups (also copy durable ones to `MEMORY.md`).
