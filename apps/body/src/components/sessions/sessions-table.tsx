import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Video } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type SessionRow } from './types'

import { actionLabel, formatDuration, proxyLabel, timeAgo } from './describe'
import { SessionStatusBadge } from './session-status-badge'
import { useTaskCatalog } from './use-task-catalog'

type Props = {
   sessions: SessionRow[] | undefined
   loading: boolean
   error: string | undefined
   selectedId: string | null
   hasMore: boolean
   loadingMore: boolean
   onOpen: (id: string) => void
   onLoadMore: () => void
}

export const SessionsTable = ({
   sessions,
   loading,
   error,
   selectedId,
   hasMore,
   loadingMore,
   onOpen,
   onLoadMore,
}: Props) => {
   const catalog = useTaskCatalog()

   return (
   <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg border">
         <Table>
            <TableHeader className="bg-muted/50">
               <TableRow>
                  <TableHead>Result</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Took</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
               {loading ? (
                  <TableRow>
                     <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                     </TableCell>
                  </TableRow>
               ) : null}
               {error ? (
                  <TableRow>
                     <TableCell colSpan={6} className="text-destructive h-24 text-center text-sm">
                        {error}
                     </TableCell>
                  </TableRow>
               ) : null}
               {sessions?.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={6} className="text-muted-foreground h-28 text-center text-sm">
                        <Video className="mx-auto mb-2 size-5" />
                        No sessions yet. Add an account and a proxy, and its check shows up here.
                     </TableCell>
                  </TableRow>
               ) : null}
               {sessions?.map(session => (
                  <TableRow
                     key={session.id}
                     tabIndex={0}
                     role="button"
                     aria-label={`Open the session from ${new Date(session.startedAt).toLocaleString()}`}
                     data-state={session.id === selectedId ? 'selected' : undefined}
                     className={cn('cursor-pointer', session.id === selectedId && 'bg-muted/60')}
                     onClick={() => onOpen(session.id)}
                     onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                           event.preventDefault()
                           onOpen(session.id)
                        }
                     }}
                  >
                     <TableCell>
                        <SessionStatusBadge
                           status={session.status}
                           noAnswer={session.noAnswer}
                           kind={session.kind}
                           task={session.task}
                           verdict={session.verdict}
                        />
                     </TableCell>
                     <TableCell className="font-medium">{actionLabel(session, catalog)}</TableCell>
                     <TableCell>{session.linkedInAccount.email}</TableCell>
                     <TableCell>
                        <div className="grid">
                           <span className="font-mono text-xs">{proxyLabel(session)}</span>
                           {session.proxyCountry ? (
                              <span className="text-muted-foreground text-xs">{session.proxyCountry}</span>
                           ) : null}
                        </div>
                     </TableCell>
                     <TableCell title={new Date(session.startedAt).toLocaleString()}>
                        {timeAgo(new Date(session.startedAt))}
                     </TableCell>
                     <TableCell className="text-right tabular-nums">{formatDuration(session.durationMs)}</TableCell>
                  </TableRow>
               ))}
            </TableBody>
         </Table>
      </div>

      {hasMore ? (
         <Button variant="outline" size="sm" className="justify-self-center" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="animate-spin" /> : null}
            Show older sessions
         </Button>
      ) : null}
   </div>
)
}
