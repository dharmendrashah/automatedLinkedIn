# Deploy the spider API and worker to staging (Kubernetes manifests only, not applied)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 ("work on the kubernetes code ... we do not need to deploy it but work on it")

## Goal

Write the Kustomize manifests and CI wiring to run `apps/spider` (API + Camoufox worker) on the staging GKE
cluster, matching the conventions in `.plan/kubernetes-deploy.md`. This task is authoring only: nothing is
applied to the cluster, the staging node pool is not resized, and the two `MEMORY.md` open items this closes
stay open until someone actually runs it.

## Requirements

Confirmed (by the user's instruction, and by re-reading the locked decisions in `.plan/spider-scraper-app.md`
and `.plan/camoufox-browser.md`):

- Write the manifests and CI publish/deploy wiring; do not `kubectl apply`, do not resize the node pool, do not
  run any `gcloud` command.
- Base manifests stay platform agnostic; cloud-specific values (bucket name, image names) live in the staging
  overlay, matching every existing workload.
- `spider-api` is internal only (Q5 of `spider-scraper-app.md`): a `ClusterIP` `Service`, no `Ingress`, no new
  subdomain.
- `LINKEDIN_CRED_ENC_KEY` is the exact value brain already has in `app-secrets` (it must equal brain's key for
  spider to decrypt the sealed credentials brain sends); no new secret key.
- GCS access uses GKE Workload Identity (a `ServiceAccount` bound to a GCP service account with only
  `storage.objectAdmin` on the spider bucket, not a mounted key file), consistent with the project's existing
  keyless-auth stance for GitHub Actions.
- `replicas: 1` for both, like every other staging workload (one Spot node).

Open, left as placeholders for whoever applies this (documented inline, not blocking since nothing is applied):

- The GCP service account email for Workload Identity, and whether Workload Identity is already enabled on the
  `staging` cluster (it is a cluster-level feature, separate from the GitHub Actions WIF pool already set up).
