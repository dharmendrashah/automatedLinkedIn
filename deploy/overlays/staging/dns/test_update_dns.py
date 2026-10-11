"""Tests for update_dns.py against a local mock of the Cloudflare API and the Kubernetes API.

Run with: python3 -m unittest deploy/overlays/staging/dns/test_update_dns.py
"""

import json
import os
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT = Path(__file__).with_name("update_dns.py")
TOKEN = "test-token-do-not-print"
ZONE = "zone123"
NAME = "app.staging.example.com"
NODE_NAME = "gke-staging-asia-default-pool-test"


class MockServers:
    def __init__(self) -> None:
        self.node_ip = "34.47.216.69"
        self.node_status = 200
        self.records: list[dict] = []
        self.api_status = 200
        self.api_errors: list[str] = []
        self.calls: list[tuple[str, str, dict | None, str]] = []
        self.next_id = 1
        servers = self

        class K8sApi(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                body = json.dumps(
                    {"status": {"addresses": [{"type": "ExternalIP", "address": servers.node_ip}]}}
                ).encode()
                self.send_response(servers.node_status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args) -> None:  # noqa: D401
                return

        class Api(BaseHTTPRequestHandler):
            def _body(self) -> dict | None:
                length = int(self.headers.get("Content-Length", 0) or 0)
                return json.loads(self.rfile.read(length)) if length else None

            def _reply(self, status: int, payload: dict) -> None:
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _record(self, method: str) -> None:
                body = self._body()
                servers.calls.append((method, self.path, body, self.headers.get("Authorization", "")))
                if servers.api_status != 200:
                    self._reply(servers.api_status, {"success": False, "errors": [{"message": servers.api_errors[0]}], "result": None})
                    return
                if method == "GET":
                    self._reply(200, {"success": True, "errors": [], "result": list(servers.records)})
                elif method == "POST":
                    record = {**body, "id": f"rec{servers.next_id}"}
                    servers.next_id += 1
                    servers.records.append(record)
                    self._reply(200, {"success": True, "errors": [], "result": record})
                elif method == "PATCH":
                    record_id = self.path.rsplit("/", 1)[-1]
                    for index, record in enumerate(servers.records):
                        if record["id"] == record_id:
                            servers.records[index] = {**record, **body}
                    self._reply(200, {"success": True, "errors": [], "result": body})

            def do_GET(self) -> None:  # noqa: N802
                self._record("GET")

            def do_POST(self) -> None:  # noqa: N802
                self._record("POST")

            def do_PATCH(self) -> None:  # noqa: N802
                self._record("PATCH")

            def log_message(self, *args) -> None:  # noqa: D401
                return

        self.k8s = HTTPServer(("127.0.0.1", 0), K8sApi)
        self.api = HTTPServer(("127.0.0.1", 0), Api)
        for server in (self.k8s, self.api):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @property
    def k8s_api_url(self) -> str:
        return f"http://127.0.0.1:{self.k8s.server_port}"

    @property
    def api_base(self) -> str:
        return f"http://127.0.0.1:{self.api.server_port}/client/v4"

    def stop(self) -> None:
        self.k8s.shutdown()
        self.api.shutdown()


def run_script(servers: MockServers, **overrides: str | None) -> subprocess.CompletedProcess:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "CF_API_TOKEN": TOKEN,
        "CF_ZONE_ID": ZONE,
        "RECORD_NAME": NAME,
        "NODE_NAME": NODE_NAME,
        "K8S_API_URL": servers.k8s_api_url,
        "K8S_API_TOKEN": "test-k8s-token",
        "CF_API_BASE": servers.api_base,
    }
    for key, value in overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return subprocess.run([sys.executable, str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60)


class UpdateDnsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.servers = MockServers()

    def tearDown(self) -> None:
        self.servers.stop()

    def writes(self) -> list[tuple[str, str, dict | None, str]]:
        return [call for call in self.servers.calls if call[0] in ("POST", "PATCH")]

    def test_creates_the_record_when_it_does_not_exist(self) -> None:
        result = run_script(self.servers)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("created A", result.stdout)
        method, path, body, _ = self.writes()[0]
        self.assertEqual(method, "POST")
        self.assertEqual(body, {"type": "A", "name": NAME, "content": "34.47.216.69", "ttl": 60, "proxied": False})

    def test_leaves_a_correct_record_alone(self) -> None:
        self.servers.records = [{"id": "rec0", "type": "A", "name": NAME, "content": "34.47.216.69", "ttl": 60, "proxied": False}]

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("unchanged", result.stdout)
        self.assertEqual(self.writes(), [])

    def test_updates_the_record_when_the_node_ip_changed(self) -> None:
        self.servers.records = [{"id": "rec0", "type": "A", "name": NAME, "content": "136.113.71.250", "ttl": 60, "proxied": False}]

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("updated A", result.stdout)
        self.assertIn("136.113.71.250 -> 34.47.216.69", result.stdout)
        method, path, body, _ = self.writes()[0]
        self.assertEqual((method, path), ("PATCH", f"/client/v4/zones/{ZONE}/dns_records/rec0"))
        self.assertEqual(body["content"], "34.47.216.69")

    def test_turns_off_the_proxy_on_an_existing_record(self) -> None:
        self.servers.records = [{"id": "rec0", "type": "A", "name": NAME, "content": "34.47.216.69", "ttl": 60, "proxied": True}]

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("updated A", result.stdout)
        self.assertIs(self.writes()[0][2]["proxied"], False)

    def test_refuses_when_several_records_match_the_name(self) -> None:
        self.servers.records = [
            {"id": "rec1", "type": "A", "name": NAME, "content": "1.1.1.1", "ttl": 60, "proxied": False},
            {"id": "rec2", "type": "A", "name": NAME, "content": "2.2.2.2", "ttl": 60, "proxied": False},
        ]

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 1)
        self.assertIn("2 A records", result.stderr)
        self.assertEqual(self.writes(), [])

    def test_refuses_a_private_address_from_the_kubernetes_api(self) -> None:
        self.servers.node_ip = "10.160.0.3"

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 1)
        self.assertIn("non-public", result.stderr)
        self.assertEqual(self.servers.calls, [])

    def test_refuses_a_malformed_kubernetes_api_response(self) -> None:
        self.servers.node_ip = "not-an-ip"

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid IPv4", result.stderr)
        self.assertEqual(self.servers.calls, [])

    def test_fails_when_the_node_has_no_external_ip(self) -> None:
        self.servers.node_status = 404

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 1)
        self.assertIn("could not read node", result.stderr)
        self.assertEqual(self.servers.calls, [])

    def test_fails_when_node_name_is_missing(self) -> None:
        result = run_script(self.servers, NODE_NAME=None)

        self.assertEqual(result.returncode, 1)
        self.assertIn("NODE_NAME is not set", result.stderr)
        self.assertEqual(self.servers.calls, [])

    def test_reports_api_errors_without_printing_the_token(self) -> None:
        self.servers.api_status = 403
        self.servers.api_errors = ["Authentication error"]

        result = run_script(self.servers)

        self.assertEqual(result.returncode, 1)
        self.assertIn("Authentication error", result.stderr)
        self.assertNotIn(TOKEN, result.stdout + result.stderr)

    def test_fails_when_the_token_is_missing(self) -> None:
        result = run_script(self.servers, CF_API_TOKEN=None)

        self.assertEqual(result.returncode, 1)
        self.assertIn("CF_API_TOKEN is not set", result.stderr)
        self.assertEqual(self.servers.calls, [])

    def test_sends_the_token_as_a_bearer_header(self) -> None:
        run_script(self.servers)

        self.assertTrue(all(call[3] == f"Bearer {TOKEN}" for call in self.servers.calls))


if __name__ == "__main__":
    unittest.main()
