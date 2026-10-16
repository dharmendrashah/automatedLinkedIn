#!/usr/bin/env bash
# Turns the staging node pool on and off, and holds the deploy lock that smart shutdown respects.
#
#   staging-power.sh sleep               scale the node pool to zero (stops the VM bill)
#   staging-power.sh wake                start the node, refresh DNS, reset the idle timer, wait for the apps
#   staging-power.sh ensure-awake        wake only when the pool is at zero (used by the deploy job)
#   staging-power.sh lock MINUTES        block smart shutdown for MINUTES (used while a deploy runs)
#   staging-power.sh unlock              release the lock
#
# Needs: gcloud and kubectl already authenticated, and these variables:
#   GCP_PROJECT_ID, GKE_CLUSTER, GKE_LOCATION (required); NAMESPACE and NODE_POOL (optional defaults below).
set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GKE_CLUSTER:?GKE_CLUSTER is required}"
: "${GKE_LOCATION:?GKE_LOCATION is required}"
NAMESPACE="${NAMESPACE:-automatedlinkedin}"
NODE_POOL="${NODE_POOL:-big-pool}"
STATE_CONFIGMAP="idle-shutdown-state"
NODE_SELECTOR="cloud.google.com/gke-nodepool=${NODE_POOL}"

nodes() {
  kubectl get nodes -l "$NODE_SELECTOR" --no-headers 2>/dev/null | wc -l | tr -d ' '
}

resize() {
  gcloud container clusters resize "$GKE_CLUSTER" --node-pool "$NODE_POOL" --num-nodes "$1" \
    --zone "$GKE_LOCATION" --project "$GCP_PROJECT_ID" --quiet
}

set_state() {
  kubectl -n "$NAMESPACE" get configmap "$STATE_CONFIGMAP" > /dev/null 2>&1 \
    || kubectl -n "$NAMESPACE" create configmap "$STATE_CONFIGMAP" > /dev/null
  kubectl -n "$NAMESPACE" patch configmap "$STATE_CONFIGMAP" --type merge -p "{\"data\":{\"$1\":\"$2\"}}" > /dev/null
}

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%S+00:00
}

wait_for_node() {
  for _ in $(seq 1 20); do
    if kubectl wait --for=condition=Ready node -l "$NODE_SELECTOR" --timeout=30s > /dev/null 2>&1; then
      return 0
    fi
    sleep 15
  done
  echo "the node did not become Ready in time" >&2
  return 1
}

# The DNS job has a 2-minute deadline, so a node that is still starting can make one attempt fail.
# Each attempt is a fresh job; three attempts are enough for a node that became Ready.
refresh_dns() {
  local attempt job
  for attempt in 1 2 3; do
    job="dns-wake-${GITHUB_RUN_ID:-manual}-$(date +%s)"
    kubectl -n "$NAMESPACE" create job --from=cronjob/staging-dns-updater "$job" > /dev/null
    if kubectl -n "$NAMESPACE" wait --for=condition=complete "job/$job" --timeout=5m > /dev/null 2>&1; then
      kubectl -n "$NAMESPACE" logs "job/$job"
      kubectl -n "$NAMESPACE" delete "job/$job" > /dev/null
      return 0
    fi
    echo "DNS update attempt $attempt did not finish; the node may still be starting" >&2
    kubectl -n "$NAMESPACE" delete "job/$job" > /dev/null 2>&1 || true
    sleep 30
  done
  echo "DNS update failed after 3 attempts" >&2
  return 1
}

wait_for_apps() {
  for target in deploy/brain deploy/brain-worker deploy/body deploy/spider-api deploy/spider-worker statefulset/rabbitmq; do
    # The deploy job wakes the node before it applies the manifests, so a workload that this very deploy creates (a new one)
    # is not on the cluster yet; the deploy waits for it after applying.
    if ! kubectl -n "$NAMESPACE" get "$target" > /dev/null 2>&1; then
      echo "not waiting for $target: it is not on the cluster yet"
      continue
    fi
    kubectl -n "$NAMESPACE" rollout status "$target" --timeout=10m
  done
}

wake() {
  if [ "$(nodes)" -eq 0 ]; then
    echo "starting the node pool"
    resize 1
  fi
  wait_for_node
  refresh_dns
  set_state last_active "$(now_utc)"
  wait_for_apps
  echo "staging is awake"
}

case "${1:-}" in
  sleep)
    resize 0
    echo "staging is asleep"
    ;;
  wake)
    wake
    ;;
  ensure-awake)
    if [ "$(nodes)" -eq 0 ]; then
      wake
    else
      echo "staging is already awake"
    fi
    ;;
  lock)
    minutes="${2:?lock needs a number of minutes}"
    set_state deploy_lock_until "$(date -u -d "+${minutes} minutes" +%Y-%m-%dT%H:%M:%S+00:00)"
    echo "smart shutdown is held for ${minutes} minutes"
    ;;
  unlock)
    set_state deploy_lock_until "1970-01-01T00:00:00+00:00"
    echo "smart shutdown lock released"
    ;;
  *)
    echo "usage: staging-power.sh sleep|wake|ensure-awake|lock MINUTES|unlock" >&2
    exit 2
    ;;
esac
