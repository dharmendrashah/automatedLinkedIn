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
gh variable set GKE_LOCATION --body "us-central1-a"
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
