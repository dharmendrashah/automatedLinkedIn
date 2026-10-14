# Spider devtools: run a task locally, from the same menu as record-session

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-15
- Locked by user: yes, 2026-10-15 (answers recorded under Requirements)

## Goal

Extend the local devtools CLI (`.plan/spider-devtools-recorder.md`) so that after choosing a proxy you pick one of two
things: **Record a session** (as today) or **Run a task**. Running a task asks for the task's inputs, runs it through the
real task runner (`runTask`) in a headed browser, and shows the verdict, the report and where the full recording was saved.
The point is to test the existing tasks (`browser-detection`, `linkedin-login`), find where they are unreliable, and shape
new ones from what a recording shows.

## Requirements

Confirmed (locked 2026-10-15):

- R1. Entry point: `dev:record` stays the one command and becomes a menu. Step 1 pick the proxy (or none), step 2 pick
  `Record a session` or `Run a task`. Record-session behaves as it does now.
- R2. Run a task uses the real `runTask` from `apps/spider/src/tasks/runner.ts` with local dependencies injected, so a task
  is validated, limited (`limits.timeoutMs`), recorded, masked and answered exactly as in the worker. No second runner.
- R3. Tasks come from the real registry (`buildTasks`), so a task added there shows up in the menu with no extra step.
  The list shows `title`, `name` and whether it needs a proxy and an account.
- R4. Inputs: the task's own zod `input` schema drives the questions, read through `toJSONSchema` (the same call the catalog
  uses). One prompt per field with its type, required or optional, default and allowed values. Strings, numbers, booleans
  and enums are typed answers; arrays and objects are typed as JSON. The answers are validated with the task's schema and
  a wrong answer is asked again with the schema's message. A task with no input asks nothing.
- R5. Proxy rule from the task: `needs.proxy` `required` with "no proxy" chosen stops with a sentence before anything
  opens; `optional` and `none` follow the choice (`none` is told it will be ignored).
- R6. Account: for a task with `needs.account` the user picks one of the local database's LinkedIn accounts (email and
  status). The sealed credentials are read from the local database and passed as the worker receives them; they are opened
  with the same `openCredentials`. Before it starts, the CLI says which account will sign in to live LinkedIn and asks for a
  confirmation (`y/N`), because this bypasses brain's 5 minute wait between sign-ins.
- R7. Rules while running: free, like record-session. No `SPIDER_ALLOWED_HOSTS` allowlist, no robots.txt check, no
  per-host delay (the driver's `isAllowedNavigation`, the runner's `policy`, `robots` and `limiter` are all permissive).
  Told to the user in the menu text, since it is what the worker would not do.
- R8. Reliability runs: after the inputs the CLI asks how many times to run (default 1, at most 10; at most 3 when the task
  needs an account). Runs are one after another. At the end it prints a tally of verdicts, the number of passes, and the
  shortest, longest and average duration. A run that throws (browser crash) counts as `CRASHED` and the next run goes on.
- R9. Output: every run is recorded in full (timeline, network, logs, screenshots, `failure.html`, video) with the same
  `Recorder` the worker uses, in mode `always`. Files go to `apps/spider/.devtools-recordings/runs/<runPrefix(command)>/`
  (gitignored, already). The console shows, per run: verdict label, message, duration, the report headline and items when the
  task returns a report, and the folder path. Nothing is uploaded; nothing touches the bucket.
- R10. Browser: headed Camoufox through the picked proxy, with a fingerprint for the machine's own OS (the font fix in
  `926a0ac`). `CamoufoxDriver` gets an optional `operatingSystems` option for this; the worker passes nothing and keeps its
  default.
