# Spider: Camoufox fingerprint from Apify's fingerprint-generator

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 ("use this fingerprint generator", with the fingerprint-suite README). Replaces the first
  version of this plan, which passed `os` and `screen` to Camoufox and let it generate the fingerprint.

## Goal

Generate the browser fingerprint with `fingerprint-generator` (Apify's fingerprint-suite) and give it to Camoufox.

## Facts checked (2026-10-12)

- `fingerprint-suite` has four packages. `fingerprint-generator` makes a fingerprint (navigator, screen, ...) and headers.
  `fingerprint-injector` injects one into a Playwright or Puppeteer page with JavaScript. Camoufox spoofs inside the
  browser instead, so the injector is not used: it would put a second, script-level layer on top.
- Camoufox takes the fingerprint as the `fingerprint` option. It requires a Firefox user agent (it throws for another
  browser) and prints a `LeakWarning` on every launch: "Passing your own fingerprint is not recommended".
- Apify's dataset is older than Camoufox's own generator: generated user agents here carry Firefox 135 to 150. Camoufox
  rewrites the version to the one of its build (156), so the browser reports 156. The Camoufox README says some
  properties of these fingerprints are not passed because of the outdated dataset; the hardware thread count, for
  example, stayed the machine's own.
- `fingerprint-generator@2.1.88` is the version added (`^2.1.88`), Apache-2.0, with `header-generator` and
  `generative-bayesian-network` as dependencies.

## Requirements

- R1 Generate with `FingerprintGenerator`: Firefox, desktop, `windows`, `macos` or `linux`, screen at most 1920 by 1080.
- R2 Pass it to Camoufox as `fingerprint`. Do not also pass `os` or `screen` (they would steer a second generation).
- R3 Do not use `fingerprint-injector`.

## Edge cases and risks

- A new fingerprint on every launch: one LinkedIn account sees a different device (and sometimes a different OS) on every
  sign-in. A fingerprint saved per account with its session would avoid it. Not built; follow-up in MEMORY.md.
- The `LeakWarning` is printed on each launch. Passing `i_know_what_im_doing` would silence it but also skip Camoufox's
  check that the fingerprint is a Firefox one, so it is left on.
- A generated screen that is not plausible for a desktop (for example 960 by 540) is raised by Camoufox (seen: 1366 by
  768). It never exceeds the limit.
- The dataset ages: generated user agents are already several versions behind Firefox 156. Camoufox corrects the
  version only.
- New dependency: Apache-2.0, a few transitive packages. The deploy image installs production dependencies, so it is in
  `dependencies`.
- Rollback: remove the `fingerprint` option; Camoufox generates its own.

## Open questions

None.

## Steps

- [x] Unit test: Camoufox gets a Firefox desktop fingerprint within the screen limit, and no `os` or `screen`
- [x] Dependency and `newFingerprint()` in `camoufoxDriver.ts`
- [x] Real Camoufox launches with generated fingerprints (local, and in the worker image on the virtual display)
- [x] lint, ts:check, unit tests, build; MEMORY.md

## Outcome

Shipped as planned. Local run (6 launches) and worker image on the virtual display (5 launches): Camoufox accepts the
fingerprints, reports Firefox 156 whatever version was generated, and keeps the generated OS and screen (1376x774,
1920x1080, 1707x1067, 1680x1050; a generated 960x540 became 1366x768). Operating systems seen: Windows in 9 of 11, Linux
in 1, macOS in 1. The compiled driver loads in the image with the new dependency. Unit tests: spider 344. Not checked:
a run against LinkedIn with these fingerprints.
