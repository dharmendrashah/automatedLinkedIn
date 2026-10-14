# Staging DNS after moving elitale.com to a new Cloudflare account

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-14
- Locked by user: yes (the user asked to test and plan the change, 2026-10-14)

## Goal

The staging DNS updater keeps `app.staging.elitale.com` pointed at the staging node. It must use the new
Cloudflare zone and the new API token, after elitale.com moved to another Cloudflare account.

## Facts (checked 2026-10-14)

- Nameservers for elitale.com: `hope.ns.cloudflare.com`, `leland.ns.cloudflare.com`.
- Cluster: the DNS CronJob still uses the old zone ID `e03351a934383e813f5becffec34b440`, and the token from 2026-10-11.
- Repo (this branch): new zone ID `b7c2c36fd58578c9dc212fc57d87b33b`.
- GitHub secret `CLOUDFLARE_API_TOKEN`: last updated 2026-10-11 08:00 UTC. This needs to be confirmed as the new token.
- Node external IP 34.180.56.254 and the record match.

## Steps

1. Commit the new zone ID (this branch). Run the staging deploy from this branch.
2. The deploy job writes `cloudflare-dns` from `CLOUDFLARE_API_TOKEN`. The CronJob picks up the new zone ID.
3. Run the DNS job by hand. Expected: `unchanged: A app.staging.elitale.com already points at 34.180.56.254`, with no 403 or 404.
4. Self-heal test in the new zone: point the record at a documentation address (203.0.113.10) through the new zone, run the job,
   and confirm it corrects the record to the node IP. The record change is made with the token from the cluster secret, and the
   token is never printed.
5. Check public DNS (1.1.1.1 and 8.8.8.8) and `app`, `api`, `auth` return 200.

## Edge cases and risks

- Wrong or old token: the job fails with 403. DNS does not change. A node replacement before the fix would leave staging on a dead IP.
  Check the token before the next node change.
- Wrong zone ID: the job fails with 404 or 403. DNS does not change.
- Record exists in both accounts: the zone ID decides which one is updated. The job reads only the zone in the overlay.
- Proxy: the record must stay DNS only.

## Rollback

Revert the zone ID commit and redeploy. The old zone is no longer the source of truth, so rollback only helps if the old
account still serves the zone.

## Verification

- DNS job logs show `unchanged` or `updated` with no HTTP error.
- Public resolvers return the node IP.
- Self-heal test corrects a wrong record within one job run.

## Outcome

Filled in when done.
