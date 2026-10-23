# Unibox: one inbox for the messages of every LinkedIn account (UI first)

- Status: done (UI on sample data; phase 2 is open)
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (Q2, Q7, Q8, Q9 answered below)

## Goal

A page in the web app, `/unibox`, where an agency that runs hundreds of LinkedIn accounts reads the messages of all of them merged into one inbox, always sees which account a message came from and which account it came to, and replies from the same page. This plan is the interface only, on sample data: no brain tables, no real sending. The data and the sending come after (phase 2), behind the same data interface, so the screens do not change.

## What exists

- Body: React 19, Vite, Tailwind 4, shadcn/ui in `components/ui` (sidebar, avatar with badge, badge, button, command, dialog, dropdown-menu, input, popover, select, separator, sheet, skeleton, tabs, textarea, toggle-group, tooltip), `lucide-react`, `sonner`, `@tanstack/react-query`, tRPC client. Dashboard shell: `DashboardLayout` (inset sidebar, `SiteHeader` top bar), nav list in `components/app-sidebar.tsx`, routes in `App.tsx`, page rule: full width, root `grid w-full gap-4 px-4 lg:px-6`.
- No virtual list, no scroll area, no hover card, no test library for components (body tests are pure `*.unit.test.ts`).
- Spider reads messages into `messages.json` (`packages/contracts/src/messages.ts`): conversation (id, title, participants, unread, lastActivity, complete) with messages (id, sender, direction `ME` or `THEM`, date, time, when, text, attachments as placeholders). The sample file `apps/spider/.devtools-recordings/.../48b9baa8.../files/messages.json` has 19 conversations and 57 messages of one account (8 messages sent by the account). It holds real people's names and words.
- Theme: `index.css` has the shadcn tokens (blue primary, light and dark), `next-themes` drives dark mode.

## Proposal

### What the owner sees

Sidebar entry **Unibox** (inbox icon, unread count badge of all accounts, abbreviated above 999) under Dashboard. The page opens on **All** (every message of every account merged), with the **Needs reply** count one click away. Page layout, left to right:

