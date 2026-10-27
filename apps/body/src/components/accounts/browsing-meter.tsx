import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from '../browsing/types'

import { formatMinutes, meterText } from '../browsing/format'
import { limitSecondsOf, modeOf } from '../browsing/modes'
import { NEAR_FULL_SHARE } from '../browsing/overview'
import { UseBar } from '../browsing/use-bar'

// Today's use against the account's own limit: the mode, "21 of 90 min", a bar and how much is left.
export const BrowsingMeter = ({ browse }: { browse: AccountBrowse | undefined }) => {
   if (!browse) {
      return <span className="text-muted-foreground text-sm">—</span>
   }

   if (browse.state === 'NOT_BROWSING') {
      return <span className="text-muted-foreground text-sm">Not browsing</span>
   }

   const limit = limitSecondsOf(browse.mode)
   const full = browse.state === 'DAY_FULL'
   const near = !full && browse.usedSeconds / limit >= NEAR_FULL_SHARE

   return (
      <div className="grid w-40 gap-1">
         <span className="flex items-center justify-between gap-1 text-sm">
            <span className="text-muted-foreground text-xs">{modeOf(browse.mode).label}</span>
            <span className={cn('flex items-center gap-1 tabular-nums', (full || near) && 'text-warning')}>
               {full ? <Lock className="size-3" aria-hidden /> : null}
               {meterText(browse.usedSeconds, limit)}
            </span>
         </span>
         <UseBar usedSeconds={browse.usedSeconds} limitSeconds={limit} />
         <span className="text-muted-foreground text-xs">
            {formatMinutes(Math.max(0, limit - browse.usedSeconds))} left
         </span>
      </div>
   )
}
