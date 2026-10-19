# Contributing to automatedLinkedIn

Thank you for helping. This guide explains how to set the project up, what a good issue or pull request looks like, and what we check before we merge. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first; it applies to every project space.

## Before you start

- **Search first.** Look through existing issues and discussions. Your idea or bug may already be there.
- **Open an issue before a large change.** A short conversation saves you from building something we cannot accept.
- **Know what we will not accept.** This tool automates a person's own LinkedIn activity, within LinkedIn's rules. Changes that evade LinkedIn's protections, scrape other people's data at scale, or send unsolicited bulk messages will be declined. See [Responsible Use](CODE_OF_CONDUCT.md#responsible-use).
- **Do not use public issues for security problems.** Follow [SECURITY.md](SECURITY.md).

## Where to go

| I want to... | Go to |
| --- | --- |
| Report a bug | Open an issue with the **Bug report** template. |
| Report something hard to use with a keyboard, screen reader or zoom | Open an issue with the **Accessibility barrier** template. See [ACCESSIBILITY.md](ACCESSIBILITY.md). |
| Suggest a feature | Open an issue with the **Feature request** template. |
| Ask a setup or usage question | Start a GitHub Discussion in the **Q&A** category. See [SUPPORT.md](SUPPORT.md). |
| Report a security problem | [SECURITY.md](SECURITY.md), privately. |
| Report a conduct problem | [Enforcement](CODE_OF_CONDUCT.md#enforcement) in the Code of Conduct. |

When you write an issue, remove secrets, tokens, and LinkedIn personal data from logs, text and screenshots.

## Set up your machine

You need the Node.js version in [.nvmrc](.nvmrc), pnpm (the version in `package.json`), and Docker for the local database.

```bash
pnpm install                          # also generates the Prisma client and builds the shared library
docker compose up -d postgres         # local PostgreSQL
cp apps/brain/.env.example apps/brain/.env
pnpm dev                              # all dev servers
```

Never commit `.env*` files. Only the `*.example` files are tracked. To run the integration tests, copy `apps/brain/.env.test-example` to `apps/brain/.env.test` (it is ignored by git and may point at your own test database).

To run the whole stack in containers (`docker compose up -d --build`) or in Kubernetes, see [deploy/README.md](deploy/README.md).

## How the repository is laid out

| Path | What it is |
| --- | --- |
| `apps/brain` | Backend: Express 5, tRPC, Prisma, PostgreSQL, and the background worker |
| `apps/body` | Frontend: React and Vite |
| `apps/spider` | The browser worker: Camoufox and RabbitMQ |
| `packages/contracts` | Types and schemas shared by brain and spider |
| `packages/config`, `packages/ui`, `packages/eslint-config`, `packages/tsconfig` | Shared configuration and components |
| `.plan/` | A plan file for each feature (see below) |
| `MEMORY.md` | A short log of decisions, gotchas and open items |

Run every command from the repository root.

## Making a change

1. **Branch from `main`.** Use a short name such as `fix/login-redirect` or `feat/saved-searches`.
2. **Write a plan for new features and behaviour changes.** Copy [.plan/_template.md](.plan/_template.md) to `.plan/<feature-name>.md`. Describe the goal, the confirmed requirements, the scope, the edge cases and the steps, and agree the open questions before you build. Fill in the outcome when you finish. Typo fixes and one-line fixes do not need a plan.
3. **Write the test first.** Put it next to the code, using the suffix that picks the runner:
   - `*.unit.test.ts`: no network, no database. Mock `env`, Prisma and adapters.
   - `*.integration.test.ts`: needs PostgreSQL (and RabbitMQ for the spider).
   - `*.e2e.test.ts`: needs a running server or a real browser (`pnpm exec camoufox fetch` installs the browser).

   Write the fewest tests that prove the behaviour: the normal path, the real edge and failure cases, and the contract. Every line and branch you add or change must be covered.
4. **Keep it small and readable.** Reuse what exists before writing something new, and delete code you replace. In TypeScript use strict types: no `any`, no `@ts-ignore` without a one-line reason, no `!` assertions. Run `pnpm lint:fix` instead of formatting by hand.
5. **Check it works for real.** Run the feature through its real path (the page, the tRPC call, the container), not only in unit tests.
6. **Update `README.md` and `MEMORY.md`** where your change makes them out of date, and add one line to the `MEMORY.md` changelog.

### The checks to run

Before you open a pull request, this must pass from the repository root:

```bash
pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build
```

CI runs the same checks, plus the database migrations and the brain and spider integration tests against PostgreSQL and RabbitMQ. It does not run end-to-end tests, so run those yourself when you change the browser worker or a flow that has one.

Unit tests must pass on a machine with **no** `.env.test` file, because CI has none. If your test imports a module that reads the environment (for example the `core` package), mock it, as the other tests do. Before you push, run the unit tests with `.env.test` moved away.

### Database changes

- Change `apps/brain/prisma/schema.prisma`, then create a migration with `pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name <what_changed>` and commit the files under `prisma/migrations`.
- Migrations must be additive. Never edit a migration that has been merged.
- Never reset a database that holds data (`prisma migrate reset`, `db push --force-reset`, dropping schemas) unless a maintainer asks you to.

### Changes to the web app

- Follow [ACCESSIBILITY.md](ACCESSIBILITY.md): keyboard pass, screen reader spot check, readable content. Say what you checked in the pull request.
- Pages and tables are full width. Do not add `max-w-*` or `mx-auto` to a page root.

## Commits and pull requests

- **Commits:** use conventional commit subjects: `feat`, `fix`, `ci`, `chore`, `docs`, `test`. Keep the subject short and say why in the body.
- **Pull request:** fill in the [template](.github/pull_request_template.md). It starts with one question: *what issue does this solve for the end user?* Add the plan file, steps to test it, and screenshots for anything a person sees.
- **Keep it focused.** One change per pull request is easier to review and easier to undo.
- **Do not push to `main`.** Open a pull request. A maintainer merges it once CI passes and the review is done.
- **Secrets and personal data.** None in code, tests, logs, fixtures or screenshots.

## Using AI tools

AI-assisted work is welcome and is held to the same standard as any other contribution. You are responsible for every line you submit, and you must be able to explain it. Every new feature or behaviour change needs full test coverage and a plan file. Never paste secrets, credentials or personal data into an AI tool. The details are in the [README](README.md#ai-assisted-development) and the [Code of Conduct](CODE_OF_CONDUCT.md#ai-assisted-development). The repository also holds instructions that AI tools are expected to read before they work: [.github/copilot-instructions.md](.github/copilot-instructions.md), [AGENTS.md](AGENTS.md), and `.github/agents/`.

## License

This project is released under the [MIT License](LICENSE). By contributing, you agree that your contribution is licensed under it. Do not submit code you cannot license that way.

## Thank you

Every issue, review and fix helps. If something in this guide is unclear or out of date, open an issue or a pull request to fix it.
