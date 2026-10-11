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
