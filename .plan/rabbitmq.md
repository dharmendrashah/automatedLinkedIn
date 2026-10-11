# RabbitMQ for local and staging

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11

## Goal

Run a RabbitMQ broker next to the app in docker compose (local) and in the staging cluster, so later work (LinkedIn automation jobs, scheduled outreach, status verification) can be queued instead of run inside a web request. Brain gets a validated connection setting and can report whether the broker is reachable.

## Requirements

Confirmed:

- Local: a `rabbitmq` service in `docker-compose.yml` with a healthcheck, a named volume, the management UI on `127.0.0.1:15672`, AMQP on `127.0.0.1:5672`, and dev-only default credentials (same pattern as postgres and authentik).
- Local Kubernetes (`deploy/overlays/local`) and staging (`deploy/overlays/staging`) both get RabbitMQ from the shared `deploy/base`, so the platform-agnostic rule holds (cloud specifics only in overlays).
- Staging credentials come from `secrets.env` (the GitHub secret `STAGING_SECRETS_ENV`); nothing real is committed.

Locked answers:

- Q1 Infrastructure plus the minimal brain side: `RABBITMQ_URL` in envalid, an `amqplib` connection service, broker status in `/health`, unit tests (and an integration test when a broker is reachable). No queues or consumers.
- Q2 Staging runs RabbitMQ in the cluster: single-replica StatefulSet with a small PVC, ClusterIP only, defined in the shared base.
- Q3 A broker outage is reported (`broker: up|down` in `/health`) but does not make brain not ready; only the database gates readiness.

## Scope and non-goals

- In scope: compose service, base manifests (StatefulSet, headless Service, ClusterIP Service, ConfigMap and Secret wiring), overlay patches (Spot toleration for the StatefulSet, local resource trim), `.env.example` and `secrets.example.env` entries, `deploy/README.md`, CI deploy rollout wait if it lists workloads, and (per Q1) brain env, connection service, health, tests.
- Out of scope: queues, exchanges, consumers and producers for real features; clustering or HA; public exposure of the management UI; TLS to the broker (cluster-internal, same stance as the database); a metrics stack.

## Approach

- [x] Resolve Q1 to Q3 and lock.
- [x] Compose: `rabbitmq:4-management-alpine`, `RABBITMQ_DEFAULT_USER/PASS/VHOST`, healthcheck `rabbitmq-diagnostics -q ping`, volume, loopback-only ports; `brain` gets `RABBITMQ_URL` and `depends_on` rabbitmq healthy (if Q1 includes brain).
- [x] Base manifests: `rabbitmq.statefulset.yaml` (1 replica, PVC template, probes, resource limits, non-root, read-only root where the image allows), `rabbitmq.service.yaml` (ClusterIP 5672, 15672) and headless Service; kustomization resources.
- [x] Overlays: staging Spot toleration patch also targets `StatefulSet`; local trims requests; credentials added to the example secrets files.
- [x] Brain (per Q1): `RABBITMQ_URL` in `env.ts`/`env/index.ts`, `src/messaging` or a `core` service, health field, tests first.
- [x] Validate: `docker compose config`, `kubectl kustomize --load-restrictor LoadRestrictionsNone` for both overlays, bring the compose service up and check health, run the tests.
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; update `MEMORY.md`.

## Edge cases and risks

- Credentials: `guest/guest` only works from localhost inside the container, so create a real user and vhost from env; the password must be URL-safe because it sits inside `RABBITMQ_URL` (use hex, no `@:/%`). Staging password only in `secrets.env`.
- Spot node: the node is replaced without notice, the pod restarts, and an unacked message is redelivered. The PVC is zonal and the cluster is zonal (`asia-south1-b`), so the volume re-attaches in the same zone. Durable queues and persistent messages will be needed when real features arrive; noted for later.
- Existing volumes: `RABBITMQ_DEFAULT_USER/PASS` apply only when the data directory is first created, so changing them later needs a volume reset (same class of trap as the postgres init scripts) and must be documented.
- Memory: the node is a single `e2-standard-2`; RabbitMQ gets a memory limit (about 768Mi) and a request low enough to schedule next to authentik, brain and body. Local minikube drops requests like the other workloads.
- Probes: exec probes are slow; use generous timeouts so a busy Erlang VM does not restart-loop; readiness separate from liveness.
- Port exposure: AMQP and the management UI bind to loopback in compose, ClusterIP only in Kubernetes. Reach the UI with `kubectl port-forward`.
- Image trust and tags: pin a major.minor tag, not `latest`; the image is public so no pull secret.
- Brain start order: brain must start when the broker is down (per Q3) and reconnect later, so the connection service must not crash the process.
- Cost on GKE: a small PVC; the exact minimum disk size is rounded up by GCE.
- Rollback: remove the compose service, the base resources and the env var; no database change.

## Verification

- `docker compose config` and `docker compose up -d rabbitmq`, health green, management UI answers on `127.0.0.1:15672`.
- `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` and `.../local` render without errors and include the StatefulSet with the toleration.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Shipped as locked. Local: `rabbitmq` service in `docker-compose.yml` (`rabbitmq:4.3-management-alpine`, healthcheck, `rabbitmq-data` volume, AMQP and UI bound to 127.0.0.1, dev defaults), and brain gets `RABBITMQ_URL` with a `service_started` dependency. Kubernetes: `deploy/base/rabbitmq.statefulset.yaml` (1 replica, 2Gi PVC, non-root uid 100, caps dropped, exec probes, 768Mi limit) and `rabbitmq.service.yaml` (ClusterIP only); brain builds `RABBITMQ_URL` from the same two secret keys via `$(VAR)` expansion; the staging overlay's Spot toleration and the local overlay's request trim now also target `StatefulSet`. Brain: `RABBITMQ_URL` (required in production, dev default matches compose), `MessageBroker` in `src/core` (one shared lazy connection, reconnect after close, error listener, 3 s connect timeout, safe disconnect on shutdown), and `broker: up|down` in `/health` that does not gate readiness. CI: a `rabbitmq:4.3-alpine` service and `RABBITMQ_URL` for the integration step; staging deploy waits for `statefulset/rabbitmq`.

Verified: lint, ts:check, unit tests (brain 181, body 37) and build pass; the broker integration test (connect plus a publish and consume round trip on the vhost) passes against the compose broker; the CI steps replayed on a fresh database passed (4 migrations, 20 integration tests); both overlays render with `kubectl kustomize`, include the StatefulSet, and staging has the Spot toleration; the exact StatefulSet security context (uid 100:101, all caps dropped, no new privileges) and both probe commands were run against the real image and exit 0. Not verified: a real minikube or GKE rollout.

Deviations and findings:
- `amqplib` 2.x ships its own types, so `@types/amqplib` was not added.
- Found and fixed a gap from the credential-storage work: the compose `brain` container runs with `NODE_ENV=production`, which has no built-in `LINKEDIN_CRED_ENC_KEY`, so compose brain would not have started. Compose now passes the public dev key.

Before merging to staging (user action): add `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS` (URL-safe password) to the `STAGING_SECRETS_ENV` GitHub secret; brain refuses to start in production without `RABBITMQ_URL`, and the broker pod needs the two keys. `LINKEDIN_CRED_ENC_KEY` must also be in that secret if it is not already.
