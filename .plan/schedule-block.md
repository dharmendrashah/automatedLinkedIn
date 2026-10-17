# Schedule block: plain, rich and in your time zone

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18 (answers in chat)

## Goal

Make the "On a schedule" block easy for a non-technical person: clear choices, only the settings that matter for the choice, a plain sentence of what will happen with the next run times, and the browser's time zone by default.

## Requirements

Confirmed by the owner:

- Ways to repeat: every few hours, every day, weekdays only (Mon to Fri), chosen days of the week (several), once a month (pick the day).
- Every few hours can be limited to "only between" a start and end time, and optionally to weekdays.
- A plain sentence of the schedule plus the next 3 run times.
- Time zone: a searchable list with city names; new schedule blocks and templates default to the browser's time zone.

Open questions: none.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Contracts: `scheduleSchema` gains `weekdays`, `month`, `days` (several weekdays as strings), `dayOfMonth` (1 to 28), and for hours `between`, `from`, `until`, `weekdaysOnly`. Old saved schedules keep working (`weekday` still read when `days` is empty). `nextScheduledRun` handles every case; templates take a time zone. Tests first.
- [x] 3. Brain: `workflow.nextRuns` returns the next 3 starts for a draft schedule; `workflow.create` takes the browser time zone for templates.
- [x] 4. Body: a dedicated schedule editor in the block dialog (choice cards with emojis, only relevant fields, presets for hours and times, day chips, a time zone search, the sentence and next runs); new schedule blocks get the browser time zone; the block's line on the canvas uses the same sentence.
- [x] 5. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- Daylight saving: start times are wall-clock times in the chosen zone (existing `zonedToUtc`, checked twice).
- Month days are 1 to 28 so every month has the day.
- "Only between" with an end before the start is refused by the schema.
- A saved schedule from before keeps its meaning; the worker computes `nextRunAt` with the new function on the next change or tick.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; contracts tests for each repeat kind, the window, DST.

## Outcome

- Shipped as planned: five repeats, the working-hours window and weekend skip for every few hours, a dedicated form (`schedule-settings.tsx`) with emoji choice cards, hour and time presets, day chips, a searchable time zone list with offsets and "Use mine", the plain sentence (`schedule-text.ts`, also the block's line on the canvas) and the next 3 runs from `workflow.nextRuns`. New schedule blocks and templates take the browser's time zone. The generic `fields` of the schedule block are now empty; the browser draws its own form.
- Verified: lint, ts:check, unit tests (contracts: weekdays, chosen days, month day, window, next 3; body: the sentences), brain integration, build.
- Not verified: the form in a browser (local sign-in needed).
