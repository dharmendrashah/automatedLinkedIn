# API trigger block: key, header and a sample call in its Input tab

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 ("plan this and continue"; the request settles the scope, the one limit is below)

## Goal

Open the "When called by API" block and its Input tab tells the owner how to call it: the header with the API key, a ready cURL and a sample JSON body whose fields follow the blocks that come after it. Today that lives only on the API tab and lists every input block of the workflow, not the ones this trigger feeds.

## Requirements

Confirmed:

- The Input tab of `trigger.api` shows the address, the header (`Authorization: Bearer <key>`), a cURL with a sample body, and the JSON body alone, each with a copy button.
- The sample body follows the next blocks: the input blocks (Profiles, Posts, Companies) reached from the trigger along its lines, in the draft on the canvas, so unsaved edits show at once. With none reached, the call has no body.
- The key: only a hash is stored, so an existing key can never be shown again. The tab shows whether a key is set, and creating a new key shows it once with a copy button; the cURL then carries it. Until then the cURL and header carry the placeholder `YOUR_API_KEY`.
- The tab also says what is missing before a call works (workflow switched on, key set).
- The API tab uses the same pieces and the same "which inputs" rule, so the two never disagree.

Open questions: none.

## Scope and non-goals

- In scope: `api-sample.ts` (pure: which inputs, sample body, cURL), `api-request.tsx` (copy button, code block, key control, request view, shared hook), `api-access.tsx` on the shared pieces, the trigger's Input tab (`block-run-tabs.tsx`, `block-run-panel.tsx`), the canvas passing the draft graph and whether the workflow is on, tests, `MEMORY.md`.
- Out of scope: showing an old key, changing the token rules or limits, showing what a past call sent (run inputs are deleted after 14 days and not exposed), a schedule or "after another workflow" trigger panel.

## Approach

- [x] 1. Tests first for `apiInputsOf`, `sampleBody`, `curlOf`.
- [x] 2. Extract the shared pieces from `api-access.tsx`, use the new rule there.
- [x] 3. Trigger Input tab, canvas props.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, `MEMORY.md`, push to PR 174.

## Edge cases and risks

- A trigger connected to nothing, or to blocks that reach no input block: no body, the tab says a call with no body starts the workflow.
- Two API triggers, or an input block reached twice: each field appears once.
- A line back to the trigger (loop): the walk keeps a visited set, so it ends.
- The sample links are made up (no real person), and the cURL quotes the body with single quotes; links hold no single quote, so the shell command stays valid.
- The key typed into a cURL is shown on screen; it appears only right after it was created and is dropped when the dialog closes, like on the API tab.
- Creating a key here makes the old key stop working at once (same as the API tab); the new-key button asks first when a key exists.
- Not seen in a browser behind sign-in.

## Verification

- Unit tests above; lint, ts:check, unit tests, build; brain is untouched.

## Outcome

Shipped on PR 174. The Input tab of "When called by API" now shows a readiness checklist (switched on, key set), the header `Authorization: Bearer <key>` with the key control, and a sample request (address, cURL, JSON body). The body fields follow the input blocks the trigger reaches in the draft on the canvas (`apiInputsOf` in `api-sample.ts`, tested). The API tab uses the same pieces (`api-request.tsx`, `use-api-token.ts`), so the two cannot disagree; before it listed every input block of the workflow.

Deviation: an existing key cannot be shown (only its hash is stored), so the header and cURL carry `YOUR_API_KEY` until a new key is made, and a new key is shown once there with a copy button. Not seen in a browser behind sign-in.
