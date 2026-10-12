# GCP setup for the staging deploy

One-time setup so GitHub Actions can deploy to GKE **without a service account key**.

This project's organisation enforces `constraints/iam.disableServiceAccountKeyCreation`, so
`gcloud iam service-accounts keys create` fails with `FAILED_PRECONDITION`. That is the right
default: keys never expire and work from anywhere. Workload Identity Federation (WIF) lets the
workflow exchange a short-lived GitHub OIDC token for GCP credentials instead.

## 0. Variables

```sh
export PROJECT_ID=automate-linkedin-511215
export REPO=dharmendrashah/automatedLinkedIn
export SA_NAME=github-actions-staging

gcloud config set project "$PROJECT_ID"

export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
```

## 1. Enable the APIs

```sh
gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  container.googleapis.com
```

## 2. Service account (no key)

Skip the create step if you already made it.

```sh
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions staging deploy"

# Manage workloads inside clusters, but not create/resize/delete clusters.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/container.developer"
```

## 3. Workload identity pool and provider

```sh
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
```

The `--attribute-condition` is the security boundary: without it **any** GitHub repository in the
world could impersonate this service account. Never omit it.

## 4. Let the repository impersonate the service account

```sh
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

The segment is `attribute.repository` — **singular**. The principal set format is
`.../workloadIdentityPools/{pool}/attribute.{name}/{value}`; writing `attributes.repository`
fails with `INVALID_ARGUMENT: Invalid principalSet member`.

## 5. Tell GitHub about it

```sh
gh variable set GCP_PROJECT_ID  --body "$PROJECT_ID"
gh variable set GCP_SERVICE_ACCOUNT --body "$SA_EMAIL"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"

gh variable set GKE_CLUSTER  --body "staging"
gh variable set GKE_LOCATION --body "asia-south1-b"
```

## 6. Verify

```sh
gcloud iam workload-identity-pools providers describe github \
  --location=global --workload-identity-pool=github \
  --format="value(attributeCondition)"
```

Then run the workflow manually (`gh workflow run "Staging images"`) and check the `auth` step
reports the impersonated service account.

## Troubleshooting

| Error | Cause |
| --- | --- |
| `Key creation is not allowed on this service account` | The org policy blocks keys. Use WIF, as above. |
| `Invalid principalSet member` | The member used `attributes.repository`; it must be `attribute.repository` (singular). |
| `Unable to acquire impersonated credentials` | Step 4 was skipped, or `$REPO` case does not match exactly. |
| `The workload identity pool provider ... does not exist` | `GCP_WORKLOAD_IDENTITY_PROVIDER` uses the project **number**, not the project ID. |
| `Permission 'container.clusters.get' denied` | The `roles/container.developer` binding in step 2 is missing. |
| `id-token: write` missing | The job cannot mint an OIDC token; already set in `staging.yml`. |

## If your org also blocks WIF

Ask an org admin to grant an exception for this project rather than disabling the constraint
org-wide:

```sh
gcloud resource-manager org-policies describe \
  constraints/iam.disableServiceAccountKeyCreation --effective --project="$PROJECT_ID"
```

## GKE Workload Identity for the spider worker (not done yet)

This is a different mechanism from the WIF setup above: that one lets **GitHub Actions**
impersonate a service account to run `kubectl`/`kustomize` against the cluster. This one lets a
**pod inside the cluster** (`spider-worker`) reach Google Cloud Storage with no mounted key file.
`deploy/components/spider` already ships the Kubernetes `ServiceAccount` (`spider-worker`); these
are the commands to bind it, not run as part of this change (see
`deploy/overlays/staging/kustomization.yaml` for why the component is not deployed yet).

```sh
export PROJECT_ID=automate-linkedin-511215
export BUCKET=automate-linkedin-511215-spider
export SA_NAME=spider-worker-gcs
export SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
export CLUSTER=staging-asia
export LOCATION=asia-south1-b

# One-time per cluster: turns on the feature that lets a KSA impersonate a GSA with no key.
gcloud container clusters update "$CLUSTER" --location="$LOCATION" \
  --workload-pool="$PROJECT_ID.svc.id.goog"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="spider-worker GCS access"

# Scoped to the one bucket (roles/storage.objectAdmin), not a project-wide role.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin"

# Lets the Kubernetes ServiceAccount automatedlinkedin/spider-worker impersonate it.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:$PROJECT_ID.svc.id.goog[automatedlinkedin/spider-worker]"
```

Then annotate the Kubernetes `ServiceAccount` with the GSA email — either patch it live
(`kubectl -n automatedlinkedin annotate serviceaccount spider-worker
iam.gke.io/gcp-service-account=$SA_EMAIL`) or add the annotation to
`deploy/components/spider/spider-worker.serviceaccount.yaml` directly, since it is the same value
in every environment that uses this project's GCP account.

| Error | Cause |
| --- | --- |
| `permission denied` reaching GCS from the pod | The cluster does not have Workload Identity enabled, the binding is missing, or the `ServiceAccount` has no `iam.gke.io/gcp-service-account` annotation. |
| `storage.googleapis.com/... 403` for a single object | The bucket binding covers the bucket but not objects created before it (rare; usually not an issue for `objectAdmin`). |

## Session recordings (not done yet)

The Sessions page (`/sessions`, `.plan/spider-session-recording.md`) plays each run's video, steps, requests and logs
straight from the bucket. The worker writes them under `runs/<task>/<user>/<yyyy>/<mm>/<dd>/<task_id>/` (older sessions used `recordings/`; it already has `objectAdmin`, so it needs
nothing new). The bucket stays private: **brain** hands the browser a signed link that works for ten minutes. These
are the commands for that, not run as part of this change.

```sh
export PROJECT_ID=automate-linkedin-511215
export BUCKET=automate-linkedin-511215-spider
export SIGNER_NAME=brain-recording-links
export SIGNER_EMAIL="$SIGNER_NAME@$PROJECT_ID.iam.gserviceaccount.com"
export APP_ORIGIN=https://app.staging.elitale.com

