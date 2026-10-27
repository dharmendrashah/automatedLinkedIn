export const SHOW_MS = 30_000
export const SHOW_MAX_MS = 120_000

// A secret shows for 30 seconds; Keep showing adds 30 more, but never past 2 minutes from when it was first shown.
export const extendedDeadline = (deadline: number, shownAt: number) =>
   Math.min(deadline + SHOW_MS, shownAt + SHOW_MAX_MS)

export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000))

export const expired = (deadline: number, now: number) => now >= deadline
