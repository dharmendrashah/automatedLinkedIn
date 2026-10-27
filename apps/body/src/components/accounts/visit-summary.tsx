import { SessionStatusBadge } from '@/components/sessions/session-status-badge'
import { Link } from 'react-router'

import { type Account } from './types'

import { nextVisitNote } from './visit'

const formatDateTime = (value: string | Date) =>
   new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

// The account's daily visit: how the last one went and when the next one is planned.
export const VisitSummary = ({ account }: { account: Account }) => {
   const { lastVisit } = account
   const note = nextVisitNote(account.status, account.nextBrowseAt)

   return (
      <div className="grid gap-1.5 py-1">
         {lastVisit ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
               <SessionStatusBadge
                  status={lastVisit.status}
                  noAnswer={false}
                  kind="TASK"
                  task="linkedin-browse"
                  verdict={lastVisit.verdict}
               />
               <Link
                  className="text-muted-foreground underline underline-offset-4"
                  to={`/sessions?session=${lastVisit.id}`}
               >
                  {formatDateTime(lastVisit.startedAt)}
               </Link>
               <span className="text-muted-foreground text-xs">
                  {lastVisit.trigger === 'manual' ? 'by you' : 'daily'}
               </span>
            </div>
         ) : (
            <span className="text-muted-foreground text-sm">Never visited</span>
         )}
         <span className="text-muted-foreground text-xs">
            Next: {note ?? (account.nextBrowseAt ? formatDateTime(account.nextBrowseAt) : '—')}
         </span>
      </div>
   )
}
