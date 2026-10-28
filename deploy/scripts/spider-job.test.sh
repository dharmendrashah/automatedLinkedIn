#!/usr/bin/env bash
# Tests for spider-job.sh with stub gcloud and pulumi commands. Run with: bash deploy/scripts/spider-job.test.sh
# CHECK_LIVE=1 also checks the readiness of the real spider job (read only, needs gcloud credentials for the project).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/spider-job.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

failures=0

fail() {
  echo "FAIL $1" >&2
  failures=$((failures + 1))
}

# Each test gets its own stubs. They log every call in order, count attempts in files, and report the job state the test sets.
setup() {
  local dir="$root/$1"
  mkdir -p "$dir/bin" "$dir/log"
  cat > "$dir/bin/pulumi" <<'EOF'
#!/usr/bin/env bash
echo "pulumi $*" >> "$CALLS"
if [ "$1" = stack ] && [ "$2" = output ]; then
  echo 10.160.0.200
fi
if [ "$1" = up ]; then
  count="$(cat "$JOB_DIR/up-count" 2>/dev/null || echo 0)"
  echo $((count + 1)) > "$JOB_DIR/up-count"
  if [ "$count" -lt "${PULUMI_UP_FAILS:-0}" ]; then
    echo "error: the provider could not be reached" >&2
    exit 1
  fi
fi
EOF
  cat > "$dir/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = secrets ] && [ "$2" = versions ] && [ "$3" = add ]; then
  echo "gcloud secrets versions add $4" >> "$CALLS"
  count="$(cat "$JOB_DIR/add-$4" 2>/dev/null || echo 0)"
  echo $((count + 1)) > "$JOB_DIR/add-$4"
  if [ "$count" -lt "${SECRET_FAILS:-0}" ]; then
    echo "error: the secret service did not answer" >&2
    exit 1
  fi
  for arg in "$@"; do
    case "$arg" in
      --data-file=*) cp "${arg#--data-file=}" "$SECRET_DIR/$4" ;;
    esac
  done
  exit 0
fi
if [ "$1" = run ] && [ "$2" = jobs ] && [ "$3" = describe ]; then
  echo "gcloud run jobs describe" >> "$CALLS"
  count="$(cat "$JOB_DIR/describe-count" 2>/dev/null || echo 0)"
  echo $((count + 1)) > "$JOB_DIR/describe-count"
  ready="$JOB_READY"
  if [ "$count" -lt "${JOB_NOT_READY_TIMES:-0}" ]; then ready=False; fi
  printf '%s' "{\"metadata\":{\"generation\":2},\"status\":{\"observedGeneration\":${JOB_OBSERVED:-2},\"conditions\":[{\"type\":\"Ready\",\"status\":\"$ready\"}]},\"spec\":{\"template\":{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"image\":\"$JOB_IMAGE\"}]}}}}}}"
  exit 0
fi
echo "unexpected gcloud $*" >&2
exit 1
EOF
  cat > "$dir/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$dir/bin/pulumi" "$dir/bin/gcloud" "$dir/bin/sleep"
  cat > "$dir/secrets.env" <<'EOF'
RABBITMQ_DEFAULT_USER=automatedlinkedin
RABBITMQ_DEFAULT_PASS=s3cret-pass
LINKEDIN_CRED_ENC_KEY=cHFhWkdDbEgva3F4Tkxt==
EOF
  echo "$dir"
}

# Runs the script for one tag. Extra variables (PULUMI_UP_FAILS, SECRET_FAILS, JOB_NOT_READY_TIMES) come from the caller.
run_script() {
  local dir="$1" ready="$2" image="$3"
  : > "$dir/calls.log"
  env PATH="$dir/bin:$PATH" CALLS="$dir/calls.log" SECRET_DIR="$dir/log" JOB_DIR="$dir" JOB_READY="$ready" JOB_IMAGE="$image" \
    JOB_CHECK_TRIES=3 JOB_CHECK_WAIT=0 RETRY_WAIT=0 \
    GCP_PROJECT_ID=test-project GCP_REGION=asia-south1 SECRETS_FILE="$dir/secrets.env" \
    PULUMI_CONFIG_PASSPHRASE=unused \
    bash "$script" sha-abc1234 > "$dir/out.log" 2>&1
}

GOOD_IMAGE="asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-abc1234"
TARGETS="--target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:secretmanager/secret:Secret::spider-worker-rabbitmq-url --target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:secretmanager/secret:Secret::spider-worker-linkedin-cred-enc-key --target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:compute/address:Address::rabbitmq-internal"

# 1. The order: the containers and the address first, then the values, then the full apply, then the check. A lock left by a
# cancelled deploy is cleared first; deploys run one at a time, so nothing else holds it.
dir="$(setup order)"
run_script "$dir" True "$GOOD_IMAGE" || { fail "order: the script failed"; cat "$dir/out.log" >&2; }
expected_order="pulumi login gs://test-project-pulumi-state
pulumi stack select staging
pulumi config set imageTag sha-abc1234
pulumi cancel --stack staging --yes
pulumi up --yes $TARGETS
pulumi stack output rabbitmqInternalAddress --stack staging
gcloud secrets versions add spider-worker-rabbitmq-url
gcloud secrets versions add spider-worker-linkedin-cred-enc-key
pulumi up --yes
gcloud run jobs describe"
if [ "$(cat "$dir/calls.log")" != "$expected_order" ]; then
  fail "order: calls were"
  cat "$dir/calls.log" >&2
