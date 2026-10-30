# Staging deploys only what changed

- Status: done
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30

## Goal

A push to `main` builds and deploys only the staging services whose code changed (body, brain, spider), so a body-only change deploys in about 4 minutes instead of about 9.

## Requirements

Confirmed:

- Build and deploy only the changed app among body, brain and spider; anything shared or unknown deploys everything.
- Lint, `ts:check`, unit tests and build still run for the whole monorepo (body reads brain's router types without a declared dependency).
- Integration tests run only for the app they test (brain, spider).
- Images that are not rebuilt keep the exact tag running on the cluster; nothing falls back to the floating `staging` tag.
- `workflow_dispatch` deploys everything.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `deploy/scripts/changed-apps.sh` (+ test), a `changes` job, conditional integration tests in `ci.yml`, a dynamic publish matrix, pinning live tags and skipping the spider job in `staging.yml`.
- Out of scope: publishing before the checks pass, affected-only lint and type checks, `release.yml` (always builds everything).

## Approach

- [x] `changed-apps.sh`: reads changed paths, prints `body`, `brain`, `spider` (true/false). `apps/<app>/` marks that app; docs (`*.md`, `.plan/`, `LICENSE`, example env files), `.github/` other than workflows and `docker-compose.yml` mark nothing; everything else (`packages/`, root configs, the lockfile, `deploy/`, `infra/`, workflows, unknown paths) marks all three.
- [x] `changes` job: diff of the push (`before`..`sha`); a new branch, a missing `before` (force push) or `workflow_dispatch` marks all. Outputs the flags and the publish matrix.
- [x] `ci.yml`: inputs `brain-integration` and `spider-integration` (default true, so pull requests run both).
- [x] `publish`: matrix from `changes`; skipped when nothing changed.
- [x] `deploy`: skipped when nothing changed; after waking staging, pins rebuilt images to this commit and the others to the tag live on the cluster (fails if none is found); waits only for changed workloads (all of them when everything changed); Pulumi and the spider job only when spider changed.

## Edge cases and risks

- A path the script does not know deploys everything (safe default); a new app needs a line in the script.
- Brain and `brain-migrate` always ship together (one flag), so migrations still run with the brain that needs them.
- A live tag cannot be read (first deploy, deployment deleted): the deploy stops with a message to run the workflow by hand, which deploys everything.
- Runs queue (`cancel-in-progress: false`), so each run reads the tags the previous one left.
- A config-only change (`STAGING_CONFIG_ENV` secret) still restarts what its config map feeds, as today.
- Rollback: per service, by running the workflow by hand on an older commit or setting the image tag.

## Verification

- `bash deploy/scripts/changed-apps.test.sh`; `actionlint` if available; the first pushes to `main` after merge (one body-only, one brain-only) show the skipped jobs.

## Outcome

Built as planned. Not run on GitHub yet: confirm on the first body-only push that only body is built and deployed.
