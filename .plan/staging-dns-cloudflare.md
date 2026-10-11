# Automatic DNS update for the staging node (Cloudflare)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-11
- Locked by user: partly. The user asked for automatic DNS updates with Cloudflare when the Spot node's IP changes.
  The choices marked "proposed" below are mine and need the user's OK.

## Goal

When the staging node is replaced and gets a new external IP, `app.staging.elitale.com` points at the new IP
within a few minutes, with no manual DNS edit. `api.` and `auth.` are CNAMEs to `app.`, so they follow.

## Requirements

Confirmed:

- The zone is `elitale.com` on Cloudflare.
- Updates are automatic, not a manual step.

Proposed (need confirmation):

- P1 Mechanism: a Kubernetes CronJob in the staging overlay, running every 5 minutes. It reads the node's
  external IP from the GCE metadata server and updates the A record through the Cloudflare API.
  It runs in the cluster, so it needs no GitHub Actions minutes and keeps working between deploys.
- P2 Scope: only the `app.staging` A record. The CNAMEs stay as they are.
- P3 Proxy: the record is DNS only (grey cloud). The Cloudflare proxy would hide the origin, and cert-manager's
  HTTP-01 challenge plus the TLS setup depend on reaching the node directly.
- P4 Credential: a Cloudflare API token limited to `Zone → DNS → Edit` on `elitale.com`. It is stored as the GitHub
  secret `CLOUDFLARE_API_TOKEN` and copied into the cluster as a Kubernetes secret by the deploy job.
- P5 TTL 60 seconds, so a change propagates quickly.
- P6 Safety: the script refuses to act on an invalid IP, and refuses to guess when more than one A record matches the name.

## Scope and non-goals

- In scope: the CronJob, the script, the secret wiring in `staging.yml`, the overlay config (zone ID and record name),
  docs, and a manual test against a mock Cloudflare API.
- Out of scope: production DNS, IPv6, a load balancer with a static IP (the reserved IP was declined),
  and any change to the CNAME records.

## Approach

- [x] Confirm the GCE metadata endpoint works from a pod in the cluster (returns the node IP).
- [x] Write the updater script (stdlib Python, configurable API base for testing).
- [x] Test the script against a mock Cloudflare API: create, unchanged, update, proxy off, multiple records, private IP, malformed metadata, API error, missing token.
- [x] Add the CronJob and the script ConfigMap to the staging overlay.
- [x] Deploy job: create the `cloudflare-dns` secret from `CLOUDFLARE_API_TOKEN`, warn when it is empty.
- [x] Render the overlay (the CronJob and ConfigMap references are rewritten to hashed names).
- [ ] After the user supplies the token and zone ID: run the job once manually and confirm the record is unchanged.
- [ ] Mark done, update `MEMORY.md`.

## Edge cases and risks

- **Metadata unavailable**: the job fails without changing DNS. The record keeps the last good IP.
- **Node replaced**: the record stays on the old IP until the next run (up to 5 minutes), then updates.
- **Several A records with the same name**: the script stops and reports, because it cannot tell which one is right.
- **Token leakage**: the token is never printed. Errors print the Cloudflare error message only.
- **Token missing**: the deploy warns, and the CronJob fails visibly instead of silently doing nothing.
- **Rate limits**: one lookup and at most one write per run, every 5 minutes.
- **Concurrent runs**: `concurrencyPolicy: Forbid`.
- **Cloudflare outage**: the run fails and retries on the next schedule.
- **Proxy setting**: the script sets `proxied: false`, so an existing orange-cloud record is switched to DNS only.

## Verification

- Mock API tests (see the outcome).
- `kubectl kustomize` renders the CronJob and secret wiring.
- After deploy: one manual job run, then `dig +short app.staging.elitale.com` matches the node IP.
- Simulate a change: point the record at a wrong IP, run the job, confirm it is corrected.

## Outcome

Built and live on staging on 2026-10-11 (branch `feat/staging-dns-cloudflare`, PR #7).

- Unit tests: `python3 -m unittest deploy/overlays/staging/dns/test_update_dns.py`, 10 of 10 pass against a mock
  Cloudflare API and mock metadata server. They cover create, unchanged, update, proxy off, duplicate records,
  private and malformed IPs, API errors (token not printed), and a missing token.
- Cluster path check: a one-off pod with the same image and script mount read the node IP from the metadata
  server and reached the real Cloudflare API. It got a normal API reply for a fake zone, and DNS stayed at
  `34.47.216.69`.
- Live: the `CLOUDFLARE_API_TOKEN` secret is set, the zone ID is in the overlay, and the branch was deployed (run 38124369418).
  The CronJob runs every 5 minutes. A manual run reported `unchanged: A app.staging.elitale.com already points at 34.47.216.69`.
  Live drift test, 2026-10-11 (after PR #7 was merged and deployed; deploy run 38125740481): the record was changed from
  `34.47.216.69` to the documentation address `203.0.113.10`. A manual run of the CronJob logged
  `updated A app.staging.elitale.com: 203.0.113.10 -> 34.47.216.69` about 7 seconds after it started, and the record
  was correct again. Resolvers 8.8.8.8 and 1.1.1.1 returned `34.47.216.69` after the 60-second TTL, and `app` and `api`
  returned 200. Staging was wrong for roughly one minute.
- Found and fixed during rollout: a duplicate `configMapGenerator` key silently dropped the `app-config` merge, and the new
  authentik pods used the base placeholder database host. The fix is in the same branch, and the deploy job now refuses to
  apply a rendered overlay that contains `example.invalid` or `CHANGE_ME`.
- Previously needed (now done): `CF_ZONE_ID` in `overlays/staging/kustomization.yaml`
  (currently `CHANGE_ME_CLOUDFLARE_ZONE_ID`), the `CLOUDFLARE_API_TOKEN` GitHub secret, then a manual job run
  to confirm the record is unchanged.
- Until the zone ID is set, the CronJob fails every 5 minutes and DNS does not change.
