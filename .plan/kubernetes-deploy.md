# Kubernetes deployment manifests (`deploy/`)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-10
- Locked by user: yes, 2026-10-10

## Goal

Add the first Kubernetes manifests for the stack (`brain`, `body`, `authentik` server + worker,
`postgres`, migration job) so it can run on a cost-minimal single-node GKE staging cluster, while
the base stays platform agnostic and all cloud-specific detail lives in an overlay.

## Requirements

Confirmed:

- Deployment target is Kubernetes only; base manifests stay platform agnostic (MEMORY decision, 2026-10-10).
- Cloud-specific details live in overlays, not in the app or base manifests (same decision).
- Images are `ghcr.io/<owner>/automatedlinkedin-brain` and `-body`; staging tracks the `edge` tag.
- First environment is **staging**, optimised for lowest monthly cost (single zonal GKE node, Spot).
- authentik is pinned to `2026.8.3` and uses no Redis; it shares the one Postgres instance.
- Migrations are additive and run with `db:migrate:deploy` (the `migrate` Dockerfile stage).

Confirmed on 2026-10-10 by the user:

- **Postgres is external** — an existing managed PostgreSQL server on another cloud. Nothing Postgres
  runs in the cluster; `DATABASE_URL` points at it and the connection uses TLS.
- **`apps/body` keeps build-time `VITE_*`** and gets a **per-environment image build**.
- **Real domain + cert-manager** (Let's Encrypt) for TLS.
- **Secrets** are git-ignored `Secret` manifests, documented in `deploy/README.md`.
- **ingress-nginx with `hostNetwork: true`** — no Cloud Load Balancer.
- **Brain gets `/healthz` and `/readyz`** in this task, test-first.
- **Kustomize** (`deploy/base` + `deploy/overlays/staging`).

Open questions: none — all locked 2026-10-10.

- **Three subdomains** per environment: `app.` → body, `api.` → brain, `auth.` → authentik.
  The real domain is not chosen yet; the overlay ships `staging.elitale.com` placeholders.
- The external Postgres **already has** the staging app database and the `authentik` database and role.
- **No TLS on the database connection** — the user accepted the risk explicitly (see Edge cases).
- A **GitHub Actions workflow** builds and pushes the staging `body` image with staging `VITE_*` args.

## Scope and non-goals

- In scope: `deploy/base` + `deploy/overlays/staging`, manifests for the five workloads, config/secret
  wiring, probes, resource requests/limits sized for one 2 vCPU / 8 GB node, the migration `Job`,
  parameterised authentik redirect URIs, brain's health endpoints, and a short `deploy/README.md`.
- Out of scope: cluster provisioning (Terraform), monitoring/logging stack, database backups,
  horizontal autoscaling, a production overlay, anything that manages the external Postgres server.

## Approach

- [x] Decide the open questions with the user and record the answers here.
- [x] Add brain health endpoint (`/healthz` liveness, `/readyz` backed by `PrismaService.isHealthy()`), test-first.
- [x] Parameterise the authentik blueprint redirect URIs per environment.
- [x] `deploy/base`: Namespace, config/blueprint ConfigMap generators, brain Deployment (with migration
      init container) + Service, body Deployment + Service, authentik server Deployment + Service,
      authentik worker Deployment, `shm` `emptyDir`, Ingress, `kustomization.yaml`.
- [x] `deploy/overlays/staging`: image names and tags, host names, Spot tolerations, secret generator,
      staging Ingress + cert-manager annotations.
- [x] Add `.github/workflows/staging.yml` to build the three staging images.
- [x] Verify the overlay renders and the blueprint still applies (default and overridden `APP_URL`).
- [x] Mark the plan `done`, update `MEMORY.md`.

## Edge cases and risks

Re-read the plan against the code and list what can go wrong.

- **Build-time SPA config.** `apps/body/Dockerfile` takes `VITE_*` as `ARG`, so the published `edge`
  image is hard-wired to `localhost`. Staging needs its own build with staging URLs (Q4).
- **Blueprint redirect URIs are hard-coded** to `localhost:3000`/`:5173` (MEMORY gotcha). Sign-in fails
  on a deployed host until the blueprint is templated per environment.
- **External Postgres**: `infra/postgres/init/10-authentik-db.sh` never runs, so the `authentik`
  database, role and `public` schema ownership must exist on the external server before first boot.
- **No TLS on the database connection (accepted risk, 2026-10-10).** Postgres is on another cloud, so
  credentials and all row data cross the public internet in cleartext and can be read or tampered with.
  Mitigate by restricting the server's firewall to the cluster's egress IP. Revisit before production:
  adding `sslmode=require` to `DATABASE_URL` is the whole fix.
- **Cross-cloud database latency** adds to every request, and the external server's firewall must allow
  the GKE node's egress IP — pin it with a Cloud NAT or a static external IP, or the allowlist breaks
  whenever the Spot node is replaced.
- **Connection limits.** brain, the migration Job and authentik server + worker all open pools against
  one external server; set a `connection_limit` so a managed instance's cap is not exhausted.
- **Migration Job ordering.** Brain must not start before migrations finish — needs an init container or
  a Job + `startupProbe`. Re-applying a completed Job with the same name fails; needs a hashed/generated name.
- **Spot node eviction** restarts every pod; with no in-cluster state this is now only a brief outage.
- **Authentik needs `shm_size: 512mb`** (compose) → an `emptyDir` with `medium: Memory` in Kubernetes.
- **Secrets.** `AUTHENTIK_SECRET_KEY` and `AUTHENTIK_PG_PASS` have public dev defaults that must never
  reach a deployed environment; real values must come from a Secret and never be committed.
- **`hostNetwork` ingress** binds ports 80/443 on the node, so the firewall must allow them and only one
  ingress controller replica can run per node.
- **cert-manager HTTP-01** needs the DNS record pointing at the node IP before issuance, otherwise the
  certificate stays `Pending` and the whole stack looks broken.
- **Resource budget.** Five workloads plus the ingress controller must fit on one node, with headroom
  for the migration Job.
- **Memory limits on authentik worker** spike during blueprint application; too tight a limit = OOMKill loop.
- **Rollback**: `kubectl rollout undo` per Deployment; database migrations are additive so they stay forward-safe.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (for the app-side changes).
- `kubectl kustomize deploy/overlays/staging` renders without error.
- `kubeconform`/`kubectl apply --dry-run=server` passes.
- Applied to a local kind cluster: all pods `Ready`, migration Job `Complete`, SPA loads, sign-up and
  sign-in through authentik succeed, `me` returns the provisioned user.

## Cost

With Postgres external and no Cloud Load Balancer, the GKE staging bill is roughly:

| Item | Monthly |
|---|---|
| Zonal control plane (GKE free tier) | $0 |
| 1× `e2-standard-2` Spot node | ~$15 |
| 30 GB boot disk | ~$1.20 |
| Static external IP | ~$2.92 |
| Artifact Registry + egress (incl. cross-cloud DB traffic) | ~$2–5 |
| **Total** | **~$21–24** |

Scaling the node pool to zero outside working hours takes this to roughly **$10/mo**.

## Outcome

Shipped 2026-10-10.

- `apps/brain/src/middlewares/health.ts` — `GET /healthz` (liveness, no database) and `GET /readyz`
  (200 / 503 from `PrismaService.isHealthy()`), wired into `Middlewares.config`, 5 unit tests.
- `infra/authentik/blueprints/automatedlinkedin.yaml` — redirect URIs and `meta_launch_url` now come
  from `!Env [APP_URL]` via `!Format`, defaulting to `http://localhost:3000`. The vite entries stay.
- `deploy/base` + `deploy/overlays/staging` (Kustomize), `deploy/cluster/cluster-issuer.yaml`,
  `deploy/README.md`, `deploy/.gitignore`.
- `.github/workflows/staging.yml` — builds `-brain`, `-brain-migrate` and `-body` tagged `staging`.

Deviations from the plan:

- **Migrations run as an init container on the `brain` Deployment, not a separate `Job`.** It removes
  the ordering problem and the Job-name collision on re-apply, and `migrate deploy` is idempotent.
  `replicas` is pinned to 1 with `strategy: Recreate` so two migrations cannot race.
- `app-config` is a `configMapGenerator` (overlay merges `config.env`) rather than a plain ConfigMap
  plus a patch, so a config change rolls the pods via the name hash.
- No resource-reduction patch for staging: the base already totals ~410m CPU / ~2.05 Gi requests,
  which fits one `e2-standard-2` with headroom.

Verified:

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass (84 brain unit tests).
- `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` renders 11 objects
  with the correct image names, Spot tolerations, merged config and generated secret.
- `ak apply_blueprint` exits 0 and writes the unchanged `localhost:3000` URLs by default, and
  `https://app.staging.elitale.com/...` when `APP_URL` is set. Local state restored afterwards.

Not verified (no cluster available): a real apply, probe behaviour against the external database,
cert-manager issuance, and the `hostNetwork` ingress. Do a dry run on kind before the first GKE apply.

Follow-ups:

- Add `sslmode=require` to `DATABASE_URL` before this pattern is reused for production.
- `Middlewares.serveWeb` is still dead code (`web/dist` is not in the image).

Addendum 2026-10-10: the overlay's `config.env` is git-ignored too (not just `secrets.env`) and
both are materialised in CI from the GitHub secrets `STAGING_CONFIG_ENV` / `STAGING_SECRETS_ENV`
by a new `deploy` job in `staging.yml`, which authenticates to GKE and applies the overlay pinned
to the immutable `sha-<commit>` tag. The ignore rules are scoped to `overlays/*/` so the committed
`deploy/base/config.env` is not swallowed. Deploys are no longer manual.
