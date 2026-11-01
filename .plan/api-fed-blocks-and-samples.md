# API-fed blocks and sample inputs, driven by the block catalog

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (answers below; build not started)

## Goal

1. Every block that can start a chain on its own (the input blocks and the collect blocks that take no items) can say what a call to "When called by API" may feed it, and the API trigger shows a sample call for it.
2. Every block's Input tab shows a sample of what it takes, also before it ran, collect blocks included.
3. Adding a new input or collect block needs one description on the block itself. The API trigger, the sample, the API body check and the Input tab are not edited.

## What exists today (checked in code, 2026-11-01)

- The set of things a call may carry is written in three places by hand: `bodySchema` in `apps/brain/src/middlewares/workflowApi.ts` (`posts`, `profiles`, `companies`, strict), the three input executors in `apps/brain/src/worker/engine/executors.ts` (`runInput(ctx).posts` and so on), and `API_INPUTS` in `apps/body/src/components/workflows/api-sample.ts` (block type to field to example link). A new input block means touching all three.
- Only `input.posts`, `input.profiles` and `input.companies` read a call. The collect blocks that take no items (`collect.findPosts` with `keywords`, `collect.domainLookup` with `domains`, `collect.searchPeople`) cannot be fed by a call at all.
- Item kinds are `start`, `post`, `profile`, `company` (`ItemKind`). 37 blocks; 13 take items of a kind, 8 take nothing from before (`start`): the input blocks, the three collect starters and the manual, schedule and API triggers.
- The body app cannot load the contracts package at runtime, so it reads block descriptions from `workflow.catalog` (a `Block` with `fields`, `defaults`, `input`, `output`).

## Design

### One description on the block

An optional `api` on a block spec in `packages/contracts/src/workflow.ts`, a list because a block can take several fields (Search people takes four):

```
api: [{ field: 'domains', shape: 'list', check: 'text', what: 'websites', example: ['stripe.com'], setting: 'domains' }]
```

- `field`: the name in the call's JSON body.
- `shape`: `list` (several values) or `text` (one value).
- `check`: how a value is checked and cleaned, one of `profileLink`, `postLink`, `companyLink`, `text` (the link ones reuse `parseLinkedInUrl`, so adding a kind of link is one line there).
- `what`: plain words for the page ("LinkedIn links of people", "websites").
- `example`: made-up sample values.
- `setting`: for a block with settings (`domains`, `keywords`), the setting a call value replaces. The input blocks have none: they read the call before their own list.

