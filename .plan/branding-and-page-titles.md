# Branding, favicon, page titles and head tags for the web app

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (the request settles the goal; the design choices below are mine and easy to change)

## Goal

Whoever has the app open in a tab, a history list or a bookmark can tell which app and which page it is: a real icon in the tab and bookmark, a title that names the page ("Unibox · automatedLinkedIn"), and the usual head and meta tags. Today the tab says "body", the icon is the Vite default (a purple bolt), `/favicon.ico` answers with the app's HTML, and there is no description or theme colour.

## What exists today (checked in code, 2026-10-24)

- `apps/body/index.html`: `<title>body</title>`, one `<link rel="icon" href="/favicon.svg">` (Vite's default art), no description, theme colour, manifest, touch icon or social tags.
- `apps/body/public/`: `favicon.svg` (Vite default), `favicon-alert.svg` (red circle with an exclamation mark, swapped in by the takeover alert), `icons.svg`.
- No page sets `document.title`. The header (`site-header.tsx`) has its own map of titles that lacks Workflows, Lists, Ideal customers, Usage, Proxies, Sessions, Service status and Cron monitor, so those pages show an empty heading.
- The takeover alert (`components/takeover/alert.ts`) flickers the title and the first `link[rel~="icon"]`, and puts back the title it saw when the flicker started (stale if the page changed meanwhile).
- nginx (`apps/body/nginx.conf`) answers every unknown path with `index.html`, so a browser asking for `/favicon.ico` gets HTML with status 200.
- The brand in the app is the name "automatedLinkedIn" and the paper-plane (`Send`) icon in the primary colour (`PublicLayout`, sidebar).

## Requirements

Confirmed by the request of 2026-10-24:

- C1 Favicon and ico, and branding in the tab and in a bookmark.
- C2 A title and meta tags in the head so a user sees what page they are on and can bookmark it.

Design choices (mine, change on request):

- D1 Brand mark: the app's own paper-plane in white on a rounded square in the primary blue, so the tab matches the header. SVG favicon for modern browsers, `favicon.ico` (16, 32, 48) for the rest, `apple-touch-icon.png` (180, full square), `icon-192.png` and `icon-512.png` for the manifest.
- D2 Title format: `<Page> · automatedLinkedIn`; the bare `automatedLinkedIn` for the shell. One table of route titles feeds both the tab title and the header heading.
- D3 A personal name never goes into the title (browser history and bookmarks sync to other places): a conversation is "Unibox"; a workflow editor shows the workflow's own name, which the owner chose.
- D4 Head tags: description, `theme-color` for light and dark, `application-name`, `robots` noindex (a private tool behind sign-in), Open Graph and Twitter card text without an image (an image needs an absolute address that depends on the host), and a web manifest with `display: browser` (no install prompt).
- D5 No new dependency: icons are generated once with ImageMagick and `rsvg-convert` and committed; the title is set by a small module and one component, not a head library.

Open questions: none.

## Scope and non-goals

- In scope: icons and manifest, `index.html` head, route title table, title component, header heading from the same table, alert flicker restoring the right title and swapping every icon link, nginx rules for the icon files, tests, `MEMORY.md`.
- Out of scope: a logo redesign, a social share image, installable app behaviour, per-conversation titles, an unread count in the title, translated titles.

## Approach

- [ ] 1. Tests first: `lib/page-title.ts` (`titleFor`, `formatTitle`, `setPageTitle`, `getPageTitle`) for every route of `App.tsx`, the dynamic ones and an unknown path.
- [ ] 2. `PageTitle` component (inside the router, renders nothing) and the header heading from the same table; workflow editor sets its own name.
- [ ] 3. Alert: restore the title the app last set, and swap every icon link (and put each back); update its tests.
- [ ] 4. Icons and manifest: `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`; the head of `index.html`.
- [ ] 5. nginx: the icon files are served with a day of cache and a 404 when missing, instead of the HTML fallback.
- [ ] 6. Verify, `MEMORY.md`, set this plan to done.

## Edge cases and risks

- A title set while the takeover alert blinks: the alert puts back the app's last title, not an old copy.
- `/callback` and sign-in redirects run before the app knows the page; the title is "Signing in" there, then the target page sets its own.
- The workflow editor loads its name after the page shows: the title reads "Workflow" until the name arrives, and falls back to it on error.
- Several `link rel=icon` tags: the alert changes all of them, so the blinking icon is the same whichever one the browser chose.
- A cached old favicon (browsers keep icons for a long time): the new files keep their names where they differ (`favicon.ico` is new), and the SVG is referenced with `?v=` only if it does not refresh; not worth a build step otherwise.
- Staging and local use the same files; the manifest's `start_url` is `/` so it works on every host.
- `public/messages.json` stays out of builds as before; nothing here touches it.
- Rollback: revert the commit; nothing stored changes.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Look at the icons rendered at 16, 32 and 180 px; run the built files behind the real nginx config and check `/favicon.ico` (200, an icon), a missing icon (404) and `/accounts` (still the app).
- In a browser: the tab title and icon on each page, and the alert still blinks.

## Outcome

Shipped 2026-10-24: brand icon (paper-plane on the primary blue) as `favicon.svg`, `favicon.ico` (16, 32, 48), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `site.webmanifest`; the head of `index.html` (title, description, theme colours for light and dark, noindex, Open Graph and Twitter text, icon and manifest links); one route-title table (`lib/page-title.ts`) that names the tab (`PageTitle`, mounted in `main.tsx`) and the header heading, so every page now has a heading; the workflow editor names the tab after the workflow; the takeover alert swaps every icon tag and restores the app's current title; nginx serves the icon files with a day of cache and the manifest type.

Deviations: the Unibox page is now loaded on demand (`App.tsx`), because the build already warned that the main chunk was over 500 kB before this change (the Unibox pushed it to 634 kB) and the repo keeps the build free of warnings; it is 489 kB now, close to the limit. The `PageTitle` component lives in `main.tsx`, not `App.tsx`, to avoid wrapping every route.

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run`, `pnpm build`; the icons looked at at 16 and 180 px; the built app behind the real nginx config (`/favicon.ico` 200 `image/x-icon`, the manifest `application/manifest+json`, `/accounts` still the app); headless Chrome on `/login`, `/signup` and an unknown path gave the expected titles. Not run: a signed-in browser (the titles of the signed-in pages follow the same table, which has a test for every route) and the takeover alert blinking in a real tab (unit tests only).

Follow-ups: a social share image (needs an absolute address per host); an unread count in the title.
