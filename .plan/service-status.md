# Service status page at /healthstatus

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 ("everyone who has signed in")

## Goal

One simple page, `/healthstatus`, for signed-in users, that says for every module the product needs whether it is **Live** or **Dead**, so anyone on the team can tell at a glance whether the product is working and which part to look at when it is not. It runs on the same Kubernetes deployment as everything else. Nothing is saved: it always shows the state right now.

Plain words used on screen:

| Word | Meaning |
| --- | --- |
| Live | The module answered its check just now. |
| Dead | The module did not answer, or answered that it is broken. A short reason is shown ("Not answering", "Timed out", "Reports an error"). |
| Unknown | The page could not check it, for example cloud storage cannot be checked while the spider worker is dead. It is never shown as Live. |

## Requirements

Confirmed (from the requests):

- A feature called service status health, at the path `/healthstatus`.
- It shows the health of every module the product needs to work properly, as Live or Dead. Including authentik's background worker, Google Cloud Storage and ipinfo.io.
- Not public: only visible to internal users (see Q1 for what that means exactly).
- "Unknown" is a third state next to Live and Dead.
- The page refreshes itself every 10 seconds; each check times out after 3 seconds.
- Signed-in users get an entry for it in the sidebar.
- No saved history. Nothing is stored.
- Deployed on Kubernetes, simple, easy to use and easy to understand.

