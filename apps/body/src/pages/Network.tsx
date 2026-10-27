import { StartAnywayDialog } from '@/components/accounts/start-anyway-dialog'
import { AccountPicker } from '@/components/network/account-picker'
import { emptyView, isBusy, moreOnLinkedIn, readLine, usageText } from '@/components/network/answer-state'
import { ConfirmIgnoreDialog } from '@/components/network/confirm-ignore-dialog'
import { ListHeader } from '@/components/network/list-header'
import { EmptyState, SampleBanner, ToAccounts } from '@/components/network/notices'
import { RequestRow } from '@/components/network/request-row'
import { type Filter, countsOf, visibleRequests } from '@/components/network/rows'
import { answersLeftToday, selectionCap } from '@/components/network/rules'
import { type Scenario, createSampleSource, scenarioOf } from '@/components/network/sample-source'
import { canChoose, firstWaiting, fullReason, stillChosen, toggleChoice } from '@/components/network/selection'
import { type NetworkSource } from '@/components/network/source'
import { Toolbar } from '@/components/network/toolbar'
import { createTrpcSource } from '@/components/network/trpc-source'
import { useNetwork } from '@/components/network/use-network'
import { useNow } from '@/components/network/use-now'
import { PageStatus } from '@/components/page-status'
import { ineligibleReason } from '@/components/posting/accounts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { readableError } from '@/lib/trpc-error'
import { useQuery } from '@tanstack/react-query'
import {
   CheckCheck,
   Inbox,
   Loader2,
   RefreshCw,
   SearchX,
   ShieldAlert,
   ShieldCheck,
   UserCheck,
   UserPlus,
   UserX,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { type Account } from '@/components/accounts/types'
import { type AnswerAsk } from '@/components/network/types'

import { trpc } from '../trpc'

// How often the number of requests that wait for each account is asked again.
const WAITING_POLL_MS = 5000

const WORDS: Record<Filter, string> = {
   WAITING: 'waiting',
   ACCEPTED: 'accepted',
   IGNORED: 'ignored',
   ATTENTION: 'need a look',
}

const emptyIcon = (filter: Filter, searching: boolean, everRead: boolean) => {
   if (searching) {
      return SearchX
   }

   if (!everRead) {
      return Inbox
   }

   return { WAITING: CheckCheck, ACCEPTED: UserCheck, IGNORED: UserX, ATTENTION: ShieldCheck }[filter]
}

const Skeletons = () => (
   <ul className="divide-y" aria-hidden>
      {[0, 1, 2].map(row => (
         <li key={row} className="flex items-center gap-3 px-4 py-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid flex-1 gap-2">
               <Skeleton className="h-4 w-40" />
               <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-8 w-28" />
         </li>
      ))}
   </ul>
)

type RequestsProps = {
   source: NetworkSource
   accountId: string
   // The account drop-down, which lives in the same row as the read.
   picker: ReactNode
}

// One account's requests: the account and the read on top, the four views and the search, and the list with its header.
const Requests = ({ source, accountId, picker }: RequestsProps) => {
   const network = useNetwork(source, accountId)
   const now = useNow(500)
   const [filter, setFilter] = useState<Filter>('WAITING')
   const [query, setQuery] = useState('')
   const [chosenIds, setChosen] = useState<string[]>([])
   const [confirming, setConfirming] = useState(false)

   const { snapshot, holding } = network
   const requests = useMemo(() => snapshot?.requests ?? [], [snapshot])
   const counts = useMemo(() => countsOf(requests), [requests])
   const answeredToday = snapshot?.answeredToday ?? 0
   const cap = selectionCap(answeredToday)
   const chosen = useMemo(() => stillChosen(chosenIds, requests, cap), [chosenIds, requests, cap])
   const shown = useMemo(() => visibleRequests(requests, filter, query, now), [requests, filter, query, now])
   const choosable = shown.filter(request => canChoose(request) && holding[request.id] === undefined)
   const everRead = snapshot?.readAt !== undefined
   const searching = query.trim() !== ''
   const asks = (action: AnswerAsk['action'], ids: string[]): AnswerAsk[] => ids.map(id => ({ id, action }))
   const nameOf = (id: string) => requests.find(request => request.id === id)?.name ?? 'this person'

   const answer = (action: AnswerAsk['action'], ids: string[]) => {
      const [first] = ids

      if (first !== undefined) {
         network.answer(asks(action, ids), (nameOf(first).split(' ')[0] ?? '').trim() || 'this person')
         setChosen([])
      }
   }

   const read = (
      <Button variant="outline" size="sm" onClick={() => void network.read()} disabled={network.reading}>
         {network.reading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
         Read from LinkedIn
      </Button>
   )

   const top = (
      <div className="flex flex-wrap items-center justify-between gap-3">
         {picker}
         <div className="flex items-center gap-3">
            {snapshot ? (
               <span className="text-muted-foreground text-sm" role="status">
                  {readLine(snapshot, now)}
               </span>
            ) : null}
            {snapshot && !snapshot.problem ? read : null}
         </div>
      </div>
   )

   if (network.isPending) {
      return (
         <div className="grid gap-4">
            {top}
            <div className="bg-card overflow-hidden rounded-xl border">
               <Skeletons />
            </div>
         </div>
      )
   }

   if (network.error || !snapshot) {
      return (
         <div className="grid gap-4">
            {top}
            <p className="text-destructive text-sm">
               {network.error ? readableError(network.error) : 'The requests could not be loaded.'}
            </p>
         </div>
      )
   }

   if (snapshot.problem === 'SIGNED_OUT') {
      return (
         <div className="grid gap-4">
            {top}
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={ShieldAlert}
                  title="LinkedIn asked this account to sign in"
                  text="Its requests cannot be read or answered until it is signed in again."
                  action={<ToAccounts label="Open accounts" />}
               />
            </div>
         </div>
      )
   }

   const view = emptyView(filter, searching, everRead)
   const limit = fullReason(chosen.length, cap, answersLeftToday(answeredToday))
   const more = filter === 'WAITING' && !searching ? moreOnLinkedIn(snapshot) : undefined
   const base = searching
      ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`
      : `${counts[filter]} ${WORDS[filter]}`

   return (
      <div className="grid gap-4">
         {top}
         <Toolbar
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={next => {
               setFilter(next)
               setChosen([])
            }}
            counts={counts}
         />
         <div className="bg-card overflow-hidden rounded-xl border" aria-busy={network.reading}>
            {shown.length > 0 ? (
               <>
                  <ListHeader
                     selectable={filter === 'WAITING' && choosable.length > 0}
                     chosenCount={chosen.length}
                     room={Math.min(cap, choosable.length)}
                     text={more ? `${base} · ${more}` : base}
                     usage={usageText(answeredToday)}
                     limit={limit}
                     onToggleAll={() => setChosen(chosen.length > 0 ? [] : firstWaiting(choosable, cap))}
                     onClear={() => setChosen([])}
                     onAccept={() => answer('ACCEPT', chosen)}
                     onIgnore={() => (chosen.length === 1 ? answer('IGNORE', chosen) : setConfirming(true))}
                  />
                  <ul className="divide-y">
                     {shown.map(request => (
                        <RequestRow
                           key={request.id}
                           request={request}
                           held={holding[request.id]}
                           chosen={chosen.includes(request.id)}
                           fullReason={limit}
                           now={now}
                           onChoose={() => setChosen(toggleChoice(chosen, request.id, cap))}
                           onAnswer={action => answer(action, [request.id])}
                           onUndo={() => network.undo(request.id)}
                        />
                     ))}
                  </ul>
               </>
            ) : network.reading && !everRead ? (
               <Skeletons />
            ) : (
               <EmptyState
                  icon={emptyIcon(filter, searching, everRead)}
                  title={view.title}
                  text={view.text}
                  action={
                     view.read ? (
                        <Button
                           size="sm"
                           variant="outline"
                           onClick={() => void network.read()}
                           disabled={network.reading}
                        >
                           {network.reading ? (
                              <Loader2 className="animate-spin" aria-hidden />
                           ) : (
                              <RefreshCw aria-hidden />
                           )}
                           Read requests from LinkedIn
                        </Button>
                     ) : undefined
                  }
               />
            )}
         </div>
         {isBusy(snapshot) ? (
            <p className="sr-only" role="status">
               LinkedIn is being asked. This page updates by itself.
            </p>
         ) : null}
         <ConfirmIgnoreDialog
            count={confirming ? chosen.length : 0}
            onConfirm={() => {
               setConfirming(false)
               answer('IGNORE', chosen)
            }}
            onCancel={() => setConfirming(false)}
         />
         <StartAnywayDialog message={network.refusal} onConfirm={network.goAnyway} onCancel={network.stopAsking} />
      </div>
   )
}

const messageFor = (accounts: Account[]) =>
   accounts.length === 0
      ? {
           title: 'No LinkedIn account yet',
           text: 'Add an account first. Its connection requests show up here.',
        }
      : {
           title: 'No account is signed in',
           text: 'Its requests can only be read for an account that is signed in. Fix one on the accounts page.',
        }

// "My network": the connection requests one LinkedIn account received, to accept or ignore one by one or several at once.
export const Network = () => {
   const { accountId } = useParams()
   const navigate = useNavigate()
   const [params, setParams] = useSearchParams()
   const { client } = trpc.useUtils()
   const sample = params.get('sample')
   const scenario = sample === null ? undefined : scenarioOf(sample)
   // The real requests, unless the address asks for a view of the preview (`?sample=`), which makes up people and sends nothing.
   const source = useMemo(
      () => (scenario ? createSampleSource(scenario) : createTrpcSource(client)),
      [scenario, client]
   )
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const ids = useMemo(() => (accounts.data ?? []).map(({ id }) => id), [accounts.data])
   const waiting = useQuery({
      queryKey: ['network-waiting', source.key, ids],
      queryFn: () => source.waiting(ids),
      enabled: ids.length > 0,
      refetchInterval: WAITING_POLL_MS,
   })

   if (accounts.isPending) {
      return <PageStatus>Loading your accounts…</PageStatus>
   }

   if (accounts.error) {
      return <p className="text-destructive px-4 text-sm lg:px-6">{readableError(accounts.error)}</p>
   }

   const usable = accounts.data.filter(account => ineligibleReason(account.status) === undefined)
   const current = usable.find(account => account.id === accountId) ?? usable[0]
   const nothing = messageFor(accounts.data)
   const chooseScenario = (next: Scenario | undefined) =>
      setParams(
         previous => {
            const copy = new URLSearchParams(previous)

            if (next) {
               copy.set('sample', next)
            } else {
               copy.delete('sample')
            }

            return copy
         },
         { replace: true }
      )

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <h2 className="sr-only">Connection requests</h2>
         {scenario ? <SampleBanner scenario={scenario} onScenario={chooseScenario} /> : null}
         {current ? (
            <Requests
               key={`${source.key}-${current.id}`}
               source={source}
               accountId={current.id}
               picker={
                  <AccountPicker
                     accounts={accounts.data}
                     selectedId={current.id}
                     waiting={waiting.data ?? {}}
                     onPick={id => void navigate(`/network/${id}${params.size > 0 ? `?${params.toString()}` : ''}`)}
                  />
               }
            />
         ) : (
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={UserPlus}
                  title={nothing.title}
                  text={nothing.text}
                  action={<ToAccounts label="Open accounts" />}
               />
            </div>
         )}
      </div>
   )
}
