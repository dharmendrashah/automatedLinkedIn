import { cn } from '@/lib/utils'

import { type AccountBrowse } from './types'

import { type Bucket, needAttention } from './overview'

const ITEMS: { bucket: Bucket; label: string }[] = [
   { bucket: 'FULL', label: 'Full today' },
   { bucket: 'NEAR_FULL', label: 'Near full' },
   { bucket: 'IDLE', label: 'Idle' },
   { bucket: 'NOT_BROWSING', label: 'Not browsing' },
]

type Props = {
   accounts: AccountBrowse[]
   counts: Record<Bucket, number>
   active: Bucket | null
   onChange: (bucket: Bucket | null) => void
}

// The state of every account in four counts. A count is also a filter: click it to list those accounts, click again to clear.
export const OverviewStrip = ({ accounts, counts, active, onChange }: Props) => {
   const attention = needAttention(accounts)

   return (
      <div className="grid gap-2">
         <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label="Filter accounts by browsing state"
         >
            {ITEMS.map(({ bucket, label }) => (
               <button
                  key={bucket}
                  type="button"
                  aria-pressed={active === bucket}
                  className={cn(
                     'hover:bg-muted/50 focus-visible:ring-ring/50 flex items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-[3px]',
                     active === bucket && 'border-primary bg-primary/5 ring-primary ring-1'
                  )}
                  onClick={() => onChange(active === bucket ? null : bucket)}
               >
                  <span className="text-muted-foreground text-sm">{label}</span>
                  <span className="text-xl font-semibold tabular-nums">{counts[bucket]}</span>
               </button>
            ))}
         </div>
         {attention.length > 0 ? (
            <p className="text-warning text-sm">
               {attention.length === 1 ? '1 account went' : `${attention.length} accounts went`} over the daily limit on
               3 or more of the last 14 days: {attention.map(({ email }) => email).join(', ')}.
            </p>
         ) : null}
      </div>
   )
}
