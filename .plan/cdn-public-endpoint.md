# Public CDN endpoint (remote file cache in a public bucket)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 (answers 1-8, change A, A1)

## Goal

`GET /cdn?url=<encodeURIComponent(remote url)>` on brain answers a `302` to the public address of a copy of that remote file kept
under `cache/` (`https://storage.googleapis.com/<bucket>/<key>`). The first call fetches and saves the file; every later call is one
database read. The `302` is cached by the browser for a long time, so a page that shows the same file again does not call brain at
all. This keeps pictures and media (LinkedIn photos whose links expire, and so on) loading after the remote link dies.

## Requirements

Confirmed (from the request):

- Public route on brain, query `url` holds the full remote URL, URL-encoded once.
- Key is the MD5 hash of the URL. Look it up in the database:
  - found and `saved`: answer `302` (never `301`) to the file's public address.
  - not found: fetch, save to the bucket, write the row, answer `302` to the file's public address.
- Object key `cache/{remote host}/{extension}/{yyyy}/{mm}/{dd}/{hash}.{extension}`, stored on the row as `gs://<bucket>/<key>`.
- Table: `id` (uuid v7), `hash`, `path` (decoded full URL), `status` (`saved` | `pending` | `deleted`, default `saved`),
  `bucketUrl`, `createdAt`, `updatedAt`.
- Any file type.

Locked answers (2026-10-30):

