#!/usr/bin/env bash
# Deploys the spider worker's Cloud Run job for one image tag (infra/cloud-run), after the Kubernetes apply, and fails unless the
# job is ready on that tag (.plan/spider-worker-cloud-run.md, step 9).
#
#   spider-job.sh TAG
#
# Errors that go away on their own (an API hiccup, IAM that is still spreading) are tried again, up to three times. The secret
# values are written here from the staging secrets file, through a file only this user can read, so they reach neither the
# Pulumi state nor a command line. Needs gcloud and the Pulumi CLI on PATH, Google credentials, and the infra build (npm ci &&
# npm run build in infra/cloud-run). In the environment: GCP_PROJECT_ID, GCP_REGION, SECRETS_FILE, PULUMI_CONFIG_PASSPHRASE
# (or its file).
set -euo pipefail

STACK=staging
PROJECT_NAME=automatedlinkedin-cloud-run
JOB=spider-worker
URN_PREFIX="urn:pulumi:$STACK::$PROJECT_NAME::"
RETRY_WAIT="${RETRY_WAIT:-30}"
JOB_CHECK_TRIES="${JOB_CHECK_TRIES:-60}"
JOB_CHECK_WAIT="${JOB_CHECK_WAIT:-10}"

# Runs a command up to three times. Only for errors that can go away on their own: a second try of the same command is safe
# because Pulumi and gcloud's version adds are repeatable.
retry() {
  local attempt
  for attempt in 1 2 3; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -lt 3 ]; then
      echo "$1 failed (attempt $attempt of 3); trying again in $RETRY_WAIT s" >&2
      sleep "$RETRY_WAIT"
    fi
  done
  return 1
}

# Reads one value from the secrets file. The file has no quotes (kustomize would keep them), so the value is the rest of the line.
value_of() {
  grep "^$1=" "$SECRETS_FILE" | head -n 1 | cut -d= -f2-
}

# Writes one secret version. The value goes through a file that only this user can read, so a try that fails halfway can be run again.
write_secret() {
  local name="$1" value="$2" file status=0
  file="$(mktemp)"
  chmod 600 "$file"
  printf '%s' "$value" > "$file"
  retry gcloud secrets versions add "$name" --project "$GCP_PROJECT_ID" --data-file="$file" > /dev/null || status=$?
  rm -f "$file"
  return "$status"
}

# Reads the job as JSON. Its Ready condition and container image come from this one description.
describe_job() {
  gcloud run jobs describe "$JOB" --region "$GCP_REGION" --project "$GCP_PROJECT_ID" --format=json
}

# Reads one value from the JSON on stdin with a Python expression over the job description d.
json_value() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"
}
READY='next((c["status"] for c in d.get("status", {}).get("conditions", []) if c.get("type") == "Ready"), "")'
CURRENT='d.get("status", {}).get("observedGeneration") == d.get("metadata", {}).get("generation")'
IMAGE='d["spec"]["template"]["spec"]["template"]["spec"]["containers"][0]["image"]'

# Waits until the job reports Ready for its current spec, then checks that it runs the image of this tag. The status of an
# earlier update does not count, even when it says Ready.
wait_for_ready() {
  local tag="$1" job="" ready="" current="" image="" attempt
  for attempt in $(seq 1 "$JOB_CHECK_TRIES"); do
    job="$(describe_job 2> /dev/null || true)"
    ready="$(printf '%s' "$job" | json_value "$READY" 2> /dev/null || true)"
    current="$(printf '%s' "$job" | json_value "$CURRENT" 2> /dev/null || true)"
    if [ "$ready" = True ] && [ "$current" = True ]; then
      break
    fi
    sleep "$JOB_CHECK_WAIT"
  done
  if [ "$ready" != True ] || [ "$current" != True ]; then
    echo "the spider job is not ready (Ready=$ready, current=$current) after $JOB_CHECK_TRIES checks" >&2
    return 1
  fi
  image="$(printf '%s' "$job" | json_value "$IMAGE")"
  if [ "${image##*:}" != "$tag" ]; then
    echo "the spider job runs ${image##*:}, not $tag" >&2
    return 1
  fi
  echo "the spider job is ready on $tag"
}

deploy() {
  local tag="$1" user pass key address

  user="$(value_of RABBITMQ_DEFAULT_USER)"
  pass="$(value_of RABBITMQ_DEFAULT_PASS)"
  key="$(value_of LINKEDIN_CRED_ENC_KEY)"
  if [ -z "$user" ] || [ -z "$pass" ] || [ -z "$key" ]; then
    echo "the secrets file lacks a value the worker needs" >&2
    return 1
  fi

  retry pulumi login "gs://$GCP_PROJECT_ID-pulumi-state"
  pulumi stack select "$STACK"
  pulumi config set imageTag "$tag"

  # Deploys run one at a time (the workflow's concurrency group), so a lock that a cancelled run left behind is not in use.
  pulumi cancel --stack "$STACK" --yes > /dev/null 2>&1 || true

  # The containers and the address come first, so the values exist before the job refers to them.
  retry pulumi up --yes \
    --target "${URN_PREFIX}gcp:secretmanager/secret:Secret::spider-worker-rabbitmq-url" \
    --target "${URN_PREFIX}gcp:secretmanager/secret:Secret::spider-worker-linkedin-cred-enc-key" \
    --target "${URN_PREFIX}gcp:compute/address:Address::rabbitmq-internal"

  address="$(retry pulumi stack output rabbitmqInternalAddress --stack "$STACK")"

  write_secret spider-worker-rabbitmq-url "amqp://$user:$pass@$address:5672/automatedlinkedin"
  write_secret spider-worker-linkedin-cred-enc-key "$key"

  retry pulumi up --yes

  wait_for_ready "$tag"
}

# Runs the deploy only when the script is executed, so a test can source the functions above (for example wait_for_ready).
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  TAG="${1:?usage: spider-job.sh TAG}"
  : "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
  : "${GCP_REGION:?GCP_REGION is required}"
  : "${SECRETS_FILE:?SECRETS_FILE is required}"

  here="$(cd "$(dirname "$0")" && pwd)"
  # Made absolute before the script changes directory.
  SECRETS_FILE="$(cd "$(dirname "$SECRETS_FILE")" && pwd)/$(basename "$SECRETS_FILE")"
  cd "$here/../../infra/cloud-run"

  deploy "$TAG"
fi
