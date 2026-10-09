# automatedLinkedIn

Automate your LinkedIn outreach: find the right people, personalize messages at scale, and track responses, without the daily manual grind.

> **Status:** early development. The architecture is in place and features are being built incrementally.

## Why It Is Necessary

LinkedIn is the primary channel for B2B networking, recruiting, and sales, but doing outreach well by hand is slow and inconsistent:

- **Time sink:** searching profiles, writing messages, and following up can consume hours every day.
- **Generic messaging:** copy-pasted templates get ignored; real personalization takes effort most people can't sustain.
- **Dropped follow-ups:** leads go cold because nobody remembers to follow up.
- **No visibility:** it is hard to know which messages, audiences, or timings actually work.

automatedLinkedIn exists to remove the repetitive parts of outreach while keeping the human in control of what gets said and to whom.

## How Effective It Can Become

Effectiveness depends on targeting and message quality, but the design goals are:

- **Consistency:** every lead gets a timely first message and follow-up, so fewer opportunities are lost.
- **Personalization at scale:** messages built from profile context rather than one-size-fits-all templates, which generally improves reply rates.
- **Measurable iteration:** tracking outcomes per campaign makes it possible to test and improve messaging over time.
- **Reclaimed time:** hours of manual work per week shift to conversations with people who have actually replied.

No specific results are promised; the goal is a repeatable, measurable process rather than a one-off boost.

## Benefits

- Save time on repetitive outreach tasks.
- Keep messaging personal and relevant.
- Never miss a follow-up.
- Learn what works through campaign tracking.
- Open source and self-hostable: you own your data and workflow.
- Type-safe end to end (tRPC + TypeScript), making it easy to extend.

## Tech Stack

Monorepo managed with [pnpm](https://pnpm.io) workspaces and [Turborepo](https://turbo.build).

| Path | Description |
| --- | --- |
| `apps/brain` | Node.js backend exposing a tRPC API |
| `apps/body` | React + Vite frontend |
| `packages/config` | Shared configuration and services |
| `packages/ui` | Shared UI components |
| `packages/eslint-config` | Shared ESLint configuration |
| `packages/tsconfig` | Shared TypeScript configuration |

## Getting Started

Prerequisites: the Node.js version in [.nvmrc](.nvmrc) and pnpm.

```bash
pnpm install
pnpm dev
```

Other useful scripts:

```bash
pnpm lint            # lint all packages
pnpm ts:check        # type-check
pnpm build           # build all packages
pnpm test:unit:run   # unit tests
```

## Responsible Use

Automating LinkedIn activity can violate LinkedIn's Terms of Service and local privacy or anti-spam laws if misused. You are responsible for how you use this software. Keep outreach honest, relevant, and low-volume, and respect the people you contact.

## Contributing

Contributions are welcome. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

### AI-assisted development

Using AI tools to develop this project is welcome, with two requirements for every new feature or behaviour change:

1. **Full test coverage.** Every line and branch you add or change is covered by tests written with the code, and `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` passes. Add integration tests (`pnpm test:integration:run`) when the change touches the database.
2. **A plan file.** Add `.plan/<feature-name>.md` (start from [.plan/_template.md](.plan/_template.md)) describing what the feature contains: goal, confirmed requirements, scope, edge cases, steps, and outcome. Requirements are confirmed before implementation starts.

You are responsible for everything you submit, AI-written or not. The repository ships agent instructions in [.github/copilot-instructions.md](.github/copilot-instructions.md), [AGENTS.md](AGENTS.md), and `.github/agents/`, and a living project log in [MEMORY.md](MEMORY.md); AI tools are expected to read them before working. See the [Code of Conduct](CODE_OF_CONDUCT.md#ai-assisted-development) for the full policy.

## License

[MIT](LICENSE) © 2026 Dharmedra Soni