- R11. Stopping: Ctrl+C while a run is in progress stops after that run ends and skips the remaining repeats ("finishing
  this run, press Ctrl+C again to quit now"); a second Ctrl+C exits at once. Anything already saved stays saved.
- R12. Secrets: the proxy credentials, the account password, two-step secret and session are added to the recorder's
  secrets so they are masked in every file (the runner already does this). The console prints the task's own message and
  report only, never the command, the credentials or the proxy credentials.
- R13. Local only, same guard as before: `localDb.ts` refuses any `DATABASE_URL` that is not `localhost`/`127.0.0.1`.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: a menu entry module, the run-a-task module, a schema-to-prompt helper, a local object store for the recorder,
  reading accounts from the local database, the `operatingSystems` option, the `dev:record` script pointing at the menu,
  unit tests for the pure parts, plan, `MEMORY.md`.
- Out of scope: generating a task folder from a recording (answered no), publishing anything to RabbitMQ or reading
  from it, uploading to the bucket, changing any task or the runner, running tasks in parallel, running in headless mode,
  replaying a recorded session automatically, any brain or body change.
- Unchanged: the worker, the runner's behaviour, the contracts, record-session's output format.

## Approach

- [ ] `apps/spider/src/devtools/prompt.ts`: the shared readline interface plus small helpers `ask(question, default?)`,
      `choose(title, options)` and `confirm(question)`; the Ctrl+C handling moves here (one place that decides between
      "stop after this" and "quit now"). `recordSession.ts` uses it instead of its own `rl`.
- [ ] `apps/spider/src/devtools/localDb.ts`: add `listSavedAccounts(databaseUrl)` returning `{ id, email, status, sealed }`
      (credentials stay sealed), reusing the connection and guard code that `listSavedProxies` uses.
- [ ] `apps/spider/src/devtools/localStore.ts`: `LocalStore` implementing `Pick<ObjectStore, 'put' | 'upload'>` over a folder.
      Rejects a key that resolves outside the root (`..`, absolute). Used by `Recorder` and by the runner.
- [ ] `apps/spider/src/devtools/inputPrompt.ts`: pure `describeFields(jsonSchema)` and `coerceAnswer(field, text)` plus an
      `askInput(task)` loop that validates with `task.input.safeParse`. Unit tested with fixtures for string, number, integer,
      boolean, enum, optional, default, array/object as JSON, and a rejected answer.
- [ ] `apps/spider/src/devtools/summary.ts`: pure `summarise(runs)` for the tally and durations, and `formatRun(result)`.
      Unit tested.
- [ ] `apps/spider/src/devtools/runMode.ts` (and `command.ts` for the pure command builder): builds the command (`randomUUID`, user `devtools`, `trigger: 'manual'`, input,
      proxy, account), parses it with `taskCommandSchema`, builds `RunnerDeps` (permissive policy, robots and limiter, no-op
      `pause`, in-process `accountLock`, `openCredentials` with the key from brain's `.env`, `startRecording` with
      `Recorder.start` in mode `always`, `publishResult` that keeps the result), runs it N times and prints the summary.
      Unit tested for the command it builds (no secret in what is printed, proxy and account fields set only when needed).
- [ ] `apps/spider/src/devtools/index.ts`: the menu entry (proxy, then mode). `recordSession.ts` keeps the record logic and
      exports `recordSession(options)` instead of running on import. `hostOs.ts` holds the shared host-OS lookup.
- [ ] `apps/spider/src/scraping/camoufoxDriver.ts`: optional `operatingSystems` in `CamoufoxOptions`, passed to
      `newFingerprint` in `launch()`. Unit test that it reaches `Camoufox()`.
- [ ] `apps/spider/package.json`: `dev:record` runs `node dist/src/devtools/index.js` after `tsc -b`.
- [ ] Verify end to end with a real run of `browser-detection` (through no proxy and through a proxy), with a repeat count
      of 2. The `linkedin-login` task is left for the user (live LinkedIn account).
- [ ] `MEMORY.md`, this plan's Outcome.

## Edge cases and risks

- Account safety is the main risk: `linkedin-login` signs in to live LinkedIn, and running it N times in a row is how
  accounts get locked. Mitigations: a confirmation naming the account, a cap of 3 repeats for account tasks, and the runner's
  own rule that a wrong password or code is an answer (the task does not retry it). The 5 minute wait that brain keeps
  between sign-ins is not enforced here; this is stated in the confirmation text. Only the user's own accounts in the local
  database can be picked.
- Free rules (R7): a task can pass here and be refused by the worker's allowlist. The menu says so. A task's `hosts` list is
  not checked against anything locally.
- The saved browser session: a task that returns `commitSession` writes the session to the store at `sessions/<id>/state.json`.
  The local store would keep it in the devtools folder only, never in the bucket and never back into the database, so a local
  run cannot refresh the real saved session. Accepted: a local run starts from the credentials bundle in the database.
- `needs.proxy: 'required'` with no proxy chosen: refused before the browser opens (R5), not as a task failure.
- The task input is typed by hand: a long JSON value is allowed up to the contract's input limit (checked by
  `taskCommandSchema`), and the answer is never echoed on an error.
