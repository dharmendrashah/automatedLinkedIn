"""Keep a Cloudflare A record pointed at this GKE node's external IP.

Runs as a CronJob in the staging cluster. The node's external IP changes when a Spot node
is replaced, so the record is checked on every run and updated only when it differs.

Environment:
  CF_API_TOKEN   Cloudflare API token with Zone -> DNS -> Edit on the zone (required)
  CF_ZONE_ID     Cloudflare zone ID (required)
  RECORD_NAME    fully qualified A record name, for example app.staging.example.com (required)
  METADATA_URL   GCE metadata URL for the external IP (defaults to the node's IP)
  CF_API_BASE    Cloudflare API base URL (defaults to the public API; tests override it)

Exit status is 0 when the record is correct afterwards, 1 on any error. The token is never printed.
"""

import ipaddress
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_METADATA_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip"
)
DEFAULT_API_BASE = "https://api.cloudflare.com/client/v4"
TTL_SECONDS = 60


class UpdateError(Exception):
    pass


def require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise UpdateError(f"{name} is not set")
    return value


def node_external_ip(metadata_url: str) -> str:
    request = urllib.request.Request(metadata_url, headers={"Metadata-Flavor": "Google"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode().strip()
    except (urllib.error.URLError, TimeoutError) as error:
        raise UpdateError(f"could not read the node IP from the metadata server: {error}") from error
    try:
        address = ipaddress.IPv4Address(raw)
    except ValueError as error:
        raise UpdateError(f"metadata returned an invalid IPv4 address: {raw!r}") from error
    if address.is_private or address.is_unspecified or address.is_loopback:
        raise UpdateError(f"refusing to publish a non-public address: {address}")
    return str(address)


class Cloudflare:
    def __init__(self, base: str, token: str, zone_id: str) -> None:
        self.base = base.rstrip("/")
        self.token = token
        self.zone_id = zone_id

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")
        request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            payload = _safe_json(error.read())
            raise UpdateError(f"Cloudflare {method} {path} failed with HTTP {error.code}: {_errors(payload)}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise UpdateError(f"Cloudflare {method} {path} could not be reached: {error}") from error
        if not payload.get("success", False):
            raise UpdateError(f"Cloudflare {method} {path} reported failure: {_errors(payload)}")
        return payload

    def a_records(self, name: str) -> list[dict]:
        query = urllib.parse.urlencode({"type": "A", "name": name})
        payload = self.call("GET", f"/zones/{self.zone_id}/dns_records?{query}")
        return payload.get("result", [])


def _safe_json(raw: bytes) -> dict:
    try:
        return json.loads(raw or b"{}")
    except ValueError:
        return {}


def _errors(payload: dict) -> str:
    errors = payload.get("errors") or []
    messages = [str(item.get("message", "")) for item in errors if isinstance(item, dict)]
    return "; ".join(message for message in messages if message) or "no details returned"


def sync(cloudflare: Cloudflare, name: str, ip: str) -> str:
    records = cloudflare.a_records(name)
    if len(records) > 1:
        raise UpdateError(f"{len(records)} A records named {name} exist; resolve the duplicate in Cloudflare first")

    desired = {"type": "A", "name": name, "content": ip, "ttl": TTL_SECONDS, "proxied": False}

    if not records:
        cloudflare.call("POST", f"/zones/{cloudflare.zone_id}/dns_records", desired)
        return f"created A {name} -> {ip}"

    current = records[0]
    if current.get("content") == ip and current.get("proxied") is False and current.get("ttl") == TTL_SECONDS:
        return f"unchanged: A {name} already points at {ip}"

    previous = current.get("content")
    cloudflare.call("PATCH", f"/zones/{cloudflare.zone_id}/dns_records/{current['id']}", desired)
    return f"updated A {name}: {previous} -> {ip}"


def main() -> int:
    try:
        token = require("CF_API_TOKEN")
        zone_id = require("CF_ZONE_ID")
        name = require("RECORD_NAME")
        metadata_url = os.environ.get("METADATA_URL", DEFAULT_METADATA_URL)
        api_base = os.environ.get("CF_API_BASE", DEFAULT_API_BASE)

        ip = node_external_ip(metadata_url)
        result = sync(Cloudflare(api_base, token, zone_id), name, ip)
        print(result, flush=True)
        return 0
    except UpdateError as error:
        print(f"dns update failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
