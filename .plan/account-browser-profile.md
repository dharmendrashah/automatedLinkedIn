# A real browser profile per account, kept in the bucket

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19

## Goal

Each LinkedIn account runs in its own Firefox profile, like a person's browser: the same folder every run, with its cookies, site storage, history and (optionally) cache. The profile is saved to the bucket after a good run and put back before the next one, so the browser carries its whole last state and pages load faster.

## What exists (2026-10-19)

- Every run starts a fresh, empty Firefox (`Camoufox()` then `browser.newContext({ storageState, recordVideo, ... })`).
- What carries over is the sealed storage state `sessions/<account>/state.json`: cookies, local storage and IndexedDB of allowed sites, saved only after a run that passed its check.
- The device identity (fingerprint, language, timezone) is pinned per account, so the browser already looks the same every run.
- On LinkedIn (owner's DevTools screenshot, 2026-10-19): cookies, local storage, session storage, and IndexedDB `beacons`, `grpcRestBeacons`, `sequenceNumber` (telemetry, not sign-in).

## What a profile adds over the storage state

- HTTP cache and Cache Storage: pages and scripts load from disk (faster, and fewer requests look like a returning browser).
- History, site permissions, HSTS, service worker registrations: the browser looks used, not fresh.
- Not session storage: Firefox drops it when the tab closes, in a profile too.

## Proposal

1. **Start (spider):** download `profiles/<account>/profile.tar.zst.enc`, decrypt (AES-256-GCM, the credentials key, streamed), unpack into a temporary folder, and launch Camoufox with `persistent_context: true, user_data_dir` and the account's pinned identity and proxy. No profile yet: an empty folder, plus the storage state as today.
2. **End:** after the browser closes, and only after a run that passed its check (`commitSession`), pack the folder (without lock files, crash reports and the parts left out by the size rule), encrypt, upload; then delete the temporary folder in every case.
3. **Storage state stays** as a small backup: if the profile is missing, too old for the browser build, or cannot be opened, the run starts from the storage state as today.
4. **Size rule:** the profile has a size cap; above it the HTTP cache is left out first, then the profile is not saved (the storage state still is).
5. **Local tool (`pnpm record`):** the profile lives in a folder on disk per account, so a local visit starts signed in without signing in first.
6. One run per account at a time is already guaranteed by the account lease, so two runs never write the same profile.

## Requirements

Confirmed:

- One profile per account, saved after a good run and loaded before the next, kept in the bucket and encrypted.
- The HTTP cache is kept (Camoufox's `enable_cache` is on for profile runs).
- Size cap 1 GB packed. Above it the HTTP cache (`cache2`) is left out; if still above, the profile is not saved (the storage state still is).
- `state.json` stays as the backup, restored into a new profile with `setStorageState`.
- The local tool keeps a profile folder per account on disk (`.devtools-recordings/profiles/<account>`), not in the bucket.

Design:

- `Profiles.checkout(accountId)` gives `{ dir, restored, keep(), release() }`. Bucket version (worker): download, unseal and untar into a temporary folder; `keep` tars (gzip), seals and uploads as a stream; `release` deletes the folder. Disk version (local tool): a fixed folder, `keep` and `release` do nothing.
- Archive `profiles/<account>/profile.tar.gz.enc`: a 4-byte tag, the 12-byte IV, AES-256-GCM ciphertext, the 16-byte auth tag at the end; streamed both ways, so memory stays flat.
- `tar` is the system binary (present in the bookworm worker image).
- The worker gets a 4 Gi disk `emptyDir` at `/tmp` for unpacked profiles. `SPIDER_BROWSER_PROFILES` (default on) turns profiles off for rollback.
- `CamoufoxDriver.open({ profileDir })` launches a persistent context (`persistent_context`, `user_data_dir`) with the same identity, proxy, video and route rules.

Open questions: none.

## Scope and non-goals

- In scope: `CamoufoxDriver.open` (persistent context), a `ProfileVault` (pack, seal, upload, download, unpack), the runner (load before, save after), the local tool, tests, worker disk (`emptyDir`) and memory check.
- Out of scope: brain (never reads the profile), sharing a profile between accounts, session storage.

## Edge cases and risks

- **Worker disk and memory:** an unpacked profile plus cache needs disk; the pod gets an `emptyDir` with a size limit. Packing runs after the browser closed, so it does not add to the browser's memory peak.
- **Time:** download and upload add seconds per run (more with cache).
- **Corrupt or partial profile:** a failed unpack or a browser that will not start from it falls back to an empty profile plus the storage state, and the bad profile is not saved over.
- **Camoufox upgrade:** a profile from an older build may not open; same fallback.
- **Secrets:** the profile holds sign-in cookies; it is sealed before upload, never logged, and the temporary folder is deleted after every run.
- **Fingerprint:** the profile's own prefs must not fight the pinned identity; Camoufox applies the fingerprint at launch, which is checked in the browser test.
- **Rollback:** switch back to the non-persistent launch; the storage state keeps working throughout.

## Verification

- Gates; a Camoufox e2e: a page writes cookie, storage, IndexedDB and a cached file, the profile is packed, sealed, unpacked into a new folder, and a new browser finds all of it (and serves the cached file without a request); the browser test on staging still passes with a reused profile.

## Outcome

- Shipped:
   - `sessions/sealStream.ts` (streamed AES-256-GCM, tag at the end), `sessions/profiles.ts` (`BucketProfiles`: tar.gz, sealed, streamed to `profiles/<account>/profile.tar.gz.enc`, 1 GB cap, `cache2` dropped first; `DiskProfiles` for the local tool).
   - `GcsStore.readStream` / `writeStream`; `CamoufoxDriver.open({ profileDir })` launches a persistent context with the run's options and `enable_cache`, and fills a new profile with `setStorageState`.
   - Runner: checkout before the run, `keep` after a run that passed its check (with the session save), `release` always.
   - Worker: `SPIDER_BROWSER_PROFILES` (default on), a 4 Gi `emptyDir` at `/tmp`.
   - Local tool: profiles under `.devtools-recordings/profiles/<account>` and the device identity on disk too (`LocalStore.get` / `create`), so a profile always goes with the same device; a visit signs in first only when the account has no local profile yet.
- Deviations:
   - The HTTP cache is packed and restored, but Playwright does not use it while request routing is on ("Enabling routing disables http cache"), and the driver routes every request for the navigation allowlist. So pages are not served from the cache yet. Using it needs the allowlist check without `context.route`; done in `.plan/browser-allowlist-policy.md`.
   - The local tool's profile is used in place, so a failed local run also changes it (there is no copy to throw away).
- Follow-ups:
   - Decide how to enforce the allowlist without routing, if the cache should serve pages.
   - Watch staging: profile size, upload and download time per run, `/tmp` use.
