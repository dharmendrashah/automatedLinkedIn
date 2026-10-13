"""Smart shutdown for the staging node pool.

Each run reads the recent logs of the brain API, the spider API and the spider worker. If none of them logged real
activity for IDLE_MINUTES, the staging node pool is scaled to zero, which stops the VM bill.

What counts as activity:
  brain                       any request or job line, except health checks and known retry noise
  spider-api, spider-worker   only the job lines "spider job started / still running / finished"
Authentik is not read: sign-ins only count once they reach brain.

The checker does nothing while a deploy holds the lock (deploy_lock_until in the state ConfigMap), and it only acts
when the node pool has exactly one node.

SMART_SHUTDOWN_MODE:
  dry-run   log what would happen and never change the cluster (default)
  enforce   scale the node pool to zero when the idle limit is reached

Environment:
  SMART_SHUTDOWN_ENABLED   "true" to run the checks at all (default "false")
  SMART_SHUTDOWN_MODE      "dry-run" (default) or "enforce"
  IDLE_MINUTES             minutes without activity before shutdown (default 45, allowed 5 to 1440)
  ACTIVITY_WINDOW_SECONDS  how much recent log each run reads (default 600, allowed 60 to 3600)
  NAMESPACE                Kubernetes namespace (default automatedlinkedin)
  GCP_PROJECT, GKE_CLUSTER, GKE_LOCATION, GKE_NODE_POOL   the node pool to watch and, in enforce mode, scale

Exit status is 0 after a completed run and 1 on any error. Errors never shut anything down.
"""

import datetime as dt
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

ACTIVITY_APPS = ("brain", "spider-api", "spider-worker")
SPIDER_APPS = ("spider-api", "spider-worker")
JOB_MARKERS = ("spider job started", "spider job still running", "spider job finished")
NOISE_MARKERS = (
    "/health",
    "/healthz",
    "/readyz",
    "Could not consume validation results",
    "ECONNREFUSED",
)
DEFAULT_IDLE_MINUTES = 45
MIN_IDLE_MINUTES = 5
MAX_IDLE_MINUTES = 1440
DEFAULT_WINDOW_SECONDS = 600
MIN_WINDOW_SECONDS = 60
MAX_WINDOW_SECONDS = 3600
STATE_CONFIGMAP = "idle-shutdown-state"
LAST_ACTIVE_KEY = "last_active"
DEPLOY_LOCK_KEY = "deploy_lock_until"
NODE_POOL_LABEL = "cloud.google.com/gke-nodepool"
SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
KUBERNETES_BASE = "https://kubernetes.default.svc"
METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
CONTAINER_API_BASE = "https://container.googleapis.com/v1"


class ConfigError(Exception):
    pass


def parse_int(raw: str, name: str, low: int, high: int) -> int:
    try:
        value = int(raw.strip())
    except ValueError as error:
        raise ConfigError(f"{name} must be a whole number, got {raw!r}") from error
    if not low <= value <= high:
        raise ConfigError(f"{name} must be between {low} and {high}, got {value}")
    return value


@dataclass(frozen=True)
class Config:
    enabled: bool
    mode: str
    idle_minutes: int
    window_seconds: int
    namespace: str
    project: str
    cluster: str
    location: str
    node_pool: str

    @classmethod
    def from_env(cls, env: dict) -> "Config":
        mode = env.get("SMART_SHUTDOWN_MODE", "dry-run").strip() or "dry-run"
        if mode not in ("dry-run", "enforce"):
            raise ConfigError(f"SMART_SHUTDOWN_MODE must be dry-run or enforce, got {mode!r}")
        config = cls(
            enabled=env.get("SMART_SHUTDOWN_ENABLED", "false").strip().lower() == "true",
            mode=mode,
            idle_minutes=parse_int(env.get("IDLE_MINUTES", str(DEFAULT_IDLE_MINUTES)), "IDLE_MINUTES", MIN_IDLE_MINUTES, MAX_IDLE_MINUTES),
            window_seconds=parse_int(
                env.get("ACTIVITY_WINDOW_SECONDS", str(DEFAULT_WINDOW_SECONDS)),
                "ACTIVITY_WINDOW_SECONDS",
                MIN_WINDOW_SECONDS,
                MAX_WINDOW_SECONDS,
            ),
            namespace=env.get("NAMESPACE", "automatedlinkedin").strip(),
            project=env.get("GCP_PROJECT", "").strip(),
            cluster=env.get("GKE_CLUSTER", "").strip(),
            location=env.get("GKE_LOCATION", "").strip(),
            node_pool=env.get("GKE_NODE_POOL", "").strip(),
        )
        if not config.node_pool:
            raise ConfigError("GKE_NODE_POOL is required")
        if config.mode == "enforce" and not all([config.project, config.cluster, config.location]):
            raise ConfigError("enforce mode needs GCP_PROJECT, GKE_CLUSTER and GKE_LOCATION")
        return config


