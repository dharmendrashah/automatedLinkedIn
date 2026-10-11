# Body UI foundation: Tailwind, shadcn, icons, dashboard, profile

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11 (request settles scope)

## Goal

Give `apps/body` a proper UI foundation (Tailwind, shadcn/ui, lucide icons), add the shadcn `dashboard-01` block as the signed-in app shell, and rebuild the profile page and logout button. Profile data is read-only here; editing happens on authentik's user settings page.

## Requirements

Confirmed:

- Install Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui and `lucide-react` in `apps/body`.
- Run `pnpm dlx shadcn@latest add dashboard-01` in `apps/body`.
- Profile page shows OIDC claims and the backend account, with a button that opens authentik (`authConfig.accountUrl`) to edit details.
- Logout button reachable from the dashboard shell (sidebar user menu) and the public header.
- Restyle existing pages (home, login/signup status, callback) with the new components.

Open questions: none.

## Scope and non-goals

- In scope: `apps/body` only (deps, Vite alias, `@/` path, CSS, components, routes).
- Out of scope: in-app profile editing, brain changes, token refresh, dashboard data (sample data from the block stays as placeholder).

## Approach

- [ ] Add Tailwind v4 plugin, `@/` alias (Vite + tsconfig), `components.json`, theme CSS
- [ ] Install `dashboard-01` and its dependencies
- [ ] Wire `/dashboard` route and sidebar user menu (profile, log out)
- [ ] Rebuild Profile page, Home, Header, status pages
- [ ] Remove obsolete `App.css` / old index.css styles
- [ ] Lint, type check, tests, build

## Edge cases and risks

- `apps/body/tsconfig.app.json` maps bare `trpc`, `auth`, `database`, `env` to brain; the `@/*` alias must not collide with them.
- shadcn scaffolds Next.js style files (`app/dashboard/page.tsx`); these must be adapted to Vite + react-router, with no `next/*` imports and no `"use client"` reliance.
- oxlint may flag generated shadcn files; fix without hand-formatting everything (Prettier handles it).
- Existing dark mode follows `prefers-color-scheme`; shadcn dark mode uses a `.dark` class, so the theme must keep working without a toggle.
- Bundle size grows (charts, table libs from dashboard-01); acceptable for now.
- Dependency versions are resolved from the registry at install time; the lockfile changes.
- Rollback: revert the commit; no database or infra impact. Docker build for body uses the same `pnpm build`.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`

## Outcome

Shipped: Tailwind v4 + shadcn (new-york, neutral, class-based dark mode through `next-themes`) + lucide in `apps/body`. `dashboard-01` installed and trimmed to a `/dashboard` route inside an authenticated sidebar layout (`DashboardLayout`); public pages use `PublicLayout`. Sidebar has Dashboard, Profile, a "Manage account" link to authentik and a user menu with Log out. Profile page shows OIDC claims and the backend account, with an "Edit details" button to authentik. `/` redirects signed-in users to `/dashboard`.

Deviations: the block's sample nav (Lifecycle, Projects, Documents, Quick Create) was removed; chart, cards and table keep sample data as placeholders. The block's Tabler icons stay (its components use them); new code uses lucide. Lint reports 9 warnings, all in generated shadcn files.

Follow-ups: replace the sample dashboard data with real outreach data; drop `@tabler/icons-react` once the block components move to lucide.
