# Spider devtools: manually browse through a saved proxy and record steps for writing tasks

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-10-15
- Locked by user: yes, 2026-10-15 (answers recorded under Requirements)

## Goal

A local-only CLI for `apps/spider` that opens a real, headed Camoufox browser through one of your saved
proxies, lets you drive it by hand, and records every click/fill/navigation you make as a step list — in the
same vocabulary the production task recorder already uses — plus a generated skeleton showing those steps as
`TaskContext` calls, so a new spider task can be written from it quickly.

## Requirements

Confirmed (locked 2026-10-15):

- R1. DB access: a direct local Postgres connection. The script reads `DATABASE_URL` and `LINKEDIN_CRED_ENC_KEY`
  from `apps/brain/.env` (no copy, no manual re-entry) and refuses to run unless the resolved DB host is
  `localhost` or `127.0.0.1` — it must never be pointed at staging or production.
- R2. No new brain/body code, no new tRPC endpoint. Proxy credentials are decrypted only inside this local
  script, with the same AES-256-GCM scheme spider already uses for account credentials
  (`apps/spider/src/tasks/credentials.ts`), extracted into a shared low-level `decryptSealed` the existing
  `openCredentials` and a new `openProxyCredentials` both call (same ciphertext/iv/tag/key_version shape, a
  different field schema: `{ username?, password? }` instead of `{ password?, totpSecret?, session? }`).
- R3. Browser: Camoufox headed (`headless: false`), humanize on, `geoip: true` when a proxy is picked — same
  options `CamoufoxDriver` already builds for production, extracted so both share one function instead of two
  copies of the same Camoufox options.
- R4. Free browsing: no `SPIDER_ALLOWED_HOSTS` allowlist, no robots.txt check, no rate limiter while recording.
  Those exist to govern unattended automation; a human deliberately driving the browser doesn't need them, and
  they would only get in the way of exploring a page before deciding what to automate.
- R5. Recording: a page script captures `click`, `change`/`input` (on blur, not per keystroke), `submit`, and
  navigation, and turns each into a step using the existing `StepCall`/`StepEntry` vocabulary from
  `apps/spider/src/recording/recorder.ts` (`goto`, `click`, `fill`) so the output already matches what a task's
  own recorder would have written.
- R6. Typed values: saved as plain text for ordinary fields (so the recording is directly reusable), **except**
  any `input[type="password"]` element, which always records only the length, never the value — a hard rule
  applied regardless of field name, so no real password ever reaches disk. Call this out to the user in the
  CLI's own help text and in a comment, since it narrows what was asked for.
- R7. Selector strategy, closest practical to Chrome DevTools Recorder's own preference order: `data-testid`
  attribute first (the project already uses it for `select` elements per the Selector Attribute idea in that
  tool), then `id`, then `aria-label`/role, then a short unique visible text match, then a CSS `nth-of-type`
  path as the fallback. One selector per step, stored as plain CSS (XPath/ARIA/Pierce variants are out of scope
  — see Non-goals).
