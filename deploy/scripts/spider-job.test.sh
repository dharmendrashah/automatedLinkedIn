#!/usr/bin/env bash
# Tests for spider-job.sh with stub gcloud and pulumi commands. Run with: bash deploy/scripts/spider-job.test.sh
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

# Each test gets its own stubs: they log every call in order, and report the job state and image the test sets.
setup() {
  local dir="$root/$1"
  mkdir -p "$dir/bin" "$dir/log"
  cat > "$dir/bin/pulumi" <<'EOF'
#!/usr/bin/env bash
echo "pulumi $*" >> "$CALLS"
if [ "$1" = stack ] && [ "$2" = output ]; then
  echo 10.160.0.200
fi
EOF
  cat > "$dir/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = secrets ] && [ "$2" = versions ] && [ "$3" = add ]; then
  echo "gcloud secrets versions add $4" >> "$CALLS"
  cat > "$SECRET_DIR/$4"
  exit 0
fi
if [ "$1" = run ] && [ "$2" = jobs ] && [ "$3" = describe ]; then
  echo "gcloud run jobs describe" >> "$CALLS"
  # Reads a counter file, so a test can say how many checks report not ready before the job is ready.
  tries_file="$JOB_DIR/describe-count"
  count="$(cat "$tries_file" 2>/dev/null || echo 0)"
  echo $((count + 1)) > "$tries_file"
  ready="$JOB_READY"
  if [ "$count" -lt "${JOB_NOT_READY_TIMES:-0}" ]; then ready=False; fi
  printf '%s' "{\"status\":{\"conditions\":[{\"type\":\"Ready\",\"status\":\"$ready\"}]},\"spec\":{\"template\":{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"image\":\"$JOB_IMAGE\"}]}}}}}}"
  exit 0
fi
echo "unexpected gcloud $*" >&2
exit 1
EOF
  chmod +x "$dir/bin/pulumi" "$dir/bin/gcloud"
  cat > "$dir/secrets.env" <<'EOF'
RABBITMQ_DEFAULT_USER=automatedlinkedin
RABBITMQ_DEFAULT_PASS=s3cret-pass
LINKEDIN_CRED_ENC_KEY=cHFhWkdDbEgva3F4Tkxt==
EOF
  echo "$dir"
}

run_script() {
  local dir="$1" state="$2" image="$3"
  : > "$dir/calls.log"
  env PATH="$dir/bin:$PATH" CALLS="$dir/calls.log" SECRET_DIR="$dir/log" JOB_DIR="$dir" JOB_READY="$state" JOB_IMAGE="$image" \
    JOB_NOT_READY_TIMES="${NOT_READY_TIMES:-0}" JOB_CHECK_TRIES=3 JOB_CHECK_WAIT=0 \
    GCP_PROJECT_ID=test-project GCP_REGION=asia-south1 SECRETS_FILE="$dir/secrets.env" \
    PULUMI_CONFIG_PASSPHRASE=unused \
    bash "$script" sha-abc1234 > "$dir/out.log" 2>&1
}

# 1. The order: the containers and the address first, then the values, then the full apply, then the check.
dir="$(setup order)"
run_script "$dir" True "asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-abc1234" \
  || { fail "order: the script failed"; cat "$dir/out.log" >&2; }
expected_order="pulumi login gs://test-project-pulumi-state
pulumi stack select staging
pulumi config set imageTag sha-abc1234
pulumi up --yes --target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:secretmanager/secret:Secret::spider-worker-rabbitmq-url --target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:secretmanager/secret:Secret::spider-worker-linkedin-cred-enc-key --target urn:pulumi:staging::automatedlinkedin-cloud-run::gcp:compute/address:Address::rabbitmq-internal
pulumi stack output rabbitmqInternalAddress --stack staging
gcloud secrets versions add spider-worker-rabbitmq-url
gcloud secrets versions add spider-worker-linkedin-cred-enc-key
pulumi up --yes
gcloud run jobs describe"
if [ "$(cat "$dir/calls.log")" != "$expected_order" ]; then
  fail "order: calls were"
  cat "$dir/calls.log" >&2
fi

# 2. The worker gets the broker address from the reserved one, with the staging user and password, and the key as is.
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

# 4. A job that takes a moment to become ready is checked again, and passes once it is ready.
dir="$(setup slow-ready)"
NOT_READY_TIMES=2 run_script "$dir" True "asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-abc1234" \
  || { fail "slow-ready: the deploy failed for a job that became ready"; cat "$dir/out.log" >&2; }

# 5. The secrets file can be given relative to the repository root, as the workflow gives it.
dir="$(setup relative)"
: > "$dir/calls.log"
if ! (cd "$dir" && env PATH="$dir/bin:$PATH" CALLS="$dir/calls.log" SECRET_DIR="$dir/log" JOB_DIR="$dir" JOB_READY=True \
  JOB_IMAGE="asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-abc1234" GCP_PROJECT_ID=test-project \
  GCP_REGION=asia-south1 SECRETS_FILE=secrets.env PULUMI_CONFIG_PASSPHRASE=unused bash "$script" sha-abc1234 > out.log 2>&1); then
  fail "relative: the script failed with a relative secrets path"
  cat "$dir/out.log" >&2
fi
if [ "$(cat "$dir/log/spider-worker-linkedin-cred-enc-key" 2>/dev/null)" != "cHFhWkdDbEgva3F4Tkxt==" ]; then
  fail "relative: the key was not read from the relative path"
fi

# 6. A job that is not ready fails the deploy.
dir="$(setup not-ready)"
if run_script "$dir" False "asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-abc1234"; then
  fail "not-ready: the deploy passed with a job that is not ready"
fi
grep -q "not ready" "$dir/out.log" || fail "not-ready: no message says why"

# 7. A job on another image fails the deploy, so an old image is never reported as the new one.
dir="$(setup wrong-image)"
if run_script "$dir" True "asia-south1-docker.pkg.dev/test-project/spider/spider-worker:sha-0000000"; then
  fail "wrong-image: the deploy passed with another image"
fi
grep -q "not sha-abc1234" "$dir/out.log" || fail "wrong-image: no message says which image it runs"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "PASS spider-job.sh: order, values, secrets off the command line, not ready, wrong image"