def is_activity(line: str) -> bool:
    text = line.strip()
    if not text:
        return False
    return not any(marker in text for marker in NOISE_MARKERS)


def is_job_line(line: str) -> bool:
    return any(marker in line for marker in JOB_MARKERS)


def counts_as_activity(app: str, line: str) -> bool:
    if app in SPIDER_APPS:
        return is_job_line(line)
    return is_activity(line)


def count_activity(app: str, lines: list[str]) -> int:
    return sum(1 for line in lines if counts_as_activity(app, line))


@dataclass(frozen=True)
class Decision:
    action: str  # "active", "idle" or "shutdown"
    last_active: dt.datetime


def decide(now: dt.datetime, last_active: Optional[dt.datetime], activity: int, idle_minutes: int) -> Decision:
    if activity > 0:
        return Decision("active", now)
    if last_active is None:
        # First quiet run: start the idle timer now.
        return Decision("idle", now)
    if now - last_active >= dt.timedelta(minutes=idle_minutes):
        return Decision("shutdown", last_active)
    return Decision("idle", last_active)


def parse_time(raw: Optional[str]) -> Optional[dt.datetime]:
    if not raw:
        return None
    return dt.datetime.fromisoformat(raw)


def format_time(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat()


class HttpClient:
    """Small HTTP helper. The opener is injected so tests can replace the network."""

    def __init__(self, opener) -> None:
        self.opener = opener

    def request(self, method: str, url: str, headers: dict, body: Optional[bytes] = None) -> tuple[int, bytes]:
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=20) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.read()


class Kubernetes:
    def __init__(self, http: HttpClient, token: str, base: str = KUBERNETES_BASE) -> None:
        self.http = http
        self.token = token
        self.base = base

    def _headers(self, content_type: Optional[str] = None) -> dict:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def pod_names(self, namespace: str, app: str) -> list[str]:
        query = urllib.parse.urlencode({"labelSelector": f"app.kubernetes.io/name={app}"})
        status, raw = self.http.request("GET", f"{self.base}/api/v1/namespaces/{namespace}/pods?{query}", self._headers())
        if status != 200:
            raise RuntimeError(f"listing {app} pods failed with HTTP {status}")
        return [item["metadata"]["name"] for item in json.loads(raw)["items"]]

    def recent_lines(self, namespace: str, pod: str, since_seconds: int) -> list[str]:
        query = urllib.parse.urlencode({"sinceSeconds": since_seconds})
        status, raw = self.http.request(
            "GET", f"{self.base}/api/v1/namespaces/{namespace}/pods/{pod}/log?{query}", self._headers()
        )
        if status != 200:
            raise RuntimeError(f"reading logs of {pod} failed with HTTP {status}")
        return raw.decode(errors="replace").splitlines()

    def node_count(self, node_pool: str) -> int:
        query = urllib.parse.urlencode({"labelSelector": f"{NODE_POOL_LABEL}={node_pool}"})
        status, raw = self.http.request("GET", f"{self.base}/api/v1/nodes?{query}", self._headers())
        if status != 200:
            raise RuntimeError(f"listing nodes failed with HTTP {status}")
        return len(json.loads(raw)["items"])

    def read_state(self, namespace: str, key: str) -> Optional[str]:
        status, raw = self.http.request(
            "GET", f"{self.base}/api/v1/namespaces/{namespace}/configmaps/{STATE_CONFIGMAP}", self._headers()
        )
        if status == 404:
            return None
        if status != 200:
            raise RuntimeError(f"reading {STATE_CONFIGMAP} failed with HTTP {status}")
        return json.loads(raw).get("data", {}).get(key)

    def write_state(self, namespace: str, key: str, value: str) -> None:
        status, _ = self.http.request(
            "GET", f"{self.base}/api/v1/namespaces/{namespace}/configmaps/{STATE_CONFIGMAP}", self._headers()
        )
        if status == 404:
            body = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": STATE_CONFIGMAP, "namespace": namespace},
                "data": {key: value},
            }
            status, _ = self.http.request(
                "POST",
                f"{self.base}/api/v1/namespaces/{namespace}/configmaps",
                self._headers("application/json"),
                json.dumps(body).encode(),
            )
        else:
            status, _ = self.http.request(
                "PATCH",
                f"{self.base}/api/v1/namespaces/{namespace}/configmaps/{STATE_CONFIGMAP}",
                self._headers("application/merge-patch+json"),
                json.dumps({"data": {key: value}}).encode(),
            )
        if status not in (200, 201):
            raise RuntimeError(f"saving {STATE_CONFIGMAP} failed with HTTP {status}")


