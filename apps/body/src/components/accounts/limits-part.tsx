import { trpc } from '../../trpc'
import { Part } from './drawer-browsing'
import { limitLines, pendingLine, pendingNotice } from './limits'

const POLL_MS = 60_000

// "Today's limits" of one account: what each act may do today and what it did, and its pending invites. The random share behind a
// limit is never shown (.plan/lead-pipeline-p1-foundations.md).
export const LimitsPart = ({ accountId, name }: { accountId: string; name: string }) => {
   const query = trpc.linkedInAccount.room.useQuery(undefined, {
      retry: false,
      refetchInterval: POLL_MS,
   })
   const room = query.data?.find(entry => entry.accountId === accountId)
   const notice = room ? pendingNotice(name, room) : undefined

   return (
      <Part value="limits" title="Today's limits" summary={room ? limitLines(room)[0]?.text : undefined}>
         {room ? (
            <div className="grid gap-3">
               <dl className="grid gap-1 text-sm">
                  {limitLines(room).map(({ label, text }) => (
                     <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="tabular-nums">{text}</dd>
                     </div>
                  ))}
                  <div className="flex justify-between gap-3">
                     <dt className="text-muted-foreground">Pending invites</dt>
                     <dd className="tabular-nums">{pendingLine(room)}</dd>
                  </div>
               </dl>
               {notice ? <p className="text-warning text-sm">{notice}</p> : null}
               <p className="text-muted-foreground text-xs">The pending count covers only invites made here.</p>
            </div>
         ) : (
            <p className="text-muted-foreground text-sm">
               {query.isError ? 'The limits could not be read.' : 'Reading the limits...'}
            </p>
         )}
      </Part>
   )
}
