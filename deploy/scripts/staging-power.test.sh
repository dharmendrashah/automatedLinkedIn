#!/usr/bin/env bash
# Tests for staging-power.sh: which workloads a wake waits for. Run with: bash deploy/scripts/staging-power.test.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# A kubectl that only records its arguments and reports success, so no cluster is needed.
cat > "$work/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$KUBECTL_LOG"
exit 0
EOF
chmod +x "$work/kubectl"

export PATH="$work:$PATH" KUBECTL_LOG="$work/kubectl.log"
export GCP_PROJECT_ID=test-project GKE_CLUSTER=test-cluster GKE_LOCATION=test-zone

# Sourcing must not run a command: the script only runs its command when it is executed directly.
source "$here/staging-power.sh"

wait_for_apps

waited="$(grep 'rollout status' "$KUBECTL_LOG" | awk '{print $5}' | tr '\n' ' ' | sed 's/ $//')"
expected="deploy/brain deploy/brain-worker deploy/body deploy/spider-api statefulset/rabbitmq"

if [ "$waited" != "$expected" ]; then
  echo "FAIL wait_for_apps waited for: $waited" >&2
  echo "     expected:                 $expected" >&2
  exit 1
fi

echo "PASS wait_for_apps waits for the apps, and not for the spider worker"