class NodePools:
    def __init__(self, http: HttpClient, token: str, base: str = CONTAINER_API_BASE) -> None:
        self.http = http
        self.token = token
        self.base = base

    def set_size(self, project: str, location: str, cluster: str, node_pool: str, count: int) -> None:
        url = (
            f"{self.base}/projects/{project}/locations/{location}/clusters/{cluster}"
            f"/nodePools/{node_pool}:setSize"
        )
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        status, raw = self.http.request("POST", url, headers, json.dumps({"nodeCount": count}).encode())
        if status != 200:
            raise RuntimeError(f"resizing node pool {node_pool} to {count} failed with HTTP {status}: {raw[:200]!r}")


def run(config: Config, kube, pools, now: dt.datetime) -> str:
    if not config.enabled:
        return "disabled"

    lock = parse_time(kube.read_state(config.namespace, DEPLOY_LOCK_KEY))
    if lock is not None and now < lock:
        return "deploy-in-progress"

    nodes = kube.node_count(config.node_pool)
    if nodes != 1:
        return f"skipped-nodes-{nodes}"

    activity = 0
    for app in ACTIVITY_APPS:
        for pod in kube.pod_names(config.namespace, app):
            activity += count_activity(app, kube.recent_lines(config.namespace, pod, config.window_seconds))

    last_active = parse_time(kube.read_state(config.namespace, LAST_ACTIVE_KEY))
    decision = decide(now, last_active, activity, config.idle_minutes)
    kube.write_state(config.namespace, LAST_ACTIVE_KEY, format_time(decision.last_active))

    if decision.action != "shutdown":
        return decision.action
    if config.mode == "dry-run":
        return "would-shutdown"
    pools.set_size(config.project, config.location, config.cluster, config.node_pool, 0)
    return "shutdown"


def metadata_token(http: HttpClient) -> str:
    status, raw = http.request("GET", METADATA_TOKEN_URL, {"Metadata-Flavor": "Google"})
    if status != 200:
        raise RuntimeError(f"reading the workload identity token failed with HTTP {status}")
    return json.loads(raw)["access_token"]


def service_account_token() -> str:
    with open(os.path.join(SERVICE_ACCOUNT_DIR, "token"), encoding="utf-8") as handle:
        return handle.read().strip()


def cluster_opener():
    context = ssl.create_default_context(cafile=os.path.join(SERVICE_ACCOUNT_DIR, "ca.crt"))
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=context))


def main() -> int:
    try:
        config = Config.from_env(dict(os.environ))
        if not config.enabled:
            print("smart shutdown is disabled (SMART_SHUTDOWN_ENABLED is not true)", flush=True)
            return 0
        kube = Kubernetes(HttpClient(cluster_opener()), service_account_token())
        pools = None
        if config.mode == "enforce":
            pools = NodePools(HttpClient(urllib.request.build_opener()), metadata_token(HttpClient(urllib.request.build_opener())))
        result = run(config, kube, pools, dt.datetime.now(dt.timezone.utc))
        print(f"smart shutdown ({config.mode}, idle limit {config.idle_minutes} min): {result}", flush=True)
        return 0
    except (ConfigError, RuntimeError, OSError, ValueError, KeyError) as error:
        print(f"smart shutdown failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
