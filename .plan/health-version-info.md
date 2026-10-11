# Build info endpoint (`/health`) for brain and body

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-11
- Locked by user: partly. The user asked for a JSON `/health` on both apps that shows version, commit SHA and deploy time, and said the path may change. The choices marked "proposed" below are mine and need the user's OK before merge.

## Goal

After each staging deploy, anyone can run `curl https://api.staging.elitale.com/health` and
`curl https://app.staging.elitale.com/health` and see which commit is live and when it was built,
so a deploy can be confirmed without looking at GitHub or the cluster.

## Requirements

Confirmed:

- Both `brain` and `body` expose `/health`.
- Both return JSON.
- The response includes the commit SHA and the deploy time.

Proposed (need confirmation):

- P1 Path: `/health` on both apps. (Brain already has `/healthz` and `/readyz`, which stay unchanged.)
- P2 Fields: `status`, `service`, `commit`, `builtAt`, and on brain `startedAt`.
- P3 `builtAt` is the time the image was built. CI builds and deploys in the same run, so this is the deploy time.
  `startedAt` (brain only) is when this pod process started, which shows whether a rollout actually replaced the pod.
- P4 Version = commit SHA. The app's package version is not included, because it is not bumped per release.
- P5 `/health` never touches the database and always returns 200 when the process is up. Readiness stays on `/readyz`.
- P6 Local builds (compose, minikube) report `commit: "unknown"`.

## Scope and non-goals

- In scope: brain route and env, body nginx route and build file, both Dockerfiles, `staging.yml` build args, tests, docs.
- Out of scope: a version field in the UI, release tags, changing the probes, a database check on `/health`.

## Approach

- [ ] Brain: failing unit test for `GET /health` (JSON, fields, no database call, no-store header).
- [ ] Brain: `GIT_SHA` and `BUILD_TIME` in the env module (default `unknown`), and the route in `Health.config`.
- [ ] Brain Dockerfile: `ARG GIT_SHA` and `BUILD_TIME`, set as `ENV` in the final image.
- [ ] Body Dockerfile: write `health.json` in the build stage from the build args.
- [ ] Body nginx: exact-match `location = /health` serving that file as `application/json`, so the SPA fallback is unchanged.
- [ ] `staging.yml`: pass `GIT_SHA=${{ github.sha }}` and `BUILD_TIME` (UTC, computed in a step) to both images.
- [ ] Verify locally: build both images, run them, curl `/health`, confirm `/` still serves HTML.
- [ ] Verify on staging: run the workflow on this branch, then confirm both hosts report the branch commit.
- [ ] Update `MEMORY.md`, mark the plan done.

## Edge cases and risks

- **SPA fallback swallowing `/health`.** `try_files $uri /index.html` would return HTML with a 200. An exact `location =` avoids that.
- **Stale SHA in cache.** The SHA is in the image, not a runtime variable, so a cached layer cannot report another commit.
  The `ARG` must come before the file is written, and the build step must rerun when the SHA changes.
- **Shell injection through `printf`.** The SHA and timestamp are both written with `%s`, not interpolated into the command.
- **`startedAt` on a restarted pod.** A crash restart changes `startedAt` without a new deploy. Documented, not hidden.
- **Brain startup.** The module reads `GIT_SHA` at import and `STARTED_AT` is set once. Both are read-only.
- **Public endpoint.** Only the commit SHA and times are exposed. No secrets, hostnames or versions of dependencies.
- **Caching by proxies.** `Cache-Control: no-store` so a CDN or browser never shows an old commit.
- **Missing build args.** Release and manual builds (no args) report `unknown`, which is visible, not a silent wrong value.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass.
- Local: `curl` on both containers returns JSON with the values passed as build args.
- `curl` on the body `/` and on a deep link still returns HTML.
- Staging: `https://api.staging.elitale.com/health` and `https://app.staging.elitale.com/health` return the branch commit SHA.

## Outcome

Filled in when done.