- `task.limits.timeoutMs` still applies (`withLimit`). A browser that hangs is closed by the runner's timeout path; a stuck
  close is bounded the same way the recorder's is (5 seconds, then the process exits).
- `Recorder` writes under the folder for all runs; many repeats of a task with video can use disk (about 20 KB per second of
  video at the recorder's size). Not capped; the folder is local and gitignored.
- `ffmpeg` for the video: if it is missing the recorder already logs and skips the video, the run still finishes.
- Runs execute one at a time in one process; no lease is needed. The in-process `accountLock` is a no-op that always grants.
- tsx must not be used (maxmind gotcha in `MEMORY.md`): the script stays compiled.
- `importing ./env` would validate the worker's environment: the devtools read only what they need (the key from brain's
  `.env`), and `buildTasks` receives the LinkedIn settings explicitly (`SPIDER_LINKEDIN_BASE_URL` default and validation mode
  `full`), without importing `./env`.
- Docker/CI: no change. The new files are not imported by `server.ts` or `worker.ts`; `pg` stays a devDependency.
- Rollback: delete `apps/spider/src/devtools` additions and point `dev:record` back at `recordSession.js`.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests for `LocalStore` (writes, nested keys, path escape refused), `inputPrompt` (each field type and the re-ask path),
  `summary`, the command builder, and `CamoufoxDriver` passing `operatingSystems`.
- Manual (agent, local): `dev:record` → no proxy → Run a task → `browser-detection` → repeat 2: both runs finish, the console
  shows verdict, report and folder, and the folder holds `timeline.json`, `network.json`, `logs.json`, screenshots and a
  video. Then the same through a saved proxy.
- Manual (user): `linkedin-login` against one of your own accounts, once.
- Not verifiable here: a live LinkedIn sign-in.

## Outcome

Shipped as locked.

- `dev:record` is now a menu (`devtools/index.ts`): pick the proxy, then Record a session (unchanged behaviour) or Run a task.
- `devtools/runMode.ts` runs the real `runTask` with local dependencies: free rules, an in-process no-op account lock, `Recorder`
  in mode `always` writing through `LocalStore` to `.devtools-recordings/runs/<runPrefix>/`, inputs asked from the task's own
  schema (`inputPrompt.ts`), an account pick with a confirmation for `needs.account` tasks (`listSavedAccounts` in `localDb.ts`),
  a repeat count (10, or 3 for account tasks) and a tally (`summary.ts`). Ctrl+C finishes the current run and skips the rest;
  a second press quits.
- Shared pieces: `prompt.ts` (lazy readline, Ctrl+C handling), `hostOs.ts`, `command.ts` (the manual command, checked by
  `taskCommandSchema`), `CamoufoxDriver` option `operatingSystems`.

Verified: `pnpm lint`, `ts:check`, `test:unit:run` and `build` from the repo root; a real run of `browser-detection` through a
saved proxy: it finished as "Not detected" in 152 s, printed the report and wrote the files; the "no proxy" refusal for a
proxy-required task; Ctrl+C after run 1 skipped run 2.

Finding from that run: through that proxy, the two Pixelscan IP pages ("IP check", "IP blacklist") did not finish within the
45 s limit and were reported as "Could not read". Possibly the proxy or those pages; not investigated here.

Not verified: `linkedin-login` against a live account (left to the owner), a Windows or Linux host.
