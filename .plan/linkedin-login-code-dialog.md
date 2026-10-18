# LinkedIn sign-in: the two-step code dialog without a button, and the ads consent page

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Make the spider's `linkedin-login` task sign in the way LinkedIn now works, as recorded on 2026-10-18 (`apps/spider/.devtools-recordings/session-2026-10-18T17-41-58-756Z`).

## What the recording shows

1. `/login`: the email and the password go into the redesigned form, and "Sign in" is clicked. This already works (selectors from 2026-10-15).
2. **New:** the two-step code is asked for in a `<dialog>` over the same `/login` address, not on a `/checkpoint/challenge` page. Its input has no `name="pin"`, and there is **no submit button**: LinkedIn submits on its own once the 6th digit is typed (steps 13 and 14, then the feed at step 15).
3. **New:** after the code, LinkedIn sends the browser through `/connect-services/ads_experience/?session_redirect=/feed/`, an ads consent page, before the feed (steps 16 and 17: "Accept").

## Why it fails today (`apps/spider/src/tasks/linkedinLogin/accountValidator.ts`)

- **No code field found:** `SELECTORS.codeInput` only knows `input[name="pin"]` and `#input__phone_verification_pin`, so the dialog is never seen. `afterSubmit` waits the full 30 s on `/login`, and `settle` then says "a page it does not understand" (ERROR), or "security check" if the captcha badge is there.
- **No button to press:** even with the field found, `session.click(SELECTORS.codeSubmit)` has nothing to click and throws, which ends as ERROR "did not let the check load a page".
- **Code read as wrong too early:** after the code, the dialog stays on screen for a moment while LinkedIn checks it. `afterSubmit` stops polling as soon as a code input exists, so `settle` would call the code wrong ("did not accept the two-step code"), even though the sign-in went on to succeed.
- **Consent page not understood:** `kindOf` calls `/connect-services/...` `other`, so a successful sign-in that lands there ends as ERROR "unexpected page". `browseAfterLogin` has the same blind spot.

## Proposal

1. **Find the code field in the dialog.** `SELECTORS.codeInput` and `codeField` also match a visible input inside an open dialog. Most specific first: `dialog[open] input[autocomplete="one-time-code"]`, `[inputmode="numeric"]`, `[type="tel"]`, `[type="number"]`, `[type="text"]`, all `:visible`. As everywhere else, nothing relies on generated ids or on words.
2. **Type the code like a person, then send it the way the page allows.**
   - The code is typed one digit at a time, so the page's own "6 digits typed" handler fires. This needs a small new `LoginSession.type(selector, text)` (Playwright `pressSequentially` with a short human delay); the Camoufox driver and the fakes implement it.
   - The code's submit button is clicked if the page shows one (the old `/checkpoint` page). Otherwise the page is left to submit by itself, and Enter is pressed only if the dialog is still there after a short wait (about 3 s).
3. **Wait for the code to be checked before judging it.** After the code is sent, keep polling, up to the same 30 s, until the page moves off `/login`, an error shows, or a challenge shows. The code counts as wrong only if the dialog is still open, or comes back, once the page has settled. Then the existing rule applies: `NEEDS_REAUTH`, "did not accept the two-step code", and **one try only**, so a wrong key can never lock the account.
4. **Get past the consent page.** `kindOf` gains `consent` for `/connect-services/`.
   - Wherever the spider lands there (after the code, a token check, `recheck`, or `browseAfterLogin`), it clicks the visible Accept button, as recorded, and waits for the feed.
   - If the page shows no Accept button, or does not move on, the account still counts as signed in: the session cookies exist, so it is VALID.
5. **Recording:** the step names in the session video and log say "two-step code (dialog)" and "ads consent page", so a failed run is easy to read.

## Requirements

Confirmed by the request: handle the two-step code input that has no submit button, as recorded, and update the `linkedin-login` task in the spider.

Answered by the owner on 2026-10-18:

1. **The ads consent page:** click **Accept**, as in the recording.
2. **The code's selector:** match it generically, as "a visible input in an open dialog on the sign-in page", most specific first.

Open questions: none.

## Scope and non-goals

