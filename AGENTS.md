<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# automatedLinkedIn – agent guide

The full project guide is [.github/copilot-instructions.md](.github/copilot-instructions.md). Read it before changing code, and read [MEMORY.md](MEMORY.md) before every task and update it when the task is done. The essentials:

- pnpm + Turborepo monorepo: `apps/brain` (Express 5, tRPC, Prisma 7, PostgreSQL 18), `apps/body` (React, Vite), `packages/{config,ui,eslint-config,tsconfig}`.
- Non-trivial tasks start with a plan in `.plan/<name>.md` (template: `.plan/_template.md`): double-check it, list edge cases, ask the user to lock any unconfirmed requirement, and only then execute. Mark it `done` and update `MEMORY.md` at the end.
- Run everything from the repo root. Definition of done: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Brain imports top-level `src` folders as bare modules through `module-alias`. `./aliases` must load before them in `server.ts`, and a new top-level folder must be added to `importOrder` in `.prettierrc`.
- Prisma: use `PrismaService.client` only, keep migrations additive, never reset a database with data, and keep every runtime import of brain in `dependencies`.
- Tests sit next to the code as `*.unit.test.ts`, `*.integration.test.ts` (Postgres) or `*.e2e.test.ts` (running server). Write the test first.
- Local database: `docker compose up -d postgres`. Full stack: `docker compose up -d --build`.
- Do not push, change remotes, or print tokens or the remote URL unless asked. Conventional commits, and no literal `!` in commit messages.
