# Kubernetes deployment

Kustomize manifests for the stack. The base is platform agnostic; anything cloud specific
lives in an overlay. Plan and decisions: [`.plan/kubernetes-deploy.md`](../.plan/kubernetes-deploy.md).

```
deploy/
  base/                 platform-agnostic manifests
  overlays/local/       minikube: plain HTTP, local images, compose database
  overlays/staging/     staging: hosts, image tags, Spot tolerations, TLS
  cluster/              cluster-scoped prerequisites (cert-manager issuers)
  local.md              run the whole stack on minikube
  gcp-setup.md          one-time keyless GCP auth setup for CI
```

Start with [`local.md`](local.md): it uses the same manifests as staging, so most mistakes
surface on your laptop instead of in the cloud.

## What runs

| Workload | Image | Notes |
| --- | --- | --- |
| `brain` | `-brain` | API. Init container `-brain-migrate` runs `db:migrate:deploy` first. |
| `body` | `-body` | SPA on nginx. Environment specific: `VITE_*` is baked at build time. |
| `authentik-server` | `ghcr.io/goauthentik/server:2026.8.3` | Identity provider. |
| `authentik-worker` | same | Applies the blueprint from `infra/authentik/blueprints/`. |

**PostgreSQL is not deployed.** It is an existing external server on another cloud.

## Prerequisites

1. A cluster with **ingress-nginx** and **cert-manager** installed.
2. The external PostgreSQL server must already have the app database plus the `authentik`
   database and role, with `public` owned by `authentik`.
3. Its firewall must allow the cluster's egress IP. On a Spot node the IP changes when the
   node is replaced, so pin it with Cloud NAT or a static external IP.
4. DNS `A` records for `app.`, `api.` and `auth.` pointing at the ingress IP **before** the
   first apply, or cert-manager's HTTP-01 challenge never completes.
5. Apply the issuers once per cluster:
   ```sh
   kubectl apply -f deploy/cluster/cluster-issuer.yaml
   ```

## Deploy staging

```sh
cd deploy/overlays/staging

cp config.example.env config.env      # git-ignored
cp secrets.example.env secrets.env    # git-ignored
$EDITOR config.env secrets.env        # replace every CHANGE_ME
$EDITOR kustomization.yaml            # replace OWNER with the GitHub owner/repo

cd -
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging | kubectl apply -f -
```

Both `config.env` and `secrets.env` are git-ignored. `deploy/base/config.env` holds the shared
non-secret defaults and **is** committed; only the per-overlay files are kept out of git.

`--load-restrictor LoadRestrictionsNone` is required because the base reads the authentik
blueprint from `infra/authentik/blueprints/`, outside the kustomize root. That keeps one
source of truth shared with `docker-compose.yml` instead of a committed copy.

Verify:

```sh
kubectl -n automatedlinkedin get pods
kubectl -n automatedlinkedin get certificate
kubectl -n automatedlinkedin logs deploy/brain -c migrate
```

## Secrets

`config.env` and `secrets.env` are git-ignored and never committed. `secrets.env` holds
`DATABASE_URL`, `AUTHENTIK_POSTGRESQL__PASSWORD` and `AUTHENTIK_SECRET_KEY`. Never reuse the
public development defaults from `docker-compose.yml`; generate the authentik key with:

```sh
openssl rand -base64 60 | tr -d '\n'
```

> **Known risk.** The database connection uses no TLS (an accepted decision), so credentials
> and row data cross the public internet in cleartext. Mitigate with a strict firewall
> allowlist. The fix is adding `sslmode=require` to `DATABASE_URL`.

## Deploying from GitHub Actions

The `deploy` job in `.github/workflows/staging.yml` runs after the images publish. Because the
overlay's environment files are git-ignored, CI writes them back from GitHub secrets that hold
the **whole file**:

| Secret | Contents |
| --- | --- |
| `STAGING_CONFIG_ENV` | all of `deploy/overlays/staging/config.env` |
| `STAGING_SECRETS_ENV` | all of `deploy/overlays/staging/secrets.env` |

| Variable | Example |
| --- | --- |
| `GCP_PROJECT_ID` | `automate-linkedin-511215` |
| `GKE_CLUSTER` | `staging` |
| `GKE_LOCATION` | `us-central1-a` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `github-actions-staging@<project>.iam.gserviceaccount.com` |

GCP authentication is **keyless** (Workload Identity Federation): the job mints a short-lived
OIDC token instead of storing a service account key, so there is nothing to rotate and access is
pinned to this repository. Setup is in [`deploy/gcp-setup.md`](gcp-setup.md).

Upload them with the GitHub CLI so the files are copied verbatim:

```sh
gh secret set STAGING_CONFIG_ENV  < deploy/overlays/staging/config.env
gh secret set STAGING_SECRETS_ENV < deploy/overlays/staging/secrets.env
```

The job pins the **immutable `sha-<commit>` tag** rather than the mutable `staging` tag, so each
deploy actually changes the Deployment and a rollback points at a known build.

`config.env` is not secret in itself, but it is stored as a secret so one upload keeps the whole
environment definition together. Re-run `gh secret set` whenever you change a host.

## Images

`.github/workflows/staging.yml` builds and pushes all three images on every push to `main`
and on manual dispatch, tagged `staging` and `sha-<commit>`. Set the repository variables
`STAGING_API_URL` and `STAGING_AUTH_URL` first — the SPA bakes them in, so a wrong value
means a rebuild, not a config change.

Roll out a new build:

```sh
kubectl -n automatedlinkedin rollout restart deploy/brain deploy/body
kubectl -n automatedlinkedin rollout undo deploy/brain   # rollback
```

Migrations are additive, so a rollback of the app does not need a database rollback.

## Adding an environment

Copy `overlays/staging`, then change `config.env` hosts, the `images` tags, the ingress
hosts and the cert-manager issuer. Keep cloud-specific settings (Spot tolerations, storage
classes, issuers) in the overlay — never in `base/`. Add the new overlay's `config.env` and
`secrets.env` as GitHub secrets, and give it its own deploy job.
