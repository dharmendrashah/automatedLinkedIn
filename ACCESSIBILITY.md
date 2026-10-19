# Accessibility

Accessibility matters to this project. automatedLinkedIn has a web app (`apps/body`) that people use to manage LinkedIn accounts, proxies, workflows and results. We want everyone, including people with disabilities and people who use assistive technology, to be able to use that app and to contribute to it.

This document explains what we aim for, what contributors should check, how to report a barrier, and what we already know is not good enough.

## Priorities

- **Accessibility target:** we work toward [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22). This is a goal that guides our work. It is not a claim that the app conforms, and no accessibility evaluation has been done yet.
- **Keyboard support:** everything you can do with a mouse should be possible with a keyboard alone, with a visible focus indicator and a logical tab order.
- **Screen reader support:** pages use real headings, landmarks, labels, buttons, links and tables, so they can be explored with a screen reader.
- **Readable content:** plain language, descriptive link and button text, enough color contrast, and meaning that never depends on color alone (a status such as "Signed in" or "Needs your attention" always has words, not only a colored badge).
- **Language:** the page declares its language (`lang="en"` in `apps/body/index.html`). If the app gains translations, each one must declare its own language.

## Contributor expectations

If you change anything a person sees or operates, please check the following before you open a pull request.

- **Use the shared components.** `apps/body/src/components/ui` is built on Radix UI, which provides keyboard handling and screen reader semantics. Prefer these over a clickable `div`. Use a real `button` for actions and a real link for navigation.
- **Keyboard pass (required for interactive changes).**
  - Tab and Shift+Tab reach every control in a sensible order, with no traps.
  - The focus indicator is always visible.
  - Enter, Space, Escape and arrow keys work where people expect them.
  - You can move into and out of dialogs, drawers, menus and popovers.
  - Where an action is only possible by dragging (the workflow canvas, sortable lists), there is also a keyboard way to do it.
- **Screen reader spot check (for new components or big changes).**
  - Controls have a clear accessible name that matches what they do.
  - Custom controls announce their role and state (expanded, selected, checked).
  - Errors, progress and results are announced (for example with a status or live region, as `sonner` toasts and status banners already do).
  - The reading order matches the visual order.
- **Content.**
  - Do not skip heading levels.
  - Data tables have column headers.
  - Images that carry meaning have alternative text; decorative icons are hidden from assistive technology.
  - Content still works at 200% zoom and in a narrow window.
  - Video has captions or a transcript if it has speech.
- **Evidence.** In the **How to test** section of your pull request, say what you checked (keyboard pass, screen reader and which one, zoom) and attach screenshots for visual changes.
- **Checks in CI.** CI runs lint, type checks, unit tests and the build. It does **not** scan for accessibility problems, so the manual checks above matter. Adding accessibility linting for the web app (for example oxlint's `jsx-a11y` rules) would be a welcome contribution. If you cannot fix a problem you found, describe it in the pull request.

## Reporting accessibility issues

If you hit a barrier, please tell us. We treat accessibility reports as expertise, not complaints.

1. **Open an issue** using the **Bug report** template and start the title with "Accessibility:". There is no separate accessibility template.
2. If you cannot use GitHub, email **dharmendrashaheagle@gmail.com** with the subject `ACCESSIBILITY: automatedLinkedIn`.
3. Include what you can:
   - What you were trying to do and what went wrong.
   - The page or screen where it happened.
   - Steps to reproduce.
   - Your operating system, browser and assistive technology, with versions.
   - A screenshot or recording, only if you are comfortable sharing one.

You do not need to tell us about a disability or give any personal information. Please remove secrets, tokens and LinkedIn personal data from anything you attach, as described in [SUPPORT.md](SUPPORT.md).

### Severity

Maintainers assign or confirm severity when they triage. You do not need to pick one.

- **Critical:** you cannot complete a core task (for example, you cannot sign in or cannot read the results).
- **Serious:** it is very hard to do, but there is a workaround.
- **Moderate:** an annoyance or an inconsistent experience.
- **Minor:** small impact on usability.

### How we respond

- We acknowledge the report respectfully and constructively.
- We explain next steps, known limits and anything we depend on.
- We offer a workaround while a fix is in progress, where one exists.
- We update the issue when the status or expected date changes.
- We may ask you to confirm that a fix works before we close the issue.
- We thank you for helping improve the project.

### Resolution goals

This project is maintained on a best-effort basis (see [SUPPORT.md](SUPPORT.md)), so these are goals and not guarantees. After triage, each issue gets a severity and an owner.

- **Critical:** aim to resolve within 30 days.
- **Serious:** aim to resolve within 60 days.
- **Moderate and minor:** aim to resolve within 90 days.

The goal starts when the issue is opened. If we will miss it, we say why, share a workaround if there is one, and give a new date.

## Ownership and maintenance

Accessibility is owned by the project maintainer. The owner:

- triages accessibility reports;
- tracks accessibility work and known barriers;
- escalates unresolved risks;
- keeps this document current, and reviews it when a user-facing change lands or a report comes in.

If the maintainer changes, the new maintainer takes over this role and the owner named here is updated.

## Supported environments

The web app is intended to work in current versions of Chrome, Edge, Firefox and Safari on desktop.

Nothing has been formally tested yet, so please do not read this list as a promise for any combination:

- **Assistive technology:** no combination of screen reader and browser has been evaluated. Reports from people using VoiceOver, NVDA, JAWS or TalkBack are welcome and help us decide where to test first.
- **Mobile browsers and small screens:** not evaluated. The app is designed for desktop-width screens.

## Known limitations

No accessibility audit has been done, so there may be barriers we have not found. These are the ones we expect from how the app is built:

- **Taking over a run's browser.** When a sign-in check needs the account owner (for example a security check), the app shows the remote browser as a stream of pictures that you click and type into. A screen reader cannot read that content. There is no equivalent text version yet.
- **Workflow canvas and drag and drop.** The canvas and sortable lists may not be fully usable with a keyboard or a screen reader. We have not checked each action.
- **Run recordings.** Recordings are silent videos of a browser. They have no captions or text description. The run's steps, logs and result are also available as text in the same view.
- **Color and contrast.** Colors have not been checked against contrast requirements across every screen and theme.

If you run into one of these or anything else, please open an accessibility issue.

## Feedback

Accessibility is an ongoing practice, not a one-time fix. To suggest improvements to this document or to how we work, open an issue or a pull request.
