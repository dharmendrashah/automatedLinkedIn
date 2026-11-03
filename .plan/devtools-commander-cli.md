# Devtools command line with commander (`pnpm record`)

- Status: locked
- Created: 2026-11-03
- Locked by user: yes, 2026-11-03 (request: "install commander and arguments as well along with options")

## Goal

`pnpm record` reads its command line with `commander`, so a task can be run in one line (arguments and options) instead of answering a dozen prompts, and a mistyped address no longer needs a restart. Typing nothing keeps today's menu.

Also from the same report (2026-11-03): the prompt refused `sébastien-gaüzère-521240b2` ("must match pattern /^[A-Za-z0-9_%-]{1,200}$/"). LinkedIn writes such a profile address percent-encoded, and the contract's pattern accepts only that form. The devtools now turn a pasted address with accents (or a full `https://www.linkedin.com/in/...` link) into that form before the task's schema sees it. The contract and the tasks are unchanged.

## Requirements

Confirmed:

- Install `commander` and use it for arguments and options.

Decisions (mine, from the request; change on request):

- `pnpm record` with no arguments: the menu as today. `pnpm record [name] [--clean]` still names a recording and keeps pulled staging files unless `--clean`.
- `pnpm record run <task> [fields...] [options]`: arguments are the task name and its input as `key=value` pairs (first `=` splits; the value is read by the field's type, like a prompt answer).
- Options: `-i, --input <json>` (the whole input as JSON; `key=value` pairs win), `-e, --env <local|staging>` (default local), `-p, --proxy <email|none>` (the saved proxy by its account's email), `-a, --account <email>`, `-n, --runs <count>`, `-y, --yes` (skips the "signs in to live LinkedIn" question), `--clean`.
- Anything not given is still asked, except the task's input: when `fields` or `--input` is given the input is not asked, and an input the task's schema refuses ends the command with the schema's messages (no retry loop).
- `run` still refuses an account task above 3 runs, and a task that needs a proxy without one.

Open questions: none.

## Scope and non-goals

- In scope: `apps/spider/src/devtools` (`cli.ts` new, `index.ts`, `runMode.ts`, `inputPrompt.ts`), `apps/spider/package.json` (devDependency, like `pg`), tests, `MEMORY.md`.
- Out of scope: the contract's slug pattern, the tasks, staging pulls, the worker, a non-interactive replay command.

## Approach

- [x] 1. Tests first: `cli.unit.test.ts` (parsing to a plan: menu, record name, run with arguments and every option, bad env, bad runs, a missing task), `inputPrompt.unit.test.ts` (`normaliseSlug`, `presetInput`: pairs, JSON, precedence, unknown key, refused input).
- [x] 2. Install `commander` as a devDependency of the spider.
- [x] 3. `cli.ts`: a commander program that returns a plan and never runs anything.
- [x] 4. `inputPrompt.ts`: `normaliseSlug` (applied to a field named `slug`), `presetInput`.
- [x] 5. `index.ts` and `runMode.ts`: use the plan (environment, proxy by email, account by email, runs, yes, input).
- [x] 6. Gate and `MEMORY.md`.

## Edge cases and risks

- A proxy or account email that matches nothing: error listing what exists (emails only, never credentials).
- `--env staging` with `run`: the staging account is still chosen from its own list unless `--account` names one; `--proxy` is ignored there (staging brings its own) and the command says so.
- Percent-encoding: a slug that cannot be decoded is encoded as it is; an empty one stays empty so the schema refuses it.
- commander exits the process on a bad option by default: `exitOverride` and `configureOutput` keep it testable and the message printed once.
- Secrets: the command line shows the message text and addresses in shell history; the devtools already print the run folder only. Nothing new is logged.
- The `dev:record` script passes extra words to `node dist/src/devtools/index.js` through `pnpm record -- ...`; pnpm forwards them after the script's own words, so `pnpm record run linkedin-inmail slug=x` works without `--`; options starting with `-` need `--` only if pnpm itself would take them.
- Rollback: remove the dependency and the file; `index.ts` falls back to its previous argument reading.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`.
- By hand: `pnpm record run linkedin-inmail slug=sébastien-gaüzère-521240b2 text=hi --proxy none` stops at "This task only runs through a proxy"; `pnpm record --help` lists the commands. No live send is run for this change.

## Outcome

Shipped (not committed, as the owner asked): `commander` 15.0.0 as a devDependency of the spider (like `pg`); `devtools/cli.ts` (`parseCommandLine`, returns a plan, throws the parser's message, hands back help text); `inputPrompt.ts` `normaliseSlug` (used for a field named `slug`) and `presetInput`; `runMode.ts` takes a `request` (task, input, account by email, runs, yes); `index.ts` parses first, picks the proxy by email or `none`, skips the environment and mode questions for `run`. Gate green (spider 1410 unit tests); the built tool prints `--help`, `run --help` and the refusal for a field without `=`.

Deviations: `--clean` is read before or after `run` (the root command's option swallowed it until `enablePositionalOptions` and a check of the root's value, found by a test). `--account` is ignored with `--env staging` (staging has its own account list; `--proxy` is ignored there with a message).

Not run: a real `run` of a task through the new command line (no live LinkedIn session was started for this change). The working directory must still be `apps/spider` (`pnpm record` does that; running `node dist/src/devtools/index.js` from the repo root cannot find `apps/brain/.env`).

Example: `pnpm record run linkedin-inmail slug=sébastien-gaüzère-521240b2 "subject=Hello" "text=Hi there" --proxy tripti.verma@elitale.com --account tripti.verma@elitale.com --yes`.
