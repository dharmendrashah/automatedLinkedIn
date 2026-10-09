# Container build on release

- Status: done
- Created: 2026-10-10
- Locked by user: yes, 2026-10-10

## Goal

Build and publish the `brain` and `body` container images to `ghcr.io` whenever a GitHub release is published, tagged with the release version, so deployments (Kubernetes) can pin a released version instead of a commit.

## Requirements

Confirmed:

- Trigger: a GitHub release is published.
- Each app is built and pushed independently (matrix), as in the existing `publish` job.
- Images: `ghcr.io/<owner>/automatedlinkedin-brain` and `-body`, built from the existing `apps/<app>/Dockerfile` with the repo root as context.
- Stable releases push `X.Y.Z`, `X.Y`, `X`, and `latest`.
- Pre-releases push the exact version tag only, never `latest`.
- Pushes to `main` publish `edge` and `sha-<commit>`; `latest` is reserved for stable releases.
- Platform: `linux/amd64` only.
- Release images are gated on the CI checks by making `ci.yml` reusable and calling it from the release workflow.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: a new `.github/workflows/release.yml`; making `ci.yml` callable; adjusting the tags the `main` publish job produces if the `latest` proposal is accepted.
- Out of scope: creating releases or tags automatically, changelog generation, image signing, Kubernetes manifests, Helm charts.

## Approach

- [ ] Add `workflow_call` to `ci.yml` so the same checks can gate a release.
- [ ] Add `release.yml` on `release: [published]`: job `check` (calls `ci.yml`), job `publish` (matrix brain/body, needs `check`) using the same pinned Docker actions as `ci.yml`.
- [ ] Tags via `docker/metadata-action`: semver patterns for stable releases, exact tag for pre-releases, `latest` only for stable.
- [ ] Update `ci.yml` main publish tags (`edge` + `sha-`) if accepted.
- [ ] Update README (publishing), `MEMORY.md`, and `.github/copilot-instructions.md` (CI section).

## Edge cases and risks

- Release tag not valid semver (for example `release-1`): the semver patterns produce no tags. Fall back to the exact tag so the push never has an empty tag list.
- Draft releases do not fire `published`; editing a published release does not re-run. Re-running needs the workflow's re-run button or a new release.
- A pre-release must never move `latest`.
- Reusable `ci.yml` and permissions: a called workflow cannot be granted less than a job inside it requests, even when that job is skipped. The caller job must grant `contents: read` and `packages: write`, and the `publish` job in `ci.yml` must stay guarded to `push` on `main` so it is skipped when called from a release.
- `ci.yml` concurrency group is per `github.ref`; the tag ref is distinct from `main`, so they do not cancel each other. Release builds should not be cancelled mid-push.
- Re-publishing the same version tag would overwrite the image; treat version tags as immutable and publish a new patch release instead.
- Package visibility on GHCR is private by default; new image names inherit that. Clusters need a pull secret until the packages are made public.
- Free GitHub runners are amd64 only; adding arm64 means QEMU and much slower builds.
- Secrets: only the built-in `GITHUB_TOKEN` is used; no new secrets.
- Rollback: delete the release and the version tags of the packages in GHCR; nothing else changes.

## Verification

- `ruby -ryaml` parse of both workflows.
- Review of rendered tags with `docker/metadata-action` semantics for `v1.2.3`, `v1.2.3-rc.1`, and a non-semver tag.
- After push: create a pre-release on GitHub and confirm both images and tags appear in GHCR.

## Outcome

- Added `.github/workflows/release.yml` (trigger `release: published`; job `check` calls `ci.yml`; matrix `publish` for brain and body, amd64, semver tags plus exact tag, `latest` auto for stable releases only).
- `ci.yml` is now reusable (`workflow_call`) and the `main` publish job tags `edge` and `sha-<commit>` instead of `latest`.
- Validated with a YAML parse and `actionlint` (no findings). Not yet exercised on GitHub.
- Follow-up: publish a pre-release and a stable release to confirm the tags in GHCR, and make the packages public if anonymous pulls are wanted.
