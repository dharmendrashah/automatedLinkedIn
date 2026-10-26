# Devtools: record and run with an account taken from staging

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 (answers below)

## Goal

`dev:record` asks which environment to use. **Local** stays exactly as it is. **Staging** pulls what one staging LinkedIn account needs (its proxy, its device, its browser profile and its signed-in session), lets the developer pick the account, and then records a new run of a task, or runs it, with that account's session on this computer. A failure seen on staging (for example the post composer that did not open, `.plan/post-composer-not-opening.md`) can then be repeated and fixed with the same account state, without touching staging.

## What exists today (checked in code, 2026-10-26)

- `apps/spider/src/devtools/index.ts` lists the proxies of the **local** database (`localDb.ts`: a direct `pg` connection to `apps/brain/.env`'s `DATABASE_URL`, refused for any host but localhost or 127.0.0.1, key `LINKEDIN_CRED_ENC_KEY` of that file), then offers "Record a session" (`recordSession.ts`) or "Run a task" (`runMode.ts`).
- `runEnvironment.ts` runs a task with free rules (no allowlist, robots or delay, and **no account lease**), the device (`IdentityStore`) and the browser profile (`DiskProfiles`) on disk under `.devtools-recordings/`, the signed-in session in memory only (`SessionVault` over `MemoryStore`), and a `LocalStore` for the recording.
- On staging, the worker keeps the same things in the bucket `automate-linkedin-511215-spider`: `identities/<account>/identity.json`, `sessions/<account>/state.enc.json` (sealed), `profiles/<account>/profile.tar.gz.enc` (sealed) and the lease `locks/<account>.json`. The account rows and proxy rows (credentials sealed) are in the staging PostgreSQL (external Cloud SQL, no TLS, reachable only from the cluster). Everything sealed uses staging's own `LINKEDIN_CRED_ENC_KEY`, held in the Kubernetes secret.
- The staging run folders (`runs/<task>/<user>/<date>/<task id>/`) were already readable with `gcloud storage cp` (used for the post composer finding).

## Proposal

1. **Environment question first.** `Local` (as today, no change) or `Staging`.
2. **Staging pull** (read only, into a temp folder):
   - the account and proxy rows (sealed) from the staging database through a **direct connection** from the laptop, in a read-only transaction that selects only the `LinkedInAccount` and `ProxyServer` columns the tool needs (owner's choice, 2026-10-26);
   - the staging `LINKEDIN_CRED_ENC_KEY` and that database address come from one **local git-ignored file** (`apps/spider/.devtools-staging.env`, keys `STAGING_DATABASE_URL`, `STAGING_LINKEDIN_CRED_ENC_KEY`, optional `STAGING_GCS_BUCKET`), never printed and never copied elsewhere;
   - the account's `identity.json`, `state.enc.json` and `profile.tar.gz.enc` with `gcloud storage cp` (the developer's own login, no new credentials model).
3. **Pick the account**: a list of staging accounts (email, status, proxy host, when its session was last saved) and the account's own proxy is used, so the exit address and language match what LinkedIn already knows of that account.
4. **Start from the pulled state**: identity, profile and session are put where `createRunEnvironment` already looks for them, then the existing menu continues: **Record a session** (browse by hand, steps saved) or **Run a task** (inputs asked from the task's schema, run, result shown), both now with the account signed in; a third choice, **Replay a staging run**, repeats the steps of a run folder picked from the account's staging runs.
5. **Nothing goes back to staging**: no upload, no lease written, no change to the account row. Recordings of the new run go to the local folder only.
6. **Clean up**: the decrypted material is removed when the tool ends, unless `--keep` was given.

## Requirements

Confirmed (from your request): environment choice (local as it is; staging pulls the session, proxy and browser profile); pick the account to sign in with; record a new run with the account session; "automate follow the task".

Answered by the owner on 2026-10-26:

1. **Account and proxy rows:** a direct connection to the staging database. Consequences taken on: the file holds the database password; the laptop's address must be allowed by the database firewall; the staging connection has no TLS today (accepted risk in `MEMORY.md`), so the tool uses `sslmode=require` when the server offers it and says when it does not. The existing refusal of non-local hosts stays for the local path; the staging path accepts only the host named in the staging file.
2. **Key:** from the local git-ignored file above.
3. **"Automate follow the task": both.** (a) Run a task with the account's session (the existing "Run a task" mode). (b) Replay the steps of a staging run the developer picks (its `timeline.json`): it repeats the navigation, clicks, scrolls and key presses, and asks for any value that was typed, because the recorder never saves typed text (only its length) and the post words are never logged. A step the page no longer has is reported, and the replay stops there.
4. **One browser per account:** refuse to start when the worker holds the account's lease (`locks/<account>.json` not expired) or the account ran on staging in the last 10 minutes.
5. **Write back:** never. No upload, no lease, no change to the account row.
6. **On the laptop:** the pulled files are removed when the tool ends (`--keep` keeps them).
7. **No device or profile on staging yet:** stop and say which piece is missing.

## Scope and non-goals

- In scope: an environment question in `devtools/index.ts`, the `devtools/staging/` module (config file, database read, gcloud copy, account choice, replay), wiring the pulled state into `createRunEnvironment`, `recordSession` and `runMode`, tests for the pure parts, `.gitignore`, `MEMORY.md`.
- Out of scope: production, writing to staging, running the staging worker locally, a download button in the web app, changing how the worker stores things.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [ ] 2. Tests first: the pure parts (account list from the pulled rows, sealed-to-config conversion, where the pulled files are placed, refusal when a lease is held, clean-up), with `kubectl` and `gcloud` behind one small command runner that tests replace.
- [ ] 3. `devtools/staging/`: `config.ts` (reads `.devtools-staging.env`, refuses a missing key or an unexpected host), `pull.ts` (read-only rows through `pg`, files through `gcloud storage cp` behind one small command runner that tests replace), `accounts.ts` (list and choice, lease and recent-run check), `replay.ts` (reads a staging run's `timeline.json` and repeats its steps), cleanup.
- [ ] 4. Wire the environment question and the chosen account into `index.ts`, `recordSession.ts` and `runMode.ts`, keeping the local path unchanged.
- [ ] 5. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; one real run against staging with a test account, with your go-ahead.

## Edge cases and risks

- **Secrets on a laptop.** The pull decrypts staging credentials and a live LinkedIn session on this computer. It needs the staging database password and key in a local file (git-ignored; add `.devtools-staging.env` to `.gitignore` in the same change and refuse to run when it is tracked or world-readable), and read on the bucket; the key and password are never printed or copied; files are removed at the end; the tool refuses any database host other than the one in that file. A direct connection also means the staging database password sits on the laptop and the connection crosses the internet (TLS only when the server offers it): treat the laptop like staging.
- **Account safety.** A second browser on the same session can make LinkedIn cancel it. The lease check (question 4) and the account's own proxy keep the device, language and address the same as staging; a browser opened from a laptop is still a new place for the session to be used from, so use a test account first.
- **LinkedIn rules.** It acts on the developer's own account with the same task code and the same pace as the worker (a person is watching, free rules as in the local devtools); nothing is scraped from other people beyond what the task already does.
- **Stale or missing pieces.** A session that LinkedIn has since cancelled signs out on the first page (the task says so); a missing device, profile or session says which one is missing (question 7).
- **Tool availability.** `gcloud` not installed or not logged in (the Google login that expires every few hours), the database unreachable from this address, or the staging file missing: the tool says which one and what to do, never retries in a loop.
- **Replay limits.** The timeline holds the call, its target and the address after it; typed text, post words and file names are not in it. Selectors that LinkedIn changed since the run will not match; the replay says which step it stopped at.
- **Rolling back.** The local path is untouched; remove the environment question and the `staging/` folder.
- **Not verifiable here:** a real pull needs the developer's staging database and bucket access.

## Verification

- Unit tests for the pure parts; the existing devtools tests unchanged and passing.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- A pull, a run and a replay on a test account on staging, with your go-ahead, reported as not run until then.

## Outcome

Filled in when done.
