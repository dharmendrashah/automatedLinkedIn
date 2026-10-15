# Takeover alert

- Status: locked
- Created: 2026-10-16
- Locked by user: yes, 2026-10-16 ("do this and continue"; the open questions are settled by the defaults in the next section)

## Goal

When a run stops at a security check and waits for its owner, tell the owner even if the tab is in the background: flicker the favicon and play a short "boop", until they act.

## Requirements

Confirmed:

- Flicker the favicon and play a boop sound when a takeover is needed (the request).

Proposed, to confirm (see the questions):

- Trigger: the list that the banner already polls (`takeover.list`, every 3 s, on every page) shows a run it did not show before. No change in brain or the worker.
- Stops when: the owner opens the dialog, the run leaves the list (finished, given up, timed out), or the owner switches the alert off.
- Favicon: swap the `<link rel="icon">` between `favicon.svg` and a new `favicon-alert.svg` (a coloured dot) every 700 ms (under 3 flashes a second); restore the original on stop. Skipped when the system asks for reduced motion; the title and sound still work.
- Sound: a short sine "boop" made with the Web Audio API (no audio file, no licence), repeated while the run waits.
- Sound on or off: a small bell toggle in the banner, kept in `localStorage`.
- Making sure the sound is not blocked. A browser only plays sound on a page the person has touched (click, key, touch), per page load, and no code can lift that. So the aim is that it is never locked when an alert fires, in layers:
  1. Unlock early: a one-time `pointerdown` and `keydown` listener on the document, installed when the app starts (not when an alert fires), creates and resumes the audio context. The owner clicks around the app long before a check stops a run, so it is almost always running by then. A reload needs one new touch, which the same listener catches.
  2. Show the state: the bell shows "Sound on" only while the context is `running`; while it is locked it shows "Sound is blocked, click here", and clicking plays a test boop (the click is the touch the browser wants, and the owner hears that it works).
  3. A second channel that has no such rule: a desktop notification. Once the owner has allowed notifications (asked once, from a click on a visible button), the system plays its own sound and shows the notification even when the tab is hidden or the page was never touched; clicking it focuses the tab and opens the dialog. This is the one that makes a miss unlikely.
  4. Favicon flicker and title flash always run, with no permission and no sound rule.
  5. If the owner wants a guarantee beyond the browser (the laptop is closed, the browser is not open), the only way is a channel outside it (email, chat, phone push); out of scope here, and a follow-up if wanted.
  6. Help text next to the bell for the browser's own site setting (Chrome: Site settings, Sound, Allow; Firefox: Permissions, Autoplay, Allow Audio) which also removes the rule for this site.
- The list query must keep polling while the tab is hidden (`refetchIntervalInBackground: true`); by default react-query stops, and a background tab is exactly when the alert matters.

Open questions (must be empty before locking):

- None. Settled with the proposed defaults: the boop plays at once and then every 10 s, 5 times at most, until the owner opens the dialog; the tab title flashes and a desktop notification shows when the tab is hidden or unfocused (if the owner allowed notifications); sound is on by default with the toggle; the alert (favicon, title, sound) also runs while the owner is looking at the tab, because the banner may be below the fold.

## Scope and non-goals

- In scope: `apps/body` only: a small pure module (`alert.ts`: which runs are new, the favicon swap, the boop), a hook that the takeover banner uses, the alert icon, the toggle, tests.
- Out of scope: push to the browser while it is closed (service worker and web push), email or chat alerts, alert for anything other than takeover, any change in brain, the worker or the contracts.

## Approach

- [x] `alert.ts`: pure helpers (`newRuns(previous, current)`), favicon start and stop, boop, unlock listener, notification; unit tests with fake timers, a fake `AudioContext` and `Notification`, and the jsdom document
- [x] `use-takeover-alert.ts`: starts and stops from the list and the dialog state, owns the on or off setting
- [x] `takeover-banner.tsx`: use the hook, show the toggle, set `refetchIntervalInBackground`
- [x] `public/favicon-alert.svg`
- [x] Definition of done, `MEMORY.md`

## Phase 2: when the tab cannot run (proposed, not locked)

A page that is hidden for long, frozen or discarded by the browser cannot poll, play or flash; a Web Worker does not change that (it freezes with its page, cannot play sound, and needs the token the page holds). What survives is a service worker woken by Web Push.

- 2a. Keep the token alive (needed even for phase 1): the SPA has no refresh (`scope` is `openid profile email`, authentik tokens last 5 minutes), so the list poll gets UNAUTHORIZED about 5 minutes after sign-in and the alert never fires. Ask for `offline_access` in `apps/body/src/auth/config.ts`, add the `goauthentik.io/providers/oauth2/scope-offline_access` mapping to the provider in `infra/authentik/blueprints/automatedlinkedin.yaml` (the `refresh_token` grant is already allowed), and let oidc-client-ts renew by itself.
- 2b. Web Push: brain sends a push when a run starts waiting; a service worker in `apps/body` shows the notification (the system plays its sound; a click opens the app). Needs a VAPID key pair (secret, in `secrets.env`), a `PushSubscription` table (additive migration), tRPC subscribe and unsubscribe, the `web-push` package in brain, a fixed-sentence payload, HTTPS (staging has it). Works with the tab closed while the browser is running.
- 2c. Not recommended: a dedicated Web Worker that polls (cannot play audio, frozen with the page), a periodic background sync (hours apart, installed apps only).

## Edge cases and risks

- Browsers throttle timers in a tab hidden for a long time (Chrome, after 5 minutes, runs them about once a minute), so an alert can arrive late for a tab left in the background for a long while. The real fix is a push from brain; see `.plan/takeover-scale.md`.
- Several tabs of the app each alert, because each polls. Acceptable; the toggle is per browser through `localStorage`.
- Two runs waiting: one alert for the group, and it stops when the dialog of any of them opens or the list is empty.
- The sound must not pile up: one timer, cleared on stop and when the component unmounts.
- Reduced motion: no favicon flicker, nothing else changes.
- A run that disappears and comes back (a retry) counts as new and alerts again.
- Nothing about the run or the account goes into the favicon, the title or the notification beyond a fixed sentence.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; then in a real browser: start a run that stops at a check, switch to another tab, and confirm the favicon flickers and the boop plays; open the dialog and confirm both stop. Not verifiable without a browser and a live check.

## Outcome

Phase 1 shipped (body only): `alert.ts` (unlock listener installed when the banner mounts, boop, favicon and title flicker, notification, a small store), `use-takeover-alert.ts`, `takeover-bell.tsx` in the header (sound on or off, blocked state with a test boop, "Allow desktop alerts"), the banner alerts once per run the owner has not opened and keeps polling in the background, `favicon-alert.svg`. 17 new unit tests; lint without warnings, type check, build and all unit tests pass (body 254). Deviations: "newRuns" became the banner's list of unseen ids; the alert stops for a run once its dialog was opened, even if the dialog is closed again. Not verified: a real browser (favicon, sound and notification), and phase 2 (token renewal, Web Push) is not built, so the alert stops working about 5 minutes after sign-in until 2a is done.
