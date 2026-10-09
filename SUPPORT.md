# Support

Thanks for using automatedLinkedIn. This project is maintained on a best-effort basis; there is no guaranteed response time.

## Before you ask

1. Read the [README](README.md), especially **Getting Started**.
2. Search existing issues and discussions; your question may already be answered.
3. Check these common setup problems:

| Symptom | Fix |
| --- | --- |
| Install or build fails on an unexpected Node version | Use the version in [.nvmrc](.nvmrc) and pnpm `12.10.1`. |
| Server exits with a missing `DATABASE_URL` error | Copy `apps/brain/.env.example` to `apps/brain/.env`. |
| Database connection refused | Start Postgres: `docker compose up -d postgres`. |
| `Cannot find module 'generated/prisma/client'` or Prisma types are missing | Run `pnpm install` (it generates the client) or `pnpm --filter @automatedLinkedIn/brain db:generate`. |
| Tables do not exist | Apply migrations: `pnpm --filter @automatedLinkedIn/brain db:migrate:deploy`. |
| Port already in use | Stop the other process or change `PORT` for `brain`; compose publishes 3000, 3001, and 5432 on localhost. |

## Where to get help

| I want to... | Go to |
| --- | --- |
| Report a bug | Open an issue with the **Bug report** template. |
| Request a feature | Open an issue with the **Feature request** template. |
| Ask a usage or setup question | Start a GitHub Discussion in the **Q&A** category. |
| Report a security problem | Follow [SECURITY.md](SECURITY.md). Do not use public issues. |
| Report a conduct problem | See [Enforcement](CODE_OF_CONDUCT.md#enforcement) in the Code of Conduct. |
| Contribute a fix or feature | Read [Contributing](README.md#contributing) and use the pull request template. |

## What to include

- What you expected and what happened.
- Steps to reproduce.
- Commit or image tag, Node and pnpm versions, and your OS.
- Relevant logs with secrets, tokens, and LinkedIn personal data removed.

## What is not supported

- Help using this software in ways that violate LinkedIn's Terms of Service or applicable law.
- Problems with LinkedIn accounts, such as restrictions or bans.
- Issues in third-party services or in unmodified upstream dependencies.
- Custom deployments, beyond what the repository's Dockerfiles and `docker-compose.yml` provide.
