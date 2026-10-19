import { SessionStatusBadge } from '@/components/sessions/session-status-badge'
import { ScanEye } from 'lucide-react'
import { Link } from 'react-router'

import { TestButton } from '../test-button'
import { type Account } from './types'
import { nextVisitNote } from './visit'

const formatDateTime = (value: string | Date) => new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

type Props = {
   account: Account
   // Why the visit cannot start from this row; undefined when it can.
   blocker: string | undefined
   busy: boolean
   onVisit: () => void
}

// The account's daily visit: how the last one went, when the next one is planned, and a way to run one now.
export const VisitCell = ({ account, blocker, busy, onVisit }: Props) => {
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
               <Link className="text-muted-foreground underline underline-offset-4" to={`/sessions?session=${lastVisit.id}`}>
                  {formatDateTime(lastVisit.startedAt)}
               </Link>
               <span className="text-muted-foreground text-xs">{lastVisit.trigger === 'manual' ? 'by you' : 'daily'}</span>
            </div>
         ) : (
            <span className="text-muted-foreground text-sm">Never visited</span>
         )}
         <span className="text-muted-foreground text-xs">
            Next: {note ?? (account.nextBrowseAt ? formatDateTime(account.nextBrowseAt) : '—')}
         </span>
         <div>
            <TestButton label="Visit now" icon={<ScanEye />} blocker={blocker} busy={busy} onClick={onVisit} />
         </div>
      </div>
   )
}
