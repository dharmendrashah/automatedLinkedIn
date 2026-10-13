"""Tests for idle_shutdown.py. Run with: python3 -m unittest deploy/overlays/staging/idle-shutdown/test_idle_shutdown.py"""

import datetime as dt
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import idle_shutdown as ids  # noqa: E402

NOW = dt.datetime(2026, 10, 13, 12, 0, tzinfo=dt.timezone.utc)
BASE_ENV = {
    "SMART_SHUTDOWN_ENABLED": "true",
    "SMART_SHUTDOWN_MODE": "dry-run",
    "IDLE_MINUTES": "45",
    "GCP_PROJECT": "automate-linkedin-511215",
    "GKE_CLUSTER": "staging-asia",
    "GKE_LOCATION": "asia-south1-b",
    "GKE_NODE_POOL": "big-pool",
}
JOB_START = "spider job started: Task 0d9f"
JOB_HEARTBEAT = "spider job still running: Task 0d9f"
JOB_END = "spider job finished: Task 0d9f"


class FakeKube:
    def __init__(self, lines_by_app=None, state=None, nodes=1):
        self.lines_by_app = lines_by_app or {}
        self.state = dict(state or {})
        self.nodes = nodes
        self.writes = []

    def pod_names(self, namespace, app):
        return [f"{app}-pod"] if app in self.lines_by_app else []

    def recent_lines(self, namespace, pod, since_seconds):
        lines = self.lines_by_app[pod.removesuffix("-pod")]
        if lines is None:
            raise ids.PodNotReady(pod)
        return lines

    def read_state(self, namespace, key):
        return self.state.get(key)

    def write_state(self, namespace, key, value):
        self.writes.append((key, value))
        self.state[key] = value

    def node_count(self, node_pool):
        return self.nodes


class FakePools:
    def __init__(self):
        self.calls = []

    def set_size(self, project, location, cluster, node_pool, count):
        self.calls.append((project, location, cluster, node_pool, count))


class FakeOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout=None):
        self.requests.append(request)
        status, body = self.responses.pop(0)
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, "error", {}, None)

        class Response:
            def __init__(self):
                self.status = status

            def read(self):
                return body

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Response()


class ConfigTests(unittest.TestCase):
    def test_defaults_to_disabled_dry_run_with_45_minutes(self):
        config = ids.Config.from_env(dict(BASE_ENV, SMART_SHUTDOWN_ENABLED="false", SMART_SHUTDOWN_MODE=""))

        self.assertFalse(config.enabled)
        self.assertEqual(config.idle_minutes, 45)

    def test_idle_minutes_can_be_raised_from_the_environment(self):
        self.assertEqual(ids.Config.from_env({**BASE_ENV, "IDLE_MINUTES": "60"}).idle_minutes, 60)

    def test_rejects_idle_minutes_outside_the_allowed_range(self):
        with self.assertRaises(ids.ConfigError):
            ids.Config.from_env({**BASE_ENV, "IDLE_MINUTES": "2"})
        with self.assertRaises(ids.ConfigError):
            ids.Config.from_env({**BASE_ENV, "IDLE_MINUTES": "5000"})

    def test_rejects_a_non_numeric_idle_limit(self):
        with self.assertRaises(ids.ConfigError):
            ids.Config.from_env({**BASE_ENV, "IDLE_MINUTES": "forty"})

    def test_rejects_an_unknown_mode(self):
        with self.assertRaises(ids.ConfigError):
            ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "yes-please"})

    def test_always_needs_the_node_pool_name(self):
        with self.assertRaises(ids.ConfigError):
            ids.Config.from_env({**BASE_ENV, "GKE_NODE_POOL": ""})


class ActivityTests(unittest.TestCase):
    def test_health_checks_are_not_activity_for_brain(self):
        lines = ['{"req":{"url":"/health"},"msg":"incoming request"}', "GET /healthz 200", "GET /readyz 503"]

        self.assertEqual(ids.count_activity("brain", lines), 0)

    def test_known_retry_noise_is_not_activity_for_brain(self):
        lines = [
            "Could not consume validation results: connect ECONNREFUSED 34.118.226.7:5672",
            "spider worker could not start: connect ECONNREFUSED 34.118.226.7:5672",
        ]

        self.assertEqual(ids.count_activity("brain", lines), 0)

    def test_real_requests_are_activity_for_brain(self):
        lines = ['{"req":{"method":"POST","url":"/trpc/me"},"msg":"request completed"}', ""]

        self.assertEqual(ids.count_activity("brain", lines), 1)

    def test_spider_counts_only_job_lines(self):
        lines = [
            '{"req":{"url":"/tasks"},"msg":"incoming request"}',
            "spider worker is waiting for tasks",
            JOB_START,
            JOB_HEARTBEAT,
            JOB_END,
        ]

        self.assertEqual(ids.count_activity("spider-worker", lines), 3)
        self.assertEqual(ids.count_activity("spider-api", lines), 3)

    def test_spider_idle_polling_is_not_activity(self):
        lines = ["spider worker is waiting for tasks", '{"req":{"url":"/health"}}']

        self.assertEqual(ids.count_activity("spider-worker", lines), 0)


