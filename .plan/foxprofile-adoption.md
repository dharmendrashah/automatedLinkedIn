# FoxProfile research: what to take from it to make the spider more reliable

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-15
- Locked by user: yes, 2026-10-15 (answers below).

## Goal

Decide how `github.com/chienbm98/foxprofile` can raise the reliability of the spider (LinkedIn sign-in check and the tasks
to come), under one hard rule: it runs on Kubernetes and **no state lives on a machine**; state is in PostgreSQL or the bucket.

## What FoxProfile is (read from its source on 2026-10-15, commit `34fe877`)

| Fact | Where |
| --- | --- |
| Python 3.10+ app: a Flet desktop UI, a FastAPI REST API with a one-file web panel, and an MCP server. MIT licence, 82 stars, 3 releases (2.0.0 on 2026-10-08, 2.3.1 on 2026-10-09), two contributors (one is `claude`). | README, CHANGELOG |
| One browser per profile as a Python subprocess (`runner.py`) driving `AsyncCamoufox`; the manager talks to it over a loopback aiohttp control channel with a per-launch token. | `services/browser/launcher.py`, `runner.py` |
| **State is on disk**: `profiles.json` plus `camoufox_data/<profile>/` (a full Firefox profile: cookies, history, localStorage, `fingerprint.json`, `tabs.json`). Process state is in memory (`_active_sessions`), single instance. | README "Data layout", `launcher.py` |
| Deployment is a VPS with systemd and nginx (`deploy/foxprofile.service`, `docs/DEPLOY.md`). No Dockerfile, no Kubernetes. | `deploy/` |
| Chrome engine is experimental and depends on an outside fork (`fingerprint-chromium`); the pinned build had to be changed because a newer one crashed the renderer on about half the launches. | `chrome_engine/README.md` |

### Verdict: do not deploy it, take its ideas

Running FoxProfile itself on Kubernetes fails the rule: it needs a persistent volume for `camoufox_data/` and `profiles.json`
(or a sync wrapper around them), it can only run as one instance, it is Python beside a TypeScript stack, and it repeats what
brain, body and the spider already do (accounts, proxies, tasks, recordings, sign-in). Its UI, MCP server, web panel and Chrome
engine add nothing for us. What is worth having is a handful of behaviours, which are small and can be rebuilt in TypeScript
on top of what we already have (MIT, so porting an idea or a snippet with attribution is allowed).

## What it does that the spider does not