- R8. Output: `apps/spider/.devtools-recordings/<slug>-<timestamp>/` (gitignored), containing `steps.json` (the
  step list, `StepEntry`-shaped, plus the picked proxy's id/host/port — never its credentials) and
  `skeleton.md` (the same steps rendered as `await context.visit(...)` / `await context.browser.click(...)` /
  `await context.browser.fill(...)` calls to paste into a new `defineTask`).
- R9. Proxy picker: a plain numbered terminal prompt (Node's built-in `readline/promises`, no new dependency)
  listing every saved proxy across all accounts (account email, protocol/host/port, status), plus a "no proxy,
  connect directly" option. Any status can be picked; nothing is filtered out, since this is a developer tool
  with no automated consequences.
- R10. Stopping: closing the browser window, or pressing Enter back in the terminal, ends the recording and
  writes the files, whichever happens first.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: one new CLI entrypoint and its supporting modules under `apps/spider/src/devtools/`, a new
  `dev:record` package script, extracting the two small shared helpers above (`decryptSealed`,
  Camoufox launch options), `.gitignore` entry for the output folder, unit tests for the pure logic (selector
  building, step-to-skeleton rendering, the decrypt extraction).
- Out of scope: any brain or body change, any new production API, Chrome-DevTools-Recorder-compatible JSON
  import/export, XPath/ARIA/Pierce selector variants (CSS only, R7), replaying a saved recording automatically,
  staging/production use (explicitly refused by the localhost guard), scrape-task authoring itself.
- Unchanged: production task behaviour, `SPIDER_ALLOWED_HOSTS`, robots.txt handling, the rate limiter, the
  per-account lease — none of this touches the worker's own task path.

## Approach

- [ ] `apps/spider/src/tasks/credentials.ts`: extract `decryptSealed(sealed, keyBase64): string` (the existing
      decipher logic, key-length and `key_version` checks) and have `openCredentials` call it before its own
      zod parse. Add `openProxyCredentials(sealed, keyBase64)` with a `{ username?, password? }` schema, next to
      it, reusing `decryptSealed`. Unit tests for both schemas and the shared failure paths.
- [ ] `apps/spider/src/scraping/camoufoxDriver.ts`: extract the `Camoufox({...})` option-building in `launch()`
      into an exported pure function (e.g. `buildCamoufoxOptions(proxy, headless, fingerprint)`), widen the
      `headless` type to also accept `false`, and have `launch()` call it. No behaviour change for production
      (still always `true | 'virtual'` there).
- [ ] `apps/spider/src/devtools/localDb.ts`: loads `apps/brain/.env` with `dotenv`, asserts the DB host is
      localhost/127.0.0.1 (throws a clear message otherwise), opens a `pg` client, queries `ProxyServer` joined
      to `LinkedInAccount` for `(id, email, protocol, host, port, secret, secretIv, secretTag, keyVersion,
      status)`, and closes the client after use.
- [ ] `apps/spider/src/devtools/selector.ts`: pure function `buildSelector(element info)` implementing R7's
      preference order, given a small plain-object description of an element (attributes, id, role, text,
      tag/index path) that the in-page script computes. Unit tested with fixtures for each tier.
- [ ] `apps/spider/src/devtools/pageRecorder.ts`: `attachPageRecorder(page, onStep)` — `page.exposeFunction` to
      receive events, `page.addInitScript` to install the capturing listeners on every page/frame (click,
      change/input-on-blur, submit, keydown Enter), building the element description in-page and calling
      `buildSelector` in Node. Navigation is observed via Playwright's own `page.on('framenavigated')`, turned
      into a `goto` step. Emits `StepEntry`-shaped objects via `onStep`.
- [ ] `apps/spider/src/devtools/skeleton.ts`: pure function turning a `StepEntry[]` into the `skeleton.md` text
      (one `TaskContext` call per step, with the real typed text as a string literal except where R6 masked it).
      Unit tested.
- [ ] `apps/spider/src/devtools/recordSession.ts`: the CLI entrypoint — lists proxies (`localDb.ts`), prompts
      with `readline/promises`, decrypts the picked proxy (`openProxyCredentials`), launches headed Camoufox
      (`buildCamoufoxOptions`, no allowlist route block, no recorder video/network capture — that machinery is
      for automated runs), attaches `pageRecorder.ts`, waits for the browser to disconnect or Enter in the
      terminal, then writes `steps.json` and `skeleton.md` under `.devtools-recordings/`.
- [ ] `apps/spider/package.json`: add `"dev:record": "tsx src/devtools/recordSession.ts"`, add `pg` and
      `@types/pg` as devDependencies (never shipped — the worker/api Docker stages only install prod
      dependencies).
- [ ] `.gitignore`: add `apps/spider/.devtools-recordings/`.
- [ ] `MEMORY.md`: one decision entry once shipped.

## Edge cases and risks

- Safety guard is the only thing standing between this tool and decrypting a staging/production proxy's
  credentials: the localhost check must run before any query, and its failure message must not echo the
  resolved `DATABASE_URL` (host only, never user/password).
- `LINKEDIN_CRED_ENC_KEY` must match between brain and spider already (worker startup already asserts this); if
  `apps/brain/.env` is missing or the key differs, decrypting a proxy fails with a clear message, not a crash.
- Per R6, a password field's value is dropped even if the user explicitly asked to keep typed values generally —
  this is a deliberate narrowing flagged to the user, not a bug.
- A recording with no proxy selected still records locally (direct connection); must make it obvious in
  `steps.json`'s metadata which proxy (if any) was used, by id/host only, never credentials.
- The in-page script must survive full page navigations (LinkedIn is a multi-page app in parts) — `addInitScript`
  runs on every new document, so listeners are reattached automatically; no reliance on surviving in soft/SPA
  navigations is assumed beyond what `framenavigated` already reports.
- Camoufox/Firefox quirks already documented in `.plan/camoufox-browser.md` (detection risk, beta software)
  apply equally here; this tool does not change the authorization basis (still `.plan/linkedin-account-linking.md`
  B1) since it is the same attested use, run by hand instead of by the worker.
- Browser crash or terminal kill mid-recording: steps captured so far are kept in memory only; a crash before
  the save step loses them. Acceptable for a dev tool; not worth adding incremental disk writes for this.
- Docker/CI: `pg`/`@types/pg` are devDependencies, so `pnpm deploy --prod` for the worker/api images never
  installs them; the compiled `devtools/*.js` sits unused in the image (harmless, not imported by
  `server.ts`/`worker.ts`), consistent with how test files are already pruned separately.
- No data migration, no schema change, no change to any contract used over the wire.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests: `decryptSealed`/`openProxyCredentials` (shared failure paths, wrong key, wrong shape), `buildSelector`
  (each tier of the preference order), `skeleton.ts` rendering, `buildCamoufoxOptions` (proxy present/absent,
  headless variants).
- Manual local run (by the user, not verifiable here): `pnpm --filter @automatedLinkedIn/spider dev:record`
  against the local stack with at least one saved proxy, confirm the browser opens through it, confirm
  `steps.json` and `skeleton.md` are written under `.devtools-recordings/` after closing the window, and confirm
  no password value appears in either file.
- Confirm the localhost guard actually refuses when `DATABASE_URL` is pointed elsewhere (manual check with a
  throwaway non-local-looking URL).

## Outcome

Shipped as locked, with one deviation found during the user's own manual run (see below).

- `apps/spider/src/tasks/credentials.ts`: extracted `decryptSealed` (the AES-256-GCM decrypt, key-length and
  `key_version` checks), reused by both `openCredentials` (account bundle) and the new `openProxyCredentials`
  (`{ username?, password? }` bundle).
- `apps/spider/src/scraping/camoufoxDriver.ts`: extracted `buildCamoufoxOptions(headless, proxy, fingerprint?)`;
  `headless` widened to also accept `false` (devtools only, production still never sets it).
- `apps/spider/src/devtools/`: `localDb.ts` (reads `apps/brain/.env`, refuses any DATABASE_URL whose host isn't
  `localhost`/`127.0.0.1`, lists `ProxyServer` joined to `LinkedInAccount` over a direct `pg` connection),
  `selector.ts` (CSS-only selector preference order: data-testid, id, aria-label, role, short text, structural
  path), `pageRecorder.ts` (`addInitScript` + `exposeFunction` captures click/change events and framenavigated,
  builds `DevStepEntry = StepEntry & { value? }`, masks `input[type=password]` to length-only), `skeleton.ts`
  (renders steps as `TaskContext` calls), `recordSession.ts` (the CLI entrypoint: pick a proxy, headed Camoufox,
  record until Enter or the window closes, write `steps.json`/`skeleton.md`).
- `apps/spider/package.json`: `dev:record` script, `pg`/`@types/pg` devDependencies (never shipped — the
  worker/api Docker images only install production dependencies).
- `.gitignore`: `apps/spider/.devtools-recordings/`.

**Deviation found in the user's first real run**: picking a real proxy crashed with `maxmind.Reader is not a
constructor` right at the Camoufox launch step. Root cause: `tsx`'s dynamic-`import()` loader mishandles
Camoufox's optional `maxmind` dependency (its geoip lookup) — `(await import('maxmind')).default.Reader` resolves
to a function under plain Node but to `undefined` under `tsx` for this specific TypeScript-compiled, getter-based
CJS export shape (confirmed by a side-by-side repro: identical `createRequire`-based resolution, only the loader
differed). This affects any geoip-using Camoufox launch run through `tsx` (so `pnpm dev:worker` with a proxy
locally has the same latent bug — noted in `MEMORY.md` as a gotcha, out of scope to fix here). Fixed for this tool
by changing `dev:record` to `tsc -b && node dist/src/devtools/recordSession.js` (build once, run compiled with
plain `node`, matching how `start`/`start:worker` already run). Also fixed two `__dirname`-relative path defaults
(`localDb.ts`'s `repoRoot`, `recordSession.ts`'s `OUTPUT_ROOT`) that assumed the source layout depth and broke
once running from `dist/`; both now derive from `process.cwd()` (the package directory `dev:record` runs in),
and hardened the stop-recording wait to use `rl.once('line', ...)` instead of a second `rl.question()` (closing
the browser window before pressing Enter left the first question pending and broke the later "name" prompt).

Verified: `pnpm lint`, `ts:check`, `test:unit:run` (whole monorepo green, spider 436 tests including 25 new ones)
and `build`, all from the repo root; a full manual run against the user's real local Postgres and a real saved
proxy (`fabianpacheco@onet.pl`), confirming the browser launched through the proxy, recording stopped on Enter,
and `steps.json`/`skeleton.md` were written correctly (proxy metadata without credentials, no crash).


