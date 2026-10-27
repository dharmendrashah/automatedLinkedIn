import { toast } from 'sonner'

import { type AccountBrowse, type BrowseMode, type WorkingHours } from './types'

import { hoursProblem } from './format'
import { modeOf } from './modes'
import { type SampleKind } from './sample'
import { useBrowseChange } from './use-browse'

// The three things the owner changes about an account's browsing: the daily limit, the working hours and the client. Each saves at
// once and offers an Undo. With sample data nothing is sent to brain.
export const useAccountEdits = (account: AccountBrowse, kind: SampleKind | null) => {
   const change = useBrowseChange(kind !== null)
   const { email, hours } = account

   return {
      setMode: (next: BrowseMode) => {
         const problem = hoursProblem(next, hours)

         if (problem) {
            toast.error(`${modeOf(next).label} is not possible with these hours. ${problem}`)

            return
         }

         change([account], { mode: next }, `${modeOf(next).label} set for ${email}`)
      },
      setHours: (next: WorkingHours) => change([account], { hours: next }, `Working hours changed for ${email}`),
      setClient: (clientLabel: string | null) => change([account], { clientLabel }, `Client changed for ${email}`),
   }
}