| # | FoxProfile | Spider today (checked in code) | Effect on reliability |
| --- | --- | --- | --- |
| G1 | One device per profile: the first launch generates a fingerprint and every later launch reuses it (`fingerprint.py`: "a profile that keeps its cookies but changes screen, GPU and fonts on each launch looks like a spoofed browser"). | `CamoufoxDriver.launch` calls `newFingerprint()` on every launch, so the same account shows a new device on every run. | Highest. Each sign-in looks like a new machine, a pattern that tends to invite security checks (not measured here). |
| G2 | Locale and timezone pinned per profile (`runner.geo_overrides`); its Check IP warns "an account whose language changes between sessions looks suspicious". | `geoip: true` makes Camoufox draw the locale at random from the exit country's language shares on every launch (`camoufox/dist/locales.js`, `weightedChoice` over `Math.random`). | High, same reason. Likely the cause of the language changing between runs on a proxy. |
| G3 | Session continuity: the profile directory keeps cookies, localStorage and more between runs. | `runTask` saves the full storage state to `sessions/<account>/state.json` after a valid sign-in, but **nothing reads it back** in the task path (the runner's store is `Pick<ObjectStore, 'put'>`; only the old scrape engine reads that key). Each run starts with an empty cookie jar plus `li_at` from the database. | High. Every run signs in cold, with none of LinkedIn's device cookies. |
| G4 | IP and identity cross-check before trusting a profile: exit IP from three services, hosting flag, country and timezone mismatches, IPv4/IPv6 mismatch (`geo_check.py`). | Brain scores proxies (ipinfo Lite, AbuseIPDB) but nothing checks the browser's timezone and locale against the exit IP at run time. | Medium. Catches a proxy that moved country. |
| G5 | Exit-IP lookups resolve DNS through the proxy (`socks5h`, `socks4a`), after finding the pre-launch lookup leaked the host's resolver. | Camoufox's own `proxyExitGeo` does the lookup (impit, `http://ip-api.com`). Whether it resolves through a SOCKS5 proxy was not verified. | Low on a datacenter pod, and the browser itself was never affected. Verify, do not assume. |
| G6 | The virtual display is owned and cleaned up (a stale Xvfb was left behind by failed launches and kills). | The worker uses Camoufox's own `headless: 'virtual'` display. | Low in Kubernetes: one process per pod, and a restart cleans up. |
| G7 | Human takeover: the web panel shows the browser screen and lets the owner click and type (`/page/screenshot`, `click-at`, `keyboard`) to solve a captcha or a challenge. | A security check ends as `SECURITY_CHECK` with "complete it yourself", but the owner has no way to do it. | Product gap, not a defect. Design only for now. |
| G8 | Probe from the page's own world: values read in the window, a worker, an iframe and the HTTP headers must agree (`chrome_engine/probe.py`). | `browser-detection` relies on four outside pages. In the run on 2026-10-15 two Pixelscan IP pages did not finish in 45 s. | Medium. A local probe cannot time out on someone else's site. |

## Experiment (2026-10-15, macOS host, Camoufox 0.5.8, headless)

Launched with the same stored fingerprint twice, then with two fresh fingerprints, and read what a page sees.

| Run | Screen | User agent, platform, cores, GPU, canvas hash |
| --- | --- | --- |
| Same fingerprint, launch 1 | 1366x768 | identical |
| Same fingerprint, launch 2 | 1366x768 | identical to launch 1 (the whole record matched) |
| Fresh fingerprint A | 1512x982 | same strings here |
| Fresh fingerprint B | 1920x1080 | same strings here |

So pinning works with what we already generate (Camoufox 0.5.8 derives fonts, voices, GPU and noise seeds from the pinned
fingerprint, `fingerprints.js` `identitySalt`), and today's per-launch fingerprints do change the screen between runs.
Limits: the host was a Mac asking for a macOS identity, so canvas and GPU values were native and could not vary; on the Linux
worker they come from Camoufox's spoofing and still need the same check there. No proxy was used, so locale and timezone
were not exercised.

## Proposed design (Kubernetes, no state on a machine)

**Browser identity per LinkedIn account**, one JSON object in the bucket: `identities/<accountId>/identity.json`.

- Holds: `os`, the fingerprint (a few hundred KB, which is why it is not a database column or a queue message), `locale`,
  `timezone`, the exit country they were derived from, `createdAt`, `version`.
- Created on the first run of an account, under the account lease that already exists (one task per account), and written with
  the store's create-if-absent call, so two workers cannot both create it. After that it is read-only unless re-pinned.
- Locale and timezone are pinned from the first proxy's exit country (Camoufox `locale` option and `config.timezone`; geoip
  still sets geolocation and the WebRTC address). If the account's proxy later exits in another country, the locale and
  timezone are re-pinned and the fingerprint is kept; the change is logged in the run.
- The runner loads the identity before `driver.open` and passes it in (`OpenOptions.identity`). Tasks without an account keep
  a fresh identity, as today.
- Postgres: nothing needed for the spider. Brain can show a summary later (OS, locale, created) from a field in the task
  result, so spider keeps no database connection.

**Session continuity** (G3): at the start of an account task the runner reads `sessions/<accountId>/state.json` and applies
its cookies and localStorage, then the saved `li_at` from the database on top if the owner has changed it since (the state
records the hash of the `li_at` it came from, so a new token wins). It is written back only after a valid check, as now.
Encrypted with the same key as the credentials (bucket encryption at rest is not enough for login cookies), size-capped.

**Kubernetes**: no PVC and no new Deployment. The worker already has no volume except `/dev/shm`. Two image changes: bake the
GeoIP database into the image (it is downloaded at first use today, on an ephemeral disk, on every new pod), and nothing else.
Everything stays in the bucket or in Postgres through brain.

## Scope asked for (2026-10-15)

The owner asked to build the items that affect reliability, and to include human takeover: **G1, G2, G3, G4, G8 and G7**.
G5 and G6 are low effect on Kubernetes and stay out unless asked (image hygiene is a later follow-up).

## Phases (each is its own PR, each with tests first)

1. **Stable identity** (G1, G2). Smallest change with the largest effect. Also used by the devtools menu, so a local run behaves like the worker.
2. **Session continuity** (G3).
3. **Local probe task and geo preflight** (G4, G8): a task that compares navigator, Intl, a worker, an iframe and the exit IP's
   country; the run fails early when they disagree instead of signing in with a mismatched identity.
4. **Human takeover** (G7), designed below. Built last because it changes the task lifecycle (a run can wait for a person).

## Human takeover design (G7)

Goal: when the sign-in stops at a security check or captcha, the owner opens the run in the web app, sees the live browser,
clicks and types to finish the check themselves, and the run carries on. The tool never solves a challenge.