- In scope: `accountValidator.ts` (selectors, code typing, the wait after the code, the consent page), `LoginSession.type`, `browseAfterLogin`'s page kinds, unit and e2e tests.
- Out of scope:
   - Solving any puzzle or captcha (unchanged: reported as a security check).
   - Codes sent by e-mail or SMS (unchanged: needs re-auth).
   - Changes to brain or to the account statuses.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first:
   - Unit (`accountValidator.unit.test.ts`): a dialog code with no button, which signs in after the code is typed; the dialog stays a moment, which must not count as a wrong code; a wrong code where the dialog stays, which tries once only; the consent page after the code or on a token check, which behaves as the open question says.
   - E2e (`accountValidator.e2e.test.ts`, a stand-in LinkedIn in a real browser): a `/login` page that opens a `<dialog>` with one input, whose script submits after 6 digits and redirects to `/connect-services/ads_experience`, then to `/feed/`.
- [x] 3. Driver: `type(selector, text)` on `LoginSession` (Camoufox driver plus fakes).
- [x] 4. Validator: the selectors, the code send, the wait after the code, and `consent` in `kindOf` (and in `browseAfterLogin`).
- [x] 5. Verify:
   - The spider gates: `pnpm --filter @automatedLinkedIn/spider lint ts:check test:unit:run`, plus its e2e for the login task.
   - The repo-wide definition of done.
   - Then a real sign-in check through the app (the owner's account, locally or on staging), and the session video read back.
- [x] 6. MEMORY.md and Outcome.

## Edge cases and risks

- **Several inputs in the dialog** (for example a hidden recovery-code input): only the visible one is used, and the most specific selector comes first.
- **A dialog that is not about a code** (cookie notice, "remember this browser"): matched only on the sign-in page and only after the password was sent, while the page has no other answer. A hidden or text-free dialog input is never filled.
- **Typing too fast** for the page's handler: digits go in one by one with a small delay. If the dialog is still open after about 3 s, Enter is pressed once. Nothing is typed twice.
- **The old `/checkpoint` code page:** unchanged, its button is still clicked (covered by the existing tests).
- **A code that expires mid-wait:** the code is made right before typing. A 30-second TOTP window is enough for the typing and the check.
- **Wrong code:** reported after one try, as today.
- **Secrets:** the code and the two-step key stay out of verdicts, logs and step names (the existing test "should never put a secret in a verdict" covers this).
- **Rollback:** a code revert of the spider image. No data or schema change.

## Verification

- The spider unit tests and the login e2e (a stand-in page with the dialog, auto-submit and consent redirect), plus the repo definition of done.
- One real check by the owner after deploy. The session video should show the code typed, the feed (or the consent page), and an ACTIVE account.

## Outcome

**Shipped:**

- `accountValidator.ts`:
   - `CODE_DIALOG` (a visible input in an open dialog, most specific first) joins `codeInput` and `codeField`.
   - `sendCode` types the code once, digit by digit. It clicks a button only inside the dialog (or the old `/checkpoint` button), otherwise waits 3 s for the page to send the code itself and presses Enter once if the dialog is still there.
   - `afterSubmit(..., codeSent)` no longer treats the lingering dialog as an answer.
   - `kindOf` gains `consent` (`/connect-services/`), and `pastConsent` clicks Accept (VALID either way). Wired into `settle`, `tryToken` and `recheck`.
- `browseAfterLogin`: accepts the consent page if `/in/me/` lands there, then opens the profile again.
- `LoginSession.type`: Camoufox `pressSequentially` with a 120 ms delay and no read-back; `RecordedSession` records it as a `type` step with the value masked.
- **Tests:**
   - 7 new unit tests: the dialog sends the code itself, the dialog lingers, Enter as the fallback, a wrong code after one try, consent with and without an Accept button, and consent on a token check.
   - 1 new e2e test (a real Camoufox against a stand-in dialog that auto-submits, then the consent page): all 8 login e2e tests pass.

**Deviations:** none.

**Notes:**

- The login e2e tests take 7 to 34 s each locally, over Vitest's 15 s default. They were run with `--testTimeout=90000`; the existing tests need it too.
- **Not run:** a real LinkedIn sign-in after the deploy, which the owner does.
