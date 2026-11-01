# Workflow engine phase 5: switch a block off, workflow history

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 5 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md), built as the sixth piece on its own branch and PR; the user said to trim it pragmatically and report what was deferred)

## Goal

Two editor safety nets from n8n: switch a block off so it passes everything through without running (try a workflow without a step, with no cost and nothing sent), and keep the saved versions of a workflow so an older one can be restored.

## Requirements

- Switch a block off: node flag `disabled`. An off block (never a trigger) does no work: no requests, no posts, no list writes, no sends. It passes what reaches it on unchanged, of any kind, and costs nothing in the estimate. Its settings are not checked (they may be half filled). The run page shows it as done with a message saying it was off.
- What an off block would have kept does not count: an off "Add to list" adds nobody to the run's people, an off "Give back" is as if it were not there.
- History: every save that changes the graph keeps a version (up to 50 per workflow, the oldest dropped). The owner lists the versions (time, number of blocks) and restores one; a restore is a normal save, so it makes a new version and can be undone by restoring the one before.
- Files attached to a post block that a saved version holds are kept as long as that version is, so a restore does not bring back a post whose picture is gone.

Open questions: none. Deferred, with reasons:

- "Test this block with the sample item": it needs the executors to run outside a run (they read the run, its steps and the database), so it is a project of its own, and only free blocks could be tested.
- Event triggers and "Wait for an event or approval": they need an event outbox, signed sources, rate limits and a long wait that holds the live-run slot; not safe to rush, and nothing in the product sends the events yet.

## Scope and non-goals

- In scope: contracts (`disabled`, `isOff`, estimate, validation), engine (pass-through, listing helpers), migration (`WorkflowVersion`), `WorkflowService` (history, restore), tRPC, body (a switch on the block card, History dialog), tests, MEMORY.md.
- Out of scope: comparing two versions, naming a version, history of settings other than the graph.

## Approach

- [ ] 1. Tests first: contracts (`isOff`, estimate, validation), brain integration (an off block passes through and spends nothing; an off list and an off Give back do not count), history integration, body graph convert.
- [ ] 2. Contracts: `disabled`, `isOff`; estimate, validation and notes.
- [ ] 3. Engine: pass-through executor; `listedPeople` and `returned` skip off blocks.
- [ ] 4. Body: switch on the card, faded and labelled when off.
- [ ] 5. History: migration, `WorkflowVersion`, save on create and on a graph change, prune, file keep, `history` and `restore`, tRPC, dialog.
- [ ] 6. Gates, plans, MEMORY.md, commit, PR.

## Edge cases and risks

- A trigger flagged off: ignored (`isOff` is false for triggers); the workflow's own switch stops it.
- An off block that starts a chain (an input block): it passes nothing, so what follows is skipped (phase 2 rules).
- An off "Select accounts": a LinkedIn action after it still needs accounts and fails with the usual message.
- An off Retry or Task result: passes on, saying yes (main output).
- Old graphs have no flag: nothing changes.
- History size: a graph is up to 50 blocks; 50 versions of a workflow is a few hundred kilobytes at most.
- A restore of a version whose workflow has since been renamed or switched on keeps the current name and switch; only the graph changes.
- Concurrency: two saves at once each keep a version; the prune runs in the same transaction as the insert.
- Rollback: the flag and the table are additive.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, all brain integration tests.

## Outcome

Filled in when done.
