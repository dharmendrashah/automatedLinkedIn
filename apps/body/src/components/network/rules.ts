// The limits on answering requests, as the owner decided on 2026-10-27. None of them is a LinkedIn number: they are cautious
// guesses. They are `INVITATION_LIMITS` of the contract plus what only the page needs; a test keeps the copy equal.
export const NETWORK_LIMITS = {
   perRun: 10,
   perDay: 50,
   gapSeconds: {
      min: 4,
      max: 9,
   },
   // How long a single answer waits in the browser, so it can still be undone, before anything is asked of LinkedIn.
   undoMs: 5000,
} as const

export const answersLeftToday = (answeredToday: number) => Math.max(0, NETWORK_LIMITS.perDay - answeredToday)

// How many requests may be chosen at once: a run's share, and never more than the day has left.
export const selectionCap = (answeredToday: number) => Math.min(NETWORK_LIMITS.perRun, answersLeftToday(answeredToday))