First blocks to describe (the owner's answer: all the input and collect blocks that start a chain on their own):

| Block | Fields a call may send |
| --- | --- |
| `input.posts`, `input.profiles`, `input.companies` | `posts`, `profiles`, `companies` (links; today's fields, unchanged for callers) |
| `collect.findPosts` | `keywords` (text, replaces the `keywords` setting) |
| `collect.domainLookup` | `domains` (list, replaces `domains`) |
| `collect.searchPeople` | `keywords` (text), `titles`, `locations` (lists), `workingAt` (list, replaces `companies`) |

The other filters of Search people are choices from fixed lists (seniority, department, size, industry, experience, switches); a call does not set them. `workingAt` is not called `companies`, because that field already means links of companies for `input.companies`; a test refuses two descriptions with one field name and different shapes or checks. The collect blocks that take items (Get commenters, Find people at a company and the rest) are not fed by a call: they get the sample input from their kind, below.

### What reads the description

| Piece | Today | After |
| --- | --- | --- |
| Body check (brain middleware) | three fixed fields | built from the `api` descriptions of the whole catalog (strict, so an unknown field is still 400) |
| Total size limit | links in three fields | values in every list field, same 200 cap |
| Engine | each executor reads its own key | one helper `sentTo(ctx)` reads `run.input[api.field]` for the block's type; a block with a `setting` gets it replaced before it runs |
| Body app sample | `API_INPUTS` by block type | `apiInputsOf(graph, catalog)`: the blocks the trigger reaches that have an `api`, one field each |
| API tab "What to send" | same hard-coded list | same function |

A new input or collect block that can be fed by a call: add `api` to its spec and one line in its executor to use `sentTo(ctx)`. Nothing else.

### Sample input on every block

A pure function in the body app from the block's description, no per-block code:

- The block takes items of a kind (`post`, `profile`, `company`): a sample row of that kind (a made-up name, headline and link; one place, `SAMPLE_BY_KIND`), labelled "A sample of one item it takes".
- The block takes nothing (`start`) and has an `api`: "A call can send `field`" with its example, plus its settings summary.
- The block takes nothing and has no `api`: its settings summary ("Set by its settings"), as now.
- The API trigger's tab keeps its request panel and adds the sample line per field.

### Collect blocks that take items, placed right after the trigger

Today the trigger passes nothing on, so a block such as Get commenters straight after it gets nothing. The panel names this ("Get commenters takes posts: add a Posts block between, so a call can send them") from the kinds alone. Making the trigger pass the call's links on as items of the right kind is a bigger engine change; see the open question.

## Requirements

Confirmed (from your request): sample input for the collect blocks too; plan it so that new input and collect blocks do not make the start blocks' code change.

Open questions (must be empty before locking): none. Answered 2026-11-01:

1. First blocks: all the input and collect blocks that start a chain (table above; for Search people only its free-text and list settings).
2. A call value replaces the block's setting for that run.
3. A collect block that takes items straight after the trigger: only a hint to put an input block between; no engine change for the trigger.

## Scope and non-goals

- In scope: `api` on the block spec and in the catalog the page reads, the generated body check, the engine helper, the five first blocks, the sample function, the Input tab and the API tab on the new function, tests, `MEMORY.md`.
- Out of scope: new blocks themselves, a call that sets any other setting, changing the token, limits or answers of the API, a call carrying already-scored people, the Input tab for blocks inside a run (it reads the stored items as today).

## Approach

Each step starts with a failing test.

- [x] 1. Contracts: the `api` descriptor type and the five descriptions; `apiFields()` and `apiBodySchema()` built from the catalog; tests: every `api` field is unique or agrees with the others sharing it, every example passes its own check, every `setting` exists in the block's config, the catalog has no supplier name.
- [x] 2. Brain: the middleware uses `apiBodySchema()`; the engine helper `sentTo(ctx)`; the three input executors and the three collect ones use it; unit tests for the body check (known field, unknown field 400, total over the cap) and integration tests through the engine (a call feeds `domains`, `keywords` and `workingAt`; no call falls back to the settings).
- [x] 3. Body: `apiInputsOf(graph, catalog)` and `sampleOf(block)` with tests, replacing `API_INPUTS`; the Input tab uses them; the API tab uses `apiInputsOf`.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, `MEMORY.md`, push to PR 174.

## Edge cases and risks

- **Compatibility.** `posts`, `profiles` and `companies` stay exactly as they are for existing callers, including the cap and the answers.
- **Two blocks, one field.** Two blocks may read the same field (two Find posts blocks both read `keywords`); both get the value, the field appears once in the sample. A test refuses two descriptions that disagree on shape or check.
- **A value that does not check** (a link that is not a LinkedIn profile, an empty keyword): the whole call is 400 with the field named, nothing starts. Today a bad link is dropped silently by the executor; the 400 is new for the added fields only, the three old fields keep dropping bad links so old callers do not break.
- **Replacing a setting.** The call value replaces the saved setting for that run only; the saved workflow is never changed. A block with a call value ignores its list slice settings (`howMany` stays).
- **Money.** A call can make a collect block read more (a 100 domain list is 100 paid lookups): the existing 200 total cap and the wallet floor stay, and the estimate shows the saved settings, so the panel says "a call can change what it costs".
- **Privacy.** The sample values are made up. A call's values are stored in the run input and deleted after 14 days as today.
- **Catalog size.** `workflow.catalog` already carries every block; the descriptor is a few lines per block.
- **Not verifiable here:** the pages behind sign-in in a browser, and a real call through the live API (tested through the engine with the fake data client).

## Verification

- Unit and integration tests as above; lint, ts:check, unit tests, build.
- Through the real path: call the API address with each new field on a local brain and read the run.

## Outcome

Shipped on PR #174. Contracts: `api` on block specs (five blocks plus the three inputs), `apiFields`, `apiBodySchema`, `applyApiInput`, in `catalog()`. Brain: the middleware builds its check from the descriptions, the engine hands each executor a node with the call's values in the settings they replace, `sentTo` for the blocks that read the call themselves; integration tests through the engine for `domains`, `keywords`, `workingAt` and the saved fallback. Body: `apiInputsOf(graph, catalog)`, `sampleOf`, sample item on every block's Input tab, the "put an input block between" hint and a cost note.

Deviations: `check` is `link` or `text` (a link is only length-checked and the input block drops one it cannot read, as before) instead of one check per kind of link, and the body error is now "Send at most N values in all." Not seen in a browser; no real call through a live API was made (tested through the engine with the fake data client).
