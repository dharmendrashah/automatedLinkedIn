# Visit a profile: open any saved profile, wait 5 seconds, scroll the whole page

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (answers: saved profiles and pasted links both; one profile per click; limits 15 a day, never twice in 30 days, 3 minutes between visits; the do-not-contact list is NOT checked; wait 5 to 6 s; the dialog does not promise an alert; the task is called "View someone's profile" (`linkedin-view-profile`); branch from main)

## Goal

A spider task `linkedin-view-profile` (title "View someone's profile") that opens one LinkedIn profile as one of the owner's accounts, waits about 5 seconds, scrolls the whole page like a person reading it, and leaves. It reads and changes nothing. The intention is the visit itself: LinkedIn tells the person that someone viewed their profile, which is a soft first touch before a message or a connection request. Brain gets a "Visit" action on the owner's saved profiles that asks for it, with limits so it stays a few deliberate visits and never a sweep.

## Owner's answers (locked 2026-10-24); where they differ from the text below, they win

- Which profiles: both the owner's saved profiles and a pasted link (a pasted link of a person who is saved is tied to that saved profile).
- One profile per click; no bulk.
- Limits as proposed: 15 views a day for each account (rolling 24 hours), the same person never twice from one account in 30 days, 3 minutes between visits (the cooldown the owner can confirm past).
- The do-not-contact list is NOT checked.
- Wait 5 to 6 seconds; the dialog does not promise that the person is alerted.
- The task is called "View someone's profile", task name `linkedin-view-profile` (wherever the text below says `linkedin-visit-profile` or "Visit profile").
- Branch from `main`.

## What exists today (checked in code, 2026-10-24)

