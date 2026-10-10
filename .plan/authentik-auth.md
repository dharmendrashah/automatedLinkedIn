# Authentik authentication (login, signup, logout, profile)

- Status: done
- Created: 2026-10-10
- Locked by user: yes, 2026-10-10

## Goal

Run authentik (goauthentik.io) as the identity provider in docker compose, and add login, signup, logout and a profile view to `apps/body` using OpenID Connect.

## Requirements

Confirmed:

- authentik runs as containers in `docker-compose.yml`.
- `apps/body` gets login, signup, logout and a profile view.

Proposed (pending lock, see Open questions):

- OIDC authorization code flow with PKCE from the SPA (`oidc-client-ts` + `react-oidc-context`), public client, no client secret in the browser.
- Login and signup pages are authentik's hosted flows (redirect). Signup is an authentik enrollment flow linked from the login page.
- authentik gets its own PostgreSQL (`postgres:16-alpine`) and no Redis (not used in the current release, 2026.8.3). Images pinned: `ghcr.io/goauthentik/server:2026.8.3`.
- Provider, application, enrollment flow and the OIDC client are provisioned by a blueprint mounted in the worker (`/blueprints/custom`), so `docker compose up` yields a working setup with no manual clicking beyond setting the `akadmin` password.
- Profile view shows name, username, email, groups from ID token / userinfo, plus a link to authentik's user settings to edit.
- `apps/body` gets `react-router` (`/`, `/callback`, `/profile`) and the nginx SPA fallback (closes an open item in `MEMORY.md`).
- Config via `VITE_AUTHENTIK_URL` and `VITE_AUTHENTIK_CLIENT_ID` (build args for the body image).
- Secrets (`AUTHENTIK_PG_PASS`, `AUTHENTIK_SECRET_KEY`) come from `.env` (documented in a root `.env.example`). Compose has dev-only defaults, like the existing `postgres` service, because a required-variable error would also break `docker compose up postgres`. Change them for anything beyond local use.

Locked answers: frontend only (no brain changes), open self-registration without email verification, user linking to the Prisma `User` later, redirect URIs `http://localhost:3000/callback` and `http://localhost:5173/callback`.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: compose services, blueprint, `.env.example`, body auth + routing + pages, nginx SPA fallback, body Dockerfile build args, tests for auth logic, `MEMORY.md`.
- Out of scope: Kubernetes manifests, SMTP/email verification, social login, MFA enforcement, custom-styled authentik branding, outposts/proxy.

## Approach

- [ ] Compose: `authentik-postgres`, `authentik-server` (9000), `authentik-worker`, volumes, blueprint mount; no Docker socket mount on the worker.
- [ ] Blueprint: OAuth2 provider (PKCE, public), application `automatedlinkedin`, enrollment flow, link from identification stage.
- [ ] Body: auth config module, `AuthProvider`, login/signup/logout buttons, protected route, profile page, callback route.
- [ ] Tests first for config and profile mapping (vitest for body; pure functions, no jsdom).
- [ ] nginx SPA fallback, Dockerfile build args.
- [ ] Update `MEMORY.md`, run the definition-of-done commands, boot the stack to check login end to end.

## Edge cases and risks

- Token storage: `oidc-client-ts` default is sessionStorage; XSS exposes tokens. Keep in sessionStorage (not localStorage), no refresh tokens beyond rotation defaults.
- Issuer mismatch: browser reaches authentik at `localhost:9000`, containers at `authentik-server:9000`. The SPA only talks to the browser URL, so the issuer is `http://localhost:9000/application/o/automatedlinkedin/`. Brain (if included) must validate against that issuer but fetch JWKS from the internal hostname.
- Redirect URI must match exactly or authentik rejects the login.
- Blueprint errors are silent in the UI; check the worker logs and Customization > Blueprints.
- Dev-only default secrets in compose are public; never use them outside local development.
- Docker was not running when this was built, so the stack and blueprint were not booted; blueprint fields were checked against the published authentik schema only.
- Port conflicts: 9000/9443 on the host; override via `COMPOSE_PORT_HTTP`.
- Open self-signup enables account spam; acceptable for dev, needs rate limiting / invite flow before production.
- Dev vs production: HTTP issuer is fine on localhost only; production needs HTTPS and real redirect URIs.
- Silent renew / expired session: show a logged-out state and redirect to login rather than looping.
- Logout must end the authentik session (`end_session_endpoint`), not only clear local storage.
- `.env` is untracked; only `.env.example` is committed. zsh-autoenv may prompt after touching `.env`.
- Rollback: remove the authentik services and volumes; no changes to the existing app database.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- `docker compose up -d --build`, open `http://localhost:9000` (set `akadmin` password), sign up a user from `http://localhost:3000`, log in, view profile, log out, confirm the session is gone.

## Outcome

Shipped: authentik services in compose, blueprint (OIDC provider, application, sign-up flow, sign-up link on the login page), body routes `/`, `/login`, `/signup`, `/callback`, `/profile` with log out, nginx SPA fallback, body `test:unit:run` and `ts:check` scripts, unit tests for config, profile mapping and return-path validation.

Deviations: dev-only default secrets in compose (see edge cases); no route-guard component test (no jsdom). Follow-up change: authentik no longer has its own postgres service — it shares the app `postgres`, with its `authentik` database/role created on first init by `infra/postgres/init/10-authentik-db.sh` (only runs on a fresh volume).

Follow-ups (also in `MEMORY.md`): boot the stack and verify end to end; brain token verification; link users to the Prisma `User` table; email verification (needs SMTP).
