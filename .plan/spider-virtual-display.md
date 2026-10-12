# Spider worker: run Camoufox on a virtual display

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 (the request names the option and the place: `headless: "virtual"`, in the spider worker)

## Goal

Camoufox's README recommends a virtual display buffer (Xvfb) over plain headless mode, because headless can become
detectable. The worker passes `headless: true` today; run it with `headless: "virtual"` where it runs in the image.

## Facts checked (2026-10-12)

- `camoufox@0.5.8` (Node) accepts `headless: boolean | "virtual"`. `"virtual"` spawns Xvfb (`which Xvfb`, Linux only),
  picks a free display itself and tears it down with `browser.close()`. Without Xvfb it throws `CannotFindXvfb`; on
  macOS it throws `VirtualDisplayNotSupported`.
- The screen of the page comes from the generated fingerprint, not from the Xvfb root window (default `1x1x24`).
- Video recording under `"virtual"` is described as fixed in the browser build; the Dockerfile test below proves it for
  the pinned build.

## Requirements

- R1 The worker image installs `xvfb` and starts Camoufox with `headless: "virtual"`.
- R2 A new setting `SPIDER_HEADLESS` (`true` or `virtual`, default `true`) chooses the mode, so a Mac or a machine
  without Xvfb keeps working locally. The worker image sets it to `virtual`. Staging sets it to `true` in the k8s
  overlay (requested by the user, 2026-10-12), so the image default only applies elsewhere.
- R3 Recordings (screenshots, text, video) still work in the virtual mode.

## Design

- `CamoufoxOptions.headless?: true | 'virtual'` (default `true`), used by `CamoufoxDriver.launch`.
- `worker.ts` maps `SPIDER_HEADLESS` to it. The spider API never starts a browser.
- `apps/spider/Dockerfile` worker stage: add `xvfb` to the apt list and `ENV SPIDER_HEADLESS=virtual`.

## Edge cases and risks

- Xvfb missing or unable to start: the launch throws; a validation reports the engine error as today. The image
  installs it, and the e2e check below starts the real thing.
- Memory: Xvfb with a 1x1 screen is small. The worker limit stays 2Gi.
- A crashed browser leaves an Xvfb socket behind: Camoufox removes the lock and socket on teardown.
- `/tmp/.X11-unix` is created by Xvfb for the `node` user; checked in the container.
- Local development on Linux: set `SPIDER_HEADLESS=virtual` only after `apt-get install xvfb`.
- Rollback: set `SPIDER_HEADLESS=true` on the Deployment, no rebuild needed.

## Open questions

None.

## Steps

- [x] Unit tests: the driver launches with `headless: true` by default and with `"virtual"` when set
- [x] Setting, driver option, worker wiring
- [x] Dockerfile: `xvfb` and `ENV SPIDER_HEADLESS=virtual`
- [x] Build the worker image and start Camoufox on the virtual display in it, with and without a recorded video
- [x] lint, ts:check, unit tests, build; MEMORY.md

## Outcome

Shipped as planned. In the built worker image Camoufox starts on Xvfb: the X socket exists while the browser runs and
is removed on close, a page loads, `navigator.webdriver` is `false`, and a screenshot and a webm video are produced.
Unit tests: spider 343 (two new). Not checked: the staging rollout and a run against LinkedIn in this mode. The video
file was only checked for existence and size, not played.