The live browser is in one worker pod, and the owner is on the internet. To keep every machine stateless and avoid routing
to a pod, the relay goes through the brain and RabbitMQ, which already connect them:

- **Worker to owner**: while a run waits, the worker publishes a small JPEG of the page (about 1 a second, capped width and quality)
  and the page size to `takeover.frames`; brain keeps the latest frame per run in memory and serves it.
- **Owner to worker**: the owner's click (x, y as a fraction of the page), key, text and scroll go through brain to a
  per-run queue the one waiting worker consumes; the worker replays them with humanised Playwright input.
- **Lifecycle**: a run with `needsPerson` outcome (first use: `SECURITY_CHECK`) does not end. The runner publishes a
  `WAITING_FOR_OWNER` progress message (new message type on `tasks.done`, status unchanged until the end), refreshes the account
  lease while waiting (today it has no heartbeat, 30 min TTL), and waits up to a limit for "Done" or "Give up" from the owner.
  On Done the task re-runs its own check (landed on the feed?) and commits the session as today. On timeout or Give up it ends
  as `SECURITY_CHECK`, as now.
- **Access**: the owner's own runs only (`ownerProcedure`, run belongs to `ctx.user.id`), authenticated like every other call,
  short-lived run token, one controller at a time, every input size-capped and rate-limited.
- **Body**: a "Take over" panel on the session drawer and a button on the account row when its status is the security check:
  the frame in a canvas, click and keyboard capture, Done and Give up.
- **Privacy**: what the owner types can be a password or code. Nothing typed is logged; the step log records only counts; the
  video is not recorded while a person is in control (it cannot be redacted), and frames are never stored, only relayed.

Why not a direct WebSocket to the pod: it needs per-pod routing and a public path to workers (a new attack surface), and
breaks when a pod is replaced. The relay costs about 50 to 100 KB/s per watched run, only while someone watches.
Limit: brain runs one replica today (in-memory latest frame); a second replica would need the frame fan-out moved to a broker exchange.

## Edge cases and risks

- A stored fingerprint is a device. Resetting it ("new device") is a deliberate owner action, never automatic, and the
  fingerprint is kept when only the proxy changes.
- The identity OS must be one the Linux worker can present (its image bundles the fonts of all three). A Linux persona is rare
  among real LinkedIn users; choose Windows or macOS (open question).
- Concurrency: creation and re-pin under the account lease plus create-if-absent / generation preconditions; a crash between
  the write and the result is harmless because the next run reads the same object.
- Rollback: delete `identities/` and the old behaviour (fresh fingerprint per launch) returns.
- Secrets: the identity holds no secret; the stored session does (phase 2) and is encrypted, masked in every recording, never
  returned over the API.
- Stale session: a state older than the account's last password change is useless; a failed sign-in with it falls back to the
  credentials path and does not overwrite it (existing rule: only a valid check commits).
