import { cn } from '@/lib/utils'

import { type AccountBrowse } from './types'

import { limitSecondsOf } from './modes'

// Thirty small bars, one per day, tall by the share of the day's limit; amber above it.
export const Strip = ({ account }: { account: AccountBrowse }) => {
   const limit = limitSecondsOf(account.mode)
   const days = account.last30.filter(seconds => seconds > 0).length

   return (
      <span
         className="flex h-6 items-end gap-px"
         role="img"
         aria-label={`Browsing on ${days} of the last ${account.last30.length} days`}
      >
         {account.last30.map((seconds, index) => (
            <span
               key={index}
               className={cn(
                  'w-1 rounded-[1px]',
                  seconds === 0 ? 'bg-muted' : seconds > limit ? 'bg-warning' : 'bg-primary/70'
               )}
               style={{ height: seconds === 0 ? 2 : `${Math.max(12, Math.min(100, (seconds / limit) * 100))}%` }}
            />
         ))}
      </span>
   )
}