fi

# 2. The worker gets the broker address from the reserved one, with the staging user and password, and the key as it is.
if [ "$(cat "$dir/log/spider-worker-rabbitmq-url")" != "amqp://automatedlinkedin:s3cret-pass@10.160.0.200:5672/automatedlinkedin" ]; then
  fail "url: the broker URL the job gets is wrong"
fi
if [ "$(cat "$dir/log/spider-worker-linkedin-cred-enc-key")" != "cHFhWkdDbEgva3F4Tkxt==" ]; then
  fail "key: the credential key is not written as it is"
fi

# 3. No secret value appears in a command line, where other users could read it.
if grep -q "s3cret-pass\|cHFhWkdDbEgva3F4Tkxt" "$dir/calls.log"; then
  fail "args: a secret value reached a command line"
fi

# 4. A transient failure of the apply is tried again, and the deploy passes.
dir="$(setup transient-apply)"
PULUMI_UP_FAILS=1 run_script "$dir" True "$GOOD_IMAGE" || { fail "transient-apply: a failure that goes away failed the deploy"; cat "$dir/out.log" >&2; }
if [ "$(grep -c '^pulumi up' "$dir/calls.log")" -lt 3 ]; then
  fail "transient-apply: the apply was not tried again"
fi

# 5. A transient failure of a secret write is tried again, and the value is written as it is.
dir="$(setup transient-secret)"
SECRET_FAILS=1 run_script "$dir" True "$GOOD_IMAGE" || { fail "transient-secret: a secret write that goes away failed the deploy"; cat "$dir/out.log" >&2; }
if [ "$(cat "$dir/log/spider-worker-rabbitmq-url" 2>/dev/null)" != "amqp://automatedlinkedin:s3cret-pass@10.160.0.200:5672/automatedlinkedin" ]; then
  fail "transient-secret: the broker URL was not written after the retry"
fi

# 6. An error that does not go away is reported after three tries, so the deploy stops instead of retrying for ever.
dir="$(setup persistent)"
if PULUMI_UP_FAILS=99 run_script "$dir" True "$GOOD_IMAGE"; then
  fail "persistent: a failure that never goes away passed"
fi
if [ "$(grep -c '^pulumi up' "$dir/calls.log")" -ne 3 ]; then
  fail "persistent: the apply was not tried exactly three times"
fi

# 7. A job that takes a moment to become ready is checked again, and passes once it is ready.
dir="$(setup slow-ready)"
JOB_CHECK_TRIES=5 JOB_NOT_READY_TIMES=2 run_script "$dir" True "$GOOD_IMAGE" \
  || { fail "slow-ready: the deploy failed for a job that became ready"; cat "$dir/out.log" >&2; }

# 8. The secrets file can be given relative to the repository root, as the workflow gives it.
dir="$(setup relative)"
: > "$dir/calls.log"
if ! (cd "$dir" && env PATH="$dir/bin:$PATH" CALLS="$dir/calls.log" SECRET_DIR="$dir/log" JOB_DIR="$dir" JOB_READY=True \
  JOB_IMAGE="$GOOD_IMAGE" GCP_PROJECT_ID=test-project JOB_CHECK_TRIES=3 JOB_CHECK_WAIT=0 RETRY_WAIT=0 \
  GCP_REGION=asia-south1 SECRETS_FILE=secrets.env PULUMI_CONFIG_PASSPHRASE=unused bash "$script" sha-abc1234 > out.log 2>&1); then
  fail "relative: the script failed with a relative secrets path"
  cat "$dir/out.log" >&2
fi

# 9. A job that is not ready fails the deploy, and says so.
dir="$(setup not-ready)"
if run_script "$dir" False "$GOOD_IMAGE"; then
  fail "not-ready: the deploy passed with a job that is not ready"
fi
grep -q "not ready" "$dir/out.log" || fail "not-ready: no message says why"

# 10. A job whose status is for an older update does not count as ready, even when it says Ready.
dir="$(setup stale-status)"
if JOB_OBSERVED=1 run_script "$dir" True "$GOOD_IMAGE"; then
  fail "stale-status: a status for an older update passed"
fi

# 11. A job on another image fails the deploy, so an old image is never reported as the new one.
dir="$(setup wrong-image)"
if run_script "$dir" True "asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-0000000"; then
  fail "wrong-image: the deploy passed with another image"
fi
grep -q "not sha-abc1234" "$dir/out.log" || fail "wrong-image: no message says which image it runs"

# 12. A live check, on demand: the readiness check reads the real job the same way the deploy does.
if [ "${CHECK_LIVE:-0}" = 1 ]; then
  live_image="$(gcloud run jobs describe spider-worker --region asia-south1 --project automate-linkedin-511215 \
    --format='value(spec.template.spec.template.spec.containers[0].image)')"
  live_tag="${live_image##*:}"
  if ! (export GCP_PROJECT_ID=automate-linkedin-511215 GCP_REGION=asia-south1; source "$script" && wait_for_ready "$live_tag"); then
    fail "live: the readiness check does not pass for the real job ($live_tag)"
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "PASS spider-job.sh: order, values, no secret on a command line, retries, not ready, stale status, wrong image"
