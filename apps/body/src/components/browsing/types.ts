// What the browsing screens show about one LinkedIn account (.plan/account-browsing-ui.md). Until brain serves it, a `?sample=`
// switch on the page fills these shapes with invented data. Days are 'YYYY-MM-DD' in the account's own time zone, decided by the
// server, so the browser never converts them.

export type BrowseMode = 'SAFE' | 'MODERATE' | 'AGGRESSIVE'

// OPEN: can start a session now; WAITING_FOR_SLOT: has time today but the next slot is later; DAY_FULL, OUTSIDE_HOURS and
// NOT_BROWSING (paused, signed out or blocked) cannot start one.
export type BrowseState = 'OPEN' | 'WAITING_FOR_SLOT' | 'DAY_FULL' | 'OUTSIDE_HOURS' | 'NOT_BROWSING'

// Working days are ISO weekdays: 1 is Monday, 7 is Sunday. Times are minutes after midnight.
export type WorkingHours = {
   days: number[]
   startMinute: number
   endMinute: number
   timeZone: string
}

export type AccountBrowse = {
   accountId: string
   email: string
   clientLabel: string | null
   mode: BrowseMode
   usedSeconds: number
   state: BrowseState
   // A short phrase for when the next session may start, such as '14:20' or 'tomorrow at 09:00'; null when none is waiting.
   nextAt: string | null
   hours: WorkingHours
   // The zone the account's proxy exits in, offered as the default when the owner edits the hours.
   proxyTimeZone: string
   // Seconds browsed on each of the last 30 days, oldest first.
   last30: number[]
   // Working days in a row with nothing browsed, up to today.
   idleWorkingDays: number
   // Days of the last 14 that went over the limit.
   overLimitDays14: number
   // About how many profile views fit in what is left today; null when it cannot be told.
   viewsLeft: number | null
}

export type DayUsage = {
   day: string
   seconds: number
   sessions: number
   limitSeconds: number
}

export type DaySession = {
   id: string
   // Local time of day, 'HH:MM'.
   at: string
   action: string
   seconds: number
   result: string
}

export type UseMixPart = {
   label: string
   seconds: number
}
