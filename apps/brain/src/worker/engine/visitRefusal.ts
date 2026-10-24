import {
   AccountNotReadyError,
   PageVisitRefusedError,
   TaskBusyError,
   TaskNeedsProxyError,
   TaskRecentError,
   TaskRefusedError,
   TaskUnavailableError,
} from 'database'

// Why an account could not take a visit now, in a few words for the owner (.plan/visit-block-waiting-reasons.md). `later`
// clears by itself; `blocked` does not, so a block that only meets those ends with the reason instead of waiting for hours.
export type Refusal = { kind: 'later' | 'blocked'; text: string }

const later = (text: string): Refusal => ({
   kind: 'later',
   text,
})

const blocked = (text: string): Refusal => ({
   kind: 'blocked',
   text,
})

// null for an error that is not a refusal: the caller lets it go.
export const refusalOf = (error: unknown): Refusal | null => {
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
