import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { trpc } from '../../trpc'
import { READ_STATE, gapText, whenText } from './describe'
import { ToneBadge } from './tone-badge'

const STATUS_WORDS: Record<string, string> = {
   SUCCEEDED: 'finished well',
   FAILED: 'failed',
   IN_PROGRESS: 'running',
}

// Every active account and its message read: is it on a 2 hour cadence, and how did the last one end.
export const MessageReads = ({ now }: { now: number }) => {
   const reads = trpc.jobs.messageReads.useQuery(undefined, {
      refetchInterval: 30_000,
      retry: false,
   })
   const rows = reads.data ?? []
   const overdue = rows.filter(row => row.state === 'OVERDUE').length

   return (
      <div className="grid gap-3">
         <p className="text-muted-foreground text-sm">
            {reads.data
               ? `${rows.length} active accounts have their messages read about every 30 minutes (every 2 hours at night). ${overdue} overdue.`
               : 'Each active account has its messages read about every 30 minutes (every 2 hours at night).'}
         </p>
         {reads.isPending ? <Skeleton className="h-24 w-full" /> : null}
         {reads.error ? <p className="text-destructive text-sm">{reads.error.message}</p> : null}
         <div className="overflow-hidden rounded-lg border">
            <Table>
               <TableHeader className="bg-muted/50">
                  <TableRow>
                     <TableHead>User</TableHead>
                     <TableHead>LinkedIn account</TableHead>
                     <TableHead>On time</TableHead>
                     <TableHead>Last read</TableHead>
                     <TableHead>Gap before it</TableHead>
                     <TableHead>Last result</TableHead>
                     <TableHead>Next due</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {reads.data && rows.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground h-20 text-center text-sm">
                           No account is active.
                        </TableCell>
                     </TableRow>
                  ) : null}
                  {rows.map(row => (
                     <TableRow key={row.accountId}>
                        <TableCell className="text-xs">{row.user}</TableCell>
                        <TableCell className="text-xs">{row.account}</TableCell>
                        <TableCell>
                           <ToneBadge tone={READ_STATE[row.state].tone}>{READ_STATE[row.state].label}</ToneBadge>
                        </TableCell>
                        <TableCell className="text-xs">
                           {row.lastReadAt ? whenText(row.lastReadAt, now) : 'Never'}
                        </TableCell>
                        <TableCell className="text-xs">{gapText(row.gapMinutes)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                           {row.lastStatus
                              ? [row.lastVerdict ?? STATUS_WORDS[row.lastStatus], row.lastTrigger]
                                   .filter(Boolean)
                                   .join(' · ')
                              : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{row.nextDueAt ? whenText(row.nextDueAt, now) : '—'}</TableCell>
                     </TableRow>
                  ))}
               </TableBody>
            </Table>
         </div>
         {rows.length > 0 ? (
            <p className="text-muted-foreground text-xs">
               The gap is the time between the last two reads started; about 2 hours is expected.
            </p>
         ) : null}
      </div>
   )
}
