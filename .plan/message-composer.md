# Message composer: variables, spintax and sample templates for invites, messages and replies

- Status: rejected (2026-11-13, not done; owner asked to focus only on campaign-detail-insights). Was: locked
- Created: 2026-11-03
- Locked by user: yes, 2026-11-03 (same branch and PR #181, new commits)

## Goal

Give the three writing blocks (Send connection request note, Send message, Reply in a conversation) one composer: write the text with variables filled from what the database already knows about each person, vary it with spintax so no two people get the same words, start from sample templates, and see exactly what each person would get before anything is sent.

## What exists today (checked in the code, 2026-11-03)

- Text is a plain setting: invite `note` (`kind: 'text'`, 200 characters, `INVITE_LIMITS.noteChars`), message and reply `text` (`kind: 'textarea'`, 4,000, `MESSAGE_MAX_CHARS`) in `packages/contracts/src/workflow.ts`.
- Only two variables, `{first_name}` and `{company}`, filled by `fillWords` in `apps/brain/src/worker/engine/replyBlocks.ts` (and an invite twin at plan time). Spintax does not exist anywhere. The Unibox composer has its own client-only `fillTemplate` with `{first name}` and `{account}` (not shared).
- A person item (`PersonItem`, `apps/brain/src/core/workflowItem.ts`) carries: `name`, `headline`, `location`, `followers`, `title`, `company`, `email`, `connectedOn`, `note` (what they wrote when they invited), `tags`, `score`, `matched`, and `signals` (`commented`, `reacted`, `employee`, `hiring`, each with `via`, `at`, a short `excerpt` and the post as read).
- A full profile read (`PersonSnapshot.data`, only when the owner read it) holds: `about` (2,600), `experience` up to 15 roles (title, company, company link, location, start, end, description), `education` up to 10, `skills` up to 30, `connections`, `followers`, `premium`, `openToWork`, `hiring`, `country`. Comments and reactions of a person are the `signals` above and the post reads (`PageSnapshot` kinds `POST_COMMENTS`, `POST_REACTIONS`); no post text of the person's own posts is stored.
- The body cannot import values from `contracts`, so a live preview has to ask the brain.

## Requirements

Confirmed (from the request):

- A compose area for Send message, Reply and the invite note.
- Variables from the profile data we hold: full profile details, comments, reactions, current and previous company, posts and comments.
- Spintax, as the recommended way, for the first invite and messages.
- Sample templates to start from.

Decisions (owner answers, 2026-11-03):

- Syntax: `{first_name}` stays; spintax is `{Hi|Hello|Hey}`; a fallback is `{first_name:there}`. A group is spintax only when it holds a `|`. Options nest and may hold variables. `\{` writes a literal brace.
- Data: only what the database already has (My network `Person`, the newest `PersonSnapshot`, the signals of the person's list entry, the item the run carries). Nothing is read automatically; when a value is missing the composer says so and suggests a "Read full profile" block before.
- Missing values: the fallback is used; with no fallback the value is empty. Option on each block, "Skip people who lack a value I used" (off by default): they are not written to, with a fixed reason.
- Variables: `first_name`, `last_name`, `full_name`, `headline`, `location`, `company` (current), `title` (current), `previous_company`, `previous_title`, `school`, `top_skill`, `about_snippet`, `commented_on`, `comment_excerpt`, `reacted_to`, `connected_date`, `connected_ago`, `commented_date`, `commented_ago`, `reacted_date`, `reacted_ago`, `their_note`, `account_first_name`. Dates read like "12 Oct 2026" and "3 weeks ago". No `recent_post`.
- Spintax is picked truly at random each time a text is filled. A reply and a message are filled when they are asked and that text is the one stored and sent; an invite note is filled when the invite goes (the name may arrive after planning), so a retry of an invite that did not go may pick again. The preview shows random picks and can list every variant.
- InMail is out of scope.
- Templates: many short built-in samples for each of the three uses, and "save as my template" (new table `MessageTemplate`, additive migration), the owner's own, listed with the samples.
- Same branch and PR as the events and hooks work, in new commits.

## Scope and non-goals

- In scope: a pure template engine in `packages/contracts` (parse, validate, variables, spintax, deterministic pick, length checks, count of variations); use of it in the invite, message and reply executors and services (one place for the fill, replacing `fillWords` and the invite twin); a `workflow.messagePreview` query (renders for a chosen real person or a made-up one, shows the filled text, the missing values, the length and the count of variations); a composer component for the three blocks (variable chips inserted at the cursor, spintax helper, sample templates, live preview on people from My network, warnings); sample templates; `MEMORY.md`.
- Out of scope: InMail, automatic paid profile reads, AI-written text, sending anything differently (limits, queue and "Act for real" are unchanged), changing the Unibox composer (it can adopt the engine later), post text of the person's own posts.

## Approach

Each step starts with failing tests.

- [x] 1. Contracts: `template.ts` (also `humanAgo`, `humanDate`, `renderAll` that lists every variant, and about 30 short samples) with `parseTemplate`, `renderTemplate(text, values, { seed })`, `templateProblems(text, { maxChars, known })`, `countVariations`, the variable catalogue (key, label, where it comes from, example) and the per-block sample templates. Unit tests: syntax, nesting, fallbacks, unknown variable, unbalanced braces, pipes inside variables, deterministic pick, length after fill, variation count cap.
- [x] 2. Brain: `MessageValuesService.valuesFor(userId, slugs, accountFirstName)` and the overlay of the run item; `templateValues(item, snapshot, account)` building the variable values from the person item, the `PersonSnapshot` and the signals (ids and text the owner already holds; nothing is logged). One fill function used by `sendMessages`, the reply block and the invite plan; `fillWords` removed; the filled text is the one stored for the act, so a retry never re-picks.
- [x] 3. Brain: validation of the block settings through `validateGraph` (unknown variable, unbalanced braces, a variant over the limit once filled), and "skip people who lack a value" with a fixed reason.
- [x] 4. Model: table `MessageTemplate` (userId, name, use, text) with `MessageTemplateService` (list, save, delete; 50 an owner).
- [x] 4b. API: `workflow.messagePreview` (owner only; a person from the owner's lists or My network, or a made-up one; returns text, missing, length, variations) and `workflow.messageTemplates`.
- [x] 5. Body: `MessageComposer` replacing the plain field for the three blocks: chips, spintax helper, templates, preview with "next example", warnings, "add Read full profile first" hint; accessible (labelled controls, keyboard insert).
- [x] 6. Integration tests: a run through each of the three blocks with spintax and variables from a snapshot and signals (preview does nothing, acts only with "Act for real"); same person gets the same text on retry; missing value with fallback, without it, and with "skip".
- [x] 7. `MEMORY.md`, this plan's Outcome.

## Edge cases and risks

- Existing saved texts use `{first_name}` and `{company}`: they must render exactly as today (golden tests).
- A `{...}` that is meant literally (a brace in a message): escape with a backslash; unknown names are a validation error, not silent text.
- The 200 character note limit applies after the fill, to every variation: the editor checks the longest case, the run re-checks the one picked and fails the person (not the run) with a fixed reason rather than send a cut note. Free accounts have few notes a month: unchanged.
- Spintax explosion: cap nesting depth and the number of alternatives; `countVariations` saturates at a large number instead of overflowing.
- Privacy: values come from data the owner holds for that person and go only into that person's message and the preview the owner sees; never into events, logs, deliveries, run inputs, hook or event JSON, or error messages. Erasure ("Do not contact", person delete) already removes the snapshot; the composer reads nothing that survives it. The stored act text already exists for sends.
- Spam and anti-abuse: spintax varies words; it does not raise limits or change timing. Daily limits, "not again for N hours" and "Act for real" are untouched.
- Preview cost: reads only the database; no paid call. A made-up person for people without data.
- A person with a name like "unknown" or "linkedin": `first_name` stays empty as today.
- Comments and reactions: only the stored excerpt (up to 140 characters) is used; a person with no signal has no `commented_on`; the text must still read well with the fallback.
- Concurrency and idempotency: the pick depends only on stable input, so two workers produce the same text.
- Rollback: no migration is needed for steps 1 to 6; the saved-template table (question 7) is additive.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build` and the brain integration tests for the three blocks.
- Real path: in the browser, write a message with variables and spintax, preview on three real people from My network (one with a full profile read, one with only a comment signal, one with nothing), run a preview of a workflow (nothing sent), and check the text each person would get. A live send is not part of this check and needs your go-ahead.

## Outcome

Shipped on the same branch and PR #181 (2026-11-03): the engine, 33 samples, the composer in the three blocks, "Skip people I have no value for", saved templates, previews on made-up or real people from My network with every version listed, and validation of the text in `validateGraph`. Deviations: an invite note is filled at send time from stored data only (see `MEMORY.md`); `account_first_name` for invites is empty (the account is not known at fill time). Not built: a retry-stable spintax pick (the owner chose random), InMail, `recent_post`, per-block "Read full profile" auto-insert (the composer only suggests it). Not run: a browser pass of the composer (typing, cursor insert, popovers, keyboard and screen reader).