1. **Views and accounts rail** (collapsible). Views: All, Needs reply, Unread, Replied, and, only while they hold something, Drafts, Failed and Done. No "Replying" view (it lasts a moment) and no "Sent by us" (it said the same as Replied). Below: the account picker (search, tick several, **Select all** and **Clear**, the selected count always visible, each account with its full name, its unread count and a small state dot for paused, disconnected or restricted; the last selection is remembered on this device). Counts of the views follow the account selection. No client grouping (Q3); see "Saved account sets" in the decisions to confirm.
2. **Conversation list**, newest first (or **Waiting longest**, with the age on the row, in the View menu). One row each, in two lines (the second line is hidden in the compact density):
   - Line one: unread dot, the **from and to preview** (the contact's avatar with the account's small avatar overlapped on its corner and an arrow glyph: contact to account for an incoming message, account to contact for an outgoing one), the contact's name, the time.
   - Line two: "You:" or "Them:" and the last words (an image, a file or a voice note is shown as `[Image]`, `[File: name.pdf]`, `[Voice note 0:12]`), the account's **full name** as a chip in its colour, one status chip (Needs reply, Replying, Replied with the date, Failed), a "Draft" mark when one is waiting, "Also in 2 other accounts" when the same person is in conversations of other accounts of this owner.
   - Hovering an account avatar opens a small card (name, headline, state, when it last read its messages, today's messages).
3. **Conversation**: a header with the contact and the account ("From: Ruediger Niehoff, To: Acme Sales Ada"), the status and **Last reply: Oct 23, 5:18 PM**, and the "Also in N other accounts" chip (opens the details panel). Under it a one-line context strip: "You first wrote Jan 25, 2024. Waiting since Oct 21." (all from the messages themselves). Messages are bubbles grouped by day, consecutive messages of one sender grouped under one name, sent ones on the right with the account's avatar, a "New messages" divider, "Jump to latest" and "Jump to my last message". If the conversation was read only in part (`complete` false) a marker at its top says older messages were not loaded.
4. **Details panel** (closed by default): the contact, the account, and the other conversations of the same contact across accounts (matched by profile link only, never by name alone).

Top bar (the existing `SiteHeader`, extended on this page): the title, one search field that opens the palette (`Ctrl/Cmd K`: message text, contact names and accounts, every hit showing its account, the match highlighted), the account filter, a **View** menu (sort, density) and a **More** menu (Mark all read with a confirmation and undo), and the bell already there. Active filters show as removable chips above the list, with "Showing 40 of 1,203", and the "12 need a reply" line is a button that applies that filter.

### Reply (UI only)

The composer sits under the open conversation. It shows the account in a bordered banner: **Replying as <account full name>**, with its avatar and colour (the name is the main cue, colour only helps); for a group, "Replying to the group (3 people)".

- Text box and one **Send** button, always visible. `Enter` is a new line; `Ctrl/Cmd Enter` sends, and a one-line hint under the box says so. An empty or only-spaces reply cannot be sent; over the limit (8,000 characters, unverified) it cannot be sent and the counter turns red. The counter, emoji, templates and the keyboard hint appear when the box is focused.
- One **Attach** button with a menu: Image, Video, Audio (a voice-note recorder with a fake waveform and timer; no microphone is opened), File (any file), Link (shown as a chip with the domain; nothing is fetched; a shortened link gets a "shortened link" note). Drag and drop and paste of images. Each attachment is a removable chip with a fake upload bar; too large or an unsupported kind shows a plain message (limits are constants marked unverified).
- Templates: a small searchable list (`/`), with variables (`{first name}`, `{account}`) filled in and shown in a preview before they are inserted, and a warning chip if a variable could not be filled.
- Drafts are kept per conversation (in memory, and on this device) when the owner moves to another conversation or reloads; the row shows "Draft" and the Drafts view lists them.
- If the account is paused, disconnected or restricted the composer is disabled and says why. If the same person was already answered from another account of the owner in the last days, a notice above the box says so ("You replied to this person from Acme Sales on Oct 21").

### Reply states

- **Needs reply**: the last message is theirs and the owner has not marked it done. Reading does not change it. A new incoming message on a Replied or Done conversation brings it back to Needs reply at once, and the row shows "New message".
- **Replying**: the owner's reply is being sent (a "Sending..." state with an **Undo** for 5 seconds before it counts as sent; the Send button is locked while it lasts, so a double press sends once).
- **Replied**, with the **last reply date**: shown as one chip "Replied Oct 23" (the full date and time on hover and in the thread header). **Failed** is the state when a send did not go: the draft is kept and a **Retry** button shows.
- **Done**: the owner closed it without replying (a "thanks" from them); it leaves Needs reply and is listed under Done; **Undo** is offered. Done is not Replied.
- **Unread** is separate: opening a conversation marks it read after 1.5 seconds (so skimming past rows does not clear them) and a **Mark unread** is on the row and in the thread. Read and replied are independent.
- After a send, "Reply and next" opens the next conversation that needs a reply in the current filter and sort and says when the account changes ("Next: Acme Sales"). There are also **Skip** and **Done and next**.

### Fast and safe, for hundreds of accounts

- Virtualized list (`@tanstack/react-virtual`, Q5) with the correct position and total announced to screen readers; memoized rows; one index built once per data change for filters, search and counts; filter changes in a React transition so typing never stalls.
- Keyboard first: `J` and `K` or arrows move, `Enter` opens, `R` focuses the reply, `E` marks done, `U` marks unread, `X` selects (Shift range), `/` searches, `?` lists them. Single-letter keys do nothing while a text box or the palette has focus or a modifier is down. `Esc` closes things in a fixed order: palette or menu, then the details panel, then the composer focus, then (on a phone) the conversation.
- Bulk: select rows (or **Select all N matching**, which says how many), then mark read, done or unread; each asks for a confirmation that states the count and the current filter and offers Undo.
- Plain first steps: with one account the picker, chips and From/To labels are hidden; with a few messages the rail shows only All and Needs reply; the empty state has three steps each with a button, and says "Nothing is sent to anyone until you press Send".
- The state is in the address: `/unibox/:conversationId?view=needs-reply&q=...`, the account selection on this device (it can be long), so a refresh or a shared link keeps the view.

### Look: LinkedIn's scheme, scoped to the page

Tokens are set on a `.unibox` wrapper, so shadcn components inside pick them up and the rest of the app keeps its theme. Light: LinkedIn blue `#0A66C2` (hover `#004182`), canvas `#F4F2EE`, cards white, text `rgba(0,0,0,.9)` and secondary `#666666`, borders `#E0DFDC`, selected row `#EDF3F8`, replied green `#057642`, replying amber `#915907`, needs reply blue. Dark: LinkedIn's dark set (`#1B1F23` canvas, `#71B7FB` blue). Smoothness: 150 ms transitions, skeletons while loading, no layout jump when a status changes, `prefers-reduced-motion` respected, 44 px touch targets on mobile (single pane with a sheet).

### Data boundary and sample data

- One interface, `UniboxSource` (accounts, conversations with messages, send), with a sample implementation now and a tRPC one in phase 2. Types are derived from the contract: a Unibox conversation is a `messages.json` conversation plus `accountId`, `replyState`, `lastReplyAt`.
- Sample data (Q2, the owner chose the real file): the page loads the real `messages.json` as it is and spreads its conversations over 12 sample accounts (rotating, with the dates shifted a little) so the merged inbox looks like an agency's. **The real file is read in development only**: a gitignored local copy (`apps/body/src/components/unibox/sample/local/messages.json`) loaded with a dynamic import guarded by `import.meta.env.DEV`, so it is never committed and never part of the production bundle. Reason: the app's files are served to anyone who can open the site, so a bundled copy would publish real people's names and messages on staging. Without the local file (production, tests, a fresh checkout) the page uses a small committed set of invented conversations from a deterministic seed.

## Requirements

Confirmed:

- Merged inbox of all accounts; each message shows the account it came from and the account it came to, as a small preview; messages of all accounts visible.
- Reply UI: text, audio, video, images, links and any file; UI only.
- Fast, smooth and simple for agencies with hundreds of accounts; LinkedIn's colour scheme; shadcn components; sidebar entry and a top bar.
- A conversation shows **Replied**, **Replying** and the **last reply date**.

Answered by the owner on 2026-10-23:

- Q1. Replying means only the owner's own reply being sent. No teammates, no collision warning.
- Q2. Use the real file as the sample. Done as described above: real in development from a gitignored local copy, never committed, never in the production bundle, invented data otherwise. (This keeps the real data on the owner's machine; it is the one point to confirm.)
- Q3. No client grouping.
- Q4. Include the details panel, closed by default.
- Q5. Add `@tanstack/react-virtual`.
- Q6. Opening a conversation marks it read in Unibox. Whether and when that is sent to LinkedIn (which would show "seen" to the other person) is a phase 2 decision; the sample never sends anything.

Changes the user agents asked for (applied above; they refine the answers, they do not reverse them): Replying stays the owner's own send and shows only on the row, the thread and the bubble (no view); opening a conversation marks it read (Q6) but only after 1.5 seconds and never clears Needs reply; Done is a separate state from Replied; row simplified to two lines; a visible "Example messages, nothing is sent" banner; an Undo window after Send.

Answered by the owner on 2026-10-23:

- Q2. The real sample file is committed to the repository (tracked, not ignored). It is still loaded only in development (a dynamic import behind `import.meta.env.DEV`), so it is not part of the production bundle: the app's files are served to anyone who can open the site, and the build is checked to contain none of its text. It stays in git history for good.
- Q7. Saved account sets are implemented: pick accounts once, name the selection, reuse it; stored on this device; no client model.
- Q8. Views: All, Needs reply, Unread and Replied; Drafts, Failed and Done appear only while they hold something.
- Q9. `Ctrl/Cmd Enter` sends, `Enter` is a new line, with a visible Send button.

Open questions: none.

## Scope and non-goals

- In scope: page, route, sidebar entry, top bar additions, list, thread, composer UI, status model and chips, filters, search palette, keyboard shortcuts, sample source, pure-logic unit tests, `MEMORY.md`.
- Out of scope: brain tables, tRPC procedures, the worker sending anything, real uploads, real audio or video capture, real notifications, assignment to teammates, scheduling and snooze, link previews that fetch pages, translating messages.

## Approach

- [x] 1. Answers received (Q1 to Q6); reviewed by user agents; lock after the confirmations below.
- [x] 2. Pure logic with tests first, in `components/unibox/`: types (account state, conversation, message, status), the conversation index (views, account selection, search with highlight, sort including waiting longest, counts, duplicates by profile link), the reply state machine (`NEEDS_REPLY`, `SENDING` shown as Replying, `REPLIED` with the last reply date, `FAILED`, `DONE`, reopen on a new message, undo window), drafts store, read-after-delay rule, bulk selection rules ("visible" versus "all matching"), day grouping and sender grouping, relative time and age, safe link detection and shortened-link flag, attachment rules, template variables, address state (parse and serialize), keyboard reducer with the typing guard and the `Esc` order, the deterministic sample seed.
- [x] 3. Tokens: `.unibox` scope in `index.css` (light and dark, own status colours for dark).
- [x] 4. shadcn components to add: `scroll-area`, `hover-card`, `switch`; add `@tanstack/react-virtual`.
- [x] 5. Screens: account avatar, chip and hover card; conversation row (two lines, compact); list with chips of active filters and the progress line; thread with context strip, grouped bubbles, divider and jumps; composer (banner, text, attach menu, recorder UI, link chip, templates with variables, drafts, undo, failed and retry); rail with views and account picker; toolbar, View and More menus; palette; confirmations and undo toasts; empty, loading, error and sample-banner states; mobile pane and sheet.
- [x] 6. Wire: routes `/unibox` and `/unibox/:conversationId`, address state, sidebar item with unread badge, header title, keyboard layer.
- [x] 7. Verify: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; a production build must not contain the real sample file's text; open the page in a browser at desktop, tablet and phone widths, light and dark, with the 400-conversation sample, with one account, with a few messages and with none; walk the keyboard path and the focus order; try every state (Failed with `/fail`, paused account, partial load).
- [x] 8. `MEMORY.md`, Outcome.

## Edge cases and risks (UI only)

Found by the plan's own review and by five user agents (agency owner, sales rep, GTM engineer, founder; the platform admin has no seat here) on 2026-10-23. Everything below is a screen, a state or a rule of the interface.

**Wrong account, wrong person**

- Reply banner with full name, avatar and colour; colours collide at hundreds of accounts, so the name is the cue; two accounts with the same name show their handle or email domain.
- A draft is kept per conversation and never carried to the next one; switching conversations with a draft shows "Draft" on the row.
- Same person in several accounts: visible chip on the row and header, a notice in the composer when another account already replied, and a "Reply and next" that says when the account changes.
- Matching a contact across accounts by profile link only; a missing link means no match (two different people named "Anna" are never merged).
- Group conversation: all names shown, the composer says it is the group, "From" lists the sender per message.

**Accidental actions**

- Undo for 5 seconds after Send, Done, Mark all read and bulk actions; Send locked while sending; bulk and Mark all read confirm with the count and the filter; "Select all" says whether it means the visible rows or all matching.
- `Enter` never sends; `Ctrl/Cmd Enter` does; a visible Send button; no single-letter shortcut fires while typing.

**Status clarity**

- Needs reply, Unread, Replied, Done and Failed mean different things and are never combined into one chip; the legend is in the "?" sheet and in tooltips; "Replied" reads as "You replied" on hover.
- A new incoming message reopens a Replied or Done conversation; a skim does not clear Needs reply; a conversation opened for under 1.5 seconds stays unread.
- A conversation answered from LinkedIn itself (the last message is ours but the interface has no reply date) shows "Replied" with the date of that message and "Last reply" from it.
- Counts: the sidebar badge is all accounts; the rail counts follow the account selection; the list header says "Showing N of M"; the "need a reply" line is a button; the numbers cannot disagree because they come from one index.

**Account state and stale data**

- Paused, disconnected or restricted accounts show a state dot in the picker, on the row and in the composer (disabled, with the reason); "last read 3 min ago" or "not read since Oct 12" per account, so an empty inbox is not mistaken for a dead account.
- Part of the accounts failing to load shows a banner that names how many and offers Retry; the rest stay usable.

**Volume**

- 10,000 conversations and 300 accounts (virtualized, one index); an unread badge of 12,483 is abbreviated; 40 accounts selected shows "40 accounts" with a list, not 40 chips; a thread of 1,000 messages is virtualized too, keeps its scroll position when older messages are added and has Jump to latest and Jump to my last message.
- Typing in search or composer stays smooth with all of it loaded.

**Odd content**

- Image-only, file-only and voice-only messages show as `[Image]`, `[File: name]`, `[Voice note 0:12]` in the row; empty conversation; missing contact name shows "Unknown member"; a person who left shows as such; very long names truncate with a tooltip; long words wrap; emoji-only, right-to-left text and many consecutive messages of one sender (grouped, with a count when over 5).
- A message without a date is placed by its order and shows the text LinkedIn showed; "Last reply" and the thread never disagree because both come from the messages; a conversation read in part says so (`complete` false).
- Messages are other people's words: always text, links only `http` or `https`, with their domain, `rel="noopener noreferrer"`, never fetched; shortened links are marked; file and image names are shown escaped; no HTML is injected.

**Empty, loading and error states**

- No accounts (the three steps, each with a button); accounts connected but no messages ("Connected, no messages yet"); no results ("No results for 'xyz'", Clear filters); Nothing needs a reply ("You are all caught up"); the list loading (skeletons, no layout jump); failed send (draft kept, Retry); attachment too large or wrong kind; the real sample file missing (the invented set is used and the banner says so).
- One account only: the picker, chips, From/To and the details panel's account list are hidden.

**Sample mode**

- A visible, small banner "Example messages, nothing is sent" on the page whenever the data is the sample (always, in this phase), so a screen share or a demo is never mistaken for real.
- The committed sample has what the real file cannot show: the same prospect in several accounts, a paused and a disconnected account, a stale account, replies waiting for days, groups, image-only and voice-only messages, a conversation of 500 messages, unread and needs-reply combinations; a send fails when its text contains `/fail`, to see the Failed state.

**Keyboard and accessibility**

- The list is a listbox with roving focus and `aria-posinset` and `aria-setsize`; status changes are announced only for the open conversation and for send results, never per row; every icon button has a label; focus returns to the row after Send and after closing a panel; visible focus ring; contrast checked on LinkedIn blue and on the dark set; reduced motion respected (no slide or fade, only the state change).
- Shortcuts have hints in tooltips and a "?" sheet; they are desktop features, and the phone has Back, Previous and Next buttons instead.

**Mobile**

- One pane at a time; Back to list keeps the scroll position and filters; Previous and Next in the thread header; composer, account banner and Send stay visible above the keyboard (visual viewport); 44 px targets; bulk selection and shortcuts are not offered.

**Theme**

- `.unibox` tokens follow the app's `dark` class (a selector on `.dark .unibox`); the status colours have their own dark values (the light amber is too dark on the dark canvas); the page never changes the app theme and the app theme never changes its colours.

**Parked, not UI-only (phase 2 or later)**

- Campaign and prospect outcome tags (interested, not now, wrong person); teammates and reply collisions; the real Undo window (needs a delayed send in the worker); passing "read" to LinkedIn (it tells the other person "seen"); verifying LinkedIn's real limits; real duplicate detection across accounts by person identity; shared links across users.

**Rollback**: a new route, new components and one sidebar line; no data, no migration.

## Verification

- Unit tests for the logic in step 2 (the reply state machine, filtering and counts, search, grouping, link safety, attachment rules, the seed, the keyboard reducer), and a check that a production build contains none of the sample file's text.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- A look in a real browser (sign-in is required; I will use the local stack if it is up, and say so if I cannot).

## Outcome

Shipped (2026-10-23): the page `/unibox` (route `/unibox/:conversationId?`, one route so the page keeps its state), sidebar entry, header title, `.unibox` tokens (light and dark), saved account sets, composer (text, image, video, audio recorder look, file, link, templates, drafts, 5 s Undo, Failed and Retry), palette, keyboard layer, views rail, details panel, sample data (the real `messages.json` is tracked and loaded in development only; `pnpm build` output was checked to hold none of its text and no chunk for it). `@tanstack/react-virtual`, `scroll-area` and `hover-card` were added. 439 body unit tests (the pure logic of the page) pass; lint, `ts:check` and `build` are clean.

Seen in a real browser (sample data, light and dark, with a temporary sign-in bypass that was removed again): list, thread, send with Undo window, Failed with `/fail`, Retry and Dismiss, the palette, the account picker. Not seen: a phone width, a paused account in the composer, a partial load, the details sheet, drag and drop and paste, the recorder, templates, bulk actions and the keyboard on a real key press (the palette was opened by a dispatched key event); the page logic is not covered by component tests.

Deviations from the plan:

- The layout follows the width of the content (container queries `@3xl` and `@6xl` on the dashboard's `@container/main`), not the window: the sidebar takes 18 rem, so one pane, two panes (list and thread) and three (rail, list, thread) switch at 48 and 72 rem of content.
- The thread uses `content-visibility: auto` per day instead of a virtualized list (a thread of 1,000 messages is the case to watch).
- The sidebar entry has no unread badge: the unread count lives in the page's state, and there is no shared store until phase 2 reads it from brain.
- The details panel is a side sheet on every width, not an inline column.
- No "Reply and next" button; sending from the Needs reply view moves to the next conversation that needs a reply (the Undo stays in the toast), and Done moves on the same way.
- The attachments of a reply are not kept in a draft (only the text is); an undone reply gives back its text only.
- Mark all read and the bulk actions confirm through an undo toast (and a dialog for Mark all read); Skip is the `J` key.
- Not built: the "New message" mark on a row that came back, and "Select all N matching" beyond the list on screen (the bar offers it, but the list and the match are the same rows today).

Follow-ups: the tRPC `UniboxSource` and the brain tables (phase 2); the real Undo needs a delayed send in the worker; whether opening a conversation tells LinkedIn "seen"; component tests for the page; a phone-width pass.