- The framework: a task is a folder plus one line in `apps/spider/src/tasks/registry.ts`; the runner opens the saved session behind the account's proxy, takes the account lease, records the run, and `context.visit(url)` applies the host allowlist, the robots exemption and the per-host gap. `linkedin-browse` (daily visit) and `linkedin-profile` (reads the own profile) are the closest tasks.
- Shared pieces that already do what this needs: `linkedinProfile/pages.ts` (`createPages`: `open(address)`, which now also waits until the page has drawn, and `scrollThrough()`, which scrolls down at a person's pace until the page stops moving, 25 steps at most), `profileReader.parseTopCard` (tells a profile page from any other), `linkedin/session.ts` (`SignedOut`), `linkedin/pace.ts`.
- Brain: `TaskService.request` (outbox, hooks, `onStart(id, tx)` to save a row with the session, one-at-a-time and cooldown policy, confirm-to-run-anyway), the owner's saved target profiles `LinkedInProfile` (`/profiles`, link only, soft delete, unique `(userId, slug)`), `core/linkedInUrl.ts` (`parseLinkedInUrls`), the do-not-contact `Suppression` table, `LinkedInAccountProfile.data.profileUrl` (the account's own address, stored since PR #92).
- Not there: a task that opens someone else's profile on purpose, a record of which account visited whom, a Visit action on `/profiles`.

## Proposal

### The task `linkedin-visit-profile` (spider, version 1)

- Input (strict): `profileUrl`, an `https://www.linkedin.com/in/<slug>/` address (a vanity or numeric id; no query, no other path, no other host), checked by the task itself, not only by brain. Needs an account and a proxy; one at a time per account; a cooldown of 3 minutes between two visits of an account; task limit 3 minutes.
- Steps, human-paced:
  1. `pages.open(profileUrl)` (through `context.visit`, so the allowlist, the robots exemption and the host gap apply).
  2. Check the page is a profile with `parseTopCard`; if LinkedIn shows a sign-in wall, a login page or a checkpoint the run ends `SIGNED_OUT`; if it shows a page that does not exist or a profile that is not available, `NOT_AVAILABLE`.
  3. Wait about 5 seconds (5 to 6 s, drawn per run).
  4. `pages.scrollThrough()` to the end of the page (lazy sections draw as it goes), then stop. The browser closes; nothing is clicked.
- Never clicked: no Connect, Follow, Message, Endorse, Save, "More", no link on the page. The only inputs are the address and the wheel. A test asserts that no click is ever made.
- Reads nothing: no name, headline or text of the profile is kept, logged or reported. The report is one fixed sentence ("Visited the profile.") and no counts. The profile's own address is in the run's input (the owner's saved link) and in the visit row below, never in a log line.
- Verdicts: `DONE` (opened, looked like a profile, waited and scrolled), `NOT_AVAILABLE` (the page is gone or hidden), `SIGNED_OUT` (sign-in wall; the sign-in check runs next, as for the other tasks), `ERROR` (could not open, a 429/999 style refusal, or a crash; fixed sentences, no retry loop).
- `createPages` and its helpers move from `tasks/linkedinProfile/pages.ts` to `linkedin/pages.ts`, because two tasks now use them (reuse, not a copy). No behaviour change; tests move with it.

### Brain

1. **Migration `add_linkedin_profile_visit`** (additive): `LinkedInProfileVisit` with `id`, `userId` (cascade), `accountId` (cascade), `profileId` (the saved profile, `SetNull` on delete), `slug` (kept, so the 30 day rule survives a deleted profile), `sessionId` unique (the run), `status` (`ASKED`, `DONE`, `NOT_AVAILABLE`, `FAILED`), `createdAt`, `finishedAt`. Index `(accountId, createdAt)` for the daily count and `(accountId, slug)` for the repeat rule. It holds no profile content.
2. **Service `ProfileVisitService.request(userId, profileId, accountId, confirmed?)`** (one class in `src/database`): owner-checks both ids (a foreign id answers like a missing one), refuses an archived profile, a person on the owner's do-not-contact list, the account's own profile (slug equal to the stored own address), an account that is not `ACTIVE`, a visit that would pass the daily cap, and a person this account already visited in the last 30 days; then calls `TaskService.request` with `input: { profileUrl }`, trigger `manual`, and saves the `ASKED` visit row in the same transaction through `onStart`. The refusals are fixed sentences the owner can read.
3. **Hook** `linkedinVisitProfile.hooks.ts`: `onRequest` refuses unless the account is `ACTIVE`; `onResult` sets the visit row's status from the verdict and `finishedAt`, and brings the sign-in check forward on `SIGNED_OUT`. No network call.
4. **Router**: `linkedInProfile.visit({ id, accountId, confirmed? })` (errors mapped like `task.run`: `CONFLICT` for the cooldown, `PRECONDITION_FAILED` for a refusal) and the profile list returns for each profile when it was last visited and by which account (`lastVisit`), so the page can show it.
5. **Retention:** visit rows stay while the account and the owner exist (the 30 day rule needs them); deleting the profile, the account or the user removes or detaches them.

### Body

- `/profiles` row action "Visit profile": a small dialog with the accounts that are signed in (a blocker sentence for the others), a plain notice ("They will see that this account visited, unless the account's LinkedIn visibility setting hides it. This app does not change that setting."), the account's visit count for today against the cap, and a confirm button. After it starts: "Started. Follow it in Sessions" (the same line the other actions use).
- The profiles table shows "Visited 2 days ago" with the account in a tooltip, when there was a visit.
- Pure helpers with unit tests written first (sentences for the refusals, the "visited" text, which accounts are choosable).

## Requirements

Confirmed (from your request):

- A task that visits a profile, waits 5 seconds and scrolls the whole page, so the other person is told someone visited.

Open questions (must be empty before locking; each has a proposed default):

1. **Which profiles.** Only profiles the owner saved on `/profiles` (the list, the duplicate rules and the do-not-contact check all hang on it), or also any pasted link. Default: saved profiles only in the app; the devtools can run the task on any address for testing.
2. **One at a time.** One profile per click, no "visit all" or bulk in this version (a workflow block can use the task later, in its own plan). Default: one per click.
3. **Limits.** At most 15 visits a day per account (rolling 24 hours), the same person never twice from the same account within 30 days (both hard refusals), and 3 minutes between two visits of an account (the usual cooldown, which the owner can confirm and override). Default: these numbers.
4. **Do not contact.** A person on the do-not-contact list is refused. Default: yes.
5. **The 5 seconds.** Exactly 5 s plus up to 1 s of variation, so every visit is not identical. Default: 5 to 6 s.
6. **What the other person sees.** The visit shows the account (name and headline) in their "who viewed your profile", unless the account's own LinkedIn setting hides it (private mode). The app cannot read or change that setting, so the dialog says so and does not promise an alert. Default: yes.
7. **Task name and place.** `linkedin-visit-profile`, title "LinkedIn profile visit". Default: yes.
8. **Branch.** A new branch from `main` (PR #92 is separate; the only shared file is the `linkedInProfile` router area and the `TASK_HOOKS` line, so conflicts are small). Default: from `main`.

## Scope and non-goals

- In scope: the spider task and its tests, moving the shared page helpers, the visit table and service, hook, router change, the Visit action and dialog on `/profiles`, tests, `MEMORY.md`.
- Out of scope: reading anything from the visited profile, connecting, following, messaging, endorsing, visiting many people in a row or on a schedule, a workflow block for it, reading "who viewed your profile" back, changing the account's visibility setting.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Branch from `main`; move `createPages` and helpers to `linkedin/pages.ts` (tests still pass, no behaviour change).
- [x] 3. Spider task, tests first: the address check (only `/in/<slug>/` on linkedin.com), a profile opens, waits and scrolls to the end, nothing is clicked, sign-in wall, page not available, a failed load, no name or word of the profile in any log line or the report, the 5 to 6 s wait; registry line; answer sentences.
- [x] 4. Migration `add_linkedin_profile_visit` (create-only, read the SQL, then deploy locally).
- [x] 5. `ProfileVisitService` and hook, tests first (each refusal, the cap, the 30 day rule, the visit row saved with the session, the verdict to status, owner scoping, a foreign id).
- [x] 6. Router `linkedInProfile.visit` and `lastVisit` in the list, with resolver tests.
- [x] 7. Body: the action, the dialog, the "visited" text, helpers with tests first.
- [x] 8. Integration test with Postgres (cap, repeat rule, row to status). A real-browser test of the task against a stand-in profile page was NOT written: the readers of the page are not involved, and the live visit covers what it would.
- [ ] 9. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed; one live visit on a profile of your choice with your go-ahead; `MEMORY.md`; plan done.

## Edge cases and risks

- **Compliance and account risk (the main one).** Viewing a profile is something a person does by hand, and this does the same single action, but doing it by automation to prompt a notification is exactly what LinkedIn's terms call automated activity when it is done in volume, and an account that does it a lot can be restricted. The design keeps it small and deliberate: one profile per click by the owner, a daily cap, a gap between visits, never the same person twice in 30 days, a human pace, a proxy, the account's own session, nothing read or changed. It still carries the risk that LinkedIn restricts an account that visits many profiles; the owner decides how many to ask for, and the cap is the guard rail.
- **Third-party data.** Nothing from the profile is read or kept. The visit row keeps the slug the owner already saved.
- **Does it alert at all?** LinkedIn shows the viewer to the person only when the viewer's setting allows it, and free accounts and the viewed person's own settings change what they see. The task cannot know; the answer is only "visited", never "they were told".
- **Redirects and odd pages.** A vanity address that moved, a numeric id, a profile that is private or out of network (a limited view with a sign-up prompt), a deleted profile ("This page doesn't exist"), the account's own profile (refused in brain; the task also ends without waiting if the top card is the account's own). Each ends with one of the fixed verdicts.
- **Sign-in wall or checkpoint.** `SIGNED_OUT` (or a security check seen by the sign-in task): no retry, the sign-in check is brought forward.
- **Page never stops growing.** The scroll stops after 25 steps, as for the profile read; the run's time limit is a backstop.
- **Slow proxy.** The page can take half a minute to draw; the open waits for it (the render wait), and the 5 seconds start after it, so the visit is not counted before the page showed.
- **Double click or two tabs.** One at a time per account and the visit row saved in the same transaction as the task; a second click gets "already running".
- **A visit that failed.** `FAILED` and `NOT_AVAILABLE` rows count toward the daily cap (LinkedIn may have seen the visit) but not toward the 30 day rule, so the owner can try again later.
- **Account paused, signed out or restricted.** Refused with a sentence; a `BLOCKED` or `DISABLED` account never visits.
- **Concurrency with other tasks.** The account lease keeps the visit apart from the message read, the daily visit and the profile read.
- **Migration and rollback:** additive table; rolling back leaves it unused. Never reset a database.
- **Dev vs production:** the devtools run it on any address with `capture` free browsing; production goes through the allowlist and the robots exemption; the stand-in test never touches LinkedIn.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; integration tests with Postgres; a real-browser test of the spider task against a stand-in profile page.
- One live visit through the devtools (`dev:record`, Run a task) on a profile you name, with your go-ahead at that moment, to confirm the wait and the full scroll on the real page. State what could not be run (whether the other person was alerted).

## Outcome

Filled in when done.