- Real resource sizing: this plan proposes `spider-api` like `brain` (small) and `spider-worker` sized for one
  headless Firefox (`cpu: 500m` request / `1` limit, `memory: 1Gi` request / `2Gi` limit, `/dev/shm` 1Gi,
  matching compose's `shm_size: 1gb`), to be adjusted after watching real usage.

## Scope and non-goals

- In scope: `deploy/components/spider` (a Kustomize Component: `spider-api.deployment.yaml` + `.service.yaml`,
  `spider-worker.deployment.yaml` + `.serviceaccount.yaml`, `spider.config.env`, `kustomization.yaml`), the
  staging overlay's inert prep (image names, image-pull-secret patch target, `config.env` additions) and the
  comment explaining how to turn it on, `.github/workflows/staging.yml` build matrix, a `deploy/gcp-setup.md`
  section for the GCS Workload Identity binding (commands documented, not run), `deploy/README.md`, this plan,
  `MEMORY.md`.
- Out of scope: applying anything to a cluster, resizing or re-provisioning the node pool, actually including
  the component in any overlay, `ci.yml`'s main publish job or `release.yml` (staging only, per the request),
  rollout checks in the deploy job (nothing to roll out yet), a public endpoint for `spider-api`, consuming
  `scraping.results`, autoscaling, the brain-side changes that would actually call `spider-api` (separate plan).

## Approach

- [x] Read `deploy/base`, the staging overlay, `.plan/kubernetes-deploy.md`, `staging.yml` and `gcp-setup.md` for
      the conventions to follow.
- [x] `spider-api.deployment.yaml` + `spider-api.service.yaml` (small, like `brain` without the migration init
      container or database; an explicit `PORT=3002` override since it shares the `app-config` ConfigMap with
      brain, whose `PORT` is `3001`).
- [x] `spider-worker.deployment.yaml` + `spider-worker.serviceaccount.yaml`: no `Service`, no HTTP probes (it has
      no HTTP server; a crash exits the process and the container restarts, same as today), `/dev/shm`
      `emptyDir`, a dedicated `ServiceAccount` for Workload Identity, no `readOnlyRootFilesystem` (Camoufox and
      Firefox write a GeoIP database and a profile at run time).
- [x] **Design change from the original plan:** put these four manifests in a new Kustomize
      **Component** (`deploy/components/spider`), not in `deploy/base`. Compose only starts spider with
      `--profile spider`; a `Component` is the Kustomize equivalent: opt-in per overlay, so the local
      (minikube) overlay keeps working with no GCS bucket and no spider images built into it, and nothing
      changes for `local.md`. Confirmed with `kubectl kustomize deploy/overlays/local` showing zero spider
      objects after the change.
- [x] Staging overlay: image names for `automatedlinkedin-spider`/`-spider-worker`, the image-pull-secret patch
      target extended to `spider-api`/`spider-worker`, `config.env` and `config.example.env` additions
      (`SPIDER_GCS_BUCKET`, `SPIDER_ALLOWED_HOSTS`, `SPIDER_ROBOTS_EXEMPT_HOSTS`), reusing `LINKEDIN_CRED_ENC_KEY`
      from the existing secret. **The component itself is not added to `components:` yet** — see the comment at
      the top of `deploy/overlays/staging/kustomization.yaml`. The image names and the patch-target regex are
      harmless to leave declared even while unused (confirmed: an `images:` entry naming an image that is not
      present in the build is a no-op, and a `patches:` target regex that still matches at least one existing
      Deployment is not an error).
- [x] `.github/workflows/staging.yml`: two more `publish` matrix entries (`spider` image, `api` and `worker`
      Dockerfile targets), so the images exist in GHCR ahead of time. **No rollout-status checks added to the
      `deploy` job**: there is nothing to roll out until the component is included.
- [x] `deploy/gcp-setup.md`: a new section with the exact `gcloud` commands for the GKE Workload Identity
      binding (enabling it on the cluster, the service account, the bucket IAM binding scoped to
      `storage.objectAdmin` on the one bucket, the `iam.workloadIdentityUser` binding), explicitly not run here.
- [x] `deploy/README.md` (tree and workload table), `MEMORY.md`, mark this plan `done`.
- [x] Verify with `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` (render
      only, no apply), and with the component temporarily added to confirm it renders correctly on its own.

## Edge cases and risks

- **Resource budget.** Adding `spider-worker`'s proposed requests (500m CPU / 1Gi memory) to the existing
  ~410m CPU / ~2.05Gi on one `e2-standard-2` (allocatable roughly 0.7 CPU / 2.3Gi reported in `MEMORY.md`) does
  not fit. This is exactly the blocked-on-node-resize item already in `MEMORY.md`; the manifests are written so
  they are ready once that happens, not to be applied before it.

  **Addendum 2026-10-12, checked against the real cluster:** `kubectl describe node` on `staging-asia`'s one
  `e2-standard-2` Spot node shows 1930m CPU / ~6.03Gi allocatable, with 1238m CPU / ~3.56Gi already requested
  by brain/body/rabbitmq/authentik, leaving **~692m CPU / ~2.47Gi free**. With a single `spider-worker` replica
  (the default `replicas: 1`, confirmed with the user — not 2), `spider-api` (100m/128Mi) + `spider-worker`
  (500m/1Gi) need 600m CPU / ~1.13Gi, which **fits without a node resize**, leaving ~92m CPU / ~1.34Gi free.
  That CPU margin is thin (under 5% of the node's allocatable), so watch for throttling or a Spot eviction
  racing with another workload's restart; resizing to a bigger machine type is still the safer long-term move
  if a second worker or heavier scrape load is ever added, but is not required to turn this component on now.
- **Workload Identity may not be enabled on the cluster yet.** It is a one-time `gcloud container clusters
  update --workload-identity-pool=...` plus enabling it on the node pool; undocumented here beyond the
  `gcp-setup.md` note, and must happen before the `ServiceAccount` annotation does anything.
- **Image pull.** Both new images are private GHCR images like brain and body, so they need the `ghcr`
  image-pull secret; forgetting the patch target produces `ImagePullBackOff`.
- **Shared secret key.** If `LINKEDIN_CRED_ENC_KEY` ever differs between brain and spider-worker (for example a
  rotation applied to only one), every validation fails with a decrypt error; both must change together.
- **No public endpoint.** `spider-api`'s `Service` is `ClusterIP` only; nothing outside the cluster calls it
  yet, and brain does not call it yet either (a separate, not-yet-planned change) — this task only makes the
  workload deployable, not reachable from brain.
- **Firefox needs `/dev/shm`.** Without the `emptyDir` mount, Camoufox/Firefox can crash under load the same
  way Chromium does; sized to match the compose `shm_size`.
- **Rollback.** Deleting the four new base files and their `kustomization.yaml`/overlay references removes the
  workload cleanly; nothing else depends on it.

## Verification

- `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` renders without error
  (confirmed), has zero spider objects (confirmed: the component is not included), and has no `example.invalid`
  or `CHANGE_ME` placeholders in the real (git-ignored) `config.env` (confirmed, same grep the deploy job runs).
- With the component temporarily added to `components:`, the same render produced `spider-api` (Deployment +
  Service), `spider-worker` (Deployment + ServiceAccount), both with `imagePullSecrets: [ghcr]`, the Spot
  toleration, the `app.kubernetes.io/part-of` label, the merged `app-config` (one hash for every workload, so
  `SPIDER_MIN_DELAY_MS` etc. reach it), `spider-api`'s `PORT` correctly overridden to `3002`, and
  `spider-worker`'s `/dev/shm` `emptyDir` and `serviceAccountName: spider-worker` (confirmed, then reverted).
- `kubectl kustomize deploy/overlays/local` still renders with zero spider objects (confirmed, minikube
  unaffected).
- No `kubectl apply`, no `gcloud` command, no node pool change.

## Outcome

Wrote `deploy/components/spider` (a Kustomize Component, opt-in like compose's `spider` profile):
`spider-api.deployment.yaml` + `.service.yaml` (internal `ClusterIP`, `PORT=3002` override, `/health` probes,
read-only root filesystem), `spider-worker.deployment.yaml` + `.serviceaccount.yaml` (no `Service`, no probes,
`/dev/shm` 1Gi, a `ServiceAccount` for GKE Workload Identity, no read-only root filesystem), and
`spider.config.env` (the non-secret settings that do not vary by environment). The staging overlay has the
image names, the image-pull-secret patch extended, and `config.env`/`config.example.env` additions
(`SPIDER_GCS_BUCKET`, `SPIDER_ALLOWED_HOSTS`, `SPIDER_ROBOTS_EXEMPT_HOSTS`, reusing the existing
`LINKEDIN_CRED_ENC_KEY`), but **does not include the component** — a comment at the top of its
`kustomization.yaml` says exactly what three things unlock it (node resize, the Workload Identity binding, and
adding `components: [../../components/spider]`). `.github/workflows/staging.yml` now also builds and pushes
`-spider` and `-spider-worker` images on every run, ahead of the overlay using them. `deploy/gcp-setup.md` has
the exact (not run) `gcloud` commands for the GCS Workload Identity binding.

Deviation from the original plan: the first draft put the four manifests directly in `deploy/base` and wired
them into every overlay unconditionally. That would have broken `deploy/overlays/local` (minikube has no GCS
bucket and the spider images are never built there) and, more importantly, would have made the *next* run of
`.github/workflows/staging.yml` (which triggers automatically on every push to `main`) try to actually schedule
`spider-worker` on a node that cannot fit it — exactly what "we do not need to deploy it" was meant to prevent.
Restructuring as an opt-in Component, and leaving the staging overlay's reference to it commented out (as
prose, not YAML) rather than active, closes that gap: merging this work changes nothing about what the staging
deploy job actually applies.

Verified: both overlays render (staging with the component absent, and local), confirmed with the component
temporarily present that it renders correctly and is removed afterward with `git status` clean. Not verified:
anything that needs a real cluster or `gcloud` (explicitly out of scope).

Follow-ups (also in `MEMORY.md`): scale the staging node pool; bind GKE Workload Identity (`gcp-setup.md`); add
`components: [../../components/spider]` to the staging overlay and rollout-status checks to `staging.yml`'s
`deploy` job; then the two node-pool/Workload-Identity open items in `MEMORY.md` can close.

## Addendum 2026-10-12: actually deployed

Per explicit user confirmation ("yes deploy it now"), all three follow-ups above were done for real against
the live `staging-asia` GKE cluster, and spider is now running in staging:

- Enabled `GKE_METADATA` workload-metadata mode on the node pool (`gcloud container node-pools update
  default-pool --workload-metadata=GKE_METADATA`). This is a one-time, disruptive change: it recreates the
  node, so every pod on it restarts. Cluster-level Workload Identity (`--workload-pool`) was already on.
- Created the `spider-worker-gcs` GSA, bound it to `roles/storage.objectAdmin` on the spider bucket only, and
  bound `roles/iam.workloadIdentityUser` for `automate-linkedin-511215.svc.id.goog[automatedlinkedin/spider-worker]`.
  Annotated `deploy/components/spider/spider-worker.serviceaccount.yaml` with the GSA email.
- Added `components: [../../components/spider]` to `deploy/overlays/staging/kustomization.yaml` and
  `spider-api`/`spider-worker` rollout-status checks to `staging.yml`'s `deploy` job.
- Rendered and server-side dry-ran the full overlay against the live cluster, then applied it for real.
- Triggered `staging.yml` via `workflow_dispatch` on this branch (its `push: [main]` trigger does not cover
  feature branches) to build and push the `spider`/`spider-worker` images; all five images built, the `deploy`
  job applied cleanly, and `spider-api`/`spider-worker` are now `Running 1/1` with a confirmed GCS
  read/write/delete round trip through Workload Identity (no mounted key).

Two real incidents surfaced by the node recreation, both pre-existing and unrelated to spider, fixed in the
same change:

- **rabbitmq crash loop.** The default `fsGroupChangePolicy` re-chowns the volume on every mount; that widened
  `.erlang.cookie` to group-readable, which RabbitMQ refuses to start with ("must be accessible by owner
  only"). Fixed with `fsGroupChangePolicy: OnRootMismatch` on the StatefulSet (`deploy/base/rabbitmq.statefulset.yaml`),
  which skips the recursive chown once the volume's root group already matches, so a restart no longer
  re-widens it.
- **dns-updater broken by GKE_METADATA mode.** The per-node metadata proxy that mode turns on no longer serves
  `instance/network-interfaces/.../external-ip`, so the old GCE-metadata-based lookup 404'd on every run.
  Rewritten to read the node's `ExternalIP` from the Kubernetes API instead (`NODE_NAME` via the downward API,
  a dedicated `dns-updater` ServiceAccount with a `ClusterRole` scoped to `get` on `nodes` only) —
  `deploy/overlays/staging/dns/`.

Also found at deploy time: the original 500m CPU request for `spider-worker` no longer fit once
`GKE_METADATA` mode's own `gke-metadata-server` daemonset (~100m CPU) was counted, which the original estimate
did not include. Lowered to 400m request (limit unchanged at 1 CPU) in
`deploy/components/spider/spider-worker.deployment.yaml`; it schedules with the free capacity actually found on
the node.

Everything is committed and pushed to `feat/spider` (PR #17): `d8ee311` (component wiring + rabbitmq/dns-updater
fixes) and `e982ea6` (the CPU request fix, applied live first then committed). Not yet done: merging `feat/spider`
to `main` (CI's `staging.yml` only triggers on `main` push or manual dispatch; this deploy used manual dispatch).