- Detection is not removed by any of this. A datacenter proxy is still the biggest factor (FoxProfile's own docs say so).

## Compliance

All of it acts on the signed-in owner's own account, under the LinkedIn authorization recorded in
`.plan/linkedin-account-linking.md`. A stable device per account is what a real user looks like; it is consistency, not a way
around a security check. No captcha solving and no bypass of a challenge is proposed; takeover would let the owner complete it
themselves. FoxProfile itself frames its use as multi-accounting, which LinkedIn's terms may forbid; we adopt none of that.

## Locked decisions (owner, 2026-10-15)

1. Storage: bucket only (`identities/<accountId>/identity.json`); no Postgres table.
2. Identity OS: **Windows only** (the worker image bundles Windows fonts). A local devtools run on a Mac keeps its own OS and a fresh identity, as today.
3. Locale and timezone: pinned from the first proxy run (what the browser got from the exit country), then reused.
4. Proxy changes country: re-pin locale and timezone, keep the device, log it. Detecting the move needs the exit country at every launch, so it is built in phase 3 (preflight); phase 1 only pins on first use.
5. Phase 2 restores cookies and localStorage, encrypted at rest.
6. Build order: phase 1 alone first, then 2, 3, 4.
7. Takeover applies to **any task that stops on a challenge**, not only the sign-in check.
8. Takeover transport: relay through brain and RabbitMQ.
9. Takeover wait limit: 10 minutes.
10. Takeover privacy: the video is **kept** (owner's choice). Accepted risk: a code or password the owner types is visible in the video; the video is private, signed-link only, deleted after 7 days. Typed text is still never written to the step log.

## Verification

- Phase 1: unit tests for the identity store (create-if-absent, load, re-pin keeps the fingerprint), a real-Camoufox test that
  two launches of one identity agree on what a page reads, `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`,
  and a worker-image run to confirm the same on Linux.
- Not verifiable here: behaviour on live LinkedIn, and canvas and GPU stability on the Linux worker.

## Outcome

All four phases built 2026-10-15 (G1 to G4, G7, G8). G5 and G6 were left out, as agreed.

- **Phase 1, stable device (G1, G2).** `apps/spider/src/identity/`: `DeviceIdentity`, `IdentityStore` (bucket, create-if-absent), `createDeviceIdentity` (Windows only). `identities/<accountId>/identity.json`. The runner loads it for account tasks and passes it as `OpenOptions.identity`. Tasks without an account and the devtools keep a fresh device per launch.
- **Phase 2, session restore (G3).** `sessions/SessionVault`: the account's cookies and local storage, sealed with `LINKEDIN_CRED_ENC_KEY` (`sealText` next to `decryptSealed`), at `sessions/<accountId>/state.enc.json`, 1 MB cap. The runner restores it (allowed sites only) before the sign-in and saves it only after a run whose own check passed (`commitSession`). The saved `li_at` from the database is still put on top by the validator, so a token the owner replaced wins. The plain `sessions/<id>/state.json` is no longer written by task runs; the older scrape engine still reads that key.
- **Phase 3, exit check and probe (G4, G8).** Before launch an account run asks where the proxy exits (`identity/lookupExit.ts`, Camoufox's uncached `proxyExitGeo` plus its geoip database) and `regionToKeep` decides: the timezone follows the exit, the language only changes with the country (re-pin, device kept, logged in the run). The address found is handed to Camoufox (`geoip: <ip>`), so it is not asked twice. A lookup that fails answers `PROXY_FAILED`. `browser-detection` now first runs a local probe (`DetectionSession.probe`): the page, an iframe and a worker must agree on user agent, platform, language, timezone and cores, and the browser must not say `webdriver`; a disagreement counts as DETECTED, a probe that cannot run as UNKNOWN.
- **Phase 4, human takeover (G7).** Contracts `takeover.ts` (picture and input schemas, durable short-TTL queue `takeover.frames`, direct exchange `takeover.input`, 10 minute limit). Spider: a task outcome may carry `needsPerson.resume`; the runner keeps the browser open (`waitForOwner`: a JPEG about every 700 ms, the owner's click by fraction, text, a short key list, scroll, done, give up), then calls `resume`. `linkedin-login` sets it at a security check and `AccountValidator.recheck` looks at the feed again. Brain: `TakeoverRelay` (newest picture per run in memory, inputs published to the exchange, 30 inputs per second per run), `TakeoverService` (owner and still-running check every call), tRPC `takeover.list`, `.frame`, `.send`. Body: `TakeoverBanner` in the dashboard layout and a `TakeoverPanel` dialog (click, keys, wheel, I am done, Give up).
- **Verified:** lint, `ts:check`, unit tests (spider 534, brain 753, body 237, contracts 99) and build for the whole repo. Real runs: Camoufox with two launches of one identity (language, timezone and worker or iframe values agree); `lookupExit` against the live network (no proxy); the takeover loop through the real local RabbitMQ and a real Camoufox page, with a test playing the owner (the picture arrives, the click lands on the button by fraction, the typed text reaches the input, done ends the wait); brain's `TakeoverRelay` against the real RabbitMQ (pictures held, input delivered, dropped when nobody waits).
- **Deviations from the plan.** The picture queue is durable: RabbitMQ 4 refuses a transient queue that is not exclusive (found by running it). The takeover video is kept, as the owner chose, so a code typed by the owner is visible in it. Re-pin on a country change is decided before launch (phase 3) rather than after. The takeover banner polls `takeover.list` every 3 seconds on every dashboard page; brain answers from memory while nothing is held.
- **Not verified:** the Linux worker image (canvas and GPU stability, Windows fonts), a run through a real proxy (`proxyExitGeo` through a proxy), live LinkedIn, the takeover dialog in a browser (the pure click and key helpers are unit tested; the React panel was only type checked and linted), the tRPC takeover calls over HTTP with a real token.
- **Limits and follow-ups.** Brain must stay at one replica for takeover (the newest picture is held in memory). A waiting run holds the worker's one browser and the account lease for up to 10 minutes. No UI yet to give an account a new device (delete `identities/<accountId>/identity.json`). The takeover trigger is wired for the sign-in check only; another task opts in by returning `needsPerson`.
