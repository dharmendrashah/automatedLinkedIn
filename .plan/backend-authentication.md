# Backend authentication with authentik (API auth, current user, profile)

- Status: done
- Created: 2026-10-10
- Locked by user: yes, 2026-10-10

## Goal

`apps/brain` verifies authentik access tokens on every API call, knows which user is calling, and exposes the user through tRPC. `apps/body` calls brain with the access token and the profile page shows what brain knows about the user.

## Requirements

Confirmed:

- Brain authenticates API requests using authentik.
- Brain understands who the user is (identity available to resolvers).
- Profile view shows the current user from the backend.

Locked decisions:

- Frontend sends `Authorization: Bearer <access_token>` to brain's `/trpc` endpoint.
- Brain verifies the JWT with `jose` against authentik's JWKS: signature (RS256), `iss` = the provider issuer, `aud` = the OIDC client id, `exp`. No introspection call per request.
- tRPC context carries the verified claims. `publicProcedure` stays open; `protectedProcedure` rejects with `UNAUTHORIZED` when the token is missing or invalid.
- Brain does NOT create users. Lookup only: find the local `User` by `authentikId` (the token `sub`); if none, link by email, but only when authentik reports `email_verified` true. If not found, there is no local user.
- Additive migration: nullable unique `User.authentikId`.
- `me` (protected) returns `{ identity, user }`: `identity` from the verified token plus authentik userinfo (sub, name, username, email, emailVerified, groups); `user` is the local row or `null`. `getRole` is protected and returns the local role, `USER` when there is no local row.
- Everyone is `USER` for now; no admin group mapping.
- Brain env (envalid): `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, optional `AUTHENTIK_INTERNAL_URL` (compose: `http://authentik-server:9000`; the issuer stays the browser-facing `http://localhost:9000/application/o/automatedlinkedin/`).
- Brain CORS allows the body origin and the `Authorization` header.
- Body: add `@trpc/client` and `@tanstack/react-query`, wire the tRPC provider with the bearer token from `react-oidc-context`, and the Profile page shows the backend `me` result.
- Work continues on `feat/authentik-service`.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: brain env, auth module, tRPC context and procedures, Prisma migration and `UserService` methods, body tRPC client, profile page, compose env for brain, tests, `MEMORY.md`.
- Out of scope: refresh-token rotation changes, role-based authorization beyond `ADMIN`/`USER` mapping, email verification, rate limiting, Kubernetes manifests, REST (non-tRPC) endpoints.

## Approach

- [ ] Verify real token shape against the running stack (access token claims, `aud`, `iss`, userinfo fields).
- [ ] Tests first: token verification (valid, expired, wrong issuer, wrong audience, bad signature, missing token), `protectedProcedure`, JIT user provisioning, role mapping.
- [ ] Brain: env vars, `auth` module (`jose` JWKS verifier, userinfo fetch), context, `protectedProcedure`, `me`, real `getRole`; add `auth` to `importOrder` in `.prettierrc` if a new top-level folder is created.
- [ ] Database: `authentikId` column, additive migration, `UserService.findByAuthentikId`, `UserService.linkByVerifiedEmail`.
- [ ] Compose: brain env, brain `depends_on` authentik not required (JWKS fetched lazily and cached).
- [ ] Body: tRPC client and provider, profile page uses `me`.
- [ ] Update `MEMORY.md`, run `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, test end to end against the running stack.

## Edge cases and risks

- Issuer vs reachable URL: the token `iss` is `http://localhost:9000/...` but brain in Docker reaches authentik at `http://authentik-server:9000`. Verify `iss` against the public issuer and fetch JWKS/userinfo from the internal URL.
- JWKS caching and key rotation: use `jose` remote JWKS with cache and cooldown; verify failure modes when authentik is down (401, not 500, and no crash at startup).
- Access token may carry no email or name claims: fetch userinfo with the bearer token only when identity details are needed (`me`), not on every request.
- Concurrent first requests that both try to link the same row: make the link an atomic conditional update (`authentikId` still null) so one wins.
- Email linking only when `email_verified` is true; with the current sign-up flow (no verification) nothing links by email, so a row has to be linked by setting `authentikId` by hand until verification exists.
- Local row already linked to a different `authentikId`: never relink.
- Email changed in authentik: keep the local email in sync on later requests or document that it is set on first creation only (decide at lock).
- Role downgrade/upgrade: group removal in authentik must reflect on the next token; stale roles live only until the token expires.
- Token in `Authorization` only (no cookies), so CSRF is not a concern; CORS: body (3000) calls brain (3001) cross-origin, so brain needs CORS allowing the body origin and the `Authorization` header (not configured today).
- `sub` mode is `hashed_user_id` (authentik default): stable per user, not a UUID. Store it as an opaque string.
- Secrets: nothing secret in the token path (public client, JWKS is public). Do not log tokens.
- Existing data/migrations: additive nullable column only; existing rows untouched.
- Rollback: revert the commit; the extra column is harmless.
- Dev vs production: HTTP issuer is fine on localhost only.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- Integration test for `UserService` linking against Postgres.
- Manual: log in at `http://localhost:3000`, open Profile, see the backend user; call `/trpc/me` with no token (401) and with an expired or tampered token (401).

## Update 2026-10-10: create the local user just-in-time

Requested by the user after the first version shipped ("from now on create as well"); it reverses the "lookup only" decision above.

- On the first authenticated request, `userProcedure` provisions the local `User` when `ctx.user` is empty: look up by `authentikId`, else link a row by verified email, else create a row (`email` and `name` from authentik, `authentikId` = `sub`, role `USER`).
- No email in the identity: no row is created (`email` is required), `user` stays `null`.
- Email already used by an unlinked row (compared case-insensitively) and not linkable because it is unverified: reject with `CONFLICT`, never link and never create a duplicate.
- Concurrent first requests: a unique violation on create is resolved by re-reading the row linked to the `sub`.
- Risk accepted: without email verification, whoever signs up first with an address owns that row (email squatting). Needs email verification before this is safe for real users.
- `me` no longer links; it returns the identity and `ctx.user`.

## Outcome

Shipped: brain env vars (`AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_INTERNAL_URL`, `CORS_ORIGINS`), `src/auth` (`AuthService`: `jose` verification, userinfo identity), tRPC context with `auth` and `user`, `userProcedure` that rejects anonymous callers, `me` and a real `getRole`, `User.authentikId` migration, `UserService.findByAuthentikId` and `linkAuthentikAccount`, CORS, compose env for brain, body tRPC provider with the bearer token and a backend section on the profile page.

Verified end to end against the running stack with a real PKCE login: valid token returns identity (and the linked user, role included); missing or tampered token returns 401; an unverified email does not link; linking by `authentikId` works; CORS allows only the configured origins.

Deviations: none from the locked decisions. `Request` typing needed a manual cast because of the stub `express-serve-static-core` package (see `MEMORY.md`).

Follow-ups (also in `MEMORY.md`): access tokens last 5 minutes and are not refreshed by the SPA; sign-up creates no local `User` row; email verification (SMTP) before email linking can work.
