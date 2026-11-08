# Install Elephant-Goldfish Model (EGM) for VS Code Copilot and OpenCode

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-08
- Locked by user: yes, 2026-11-08 (the request settles every requirement below)

## Goal

Make EGM (upstream `google/elephant-goldfish-model`, pinned at commit `e9e1f06`, checked out in `vendor/elephant-goldfish-model`) usable in this repo from VS Code Copilot and OpenCode. EGM reads `.plan/` and `.github/copilot-instructions.md` before it runs, and saves its plans in `.plan/` in the same format as `.plan/_template.md`.

## Requirements

Confirmed:

- Install EGM in this repo for VS Code Copilot and OpenCode.
- EGM checks `.plan/` and `.github/copilot-instructions.md` before it runs.
- Plans are saved in `.plan/` in the existing template format. This extends the planning workflow in `.github/copilot-instructions.md`; it does not replace it.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: pin the vendored EGM checkout; OpenCode V1 bundle outside the repo; symlinks of the seven `egm-*` skills into `.github/skills/`; an EGM section in `.github/copilot-instructions.md`; a bullet in `AGENTS.md`; gitignore entries; a decision line in `MEMORY.md`.
- Out of scope: running any EGM skill or model call (needs explicit model-use authorisation); committing `vendor/`; changing the global `opencode` (v2.2.6) or shell config; editing EGM itself.

## Approach

- [x] Confirm `vendor/elephant-goldfish-model` is a clean git clone at `e9e1f06` (untracked by this repo).
- [x] Install OpenCode `1.18.29` (EGM's V1 target) into `$HOME/.local/share/opencode-v1`.
- [x] Run `adapters/opencode/install.py` into `$HOME/.local/share/egm/automatedlinkedin` (outside the repo, absolute paths, pinned hashes).
- [x] Verify with `opencode debug config` and `opencode debug skill` (no model calls).
- [x] Symlink the seven `egm-*` skills from `vendor/elephant-goldfish-model/skills/` into `.github/skills/`.
- [x] Add the EGM section to `.github/copilot-instructions.md` (package root, `.plan/` rules, artifact directory `.plan/egm`, final plan in template format).
- [x] Add a short EGM bullet to `AGENTS.md` so OpenCode gets the same rules.
- [x] Gitignore `vendor/elephant-goldfish-model/` and `.plan/egm/`.
- [x] Update `MEMORY.md` (decision, one changelog line) and set this plan to `done`.

## Edge cases and risks

- `vendor/` holds a nested git repo. Without a gitignore entry, `git add` records it as an embedded repo. A fresh clone must run `git clone https://github.com/google/elephant-goldfish-model vendor/elephant-goldfish-model` and check out `e9e1f06` before the skill symlinks resolve; otherwise they dangle.
- The skill symlinks are relative paths into `vendor/`. VS Code's discovery of symlinked skills is not verified here.
- Global `opencode` is v2.2.6, which uses V2 interfaces the adapter does not target. EGM must be launched with the V1 binary and `OPENCODE_CONFIG` pointing at the generated `opencode.json`.
- The installer refuses an existing destination and rejects paths with `.env.` or template characters. Re-install needs a new path or a manual removal.
- The generated OpenCode config holds absolute paths and hashes for this machine. It stays outside the repo.
- `.plan/egm/` holds working drafts and reviewer reports that may quote plan text. Gitignored so they are not committed; the final plan in `.plan/<name>.md` is committed.
- EGM reviewer isolation and the `.plan/` write path are not verified against a live model run.
- Rollback: delete the `.github/skills/egm-*` symlinks, the EGM sections in `copilot-instructions.md` and `AGENTS.md`, the two gitignore lines, and the `$HOME/.local/share/egm` directory.

## Verification

- `git -C vendor/elephant-goldfish-model rev-parse --short HEAD` prints `e9e1f06`.
- `OPENCODE_CONFIG=$HOME/.local/share/egm/automatedlinkedin/opencode.json $HOME/.local/share/opencode-v1/node_modules/.bin/opencode debug skill` lists the seven `egm-*` skills.
- Every `.github/skills/egm-*/SKILL.md` resolves through its symlink.
- `git status` no longer lists `vendor/`.
- Repo gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (no code changed, run for the rule).
- Not run: any EGM skill (model use), EGM's own `pytest` suite (pytest is not installed).

## Outcome

Shipped: vendored EGM at `e9e1f06` (already present, untracked); OpenCode V1 `1.18.29` in `~/.local/share/opencode-v1`; EGM bundle in `~/.local/share/egm/automatedlinkedin`; seven `.github/skills/egm-*` symlinks; EGM sections in `.github/copilot-instructions.md` and `AGENTS.md`; `.gitignore` entries for `vendor/elephant-goldfish-model/` and `.plan/egm/`; `MEMORY.md` decision and changelog.

Deviation: the global `~/.config/opencode/opencode.json` has keys OpenCode V1 rejects, so the EGM launch sets `XDG_CONFIG_HOME=$HOME/.local/share/egm/xdg-config` (this also keeps the global MCP servers and plugins out of the EGM session). The global config was not changed.

Verified: `opencode debug config` loads the EGM config; `opencode debug skill` lists all seven `egm-*` skills; `opencode debug agent egm` loads; the repo gate `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` passed.

Launch EGM in OpenCode:

```sh
XDG_CONFIG_HOME="$HOME/.local/share/egm/xdg-config" OPENCODE_CONFIG="$HOME/.local/share/egm/automatedlinkedin/opencode.json" "$HOME/.local/share/opencode-v1/node_modules/.bin/opencode"
```

Follow-ups: a live EGM run (needs model-use authorisation); check VS Code discovers the symlinked skills; reviewer isolation not verified; a fresh clone needs `vendor/` restored before the skill links work; the installed bundle is a snapshot, so re-run the installer into a new path after a pin change.
