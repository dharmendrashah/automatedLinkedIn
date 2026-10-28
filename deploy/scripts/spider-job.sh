#!/usr/bin/env bash
# Deploys the spider worker's Cloud Run job for one image tag (infra/cloud-run), after the Kubernetes apply, and fails
# unless the job is ready on that tag (.plan/spider-worker-cloud-run.md, step 9).
#
#   spider-job.sh TAG
#
# The secret values are written here from the staging secrets file, and never reach the Pulumi state or a command line.
# Needs gcloud and the Pulumi CLI on PATH, Google credentials, and the infra build (npm ci && npm run build in infra/cloud-run).
# In the environment: GCP_PROJECT_ID, GCP_REGION, SECRETS_FILE, PULUMI_CONFIG_PASSPHRASE (or its file).
set -euo pipefail

TAG="${1:?usage: spider-job.sh TAG}"
: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_REGION:?GCP_REGION is required}"
: "${SECRETS_FILE:?SECRETS_FILE is required}"

STACK=staging
PROJECT_NAME=automatedlinkedin-cloud-run
JOB=spider-worker
URN_PREFIX="urn:pulumi:$STACK::$PROJECT_NAME::"
here="$(cd "$(dirname "$0")" && pwd)"
# Made absolute before the script changes directory.
SECRETS_FILE="$(cd "$(dirname "$SECRETS_FILE")" && pwd)/$(basename "$SECRETS_FILE")"
cd "$here/../../infra/cloud-run"

# Reads one value from the secrets file. The file has no quotes (kustomize would keep them), so the value is the rest of the line.
value_of() {
  grep "^$1=" "$SECRETS_FILE" | head -n 1 | cut -d= -f2-
}

user="$(value_of RABBITMQ_DEFAULT_USER)"
pass="$(value_of RABBITMQ_DEFAULT_PASS)"
key="$(value_of LINKEDIN_CRED_ENC_KEY)"
if [ -z "$user" ] || [ -z "$pass" ] || [ -z "$key" ]; then
  echo "the secrets file lacks a value the worker needs" >&2
  exit 1
fi

pulumi login "gs://$GCP_PROJECT_ID-pulumi-state"
pulumi stack select "$STACK"
pulumi config set imageTag "$TAG"

# The containers and the address come first, so the values exist before the job refers to them.
pulumi up --yes \
  --target "${URN_PREFIX}gcp:secretmanager/secret:Secret::spider-worker-rabbitmq-url" \
  --target "${URN_PREFIX}gcp:secretmanager/secret:Secret::spider-worker-linkedin-cred-enc-key" \
  --target "${URN_PREFIX}gcp:compute/address:Address::rabbitmq-internal"

address="$(pulumi stack output rabbitmqInternalAddress --stack "$STACK")"

printf '%s' "amqp://$user:$pass@$address:5672/automatedlinkedin" \
  | gcloud secrets versions add spider-worker-rabbitmq-url --project "$GCP_PROJECT_ID" --data-file=- > /dev/null
printf '%s' "$key" \
  | gcloud secrets versions add spider-worker-linkedin-cred-enc-key --project "$GCP_PROJECT_ID" --data-file=- > /dev/null

pulumi up --yes

# The job reports Ready a moment after the update, so the check is repeated for a few minutes.
JOB_CHECK_TRIES="${JOB_CHECK_TRIES:-30}"
JOB_CHECK_WAIT="${JOB_CHECK_WAIT:-10}"

# Reads one value from the JSON the job describes as: the Ready condition's status, or the image of the job's container.
json_value() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"
}
READY='next((c["status"] for c in d.get("status", {}).get("conditions", []) if c.get("type") == "Ready"), "")'
IMAGE='d["spec"]["template"]["spec"]["template"]["spec"]["containers"][0]["image"]'

ready=""
for _ in $(seq 1 "$JOB_CHECK_TRIES"); do
  job="$(gcloud run jobs describe "$JOB" --region "$GCP_REGION" --project "$GCP_PROJECT_ID" --format=json)"
  ready="$(printf '%s' "$job" | json_value "$READY")"
  if [ "$ready" = True ]; then
    break
  fi
  sleep "$JOB_CHECK_WAIT"
done

if [ "$ready" != True ]; then
  echo "the spider job is not ready (Ready=$ready)" >&2
  exit 1
fi
image="$(printf '%s' "$job" | json_value "$IMAGE")"
if [ "${image##*:}" != "$TAG" ]; then
  echo "the spider job runs ${image##*:}, not $TAG" >&2
  exit 1
fi
echo "the spider job is ready on $TAG"
