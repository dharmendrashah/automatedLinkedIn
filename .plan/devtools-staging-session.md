# Devtools: record and run with an account taken from staging

- Status: in progress <!-- draft | locked | in progress | done -->
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
   - the staging `LINKEDIN_CRED_ENC_KEY` and that database address come from one **local git-ignored file** (`apps/spider/.devtools-staging.env`, keys `DATABASE_URL`, `LINKEDIN_CRED_ENC_KEY`, optional `SPIDER_GCS_BUCKET`, the names the deployed config uses), never printed and never copied elsewhere;
   - the account's `identity.json`, `state.enc.json` and `profile.tar.gz.enc` with `gcloud storage cp` (the developer's own login, no new credentials model).
3. **Pick the account**: a list of staging accounts (email, status, proxy host, when its session was last saved) and the account's own proxy is used, so the exit address and language match what LinkedIn already knows of that account.
4. **Start from the pulled state**: identity, profile and session are put where `createRunEnvironment` already looks for them, then the existing menu continues: **Record a session** (browse by hand, steps saved) or **Run a task** (inputs asked from the task's schema, run, result shown), both now with the account signed in; a third choice, **Replay a staging run**, repeats the steps of a run folder picked from the account's staging runs.
5. **Nothing goes back to staging**: no upload, no lease written, no change to the account row. Recordings of the new run go to the local folder only.
6. **Clean up**: the pulled material is kept in its own temporary folder (mode 700) by default (owner, 2026-10-26); `--clean` removes it when the tool ends.

## Requirements

Confirmed (from your request): environment choice (local as it is; staging pulls the session, proxy and browser profile); pick the account to sign in with; record a new run with the account session; "automate follow the task".

Answered by the owner on 2026-10-26:

1. **Account and proxy rows:** a direct connection to the staging database. Consequences taken on: the file holds the database password; the laptop's address must be allowed by the database firewall; the staging connection has no TLS today (accepted risk in `MEMORY.md`), so the tool uses `sslmode=require` when the server offers it and says when it does not. The existing refusal of non-local hosts stays for the local path; the staging path accepts only the host named in the staging file.
2. **Key:** from the local git-ignored file above.
3. **"Automate follow the task": both.** (a) Run a task with the account's session (the existing "Run a task" mode). (b) Replay the steps of a staging run the developer picks (its `timeline.json`): it repeats the navigation, clicks, scrolls and key presses, and asks for any value that was typed, because the recorder never saves typed text (only its length) and the post words are never logged. A step the page no longer has is reported, and the replay stops there.
4. **One browser per account:** refuse to start when the worker holds the account's lease (`locks/<account>.json` not expired) or the account ran on staging in the last 10 minutes.
5. **Write back:** never. No upload, no lease, no change to the account row.
6. **On the laptop:** the pulled files are kept by default and removed at exit with `--clean`.
7. **No device or profile on staging yet:** stop and say which piece is missing.

## Scope and non-goals

- In scope: an environment question in `devtools/index.ts`, the `devtools/staging/` module (config file, database read, gcloud copy, account choice, replay), wiring the pulled state into `createRunEnvironment`, `recordSession` and `runMode`, tests for the pure parts, `.gitignore`, `MEMORY.md`.
- Out of scope: production, writing to staging, running the staging worker locally, a download button in the web app, changing how the worker stores things.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Tests first: the pure parts (account list from the pulled rows, sealed-to-config conversion, where the pulled files are placed, refusal when a lease is held, clean-up), with `gcloud` and `git` behind one small command runner that tests replace.
- [x] 3. `devtools/staging/`: `config.ts`, `database.ts` (read-only rows through `pg`), `pull.ts` (files through `gcloud storage cp`), `accounts.ts`, `seed.ts`, `replay.ts`, `start.ts`; cleanup in `seed.ts`.
- [x] 4. Wired the environment question and the chosen account into `index.ts`, `recordSession.ts`, `runMode.ts` and `runEnvironment.ts` (`seed`), local path unchanged.
- [x] 5. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass; a read-only live pull checked. A browser run and a replay on a test account are **not run yet** (they sign in to live LinkedIn and need the owner's go-ahead).

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

## Addendum 2026-10-26: run the same task again with the same input (locked by the owner's request)

The owner asked that, inside a staging session, picking a staging run pulls that run's input and its files and runs the task again with them to completion. A run's timeline holds no typed text, so step replay cannot type; the input has to come from where brain keeps it.

- **What is recoverable:** only `linkedin-post`: `PostPublication` (found by `sessionId`) holds the blocks (words, files, link), `audience` and `comments`; its files are in the bucket under their stored `key` (`posts/<user>/<file id>/<name>`). Other tasks keep no input, so for them Replay stays a step replay.
- **One builder:** `taskInputOf` (blocks to the task's `{ text, files }`) moves from brain to `packages/contracts` so the devtools build exactly what brain sends; brain keeps importing it.
- **Flow:** after the run is picked, a post run with a recoverable input offers "Run the post task again with the same input" or "Repeat the steps". The words, file names, audience and comments are shown and the owner confirms (it posts for real). The files are copied with `gcloud storage cp` into the pull folder (`<pull>/uploads/<file id>/<name>`) and the run reads them from there; they go with the pull folder at exit.
- **Never twice:** refused unless the publication is `FAILED` (QUEUED or SCHEDULED may still be sent by the worker; SENDING, POSTED and UNKNOWN may already be on LinkedIn). A file that is no longer in the bucket (deleted after a post that went) stops the run and says so.
- **Edge cases:** no publication row for the session (an older run or a workflow-made one without it) says the input could not be found and offers the step replay; blocks that no longer parse stop with a fixed sentence; the post text is shown only in the owner's own terminal and never logged or saved by the tool.
- **Steps:** all done (contracts `taskInputOf`, `readStagingPost`, `pullPostFiles`, `rerun` in run mode, `uploadsRoot` in the seed, the choice and confirmation in `start.ts`). A staging account also signs in first in run mode (its pulled session was not accepted from the laptop), and after a run that saved a session the next run takes that session instead of the older profile. Not run live.

## Outcome

Built (status `in progress` until a browser run is seen). Shipped: the Local or Staging question, account pick with proxy and last run, lease and 10 minute refusal, read-only pull of device, session and profile, Record, Run a task and Replay with the staging account, pulled files kept by default (`--clean` removes them at exit). Checked live read-only on staging: accounts, leases, and the device, session and profile of one account opened with the staging key. Deviations: the key names are the deployed ones (`DATABASE_URL`, `LINKEDIN_CRED_ENC_KEY`, `SPIDER_GCS_BUCKET`); a session missing on staging does not stop the pull (the profile carries the login), only a missing device or profile does; replay runs inside the record session so its steps are recorded too. Follow-ups: run it on a test account in a browser; a hard kill leaves the temp folder. Added after the first live try (the pulled session landed on `/uas/login`): the feed visit signs in by itself with the stored password and two-step key (staging only), applies the saved session to the open browser and carries on; the replay stops while signed out or at a step that lands on a sign-in page; a registry test requires `SIGNED_OUT` on every account task.
