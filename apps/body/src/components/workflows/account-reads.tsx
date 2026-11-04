import { formatDistanceToNow } from 'date-fns'

import { trpc } from '../../trpc'

const ago = (value: Date | string | null) => (value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : 'never')

// Under the settings of "If person state": when each account's connections and messages were last read, so the owner knows how fresh
// the answer is. A read older than the block's limit counts as not known.
export const AccountReads = ({ maxAgeHours }: { maxAgeHours: number }) => {
   const reads = trpc.workflow.accountReads.useQuery({ maxAgeHours }, { retry: false })

   if (!reads.data || reads.data.length === 0) {
      return null
   }

   return (
      <div className="grid gap-1 text-xs">
         {reads.data.map(read => (
            <p key={read.accountId} className="text-muted-foreground">
               {read.name}: connections read {ago(read.connectionsReadAt)}, messages read {ago(read.messagesReadAt)}
            </p>
         ))}
         {reads.data.some(read => read.connectionsOld || read.messagesOld) ? (
            <p className="text-warning">
               Add Get my connections or Get my conversations before this block for a fresh answer.
            </p>
         ) : null}
      </div>
   )
}
