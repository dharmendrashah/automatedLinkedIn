# Security Policy

automatedLinkedIn handles LinkedIn account activity and personal data of the people it contacts, so security and privacy reports are taken seriously.

## Supported versions

The project is in early development. Only the latest commit on `main` and the most recently published images (`ghcr.io/<owner>/automatedlinkedin-brain` and `-body`) receive security fixes.

## Reporting a vulnerability

**Do not open a public issue, pull request, or discussion for a security problem.**

Report it privately using one of these:

1. GitHub private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**.
2. Email **dharmendrashaheagle@gmail.com** with the subject `SECURITY: automatedLinkedIn`.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected component (`apps/brain`, `apps/body`, a package, a Docker image, CI) and version or commit.
- Any suggested fix.

Do not include real credentials, tokens, or personal data from LinkedIn in a report. Redact them.

## What to expect

- We will acknowledge your report, assess it, and keep you updated on progress.
- We will fix confirmed vulnerabilities on `main` and publish updated images, and credit you if you wish.
- We ask that you give us reasonable time to fix the issue before any public disclosure.

## Scope

In scope:

- The code in this repository, its Docker images, and its GitHub Actions workflows.
- Injection, authentication and authorization flaws, secret exposure, unsafe defaults, insecure dependencies, and container or CI supply-chain issues.
- Anything that could expose or misuse LinkedIn session data or personal data processed by the tool.

Out of scope:

- Vulnerabilities in LinkedIn or other third-party services.
- Misuse of the software that violates LinkedIn's Terms of Service or applicable law (see the [Code of Conduct](CODE_OF_CONDUCT.md)).
- Social engineering, physical attacks, and denial-of-service through volume.
- Findings that need a compromised host or already-leaked credentials, unless the project made that compromise easier.

## Safe harbor

If you act in good faith, avoid privacy violations and data destruction, and stay within this policy, we will not pursue action against you for your research.

## Security practices for contributors

- Never commit secrets, tokens, keys, or `.env*` files (only the `.env*.example` placeholders). If a secret leaks, report it privately and rotate it immediately.
- Never print or store the git remote URL if it contains credentials.
- Keep runtime dependencies minimal and pinned through the lockfile; review new dependencies before adding them.
- Containers run as a non-root user and ship only compiled code and production dependencies.
- Database migrations are additive; destructive changes need explicit maintainer approval.
- Validate all external input at system boundaries (environment variables are validated with `envalid`).
- Do not paste secrets or personal data into AI tools. See [AI-Assisted Development](CODE_OF_CONDUCT.md#ai-assisted-development).