class DecideTests(unittest.TestCase):
    def test_activity_resets_the_timer(self):
        decision = ids.decide(NOW, NOW - dt.timedelta(minutes=30), activity=3, idle_minutes=45)

        self.assertEqual(decision.action, "active")
        self.assertEqual(decision.last_active, NOW)

    def test_first_quiet_run_starts_the_timer_and_does_not_shut_down(self):
        decision = ids.decide(NOW, None, activity=0, idle_minutes=45)

        self.assertEqual(decision.action, "idle")
        self.assertEqual(decision.last_active, NOW)

    def test_quiet_but_within_the_limit_is_idle(self):
        last = NOW - dt.timedelta(minutes=44)

        decision = ids.decide(NOW, last, activity=0, idle_minutes=45)

        self.assertEqual(decision.action, "idle")
        self.assertEqual(decision.last_active, last)

    def test_quiet_for_the_full_limit_triggers_shutdown(self):
        last = NOW - dt.timedelta(minutes=45)

        self.assertEqual(ids.decide(NOW, last, activity=0, idle_minutes=45).action, "shutdown")

    def test_a_longer_limit_from_the_environment_is_respected(self):
        last = NOW - dt.timedelta(minutes=50)

        self.assertEqual(ids.decide(NOW, last, activity=0, idle_minutes=60).action, "idle")
        self.assertEqual(ids.decide(NOW, last, activity=0, idle_minutes=45).action, "shutdown")


class RunTests(unittest.TestCase):
    def test_disabled_does_nothing(self):
        kube = FakeKube({"brain": []})
        pools = FakePools()

        result = ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_ENABLED": "false"}), kube, pools, NOW)

        self.assertEqual(result, "disabled")
        self.assertEqual(kube.writes, [])
        self.assertEqual(pools.calls, [])

    def test_a_deploy_in_progress_blocks_shutdown(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        lock = (NOW + dt.timedelta(minutes=10)).isoformat()
        kube = FakeKube({"brain": []}, state={"last_active": old, "deploy_lock_until": lock})
        pools = FakePools()

        result = ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW)

        self.assertEqual(result, "deploy-in-progress")
        self.assertEqual(pools.calls, [])

    def test_an_expired_deploy_lock_does_not_block(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        lock = (NOW - dt.timedelta(minutes=1)).isoformat()
        kube = FakeKube({"brain": [], "spider-api": [], "spider-worker": []}, state={"last_active": old, "deploy_lock_until": lock})

        self.assertEqual(ids.run(ids.Config.from_env(BASE_ENV), kube, FakePools(), NOW), "would-shutdown")

    def test_only_acts_when_the_pool_has_exactly_one_node(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        for nodes in (0, 2):
            kube = FakeKube({"brain": []}, state={"last_active": old}, nodes=nodes)
            pools = FakePools()

            result = ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW)

            self.assertEqual(result, f"skipped-nodes-{nodes}")
            self.assertEqual(pools.calls, [])

    def test_activity_is_recorded_and_no_shutdown_happens(self):
        kube = FakeKube({"brain": ['{"msg":"request completed"}'], "spider-api": [], "spider-worker": []})
        pools = FakePools()

        result = ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW)

        self.assertEqual(result, "active")
        self.assertEqual(kube.writes, [("last_active", NOW.isoformat())])
        self.assertEqual(pools.calls, [])

    def test_a_running_spider_job_keeps_the_pool_on(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        kube = FakeKube({"brain": [], "spider-api": [], "spider-worker": [JOB_HEARTBEAT]}, state={"last_active": old})
        pools = FakePools()

        self.assertEqual(ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW), "active")
        self.assertEqual(pools.calls, [])

    def test_dry_run_reports_the_shutdown_but_changes_nothing(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        kube = FakeKube({"brain": [], "spider-api": [], "spider-worker": []}, state={"last_active": old})
        pools = FakePools()

        self.assertEqual(ids.run(ids.Config.from_env(BASE_ENV), kube, pools, NOW), "would-shutdown")
        self.assertEqual(pools.calls, [])

    def test_enforce_scales_the_node_pool_to_zero_once_idle(self):
        old = (NOW - dt.timedelta(minutes=50)).isoformat()
        kube = FakeKube({"brain": [], "spider-api": [], "spider-worker": []}, state={"last_active": old})
        pools = FakePools()

        self.assertEqual(ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW), "shutdown")
        self.assertEqual(pools.calls, [("automate-linkedin-511215", "asia-south1-b", "staging-asia", "big-pool", 0)])

    def test_first_run_never_shuts_down(self):
        kube = FakeKube({"brain": [], "spider-api": [], "spider-worker": []})
        pools = FakePools()

        self.assertEqual(ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW), "idle")
        self.assertEqual(pools.calls, [])


