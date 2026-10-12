# Spider: Camoufox fingerprint constraints (`os` and `screen`)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 (the request gives the exact constraints from the Camoufox README)

## Goal

Camoufox generates a random BrowserForge fingerprint for the target `os` and `screen`. Say which ones the worker allows,
instead of leaving both to the defaults.

## Facts checked (2026-10-12)

- `camoufox@0.5.8` takes `os` (a string or a list of `windows`, `macos`, `linux`) and `screen`
  (`{ maxWidth, maxHeight, ... }`). Without them it picks any OS and a screen from the dataset.
- Fingerprints are generated for the Firefox version the build ships, so the user agent matches the browser. The README
  advises against passing a ready-made `fingerprint` object; this change does not.
- On a virtual display the generated screen is not clamped to the Xvfb root window, so the 1920 by 1080 limit applies.

## Requirements

- R1 Launch with `os: ['windows', 'macos', 'linux']` and `screen: { maxWidth: 1920, maxHeight: 1080 }`, the values of
  the README example. No setting: they are constants in the driver.
- R2 No custom `fingerprint` object.

## Edge cases and risks

- Each launch draws a new fingerprint. For a LinkedIn account that is a different device on every sign-in, and the OS can
  change between runs. A stable fingerprint per account (saved with the session) would avoid that. Not part of this
  change; recorded as a follow-up in MEMORY.md.
- The worker image is Linux, so a Windows or macOS identity differs from the real platform (fonts, GPU strings). That is
  the point of the feature; Camoufox's own coherence checks apply.
- Rollback: remove the two options; Camoufox returns to its defaults.

## Open questions

None.

## Steps

- [x] Unit test: the launch passes `os` and `screen`
- [x] Constants and launch options in `camoufoxDriver.ts`
- [x] Check in the worker image that the screen stays within the limit (and what OS comes out)
- [x] lint, ts:check, unit tests, build; MEMORY.md

## Outcome

Shipped as planned. In the built worker image, six launches with the constraints gave screens of 1920x1080, 1707x1067,
1920x1080, 1707x960, 1920x1080 and 1440x900, all within the limit. All six came out as Windows (`Win32`, Firefox 156):
the three-OS list does not give an even rotation, probably because Camoufox weights the OS by how common it is; this was
not investigated. Unit tests: spider 344. Not checked: a run against LinkedIn with these fingerprints.
