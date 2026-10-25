import { type BrowseMode } from './types'

// The three daily limits. The same numbers live in packages/contracts for brain; the browser does not load that package.
export const MODES: { mode: BrowseMode; label: string; minutes: number; line: string }[] = [
   {
      mode: 'SAFE',
      label: 'Safe',
      minutes: 90,
      line: 'Light, steady use. Best for accounts you rely on.',
   },
   {
      mode: 'MODERATE',
      label: 'Moderate',
      minutes: 120,
      line: 'More room for workflows and reads.',
   },
   {
      mode: 'AGGRESSIVE',
      label: 'Aggressive',
      minutes: 180,
      line: 'Most activity. Higher chance LinkedIn restricts the account.',
   },
]

export const modeOf = (mode: BrowseMode) => MODES.find(item => item.mode === mode) ?? MODES[0]

export const limitSecondsOf = (mode: BrowseMode) => modeOf(mode).minutes * 60
