# Sidebar: group the menu and colour the icons

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14

## Goal

The sidebar is one flat list of 16 links (17 for the admin), all with grey icons, so nothing tells the daily pages from the setup and system ones. Group the links under short labels, trim the wording, and give each group its own icon colour so a page is found by colour and place as well as by name.

## Current behaviour (read from code)

- [app-sidebar.tsx](../apps/body/src/components/app-sidebar.tsx): `navMain` is a flat `NavItem[]`: Dashboard, Unibox, My network, To approve, Campaigns, Write a post, LinkedIn accounts, LinkedIn companies, LinkedIn posts, Workflows, Ideal customers, Usage, Proxies, Sessions, Service status, Profile. The admin also gets "Cron monitor" inserted before Profile (`role === 'ADMIN'`, from `trpc.me`). "To approve" carries a count badge (`trpc.draft.counts`, `waiting`), matched by `to === '/approve'`. "Manage account" is an external link pinned to the bottom (`NavSecondary`). The footer is `NavUser`.
- [nav-main.tsx](../apps/body/src/components/nav-main.tsx) renders one `SidebarGroup` with all items; active when the path equals `to` or starts with `to/`. Icons use the default colour.
- `components/ui/sidebar.tsx` already has `SidebarGroupLabel`. There is no `Collapsible` in `components/ui`. The sidebar is `collapsible="offcanvas"` (a sheet on mobile), so there is no icon-only rail to design for.
- Page titles in the site header come from [page-title.ts](../apps/body/src/lib/page-title.ts) and are separate from the sidebar labels.
- No existing plan in `.plan/` covers the sidebar.

## Requirements

Confirmed (from the owner's request):

- Simplify the sidebar menu.
- Group the items.
- Colour the icons so the menu is easier to understand.

Proposed (the owner can change these before lock):

- Four groups, in this order, each with a small label:
  1. Work (the daily pages): Dashboard, Unibox, To approve (keeps its badge).
  2. Outreach: Campaigns, Workflows, Ideal customers, Write a post.
  3. LinkedIn (the data): My network, Accounts, Companies, Posts.
  4. Settings: Usage, Proxies, Sessions, Service status, Cron monitor (admin only), Profile.
- "Manage account" and the user menu stay at the bottom as they are.
- Shorter labels inside the LinkedIn group, because the group label already says LinkedIn: "LinkedIn accounts" becomes "Accounts", "LinkedIn companies" becomes "Companies", "LinkedIn posts" becomes "Posts". Routes and page titles are not changed.
- One colour per group, on the icon only (not the text, not a tinted chip), with a light and a dark shade so contrast holds in both themes: Work blue, Outreach violet, LinkedIn sky or teal, Settings slate or amber for the system items. Final tones are picked when built and checked in both themes. The active row keeps today's highlight.
- Colour is never the only signal: every item keeps its text label and icon shape.
- All groups are open (no collapsing), so nothing is hidden behind a click.
- Only the sidebar changes: no route, page, API or data change.

## Decisions (locked 2026-11-14)

1. The four groups and their members are as proposed.
2. The LinkedIn labels are shortened to Accounts, Companies, Posts.
3. One colour per group, on the icon only.
4. All groups open (no collapsing).
5. New branch `feat/sidebar-groups-and-colour` from the latest `main` (PR #220 is merged).

## Scope and non-goals

- In scope: `app-sidebar.tsx`, `nav-main.tsx` (groups, labels, colours), a small pure module for the groups and its test.
- Out of scope: any route, page or backend change; the sidebar frame, header, footer and `NavUser`; any edit to `components/ui/*`; mobile behaviour beyond what the same component gives.

## Approach

- [x] Move the data into `nav-groups.ts`: `NAV_GROUPS` (label, colour class, items) and `groupsFor({ admin, waiting })`, which inserts Cron monitor for the admin and attaches the badge to To approve. Pure, no React.
- [x] `nav-groups.unit.test.ts`: the admin sees Cron monitor and nobody else does; every `to` appears once; the badge lands on To approve and is absent when 0 or unknown. No tests of colours or labels.
- [x] `nav-main.tsx`: render one `SidebarGroup` per group with a `SidebarGroupLabel`, apply the group colour to each icon, keep the active-route rule and the badge.
- [x] `app-sidebar.tsx`: use `groupsFor`; keep header, "Manage account" and footer unchanged.
- [ ] Check dark theme, a narrow width and the real signed-in sidebar. Done only for the light theme in a throwaway harness (menu only); the dark switch did not take in the harness. Not done: sign-in needed.
- [x] Root gate, Outcome, `MEMORY.md`, commit.

## Edge cases and risks

- Colour classes must be written out in full (Tailwind does not see built-up class names), for example `text-blue-600 dark:text-blue-400`.
- Contrast: a mid-tone icon colour on the sidebar background must stay readable in dark mode; the active highlight must not hide it.
- The admin-only item: a non-admin must never see it, and `me` still loading must show the non-admin list (as today).
- The badge is matched by route today; keep it by route so reordering cannot move it to another row.
- The group labels add height: 4 labels on top of 16 rows must still fit a laptop screen without scrolling; check at 768 px high.
- Shortened labels no longer match the page titles in the header ("Accounts" in the sidebar, "LinkedIn accounts" on the page). Acceptable, or change the titles too (an answer to question 2).
- Dev vs production: the same code path. No Docker, CI, dependency or data impact. Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, and Prettier on each changed file.
- Browser: light and dark, 1440 px and a narrow width, the badge, the admin item, and an active page inside each group.

## Outcome

Shipped: `nav-groups.ts` (four groups, `groupsFor`), `nav-main.tsx` renders labelled groups with a colour per group on the icons (Work blue, Outreach violet, LinkedIn teal, Settings amber), `app-sidebar.tsx` uses it; three LinkedIn labels shortened; the badge and the admin-only Cron monitor kept. Unit test `nav-groups.unit.test.ts`. Root gate passes. Page titles and routes unchanged ("Accounts" in the menu, "LinkedIn accounts" on the page).

Follow-ups: look at the real sidebar signed in, in dark theme and narrow; the full menu is taller than a 768 px screen, so it scrolls there.