- Q1 (answered): "internal users" means everyone who has signed in. No admin role is needed.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: a Kubernetes-aware status check in brain; a signed-in-only `status` API; the `/healthstatus` page and sidebar entry; a small health endpoint on the spider worker; the Kubernetes pieces that needs; tests; docs in `MEMORY.md`.
- Out of scope: history, graphs, alerts, incident notes, per-user details, LinkedIn itself (the product never contacts LinkedIn from the cluster, only through the account's own proxies, so there is nothing to check from here), users' own proxies (the Proxies page already tests them), DNS and certificates, replacing the Kubernetes probes (they stay exactly as they are).

## What the user sees

A page inside the signed-in app (same look as Accounts and Proxies: shadcn `Card` and `Badge`), readable on a phone.

```text
Service status                                         [ Refresh ]
Is everything working? Checked 3 seconds ago.

  +--------------------------------------------------------------+
  |  Everything is live.                          (green)        |
  |  or: 2 of 11 modules are dead.                (red)          |
  +--------------------------------------------------------------+

  The app
    Website         Live      The page you are looking at
    API             Live      Everything the app asks for
    Database        Live      Where accounts and sessions are kept
  Sign-in
    Sign-in         Live      Logging in and signing up
    Sign-in worker  Live      Background work for sign-in
    Email           Dead      Not answering    (sends sign-up and password e-mails)
  The spider
    Message queue   Live      Passes work to the spider
    Spider API      Live      Takes scraping tasks
    Spider worker   Live      The browser that checks LinkedIn accounts
    Cloud storage   Unknown   Cannot be checked while the spider worker is dead
  Outside services
    Proxy lookup    Live      ipinfo.io, which finds a proxy's country
```

- One card per module: name, a one-line plain description, the badge (green Live, red Dead, grey Unknown) and, when Dead or Unknown, a short reason. The banner on top is the summary. Groups only keep eleven cards easy to read.
- If the page cannot reach the API at all, it shows the API as Dead, the website as Live (the page itself loaded), and the rest as Unknown, with one sentence: "The API is not answering, so the other modules cannot be checked."
- It updates by itself every 10 seconds; Refresh asks right away. It always says how old the answer is.

## Approach

### 1. The modules and how each is checked (brain, `src/status`)

A module is a small object: key, name, group, description and a `check()` that ends as Live, Dead (with a fixed reason) or Unknown. The module list comes from the API, so adding a module later changes only brain.

| Module | Check | Notes |
| --- | --- | --- |
| Website | `GET http://body:80/health` | The static health file |
| API | Live whenever this answers | It is the one answering |
| Database | `PrismaService.isHealthy()` | Already exists |
| Sign-in | `GET http://authentik-server:9000/-/health/ready/` | Ready, not live: live depends on the database |
| Sign-in worker | Kubernetes: the `authentik-worker` Deployment has a ready pod | authentik's worker has no web address, only an `ak healthcheck` command that Kubernetes already runs as its probe. The status asks Kubernetes the result. Unknown outside Kubernetes (Compose) |
| Email | Connect to the SMTP server authentik is configured with (`AUTHENTIK_EMAIL__HOST` and `__PORT`, which brain already receives from the shared config), over TLS when configured, and read the server's greeting. Nothing is sent | Proves the server is there; it does not prove the API key is valid |
| Message queue | `MessageBroker.isHealthy()` | Already exists |
| Spider API | `GET http://spider-api:3002/health` | 200 is Live; 503 means its queue is down, shown as Dead |
| Spider worker | `GET http://spider-worker:3003/health` (new, below) | Live when the worker is connected to the queue and consuming. A worker busy with a long task is still Live |
| Cloud storage | Reported by the spider worker in the same answer | The worker is the one with Google credentials. Unknown when the worker cannot be reached |
| Proxy lookup | One lookup of a fixed public address at ipinfo.io with brain's token, at most once a minute | Live also proves the token is still accepted. Dead on a refusal or a timeout |

- The in-cluster addresses are the Kubernetes Service names, which are the same in Docker Compose, so the defaults work in both. Each can be overridden by an environment variable for a local run, and an empty value removes the module.
- All checks run at the same time, each limited to 3 seconds, so the answer takes about 3 seconds at most. A module that hangs cannot hold up the others.
- Addresses come from brain's settings, never from the request.

### 2. A health endpoint on the spider worker (new)

The worker is the only module with no web address and the only one that can reach Google Cloud Storage. It gets a tiny `GET /health` (Node's own `http`, no new dependency) on port 3003:

```json
{ "status": "ok", "broker": "up", "consuming": true, "storage": "up" }
```

- `broker`: the worker's connection to RabbitMQ is open. `consuming`: both consumers (scrape tasks and account checks) are registered. `storage`: a cheap read of the bucket (list one object under `sessions/`, which the worker's role already allows), at most once every 30 seconds.
- It answers 503 when the broker is down or the worker is not consuming, and never includes secrets, paths or error text.
- It is not used as a Kubernetes probe: a crashed worker exits and is restarted already, and a probe that depends on the bucket or the queue would restart the worker for outages it cannot fix. The status page only reads it.

### 3. The API (signed-in only)

A tRPC query `status.get`, behind the existing `userProcedure` (a valid sign-in; or the admin check if Q1 says so). It answers with the list, always, even when the database is down:

```json
{
  "checkedAt": "2026-10-12T12:00:00.000Z",
  "overall": "live",
  "modules": [
    { "key": "database", "group": "The app", "name": "Database", "description": "...", "status": "live" },
    { "key": "email", "group": "Sign-in", "name": "Email", "description": "...", "status": "dead", "reason": "Not answering" }
  ]
}
```

- Results are cached for 10 seconds (one minute for the ipinfo lookup), and callers that arrive during a check share it, so any number of open pages causes one round of checks per 10 seconds.
- `reason` is one of a few fixed sentences. It never holds an address, a version or the text of an error.
- `/health` and the Kubernetes probes are untouched.

### 4. The page (`apps/body`)

- Route `/healthstatus` inside the signed-in layout (so it needs a sign-in like the other pages), and a "Service status" entry in the sidebar.
- `pages/HealthStatus.tsx` and `components/status/`: a banner, a group, a card, a badge. A small `describe` module holds the wording, the only place that holds the sentences. It refreshes every 10 seconds and handles "API not reachable" as described above.

### 5. Kubernetes

- **Brain asks Kubernetes about the authentik worker.** That needs a `ServiceAccount` for brain and a read-only `Role` (`get` and `list` on `deployments` and `statefulsets` in its own namespace only) with a `RoleBinding`. It follows the pattern the DNS updater CronJob already uses for reading the node. No write permission, no cluster-wide permission, no secrets.
- **Spider worker gets a Service**: a new `spider-worker` ClusterIP Service for port 3003 (internal only), plus the container port. The Ingress is unchanged: the page is a route of the web app and the API is a route of brain, both on hosts that already exist.
- Brain reaches the other modules by Service name inside the namespace. There is no NetworkPolicy in the cluster today; if one is added, brain must be allowed to reach `body`, `authentik-server`, `spider-api`, `spider-worker`, the SMTP server and ipinfo.io.
- No migration and no new secret. Settings (module addresses, the ipinfo token brain already has) need no new values in `deploy/` unless a deployment wants different addresses.
- Deploys with the normal staging pipeline after merge.
- Compose: the worker's port stays inside the Compose network; the Kubernetes check for the sign-in worker answers Unknown there.

### Steps (each with its test first)

- [ ] S1 `status` module in brain: the check runner (parallel, 3 second limit, fixed reasons, Unknown rules), the 10 second shared cache with its per-module override, with unit tests using fake checks and fake HTTP answers (live, 503, refused, timeout, slow, throws).
- [ ] S2 The individual checks with unit tests: HTTP, SMTP greeting (plain and TLS), ipinfo lookup, Kubernetes deployment readiness (fake API answers), the worker's answer including storage.
- [ ] S3 The worker's `GET /health` (consuming state, broker state, cached storage read) with unit tests.
- [ ] S4 The `status.get` procedure behind sign-in, with tests for the shape, the answer when the database is down, the cache, no address or error text in the output, and a refusal without a sign-in.
- [ ] S5 Settings (`env.ts`, `.env.example`, compose) and the Kubernetes manifests: brain `ServiceAccount`, `Role`, `RoleBinding`, the worker Service and port. Rendered and checked with `kubectl kustomize`.
- [ ] S6 Body page, cards, banner, wording helper with tests for the wording and the "API not reachable" case; route and sidebar entry.
- [ ] S7 Definition of done, a local run (start the stack, open `/healthstatus`, stop RabbitMQ and watch the queue go dead and the worker and storage follow), `MEMORY.md`, plan set to done.

## Edge cases and risks

- Access: the endpoint is behind sign-in, so a stranger gets nothing. Even so, the answer carries only names, status and fixed short reasons, never addresses, versions, tokens or error text, so a signed-in user learns nothing about the internals beyond what is up.
- Load: every check is an outbound call. The shared 10 second cache and the single in-flight check bound the work however many pages are open. The ipinfo lookup is limited to once a minute so it cannot use up a quota. Addresses are fixed by configuration, so the endpoint cannot be used to make brain call anything else.
- Kubernetes permission: the read-only `Role` is the only new permission and is limited to reading Deployments and StatefulSets in the namespace. If it is missing, the sign-in worker shows Unknown, never Live.
- The queue: the worker's health endpoint reports its own connection, so brain does not open a channel against a queue that could close it. The worker reports Dead or Unknown when the queue is down.
- Storage check: it reads, never writes, and uses a permission the worker already has. It is cached for 30 seconds so a busy status page does not call Google every 10 seconds per viewer.
- Email: the check connects to the SMTP server and reads its greeting only; it sends nothing and never uses the API key. A bad or expired key is not detected, which the card's description says.
- Brain itself being down: nothing can answer. The page shows the API as Dead from the failed request and the rest as Unknown.
- Honest colours: Unknown is used wherever a check could not run, so nothing is Live by omission.
- Time: the page shows when brain checked, not when the browser fetched.
- Deployments that do not run everything (Compose without the spider profile): the missing modules show Dead, which is true there. An empty address removes a module if a deployment never has it.
- Dev and production: works in both; local runs use the same Service-style defaults overridden by localhost addresses in `.env.example`. Docker and CI: the worker image needs no new system package. Rollback: remove the route, the procedure and the sidebar entry, and the manifests; nothing is stored.
- Compliance and privacy: no personal data is involved and nothing is stored or sent anywhere new except the checks themselves (an SMTP greeting read and one ipinfo lookup a minute).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- A local run against the compose stack: every card Live; stop `rabbitmq` and see the queue Dead and the spider worker and storage follow; stop `spider-api` and see it Dead; the sign-in worker shows Unknown (no Kubernetes).
- `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` renders the new Service, ServiceAccount, Role and RoleBinding.
- After the deploy: open `/healthstatus` signed in on the staging app address, and confirm it asks for a sign-in when signed out.
- Not verifiable here: the in-cluster Service-name addresses and the Kubernetes permission until the first staging rollout.

## Outcome

Shipped as locked, with these differences:

- When the API cannot be reached the page shows two cards (Website live, API dead) and the sentence, not a grey card for every other module: the page only knows the module list from the API, so it does not invent one.
- The brain code lives in a new top-level `serviceStatus` folder (added to `.prettierrc` and the web app's `tsconfig.app.json`), not in `src/status`.
- "Consuming" on the worker means the process is running and not shutting down: the worker exits when a queue channel closes, so a live process is a consuming one.
- The Kubernetes check calls the in-cluster API with Node's `https` and the mounted CA, with no new dependency.

Verified: `pnpm lint`, `ts:check`, `test:unit:run` (brain 442, spider 341, body 115, contracts 55) and `build`; the staging and local overlays render the new ServiceAccount, Role, RoleBinding, worker Service and port; the real checks ran against the local Compose stack and answered correctly (Website, Sign-in, Database and queue live; Email, Spider API, Spider worker and Proxy lookup dead for real reasons; the sign-in worker Unknown outside Kubernetes; cloud storage Unknown with the worker down).

Not verified: the page in a browser (it needs a signed-in session), the in-cluster addresses and the Kubernetes permission until the first staging rollout, the SMTP check over TLS (the plain path is tested), and the worker health endpoint inside a real container.

Follow-ups: the Google Cloud and spider-worker rollout steps are unchanged; if a NetworkPolicy is added later, brain must be allowed to reach `body`, `authentik-server`, `spider-api`, `spider-worker`, the SMTP server and ipinfo.io.