1. Host: `https://api.staging.elitale.com/cdn` (brain's existing host; no ingress or DNS change).
2. Remote hosts: any public `https` host. No allowlist, so the SSRF guard (private, loopback, link-local, metadata and
   unique-local addresses refused after DNS, connect to the checked address, every redirect re-checked) and the miss rate limit
   are mandatory.
3. Types: everything is stored. Kept with its own type (inline) only for `image/*` except SVG, `video/*`, `audio/*` and
   `application/pdf`; anything else (HTML, JS, SVG, unknown) is stored as `application/octet-stream` with
   `Content-Disposition: attachment` in the object's metadata (a public object cannot change its type per request).
4. Size cap: 200 MB for `video/*` and `audio/*`, 25 MB for everything else; `413` above it.
5. A `deleted` row is fetched and saved again (same row back to `saved`), at the key it had (its `bucketUrl` is kept), so a
   redirect a browser cached still points at the right file.
6. Only the three statuses; a failed fetch is fetched again on the next call (the claim is released).
7. `cache/` is kept for good; no lifecycle rule.
8. Hash input: the normalised full URL including the query (`new URL().href`: lowercase host, no trailing dot, no fragment, no
   default port). Known cost: a LinkedIn photo whose `e=`/`t=` rotate is stored once per distinct link.

Change A (2026-10-30, asked by the user, replaces signed links and the "same bucket" requirement):

- A separate public bucket `automate-linkedin-511215-cdn` (env `CDN_GCS_BUCKET`, required for the route; empty -> `503`), with
  uniform access and `allUsers` `roles/storage.legacyObjectReader` (read one object, no listing). The spider bucket stays
  private with public access prevention `enforced`. Keys keep the `cache/` prefix.
- The `302` goes to `https://storage.googleapis.com/<bucket>/<key>` with `Cache-Control: public, max-age=2592000` (30 days).
  A key never changes for a hash (answer 5), so a cached redirect stays right.
- Objects are written with `Cache-Control: public, max-age=31536000, immutable` (chosen over 1 day: fewest requests; erasure
  can lag up to a year in caches), so the browser and Google's edge cache keep the file too.
- No signing: brain needs only create and read on `cache/`, and local dev works with plain user credentials.
- Error answers stay `Cache-Control: no-store`.

Open questions: none.

## Scope and non-goals

- In scope: the route, the table and its service, fetch-and-store, unit and integration tests, the bucket and grant commands in
  `deploy/gcp-setup.md`, env var, `MEMORY.md`.
- Out of scope: files that need a LinkedIn session (`www.linkedin.com/dms/prv/...`, they answer 403 without cookies and are kept by
  the spider already), image resizing, Cloud CDN or a custom domain in front of the bucket, rewriting existing `imageUrl`s in the
  body app to use `/cdn` (a follow-up), an admin page, purge API.

## Approach

Data:

- [x] `prisma/schema.prisma`: model `CdnFile` (`id String @id @default(uuid(7)) @db.Uuid`, `hash String @unique @db.Char(32)`,
      `path String`, `status CdnFileStatus @default(SAVED)`, `bucketUrl String?` (null while first `pending`), `contentType String?`,
      `size Int?`, `createdAt`, `updatedAt @updatedAt`) and enum `CdnFileStatus { SAVED PENDING DELETED }`. Additive migration
      `add_cdn_file`. `contentType` and `size` are extra, for support and the collision guard.
- [x] `database/cdnFile.service.ts` (static class): `find(hash)`, `claim(hash, path)` (insert `PENDING` with
      `ON CONFLICT DO NOTHING`, or take over a `PENDING` row older than 5 minutes or a `DELETED` row; returns whether this call
      owns the fetch), `saved(hash, bucketUrl, contentType, size)`, `release(hash)` (deletes a new `PENDING` row, or puts a
      taken-over `DELETED` row back, after a failure). Integration test for claim races.

Core:

- [x] `core/cdnUrl.ts` (pure): parse and normalise the `url` query (one string, at most 2048 chars, `https:` only, no
      user/password, default port only, no IP literal or single-label host), `md5(href)`, extension from the path or else from the
      response type (`image/jpeg` -> `jpg`, unknown -> `bin`), the object key with the UTC date, and the public address
      (`https://storage.googleapis.com/<bucket>/<key>`, each segment URL-encoded). Unit tests.
- [x] `core/cdnFiles.ts`: `fetchAndStore(url, key)`: `fetch` with `redirect: 'manual'` (follow at most 3, each target checked
      against the same rules), 15 s connect and 60 s (other) or 5 min (video/audio) total timeout, streamed to
      `bucket.file(key).createWriteStream({ resumable: false, contentType, metadata: { cacheControl, contentDisposition } })` with a
      byte counter that aborts at the cap (an aborted stream leaves no object). Resolve the host first and refuse private,
      loopback, link-local, unique-local and metadata addresses (`169.254.169.254`), then connect to that checked address (no DNS
      rebinding). Unit tests with mocks.

Route:

- [x] `middlewares/cdn.ts` with `Cdn.config(app)`, registered in `middlewares/index.ts` before tRPC. `GET /cdn` (HEAD comes free):
  1. Validate -> `400` (missing, repeated, malformed, not https, IP literal, odd port, credentials).
  2. `find(hash)`: `SAVED` -> `302` to the public address.
  3. Otherwise `claim`. Owner: fetch, store, `saved`, `302`. Not owner (someone else is fetching): wait for the row up to 10 s
     (poll every 500 ms), then `302`, or `503` with `Retry-After: 5`.
  4. Fetch failure: `release`, then `404` (remote 404/410), `403` (private address), `413` (too big), `504` (timeout),
     `502` (anything else).
  - Every `302` sets `Cache-Control: public, max-age=2592000` and `Referrer-Policy: no-referrer`, so the browser (and any shared
    cache in front of brain) answers repeats without calling brain. Errors set `Cache-Control: no-store`.
  - Logs carry host and hash only, never the full URL (query strings hold tokens).
- [x] Per-pod single flight (a `Map<hash, Promise>`) so one pod never fetches the same URL twice at once; the database claim
      covers several pods.
- [x] Rate limit misses only (fetches), per client IP, in memory: 60 a minute -> `429`. Hits are not limited.
- [x] Env `CDN_GCS_BUCKET` (default empty -> `503`), in `.env.example` and the staging config. Caps and limits are constants.
- [x] `deploy/gcp-setup.md`: create `automate-linkedin-511215-cdn` (same region, uniform access, no versioning), `allUsers`
      `roles/storage.legacyObjectReader`, brain's service account `roles/storage.objectCreator` plus `objectViewer` on it.
      Operator applies it; without it staging answers `storage.objects.create denied`, and without the public grant the redirect
      lands on a Google `403`. No lifecycle rule (answer 7).
- [x] `MEMORY.md`.

## Edge cases and risks

Input:

- No `url`, empty, `url=a&url=b` (Express gives an array), over 2048 chars, not a URL, `http:`, `data:`, `file:`, `ftp:`,
  `javascript:` -> `400`.
- Double-encoded value (`https%3A%2F%2F...` after one decode) -> not a URL -> `400`; the caller must encode exactly once.
- `https://user:pass@host/`, non-default port, IP literal, IPv6 literal, `localhost`, single-label names -> `400`; a public
  name that resolves to a private address (`*.svc.cluster.local`, `metadata.google.internal`, `127.0.0.1.nip.io`) -> `403`.
- Host case and trailing dot (`MEDIA.LICDN.COM.`) normalised before the hash.
- Fragment (`#x`) dropped before hashing; query kept as is (order not sorted, it may matter).
- Path has no extension (most LinkedIn photo URLs) -> extension from the response type; the key is chosen after the first fetch,
  so `bucketUrl` is null while first `pending`.
- Extension in the path disagrees with the response type -> the response type wins for the stored type and the key.

Remote:

- Redirect to `http:` or to a private address -> refused (`403`); more than 3 redirects -> `502`.
- DNS rebinding: resolve once, check, connect to that address.
- `Content-Length` missing or false -> the byte counter is what counts.
- Type `text/html` with 200 (a soft error page) is stored, as answer 3 says, and served only as a download.
- Slow trickle -> total timeout.
- Remote changes the file at the same URL -> the first copy is kept forever (it is a cache by URL). Accepted.

Concurrency and idempotency:

- Two requests for a new URL at once, same pod -> single flight; different pods -> the `hash` unique index and `claim`.
- A pod dies mid fetch -> row stays `PENDING`; the next call after 5 minutes takes it over.
- Object written, row update fails -> the next call fetches again; a new day gives a new key and leaves an orphan object.
  Accepted (rare).
- MD5 collision (not a real risk for cache keys, but cheap to guard): on a hit, compare `path`; a mismatch is treated as a miss
  with a warning and not overwritten.

Public objects and caching:

- A cached `302` (30 days) is not seen by brain, so a row marked `deleted` keeps redirecting in browsers that cached it; they
  land on the object, or on a 404 if it was removed, until the cache ends. Refetching reuses the key (answer 5).
- Anyone with the address reads the file, with no expiry. The key needs the remote URL and the save day to guess; listing is not
  granted.
- Erasure: a deleted object can stay in browser and Google edge caches for up to a year (`immutable`, chosen). Accepted.
- Served from `storage.googleapis.com`, not our origin, so an odd file cannot read our cookies; risky types are downloads anyway.
- Bucket missing (local dev) -> `503`. Reading the public address locally needs the same public grant on the dev bucket.
- The cdn bucket has no versioning, so a deleted object is gone from storage at once (caches aside).

Security and abuse:

- Open public endpoint with any host (answer 2): an open fetch-and-store service whose results are publicly served from our
  bucket (free hosting for anyone). The SSRF guard, the size caps and the miss rate limit (60 a minute per IP) are what keep it
  from reaching the cluster or the metadata server and from filling the bucket; storage only grows (answer 7), so watch the size.
  Unauthenticated on purpose (`<img src>` sends no bearer token).
- Behind the ingress the client IP comes from `X-Forwarded-For`; set Express `trust proxy` to the ingress hop only, or the rate
  limit is per ingress pod (or spoofable).
- Compliance: this stores copies of other members' public pictures. An erasure request marks rows `deleted` and deletes the
  objects; with answer 5 a later call for the same URL fetches it again, so erasure of a URL that is still public is not final.

Deploy:

- Additive migration only; runs with the existing `migrate` job. Rollback: remove the route and the public grant; the table and
  objects are harmless.
- No new runtime dependency (`fetch`, `crypto`, `dns`, `@google-cloud/storage` are already there).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- `pnpm test:integration:run` for `CdnFileService` (claim race, take-over, collision guard).
- Local: brain with a bucket, `curl -I "http://localhost:3001/cdn?url=$(node -p 'encodeURIComponent(process.argv[1])' https://media.licdn.com/...)"`
  twice: first a fetch and `302`, second a `302` with no fetch (log); the `Location` opens without credentials and answers
  `Cache-Control: public, max-age=31536000, immutable`. Negative curls for `400` (http, IP literal, missing), `403`
  (`https://metadata.google.internal/`, a name resolving to 127.0.0.1), `413`.
- Staging after the operator grant: the same curl against `api.staging.elitale.com`.

## Outcome

Shipped 2026-10-30:

- `CdnFile` model and additive migration `20261030120000_add_cdn_file`; `CdnFileService` (`find`, `claim`, `saved`, `release`).
- `core/cdnUrl.ts` (parse, hash, type, key, public address), `core/cdnFetch.ts` (`openRemote`: own DNS lookup that refuses
  private addresses at connect time, manual redirects re-checked, headers timeout 15 s), `core/cdnFiles.ts` (streams into
  `CDN_GCS_BUCKET` with a byte cap and the object `Cache-Control`).
- `middlewares/cdn.ts` (`GET /cdn`), registered before tRPC; `trust proxy` set to 1 in `Middlewares.config`.
- Env `CDN_GCS_BUCKET` (brain, compose, staging example). The GCP bucket and grants are applied (see `deploy/gcp-setup.md`).

Deviations:

- `id` is a plain `String` (text) like every other model, not `@db.Uuid`; `hash` is `String` with a unique index.
- Fetching uses `node:https` with a custom `lookup` instead of `fetch` (no new dependency, and the checked address is the one used).
- An MD5 match with a different `path` answers `409` (never served, never overwritten).
- Redirects to `http:` or an address that may not be fetched answer `403` (`REFUSED`).

Verified: lint, ts:check, all unit tests, build; the integration test against local PostgreSQL; a local brain on port 3011:
`400` for http, IP literal and missing `url`, `403` for `127.0.0.1.nip.io`, `404` for a missing remote file, `302` with
`Cache-Control: public, max-age=2592000` and the public `Location` for a saved row, and a failed upload leaves no row.

Not verified: a real upload into the bucket (local Application Default Credentials had expired: `invalid_rapt`), so the first
staging call is the first real write; `metadata.google.internal` (does not resolve locally; on GKE it resolves to
169.254.169.254 and is refused).

Follow-ups: the staging `STAGING_CONFIG_ENV` secret must carry `CDN_GCS_BUCKET`; apply the migration on staging with the usual
`migrate` job; use `/cdn` for `imageUrl`s in the body app (separate plan).
