import {
   AccountNotReadyError,
   BrowseBudgetError,
   PageVisitRefusedError,
   TaskBusyError,
   TaskNeedsProxyError,
   TaskRecentError,
   TaskRefusedError,
   TaskUnavailableError,
} from 'database'

// Why an account could not take a visit now, in a few words for the owner (.plan/visit-block-waiting-reasons.md). `later`
// clears by itself; `blocked` does not, so a block that only meets those ends with the reason instead of waiting for hours.
export type Refusal = {
   kind: 'later' | 'blocked'
   text: string
   // For a refusal that says when the account can browse again: that moment, and how the owner reads it.
   until?: Date
   when?: string
}

const later = (text: string): Refusal => ({
   kind: 'later',
   text,
})

const blocked = (text: string): Refusal => ({
   kind: 'blocked',
   text,
})

const BUDGET_TEXTS: Record<BrowseBudgetError['reason'], string> = {
   OUTSIDE_OFFICE: 'an account is outside its working hours',
   DAY_FULL: 'an account has used its browsing time for today',
   BACKGROUND_FULL: 'an account has used its browsing time for today',
   TOO_SOON: 'an account is spreading its browsing time through the day',
   GAP: 'an account is resting between two sessions',
}

// Shorter than this is worth waiting for in place; longer is a time to come back at.
const DEFER_FROM_MS = 15 * 60_000

// When every chosen account is out of browsing time for hours, the block is put off until the first of them is back, instead
// of asking again every few seconds. Null while one account might take a visit, or the wait is short.
export const deferralOf = (refused: Map<string, Refusal>, usable: string[], now = new Date()) => {
   const times = usable.map(id => refused.get(id))
   const longer = times.flatMap(refusal =>
      refusal?.until && refusal.when && refusal.until.getTime() - now.getTime() > DEFER_FROM_MS
         ? [
              {
                 until: refusal.until,
                 when: refusal.when,
              },
           ]
         : []
   )

   if (usable.length === 0 || longer.length < usable.length) {
      return null
   }

   return longer.reduce((first, next) => (next.until < first.until ? next : first))
}

// null for an error that is not a refusal: the caller lets it go.
export const refusalOf = (error: unknown): Refusal | null => {
   if (error instanceof BrowseBudgetError) {
      return {
         kind: 'later',
         text: BUDGET_TEXTS[error.reason],
         until: error.until,
         when: error.when,
      }
   }

   if (error instanceof TaskBusyError) {
      return later('an account is busy with another visit')
   }

   if (error instanceof TaskRecentError) {
      return later('an account is in its 3 minute gap')
   }

   if (error instanceof PageVisitRefusedError && error.reason === 'CAP') {
      return later('an account reached its 15 visits a day')
   }

   if (error instanceof TaskUnavailableError) {
      return blocked('the browser worker has not announced this action yet; start or restart it')
   }

   if (error instanceof TaskNeedsProxyError) {
      return blocked('an account has no working proxy')
   }

   if (error instanceof AccountNotReadyError) {
      return blocked('an account is not signed in')
   }

   return error instanceof TaskRefusedError ? later('an account cannot act now') : null
}
