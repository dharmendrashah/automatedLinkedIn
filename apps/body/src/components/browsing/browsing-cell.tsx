import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from './types'

import { meterText } from './format'
import { limitSecondsOf, modeOf } from './modes'
import { NEAR_FULL_SHARE } from './overview'
import { UseBar } from './use-bar'

// The narrow table cell: the mode and today's use against the limit. It opens the drawer with the rest.
export const BrowsingCell = ({ account, onOpen }: { account: AccountBrowse; onOpen: () => void }) => {
   const limitSeconds = limitSecondsOf(account.mode)
   const full = account.state === 'DAY_FULL'
   const near = !full && account.usedSeconds / limitSeconds >= NEAR_FULL_SHARE

   return (
      <button
         type="button"
         aria-label={`Browsing time for ${account.email}`}
         className="hover:bg-muted/60 focus-visible:ring-ring/50 grid w-36 gap-1 rounded-md p-1.5 text-left outline-none focus-visible:ring-[3px]"
         onClick={onOpen}
      >
         {account.state === 'NOT_BROWSING' ? (
            <span className="text-muted-foreground text-sm">Not browsing</span>
         ) : (
            <>
               <span className="flex items-center justify-between gap-1 text-sm">
                  <span className="text-muted-foreground text-xs">{modeOf(account.mode).label}</span>
                  <span className={cn('flex items-center gap-1 tabular-nums', (full || near) && 'text-warning')}>
                     {full ? <Lock className="size-3" aria-hidden /> : null}
                     {meterText(account.usedSeconds, limitSeconds)}
                  </span>
               </span>
               <UseBar usedSeconds={account.usedSeconds} limitSeconds={limitSeconds} />
            </>
         )}
      </button>
   )
}
