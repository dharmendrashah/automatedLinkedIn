# Running the stack locally on Kubernetes

A minikube environment that mirrors the staging overlay: same manifests, same init-container
migrations, same authentik blueprint. Differences are confined to `deploy/overlays/local`
(plain HTTP, locally built images, no Spot tolerations, no resource requests).

The database is your existing `docker compose` PostgreSQL, reached from the cluster at
`host.minikube.internal` — the same "external database" shape staging uses.

## 1. Expose the compose PostgreSQL

`docker-compose.yml` binds Postgres to `127.0.0.1`, which the minikube node cannot reach:

```sh
docker compose -f docker-compose.yml -f infra/local-k8s/postgres-expose.yml up -d postgres
```

> This publishes PostgreSQL on all interfaces with the public dev credentials. Trusted
> networks only. Revert with `docker compose up -d postgres`.

## 2. Stop the compose authentik

The cluster and compose share **one** authentik database. If both run, each worker re-applies
the blueprint with its own `APP_URL` and they overwrite each other's redirect URIs:

```sh
docker compose stop authentik-server authentik-worker
```

## 3. Build the images, then start the cluster

Build **before** starting minikube. Docker Desktop's VM is ~8 GB; a running 6 GB minikube
leaves too little for a build and the daemon gets OOM-killed mid-build.

```sh
docker build -t automatedlinkedin-brain:local -f apps/brain/Dockerfile .
docker build -t automatedlinkedin-brain-migrate:local --target migrate -f apps/brain/Dockerfile .
docker build -t automatedlinkedin-body:local -f apps/body/Dockerfile \
  --build-arg VITE_API_URL=http://api.automatedlinkedin.local \
  --build-arg VITE_AUTHENTIK_URL=http://auth.automatedlinkedin.local \
  --build-arg VITE_AUTHENTIK_CLIENT_ID=automatedlinkedin \
  --build-arg VITE_AUTHENTIK_APP_SLUG=automatedlinkedin \
  --build-arg VITE_AUTHENTIK_ENROLLMENT_SLUG=automatedlinkedin-enrollment .

minikube start --cpus=4 --memory=4096 --driver=docker
minikube addons enable ingress

for img in automatedlinkedin-brain automatedlinkedin-brain-migrate automatedlinkedin-body; do
  minikube image load "$img:local"
done
```

The SPA bakes its URLs at build time, so changing a hostname means rebuilding `body`.

## 4. Apply

```sh
cd deploy/overlays/local
cp config.example.env config.env
cp secrets.example.env secrets.env
cd -

kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/local | kubectl apply -f -
kubectl -n automatedlinkedin get pods -w
```

The authentik image is large; the first start takes several minutes.

## 5. Reach it

minikube's node IP is not routable from macOS with the docker driver, so forward the ingress
controller. For browser use the hostnames must resolve on port 80, which needs `sudo`:

```sh
echo "127.0.0.1 app.automatedlinkedin.local api.automatedlinkedin.local auth.automatedlinkedin.local" \
  | sudo tee -a /etc/hosts

sudo kubectl port-forward --address 127.0.0.1 -n ingress-nginx svc/ingress-nginx-controller 80:80
```

Then open http://app.automatedlinkedin.local.

For a quick check without `sudo` or hosts entries, forward to 8080 and send the `Host` header:

```sh
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80 &

curl -H 'Host: app.automatedlinkedin.local' http://127.0.0.1:8080/
curl -H 'Host: api.automatedlinkedin.local' http://127.0.0.1:8080/readyz
curl -H 'Host: auth.automatedlinkedin.local' http://127.0.0.1:8080/-/health/live/
```

`/readyz` returning `{"status":"ok","database":"up"}` proves Prisma reached the host database
through the cluster.

## 6. Apply the blueprint for the local hostnames

The worker applies it on boot, but if compose overwrote the redirect URIs, re-run it:

```sh
kubectl -n automatedlinkedin exec deploy/authentik-worker -- ak apply_blueprint custom/automatedlinkedin.yaml
```

Verify they point at the local host:

```sh
docker compose exec -T -e PGPASSWORD=authentik postgres psql -U authentik -d authentik -t \
  -c "select _redirect_uris from authentik_providers_oauth2_oauth2provider where client_id='automatedlinkedin'"
```

## Rebuilding after a code change

```sh
docker build -t automatedlinkedin-brain:local -f apps/brain/Dockerfile .
minikube image load automatedlinkedin-brain:local
kubectl -n automatedlinkedin rollout restart deploy/brain
```

## Tear down

```sh
kubectl delete namespace automatedlinkedin
minikube delete
docker compose up -d postgres authentik-server authentik-worker   # back to compose
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `CreateContainerConfigError`, "image has non-numeric user" | The manifest needs `runAsUser: 1000`; already set on `brain`. |
| Build dies with `rpc error ... EOF` | Docker ran out of memory. Build with minikube stopped. |
| Init container cannot reach the database | Step 1 was skipped, or `host.minikube.internal` is wrong for your driver. |
| Redirect URIs keep reverting to `localhost:3000` | The compose authentik worker is running. See step 2. |
| `ImagePullBackOff` on a local image | `minikube image load` was skipped. |
