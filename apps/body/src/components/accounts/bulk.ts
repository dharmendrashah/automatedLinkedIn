import { type AccountStatus } from './types'

export type Skipped = { email: string; reason: string }

// "2 changed", or "2 changed, 1 skipped: a@x.com (already paused)": a partial result never reads as a success.
export const resultText = (changed: number, skipped: Skipped[]) => {
   if (skipped.length === 0) {
      return changed === 0 ? 'Nothing changed.' : `${changed} changed.`
   }

   const list = skipped.map(({ email, reason }) => `${email} (${reason})`).join('; ')

   return `${changed === 0 ? 'Nothing changed' : `${changed} changed`}, ${skipped.length} skipped: ${list}.`
}

// Who a bulk Pause or Resume changes, and who is left out and why.
export const pauseTargets = <A extends { email: string; status: AccountStatus }>(accounts: A[], pause: boolean) => {
   const change: A[] = []
   const skipped: Skipped[] = []

   for (const account of accounts) {
      const paused = account.status === 'DISABLED'

      if (paused === pause) {
         skipped.push({
            email: account.email,
            reason: pause ? 'already paused' : 'not paused',
         })
      } else {
         change.push(account)
      }
   }

   return {
      change,
      skipped,
   }
}
