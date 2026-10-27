import { Button } from '@/components/ui/button'

import { cn } from '@/lib/utils'

import { type AccountBrowse } from '../browsing/types'

import { needAttention } from '../browsing/overview'
import { type Summary } from './toolbar'

const TONES = {
   attention: 'border-warning/50 bg-warning/10',
   first: 'border-primary/30 bg-primary/5',
   fine: 'border-success/30 bg-success/10',
}

type Props = {
   summary: Summary
   onFix: (accountId: string) => void
}

// One sentence on top of the page: does anything need you, and what is next. With a problem it names the worst account and opens it.
export const SummaryBanner = ({ summary, onFix }: Props) => (
   <div
      role="status"
      className={cn(
         'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm',
         TONES[summary.tone]
      )}
   >
      <div className="grid gap-0.5">
         <p className="font-medium">{summary.text}</p>
         {summary.tone === 'fine' ? (
            <p className="text-muted-foreground">
               Nothing is posted or sent from here.
               {summary.progress ? ` ${summary.progress}` : ''}
            </p>
         ) : null}
      </div>
      {summary.fix ? (
         <Button size="sm" onClick={() => onFix(summary.fix ?? '')}>
            Fix it
         </Button>
      ) : null}
   </div>
)

// Accounts that went over their daily limit on 3 or more of the last 14 days.
export const OverLimitNote = ({ accounts }: { accounts: AccountBrowse[] }) => {
   const attention = needAttention(accounts)

   return attention.length > 0 ? (
      <p className="text-warning text-sm">
         {attention.length === 1 ? '1 account went' : `${attention.length} accounts went`} over the daily limit on 3 or
         more of the last 14 days: {attention.map(({ email }) => email).join(', ')}.
      </p>
   ) : null
}
