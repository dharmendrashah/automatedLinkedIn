import { isBudgetRefusal } from '@/components/accounts/budget-refusal'
import { StartAnywayDialog } from '@/components/accounts/start-anyway-dialog'
import { ConnectionRow } from '@/components/connections/connection-row'
import { readLine } from '@/components/connections/describe'
import { RemoveDialog } from '@/components/connections/remove-dialog'
import { type ConnectionItem as Row, countsOf, visibleConnections } from '@/components/connections/rows'
import { FailureCard } from '@/components/failure-card'
import { EmptyState, ToAccounts } from '@/components/network/notices'
import { useNow } from '@/components/network/use-now'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readableError } from '@/lib/trpc-error'
import { ChevronLeft, Loader2, RefreshCw, SearchX, ShieldAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { trpc } from '../trpc'

// How often the page asks again while a read or a removal goes on, and how many connections it draws at a time (a list can hold a
// thousand).
const POLL_MS = 3000
const PAGE = 100

type View = 'LIST' | 'OVER'

// What waits for the owner to say they understand the risk: the account may not browse now, so the same action is asked again with
// `startAnyway`.
type Blocked = {
   message: string
   again: () => void
}

const Skeletons = () => (
   <ul className="divide-y" aria-hidden>
      {[0, 1, 2, 3].map(row => (
         <li key={row} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid flex-1 gap-2">
               <Skeleton className="h-4 w-40" />
               <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-8 w-24" />
         </li>
      ))}
   </ul>
)

// "Connections": everyone one LinkedIn account is connected to, read from LinkedIn on request (.plan/my-connections.md). Message opens
// the conversation in the Unibox (or LinkedIn's own window for a person with no conversation yet), and Remove asks LinkedIn to remove
// one connection, after a dialog that names the person.
export const Connections = () => {
   const { accountId = '' } = useParams()
   const utils = trpc.useUtils()
   const now = useNow(1000).getTime()
   const account = trpc.linkedInAccount.get.useQuery({ id: accountId }, { retry: false })
   const list = trpc.connections.list.useQuery(
      { accountId },
      {
         retry: false,
         refetchInterval: query =>
            query.state.data?.account.reading || query.state.data?.connections.some(({ state }) => state === 'REMOVING')
               ? POLL_MS
               : false,
      }
   )
   const [view, setView] = useState<View>('LIST')
   const [query, setQuery] = useState('')
   const [limit, setLimit] = useState(PAGE)
   const [removing, setRemoving] = useState<Row | null>(null)
   const [blocked, setBlocked] = useState<Blocked | null>(null)
   const done = () => void utils.connections.list.invalidate({ accountId })
   const refresh = trpc.connections.refresh.useMutation({ onSuccess: done })
   const remove = trpc.connections.remove.useMutation({ onSuccess: done })

   const read = (startAnyway?: true) =>
      refresh.mutate(
         { accountId, ...(startAnyway && { startAnyway }) },
         {
            onError: error => {
               if (isBudgetRefusal(error)) {
                  setBlocked({ message: error.message, again: () => read(true) })
               }
            },
         }
      )

   const removeRow = (row: Row, startAnyway?: true) =>
      remove.mutate(
         { accountId, id: row.id, ...(startAnyway && { startAnyway }) },
         {
            onError: error => {
               if (isBudgetRefusal(error)) {
                  setBlocked({ message: error.message, again: () => removeRow(row, true) })
               }
            },
         }
      )

   if (list.error?.data?.code === 'NOT_FOUND') {
      return (
         <div className="grid w-full gap-4 px-4 lg:px-6">
            <FailureCard
               title="Account not found"
               message="This account does not exist, or it is not yours."
               to="/accounts"
               action="Back to LinkedIn accounts"
            />
         </div>
      )
   }

   const data = list.data
   const rows = data?.connections ?? []
   const counts = countsOf(rows)
   const shown = visibleConnections(rows, view, query)
   const searching = query.trim() !== ''
   const everRead = data?.account.readAt !== null && data?.account.readAt !== undefined
   const reading = data?.account.reading === true || refresh.isPending
   const problem = data?.account.problem !== undefined
   const error = [refresh.error, remove.error].find(item => item && !isBudgetRefusal(item))

   const readButton = (
      <Button variant="outline" size="sm" onClick={() => read()} disabled={reading || problem}>
         {reading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
         Read connections
      </Button>
   )

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <Link
            to={`/accounts/${accountId}`}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
         >
            <ChevronLeft className="size-4" aria-hidden />
            {account.data?.email ?? 'LinkedIn account'}
         </Link>

         <section className="grid gap-3" aria-labelledby="connections">
            <div className="flex flex-wrap items-end justify-between gap-3">
               <div className="grid gap-1">
                  <h2 id="connections" className="text-lg font-semibold">
                     Connections
                  </h2>
                  {data ? (
                     <p className="text-muted-foreground text-sm" role="status">
                        {readLine(data.account, now)}
                        {everRead && !problem ? ` ${data.account.removeLeft} removals left today.` : ''}
                     </p>
                  ) : null}
               </div>
               {data && !problem ? readButton : null}
            </div>

            {error ? <p className="text-destructive text-sm">{readableError(error)}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
               <Tabs
                  value={view}
                  onValueChange={value => {
                     setView(value === 'OVER' ? 'OVER' : 'LIST')
                     setLimit(PAGE)
                  }}
               >
                  <TabsList>
                     <TabsTrigger value="LIST">Connected ({counts.LIST})</TabsTrigger>
                     <TabsTrigger value="OVER">Removed or gone ({counts.OVER})</TabsTrigger>
                  </TabsList>
               </Tabs>
               <Input
                  className="w-72 max-w-full"
                  type="search"
                  placeholder="Search names and headlines"
                  aria-label="Search connections"
                  value={query}
                  onChange={event => {
                     setQuery(event.target.value)
                     setLimit(PAGE)
                  }}
               />
            </div>

            <div className="bg-card overflow-hidden rounded-xl border" aria-busy={reading}>
               {list.isPending ? (
                  <Skeletons />
               ) : list.error || !data ? (
                  <p className="text-destructive p-4 text-sm">
                     {list.error ? readableError(list.error) : 'The connections could not be loaded.'}
                  </p>
               ) : problem ? (
                  <EmptyState
                     icon={ShieldAlert}
                     title="LinkedIn asked this account to sign in"
                     text="Its connections cannot be read or changed until it is signed in again."
                     action={<ToAccounts label="Open accounts" />}
                  />
               ) : shown.length > 0 ? (
                  <>
                     <ul className="divide-y">
                        {shown.slice(0, limit).map(row => (
                           <ConnectionRow
                              key={row.id}
                              row={row}
                              account={data.account}
                              now={now}
                              onRemove={() => setRemoving(row)}
                           />
                        ))}
                     </ul>
                     {shown.length > limit ? (
                        <div className="border-t p-3 text-center">
                           <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE)}>
                              Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit}
                           </Button>
                        </div>
                     ) : null}
                     {data.cut ? (
                        <p className="text-muted-foreground border-t p-3 text-center text-xs">
                           The list is cut at a thousand connections. Search to find the rest on LinkedIn.
                        </p>
                     ) : null}
                  </>
               ) : reading && !everRead ? (
                  <Skeletons />
               ) : (
                  <EmptyState
                     icon={searching ? SearchX : Users}
                     title={
                        searching
                           ? 'Nothing matches'
                           : !everRead
                             ? 'No connections read yet'
                             : view === 'OVER'
                               ? 'Nobody has been removed or gone'
                               : 'No connections'
                     }
                     text={
                        searching
                           ? 'Clear the search to see everyone.'
                           : !everRead
                             ? 'Read them from LinkedIn to see who this account is connected to. A long list takes several minutes.'
                             : view === 'OVER'
                               ? 'People you remove, or who remove you, show here.'
                               : 'This account has no connections on LinkedIn.'
                     }
                     action={!searching && !everRead ? readButton : undefined}
                  />
               )}
            </div>
         </section>

         <RemoveDialog
            name={removing?.name ?? null}
            onCancel={() => setRemoving(null)}
            onConfirm={() => {
               if (removing) {
                  removeRow(removing)
               }

               setRemoving(null)
            }}
         />
         <StartAnywayDialog
            message={blocked?.message ?? null}
            onCancel={() => setBlocked(null)}
            onConfirm={() => {
               blocked?.again()
               setBlocked(null)
            }}
         />
      </div>
   )
}
