# Password reset and forgot-password via authentik

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11

## Goal

Let users who forgot their password reset it themselves from the authentik sign-in page, by a
time-limited link sent to the email on their account.

## Requirements

Confirmed:

- Reset is done in authentik (not in the `body` app).
- The sign-in page shows a "Forgot password?" link.
- Reset links are sent by email, so authentik needs an SMTP provider.

Answered by the user on 2026-10-11:

- Q1 Provider: **Resend** (SMTP `smtp.resend.com`, port 465 SSL, username `resend`, password = API key).
- Q2 Sender DNS: the user controls `elitale.com` DNS and will add SPF, DKIM and DMARC for the sending domain.
- Q3 Identify by: **username or email**.
- Q4 Sign-up: **require email verification now**.
- Q5 Link lifetime: **30 minutes**.

Still needed from the user before deploying (not blocking the blueprint):

- The sender address on the verified Resend domain (for example `no-reply@elitale.com`).
- The Resend API key, placed in the git-ignored `secrets.env` as `AUTHENTIK_EMAIL__PASSWORD`.

## Scope and non-goals

- In scope: a recovery flow (`default-recovery-flow` or equivalent) in the blueprint, an email stage,
  global SMTP settings from env (`AUTHENTIK_EMAIL__*`), the recovery link on the login page, and
  the password-change stage after the link is opened.
- Out of scope: custom email templates, SMS, MFA recovery codes, and changes to the `body` app.

## Approach

- [ ] Lock Q1–Q5 with the user and record the answers here.
- [ ] Add SMTP settings to the base config (non-secret) and the password to `secrets.env`.
- [ ] Blueprint: email stage, recovery flow (identification + email + password change), and link the
      flow from `default-authentication-identification` as `recovery_flow`.
- [ ] Verify locally in compose: reset email is sent, link works, password changes, old password fails.
- [ ] Apply the same blueprint to staging (`ak apply_blueprint`), send a reset email to a test account,
      and confirm it lands in the inbox and not spam.
- [ ] Mark done and update `MEMORY.md`.

## Edge cases and risks

- **User enumeration:** the recovery page must answer the same way whether or not the email exists.
- **Reset-link tokens:** expire after the configured lifetime and are single-use.
- **Email deliverability:** without SPF/DKIM for the sender domain, reset mail lands in spam or is rejected.
- **Outbound SMTP:** GKE allows outbound SMTP on 587 by default, but port 25 is blocked on GCP.
- **Secrets:** the SMTP password goes into the git-ignored `secrets.env`, never into the blueprint.
- **Blueprint apply:** identify stages and flows by `slug` or `name` so the apply stays idempotent
  (see MEMORY gotchas). Apply order matters: the default flows must exist first.
- **Existing sign-in:** the `recovery_flow` change must not break the current login flow.
- **Email squatting:** a reset proves control of the address, but sign-up still does not verify email
  (Q4).

## Verification

- Compose: request reset, receive email, open link, set new password, sign in with it.
- Staging: same steps against `auth.staging.elitale.com`.
- Old password is rejected after the change.
- An unknown email gets the same response as a known one.

## Outcome

Built and verified locally on 2026-10-11 (not yet on staging):

- Blueprint: recovery flow `automatedlinkedin-recovery` (identify by username or email, e-mail link
  valid 30 minutes, new password with the existing password policy). Sign-up now sends a verification
  e-mail and accounts start inactive until the link is opened. The login page links to the recovery flow
  (`recovery_flow`). The blueprint applies cleanly.
- Verified in a real browser (headless Chrome) against local authentik with Mailpit as the SMTP sink:
  "Forgot username or password?" opens the reset page, the reset e-mail arrives, the link leads to a
  confirmation step, the new password is accepted and the user is signed in. The new password signs in
  and the old one is rejected.
- An unknown e-mail gets the same page and sends no e-mail, so the page doesn't reveal which accounts exist.
- Sign-up verification: the account is inactive until the link is opened, then becomes active.

Deviations and notes:

- The skip-if-restored policy from authentik's example was removed. It left a placeholder stage that
  showed a blank "consent" page after the link was opened. Without it the link flow works.
- Found after go-live: authentik does not enforce unique e-mail addresses, so two sign-ups could use the same address. Fixed in `fix/unique-email-signup` (sign-up rejects an existing e-mail, case-insensitive). Usernames are already unique in authentik.
- Staging is not updated yet. It needs the Resend API key (`AUTHENTIK_EMAIL__PASSWORD` in `secrets.env`),
  the sender address (`AUTHENTIK_EMAIL__FROM` in `config.env`) and the SPF/DKIM/DMARC records.
  Applying the blueprint before e-mail works would block new sign-ups, since their accounts start inactive.
