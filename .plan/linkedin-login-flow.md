# LinkedIn login: submit, captcha, blocked, profile visit, session

- Status: done
- Created: 2026-10-15
- Locked by user: yes, 2026-10-15 (the request lists every step; the one extra decision, a new `BLOCKED` account status, follows from "mark it as blocked")

## Goal

Make the `linkedin-login` task do what a person does after typing the password: submit, wait, hand a captcha to its owner, mark a restricted account as blocked, and on the feed scroll, visit the own profile for 15 to 20 seconds, and keep the session so the next run opens the feed directly.

## Requirements

Confirmed:

- The recording `84a721a0` shows the Enter key did nothing (no sign-in request, form unchanged for 57 s): submit by clicking the form's submit button (`button[type="submit"]:visible`, no text), with Enter only when no such button is found.
- A captcha (reCAPTCHA) after submit is recognised by its frame, not its words, and is handed to the owner: on the worker through the existing takeover, in devtools through a prompt in the terminal (the browser window is open). After the owner is done the page is read again, without retyping and without leaving the page the captcha lives on.
- A restricted account (`/flagship-web/login/login-restriction`) gets its own verdict `BLOCKED` and brain sets the account status to a new `BLOCKED`.
- On the feed: scroll a few times, open the own profile (`/in/me/`, LinkedIn redirects to the signed-in member), scroll, wait 15 to 20 seconds.
- The session (cookies and local storage) is saved after that, so the next run restores it and opens the feed. Already built in the runner (`commitSession` and the session vault); only a run that ended signed in replaces it.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `accountValidator.ts` (submit, captcha, blocked), `linkedinLogin/index.ts` and a small `browseAfterLogin`, devtools handover, `BLOCKED` in the schema (additive migration), brain hooks, the status badge, tests, `MEMORY.md`.
- Out of scope: solving a captcha automatically (never); retrying a blocked account; automatic re-verification rules for `BLOCKED`; the language mismatch seen in the recording (page German while the browser says en-US), noted as an open item.

## Approach

- [ ] Validator: submit by clicking, captcha selector, blocked outcome, recheck that does not navigate away first
- [ ] Task: `ACCOUNT_BLOCKED` verdict, browse after a valid login (also after a resumed check), commit only when still signed in
- [ ] Devtools: handover that waits for the owner in the terminal
- [ ] Brain: `BLOCKED` enum value (migration), hook mapping, never overwritten by a later `NEEDS_REAUTH`
- [ ] Body: status badge for `BLOCKED`
- [ ] Tests first for each, then the definition of done

## Edge cases and risks

- A reCAPTCHA v3 badge can sit on the plain sign-in page; the captcha is only read after the wait found no error, code prompt or move, so the badge alone never raises a check.
- The profile visit goes through `visit`, so allowlist, robots and rate limit still apply; a refused or failed visit does not fail the login. If the visit ends on a sign-in or checkpoint page the session is not committed, so a bad state never replaces a good one.
- The task limit is 3 minutes: sign-in (up to about 40 s) plus scrolls plus 15 to 20 s fits. The wait for the owner is outside it, as before.
- `BLOCKED` is an additive enum value (`ALTER TYPE ... ADD VALUE`), safe on existing data; it must be applied with `db:migrate:deploy` before brain starts with the new code.
- Brain's conditional update still applies only to the validation the account waits for, so an old answer cannot flip a status.
- Rollback: the enum value can stay unused; the task change is a code revert.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; a real-Camoufox fixture for the submit button and the captcha frame; not verifiable here: live LinkedIn.

## Outcome

Shipped as planned. Deviations: the verdict code is `BLOCKED` (not `ACCOUNT_BLOCKED`); devtools also keep the signed-in session in memory for one menu session so a second run in it opens the feed directly (the worker keeps it in the bucket). Verified: lint, type check, unit tests (spider 567, brain 754), build, and the real-Camoufox stand-in e2e (6 of 6, slow on this machine: 10 to 38 s each, so the 15 s default test timeout is too short here). Not verified: live LinkedIn, the captcha frame selectors, the Linux worker image. Follow-ups: language mismatch and BLOCKED re-verification (see `MEMORY.md`).