class NodePoolRequestTests(unittest.TestCase):
    def test_set_size_posts_the_node_count_to_the_pool_endpoint(self):
        opener = FakeOpener([(200, b"{}")])

        ids.NodePools(ids.HttpClient(opener), token="tok").set_size(
            "automate-linkedin-511215", "asia-south1-b", "staging-asia", "big-pool", 0
        )

        request = opener.requests[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(
            request.full_url,
            "https://container.googleapis.com/v1/projects/automate-linkedin-511215/locations/asia-south1-b"
            "/clusters/staging-asia/nodePools/big-pool:setSize",
        )
        self.assertEqual(json.loads(request.data), {"nodeCount": 0})
        self.assertEqual(request.get_header("Authorization"), "Bearer tok")

    def test_set_size_fails_loudly_on_an_api_error(self):
        with self.assertRaises(RuntimeError):
            ids.NodePools(ids.HttpClient(FakeOpener([(403, b"permission denied")])), token="tok").set_size("p", "l", "c", "np", 0)


class PodsStartingTests(unittest.TestCase):
    def test_a_pod_whose_logs_are_not_available_yet_pauses_the_checker(self):
        kube = FakeKube({"brain": []}, state={"last_active": (NOW - dt.timedelta(minutes=50)).isoformat()})
        kube.lines_by_app["brain"] = None  # simulates a container still starting (HTTP 400 from the logs API)
        pools = FakePools()

        result = ids.run(ids.Config.from_env({**BASE_ENV, "SMART_SHUTDOWN_MODE": "enforce"}), kube, pools, NOW)

        self.assertEqual(result, "pods-starting")
        self.assertEqual(pools.calls, [])
        self.assertEqual(kube.writes, [])


class KubernetesStateTests(unittest.TestCase):
    def test_creates_the_state_configmap_when_it_is_missing(self):
        opener = FakeOpener([(404, b""), (201, b"{}")])

        ids.Kubernetes(ids.HttpClient(opener), token="tok").write_state("automatedlinkedin", "last_active", "2026-10-13T12:00:00+00:00")

        post = opener.requests[1]
        self.assertEqual(post.get_method(), "POST")
        body = json.loads(post.data)
        self.assertEqual(body["metadata"]["name"], "idle-shutdown-state")
        self.assertEqual(body["data"]["last_active"], "2026-10-13T12:00:00+00:00")

    def test_patches_the_state_configmap_when_it_exists(self):
        opener = FakeOpener([(200, b"{}"), (200, b"{}")])

        ids.Kubernetes(ids.HttpClient(opener), token="tok").write_state("automatedlinkedin", "deploy_lock_until", "x")

        patch = opener.requests[1]
        self.assertEqual(patch.get_method(), "PATCH")
        self.assertEqual(patch.get_header("Content-type"), "application/merge-patch+json")
        self.assertEqual(json.loads(patch.data), {"data": {"deploy_lock_until": "x"}})

    def test_missing_state_reads_as_none(self):
        opener = FakeOpener([(404, b"")])

        self.assertIsNone(ids.Kubernetes(ids.HttpClient(opener), token="tok").read_state("automatedlinkedin", "last_active"))

    def test_counts_the_nodes_of_the_pool(self):
        opener = FakeOpener([(200, json.dumps({"items": [{}, {}]}).encode())])

        self.assertEqual(ids.Kubernetes(ids.HttpClient(opener), token="tok").node_count("big-pool"), 2)
        self.assertIn("cloud.google.com%2Fgke-nodepool%3Dbig-pool", opener.requests[0].full_url)


if __name__ == "__main__":
    unittest.main()