gcloud services enable iamcredentials.googleapis.com

gcloud iam service-accounts create "$SIGNER_NAME" \
  --display-name="brain: links to session recordings"

# Read access to runs/ and recordings/ only, not to sessions/ (which holds login cookies) or results/.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SIGNER_EMAIL" \
  --role="roles/storage.objectViewer" \
  --condition="title=runs-and-recordings-only,expression=resource.name.startsWith('projects/_/buckets/$BUCKET/objects/runs/') || resource.name.startsWith('projects/_/buckets/$BUCKET/objects/recordings/')"

# A signed link is signed by this account through the IAM Credentials API, so it must be allowed to sign for itself.
gcloud iam service-accounts add-iam-policy-binding "$SIGNER_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="serviceAccount:$SIGNER_EMAIL"

# Lets the Kubernetes ServiceAccount automatedlinkedin/brain impersonate it (create that ServiceAccount, annotate it
# with iam.gke.io/gcp-service-account=$SIGNER_EMAIL, and set serviceAccountName: brain on the brain Deployment).
gcloud iam service-accounts add-iam-policy-binding "$SIGNER_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:$PROJECT_ID.svc.id.goog[automatedlinkedin/brain]"
```

The browser fetches the JSON files (`timeline.json`, `network.json`, `logs.json`, and `detection.json` of a browser test) with
`fetch`, so the bucket needs CORS
for the app's address. The video and screenshots load as plain `<video>` and `<img>` and need nothing:

```sh
cat > /tmp/cors.json <<EOF
[{"origin": ["$APP_ORIGIN"], "method": ["GET"], "responseHeader": ["Content-Type", "Range"], "maxAgeSeconds": 3600}]
EOF
gcloud storage buckets update "gs://$BUCKET" --cors-file=/tmp/cors.json
```

Recordings show what the browser showed, so they are deleted after seven days. This matches
`SESSION_RECORDING_RETENTION_DAYS` in brain, and it only touches `runs/` and the older `recordings/`:

```sh
cat > /tmp/lifecycle.json <<EOF
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 7, "matchesPrefix": ["runs/", "recordings/"]}}]}
EOF
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=/tmp/lifecycle.json
```

Check what is already on the bucket first (`gcloud storage buckets describe "gs://$BUCKET" --format='value(lifecycle_config,cors_config)'`):
`buckets update --lifecycle-file` replaces the whole lifecycle configuration, so merge any rule that exists.

**Local development.** Your own `gcloud auth application-default login` credentials cannot sign a link. Impersonate the
service account instead (it needs `roles/iam.serviceAccountTokenCreator` on it for your user), then start brain with
`SPIDER_GCS_BUCKET` set:

```sh
gcloud auth application-default login --impersonate-service-account="$SIGNER_EMAIL"
```

| Error | Cause |
| --- | --- |
| `Cannot sign data without client_email` | Brain is using user credentials. Use the service account (Workload Identity, or impersonation locally). |
| `Permission 'iam.serviceAccounts.signBlob' denied` | The service account is missing `roles/iam.serviceAccountTokenCreator` on itself. |
| The video plays but the steps, network and logs tabs say the file could not be loaded | The bucket has no CORS rule for the app's address. |
| The Video tab says the recording is not set up | `SPIDER_GCS_BUCKET` is empty in brain. |

## Browser tests (staging prerequisites, not applied)

A proxy's browser test (`.plan/spider-browser-test.md`) opens two public bot detection pages through the proxy and records
it. Two things only an operator can do before staging shows its results:

1. Everything in [Session recordings](#session-recordings-not-done-yet) above: the signing service account, the bucket
   CORS rule (it covers `detection.json`) and the seven day lifecycle rule. Without them the Sessions page cannot open
   the recording.
2. Allow the two hosts in the worker's `SPIDER_ALLOWED_HOSTS`: add `deviceandbrowserinfo.com` and `pixelscan.net` to the
   value in the `STAGING_CONFIG_ENV` secret (see `deploy/overlays/staging/config.example.env`), then let the next staging
   deploy roll the worker. Until then a browser test ends with "Could not tell" and the note "The address is not on the
   spider allowlist.".

The test runs headless on staging (`SPIDER_HEADLESS=true`), which some detectors treat differently from a real display. The
report does not record the display mode, so compare with a local run before drawing conclusions from one result.
