# Use the HTTP cache: enforce the allowlist in the browser, not by intercepting requests

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19

## Goal

The saved browser profile carries the HTTP cache (`.plan/account-browser-profile.md`), but pages do not load from it: Playwright turns the HTTP cache off while `context.route` is on, and the driver routes every request to enforce `SPIDER_ALLOWED_HOSTS`. Enforce the allowlist inside Firefox instead, so the route can go and the cache works.

## What was tested (2026-10-19, a scratch copy of the Camoufox build, real browser, two local hosts)

- Camoufox reads `Contents/Resources/distribution/policies.json` (Linux: next to the browser binary) and already ships a `WebsiteFilter` entry. A filter of "block `<all_urls>`, except the allowed hosts" gives:
   - a direct visit to another host: blocked (`NS_ERROR_BLOCKED_BY_POLICY`), the other server got no request;
   - a redirect from an allowed page to another host: blocked, no request reached it;
   - an iframe of another host: blocked, no request reached it;
   - a script or image from another host: **allowed** (it reached the other server);
   - patterns match host and subdomains and ignore the port (a port in a pattern matches nothing).
- With no routing, a page's script was served from the cache on a reload, and again after the browser was closed and reopened on the same profile folder: 0 requests to the server.

## How it matches today's rule

Today the route aborts only the **main frame's** navigation (and redirects) to a host that is not allowed; frames and subresources of any host are let through, because LinkedIn's captcha lives in a frame of another host. The filter gives the same for the main frame and subresources, but it also blocks **frames** of other hosts. So the hosts LinkedIn embeds must be listed as exceptions, and an exception also allows a main-frame visit to that host (a little looser than today).

## Proposal

1. **Policy file (worker start):** write the `WebsiteFilter` of `policies.json` from `SPIDER_ALLOWED_HOSTS` plus a new `SPIDER_EMBED_HOSTS` (the captcha and sign-in frames), next to the installed browser; keep the rest of Camoufox's policies. Find the folder through the same code Camoufox uses to find the browser. Re-written on every start, so a changed allowlist applies at once.
2. **Driver:** a new option `blocking: 'route' | 'browser' | 'none'`. `browser`: no `context.route`, the cache works. `route`: today's behaviour, the fallback. `none`: no check at all, for the local tool, which allows everything.
3. **Fail closed:** the worker uses `browser` only when the policy file was written and read back; any problem (read-only folder, unknown layout) logs one warning and keeps `route`, so the allowlist is never dropped.
4. **Defaults:** `SPIDER_EMBED_HOSTS` is `google.com,gstatic.com,recaptcha.net,arkoselabs.com` (the hosts the sign-in and captcha frames use today); an empty value means no frame of another host.
5. **Tests:** unit (policy file content: allowed hosts, embeds, port-free patterns, other Camoufox policies kept, read back); a Camoufox e2e on a scratch copy of the policies (blocked direct, redirect and frame; allowed subresource; cached asset served after reopening a profile); the worker image on staging to confirm the Linux path.

## Requirements

Confirmed:

- Same allowlist effect for the main frame and subresources as today; the HTTP cache works.
- The captcha and sign-in hosts are listed as exceptions (`SPIDER_EMBED_HOSTS`); the looser main-frame rule for them is accepted.
- The local tool uses `none`, so the cache works there too.

Open questions: none.

## Scope and non-goals

- In scope: `policies.json` writer, driver option, worker wiring, env and deploy config, tests, the profile plan's note about the cache.
- Out of scope: changing what the allowlist contains; request interception for anything else (the recorder only observes).

## Edge cases and risks

- **Shared file:** the policy file is shared by every browser the worker starts (one at a time). Rolled back by deleting the filter or `SPIDER_...` fallback to `route`.
- **A missing exception breaks a flow** (a captcha frame that does not load). Visible in recordings; fixed by adding the host to `SPIDER_EMBED_HOSTS`, no code change.
- **Camoufox upgrade** may move the folder or the policy format; the read-back check falls back to `route`.
- **Cached pages and the allowlist:** a cached response is only used for a URL that was fetched through the filter before.
- **Staging image:** a real worker image run is the only proof for the Linux path.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the e2e above; after deploy, one sign-in check and one visit with the recording to see the cache hits and that the captcha frame still loads.

## Outcome

- Shipped:
   - `scraping/websiteFilter.ts`: `installWebsiteFilter` (writes Camoufox's `policies.json` `WebsiteFilter`: block all, except the allowed and embed hosts; reads it back), `clearWebsiteFilter`, `chooseBlocking` (browser when the filter is in place, else `route` and a warning).
   - `CamoufoxDriver` option `blocking: 'route' | 'browser' | 'none'` (and `executablePath` for tests); `browser` and `none` install no `context.route`, so the HTTP cache works.
   - Worker: `SPIDER_BLOCK_IN_BROWSER` (default on), `SPIDER_EMBED_HOSTS`; `HostPolicy.hosts()`. The local tool uses `none` and clears the filter at start.
   - e2e (`websiteFilter.e2e.test.ts`, real Camoufox in a copy-on-write clone of the browser): direct and redirected visits to another host are refused before reaching it; an asset is served from the cache after the profile is reopened.
- Deviations:
   - Firefox ignores `browser.policies.alternatePath` in Camoufox (tested), so the filter lives in the install's one `policies.json`, shared by every launch of that install. The local tool clears it at start; a worker and the local tool must not share one install.
   - Not run on Linux: the worker image's folder layout is assumed (`distribution/` next to the binary); the read-back check falls back to `route` if it is wrong.
- Follow-ups:
   - After deploy, check the worker log for "The allowlist is checked on every request" (the fallback), and a recording of a sign-in for the captcha frame and the cache hits.
