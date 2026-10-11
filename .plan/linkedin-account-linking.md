# Link LinkedIn accounts: approach, study of moaljumaa/linki, and safety requirements

- Status: draft <!-- draft | locked | in progress | done -->
- Created: 2026-10-11
- Locked by user: no. NO CODE until the decision in D1 is made and this plan is locked.

## Goal

Let a user connect their LinkedIn account to automatedLinkedIn so the app can act on it (for example outreach).
The user asked for two ways to connect:

- A. Username and password, plus a TOTP code, with the login performed by our service.
- B. A session cache (cookie) pasted or imported by the user, which our service then accepts.

## D1. Decision required first: is this allowed?

Both A and B are described in LinkedIn's User Agreement, section 8.2 "Don'ts" (linkedin.com/legal/user-agreement,
effective 3 November 2025). The text says the user agrees not to:

- "share log-in credentials or copying cookies" (use another's account);
- "develop, support or use software, devices, scripts, robots or any other means ... to scrape or copy the Services";
- "use bots or other unauthorized automated methods to access the Services ... send or redirect messages";
- "override any security feature or bypass or circumvent any access controls".

Option A (our service logs in with a stored or typed password) and option B (we store and reuse the user's cookie) are
both in conflict with these clauses. Linki does both. The project's PR template also requires that changes "follow
LinkedIn's Terms of Service".

Options:

1. **Official APIs only.** "Sign in with LinkedIn" (OpenID Connect) identifies the user. Other LinkedIn products need
   approval, such as the Community Management or Marketing APIs. To verify: whether any approved LinkedIn API lets a
   third-party app send connection requests or messages. If not, outreach through LinkedIn is not available this way.
2. **Assisted, not automated.** The app shows a LinkedIn profile and message to the user, who sends it. The app records
   the result and reminds them when to follow up. No login, no cookie, no bot.
3. **Automation as linki does it (A or B).** Not recommended without legal review. Risks: the user's LinkedIn account
   restricted or banned, and a possible claim against the company. Linki has an open issue about account and
   connection reliability, so this carries an operational cost too.

**Question for the user:** which option? (The plan cannot move to code until this is answered.)

## Study of moaljumaa/linki (162 stars, Sustainable Use License)

Looked at `lib/linkedin/session.ts`, `lib/crypto.ts`, `pages/api/accounts/[id]/login.ts`,
`authenticate.ts`, `pages/api/accounts/[id]/index.ts`, `proxy.ts`, `lib/db.ts`, `docker-compose.yml`, `.env.example`,
the README and the issue tracker (#4, #13, #16).

**License.** "Linki Sustainable Use License": free to use, but not as managed hosting for third parties. Do not copy
code. Use it only as a reference for mistakes and design questions.

**How it links accounts today**

- A (login): a headless Chromium logs in with email and password typed into LinkedIn's page. It handles an emailed or
  SMS code and mobile-app approval. **It has no authenticator-app (TOTP) support.** The password is not stored, but the
  route receives it in the request body.
- B (cookie): `authenticate.ts` takes the `li_at` cookie and `document.cookie` and stores them with
  `is_authenticated = 1`. It never checks that the cookie still works.
- Storage: the session (cookies and local storage) is saved encrypted in SQLite. The key is derived from
  `NEXTAUTH_SECRET` with HKDF.
- Runtime: one shared Chromium, a fingerprint pinned to a Chrome 131 Windows user agent, and a stealth plugin.

**Mistakes to avoid**

1. **Unauthenticated API (issue #4, critical, closed).** Auth was enforced only in the React shell, so about 64 of 65
   `/api` routes were open. `GET /api/accounts/[id]` returned `cookies_json`, which is account takeover. The lesson:
   deny-by-default. Every route requires a session unless it is listed as public, and every route has a test that
   calls it without a session and expects 401.
2. **Unverified "authenticated" state.** `authenticate.ts` sets `is_authenticated = 1` without checking the cookie. We
   must verify the session against LinkedIn before marking the account linked, and re-check it on a schedule.
3. **Single encryption key, silent plaintext fallback.** One secret (`NEXTAUTH_SECRET`) protects everything, rotating it
   breaks all stored sessions, and `decryptSecret` returns unencrypted values as-is. We need a key ID per record,
   a documented rotation path, and failure (not a pass-through) for anything that is not encrypted.
4. **Shared browser, global queue, zombie processes.** Linki's own history shows CPU spikes and orphaned Chromium on a
   2-vCPU box, and it serialises all page opens app-wide. We need one isolated worker per linked account, with
   limits and cleanup.
5. **Fingerprint spoofing and stealth plugins.** Hard-coded user agent and stealth code are a "circumvent controls"
   risk under 8.2 and are brittle. Do not copy this.
6. **Password and cookie handling.** A password is never stored and never logged. Logs record the account ID and
   outcome only. Cookies never reach the browser or the API response.
7. **TOTP.** If we accept TOTP, the code is entered at each login and not stored. A stored TOTP seed would let the
   service generate codes forever, so it must never be stored.
8. **Unclear defaults (issue #13).** The first login step should explain what is needed.
9. **Pinned fingerprint as a feature.** Linki sells "longer sessions" through fingerprint pinning. That is the same
   control-evasion issue as 5, so it is not a goal for us.

## Requirements (apply to any option that stores LinkedIn data)

- Deny-by-default auth on every API route, with a test per route.
- No passwords, TOTP seeds, cookies or tokens in logs, errors, API responses or the database in plaintext.
- Encryption with per-record key IDs, a documented rotation procedure, and no plaintext fallback.
- Session verified before "linked", re-checked on schedule, and deleted on unlink.
- Explicit consent screen stating the LinkedIn terms risk, with the user's acknowledgment stored.
- Ownership check: the linked LinkedIn profile must match the signed-in user (no linking someone else's account).
- Account data deleted when the user unlinks or deletes the account. Check GDPR obligations for EU users.
- A LinkedIn password change or security checkpoint marks the link as needing re-auth and stops automation.

## Edge cases (for the chosen option)

- Wrong password, account lockout, CAPTCHA, email or SMS code, mobile-app approval, expired session, password change.
- TOTP clock skew, reused code, and the user entering a code late.
- The same LinkedIn profile linked to two of our accounts.
- Cookie copied from a browser where the user has logged out.
- Two concurrent logins for one account.

## Scope and non-goals

- In scope now: this study, the decision, and, once decided, a threat model and design.
- Out of scope: any code, any change to production, and copying linki's code.

## Approach

- [ ] D1: user decides the option (1, 2 or 3). Blocker.
- [ ] Legal review of the chosen option (LinkedIn terms and data protection). Blocker for options 3 and the storage parts of 1.
- [ ] If option 1: verify the LinkedIn API products and what they allow, then design the OAuth flow.
- [ ] If option 2: design the UI for assisted actions, with no LinkedIn credentials or cookies stored.
- [ ] If option 3: threat model, key management design (for example GCP KMS), per-account isolation design, then lock.
- [ ] Lock the plan, then write tests first (auth on every route, no plaintext secrets, session verification).

## Verification (for the chosen option)

- Automated: 401 on every API route without a session; encryption round-trip with key rotation; no secret in logs.
- Manual: link, verify, re-check, unlink, and confirm the stored data is gone.

## Outcome

Filled in when done.
