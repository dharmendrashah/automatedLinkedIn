import { StartAnywayDialog } from '@/components/accounts/start-anyway-dialog'
import { AccountPicker } from '@/components/network/account-picker'
import { pickedFrom, shownAccounts } from '@/components/network/accounts-pick'
import { emptyView, isBusy, moreOnLinkedIn, readLine, usageText } from '@/components/network/answer-state'
import { ConfirmIgnoreDialog } from '@/components/network/confirm-ignore-dialog'
import { ListHeader } from '@/components/network/list-header'
import { EmptyState, SampleBanner, ToAccounts } from '@/components/network/notices'
import { RequestRow } from '@/components/network/request-row'
import { type Filter, countsOf, visibleRequests } from '@/components/network/rows'
import { answersLeftToday, selectionCap } from '@/components/network/rules'
import { type Scenario, createSampleSource, scenarioOf } from '@/components/network/sample-source'
import {
   type CapOf,
   canChoose,
   chosenCounts,
   firstWaiting,
   fullReason,
   stillChosen,
   toggleChoice,
} from '@/components/network/selection'
import { type NetworkSource } from '@/components/network/source'
import { Toolbar } from '@/components/network/toolbar'
import { createTrpcSource } from '@/components/network/trpc-source'
import { useNetwork } from '@/components/network/use-network'
import { useNow } from '@/components/network/use-now'
import { PageStatus } from '@/components/page-status'
import { identityOf, ineligibleReason } from '@/components/posting/accounts'
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
import { type Answer } from '@/components/network/types'

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
   // The accounts shown, in the order of the account list.
   accounts: Account[]
   // The account drop-down, which lives in the same row as the read.
   picker: ReactNode
}

// The requests of the accounts shown, in one list: the accounts and the read on top, the four views and the search, and the list with
// its header. With several accounts each row says which account it is for, and the limits stay per account.
const Requests = ({ source, accounts, picker }: RequestsProps) => {
   const ids = useMemo(() => accounts.map(({ id }) => id), [accounts])
   const network = useNetwork(source, ids)
   const now = useNow(500)
   const [filter, setFilter] = useState<Filter>('WAITING')
   const [query, setQuery] = useState('')
   const [chosenIds, setChosen] = useState<string[]>([])
   const [confirming, setConfirming] = useState(false)

   const { snapshot, holding } = network
   const requests = useMemo(() => snapshot?.requests ?? [], [snapshot])
   const reads = useMemo(() => snapshot?.accounts ?? [], [snapshot])
   const readOf = useMemo(() => new Map(reads.map(read => [read.accountId, read])), [reads])
   const capOf: CapOf = useMemo(
      () => accountId => {
         const read = readOf.get(accountId)

         return read === undefined || read.problem ? 0 : selectionCap(read.answeredToday)
      },
      [readOf]
   )
   const many = accounts.length > 1
   const counts = useMemo(() => countsOf(requests), [requests])
   const chosen = useMemo(() => stillChosen(chosenIds, requests, capOf), [chosenIds, requests, capOf])
   const used = useMemo(() => chosenCounts(chosen, requests), [chosen, requests])
   const shown = useMemo(() => visibleRequests(requests, filter, query, now), [requests, filter, query, now])
   const choosable = shown.filter(request => canChoose(request) && holding[request.id] === undefined)
   const everRead = reads.some(({ readAt }) => readAt !== null)
   const reading = reads.length > 0 && reads.every(read => read.reading)
   const searching = query.trim() !== ''
   const accountOf = (accountId: string) => accounts.find(({ id }) => id === accountId)
   const reasonFor = (accountId: string) =>
      fullReason(
         used.get(accountId) ?? 0,
         capOf(accountId),
         answersLeftToday(readOf.get(accountId)?.answeredToday ?? 0)
      )
   const limit = [...used.keys()].map(reasonFor).find(reason => reason !== undefined)

   const answer = (action: Answer, answered: string[]) => {
      const asks = answered.flatMap(id => {
         const request = requests.find(other => other.id === id)

         return request ? [{ accountId: request.accountId, id, action }] : []
      })
      const first = requests.find(({ id }) => id === answered[0])

      if (first) {
         network.answer(asks, first.name.split(' ')[0]?.trim() || 'this person')
         setChosen([])
      }
   }

   const readAll = () => void network.read(ids.filter(id => readOf.get(id)?.reading !== true))

   const read = (
      <Button variant="outline" size="sm" onClick={readAll} disabled={reading}>
         {reading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
         {many ? `Read ${accounts.length} accounts` : 'Read from LinkedIn'}
      </Button>
   )

   const top = (
      <div className="flex flex-wrap items-center justify-between gap-3">
         {picker}
         <div className="flex items-center gap-3">
            {snapshot ? (
               <span className="text-muted-foreground text-sm" role="status">
                  {readLine(reads, now)}
               </span>
            ) : null}
            {snapshot && !reads.every(({ problem }) => problem) ? read : null}
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

   if (reads.length > 0 && reads.every(({ problem }) => problem)) {
      return (
         <div className="grid gap-4">
            {top}
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={ShieldAlert}
                  title={many ? 'LinkedIn asked these accounts to sign in' : 'LinkedIn asked this account to sign in'}
                  text="Their requests cannot be read or answered until they are signed in again."
                  action={<ToAccounts label="Open accounts" />}
               />
            </div>
         </div>
      )
   }

   const view = emptyView(filter, searching, everRead)
   const room = firstWaiting(choosable, capOf).length
   const more = filter === 'WAITING' && !searching ? moreOnLinkedIn(snapshot) : undefined
   const base = searching
      ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`
      : `${counts[filter]} ${WORDS[filter]}`
   const single = readOf.get(accounts[0]?.id ?? '')

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
         <div className="bg-card overflow-hidden rounded-xl border" aria-busy={reads.some(({ reading }) => reading)}>
            {shown.length > 0 ? (
               <>
                  <ListHeader
                     selectable={filter === 'WAITING' && choosable.length > 0}
                     chosenCount={chosen.length}
                     chosenAccounts={used.size}
                     room={room}
                     text={more ? `${base} · ${more}` : base}
                     usage={many ? 'The limits are for each account' : usageText(single?.answeredToday ?? 0)}
                     limit={limit}
                     onToggleAll={() => setChosen(chosen.length > 0 ? [] : firstWaiting(choosable, capOf))}
                     onClear={() => setChosen([])}
                     onAccept={() => answer('ACCEPT', chosen)}
                     onIgnore={() => (chosen.length === 1 ? answer('IGNORE', chosen) : setConfirming(true))}
                  />
                  <ul className="divide-y">
                     {shown.map(request => {
                        const owner = many ? accountOf(request.accountId) : undefined
                        const who = owner ? identityOf(owner, null) : undefined

                        return (
                           <RequestRow
                              key={request.id}
                              request={request}
                              account={who ? { name: who.name, imageUrl: who.imageUrl } : undefined}
                              held={holding[request.id]}
                              chosen={chosen.includes(request.id)}
                              fullReason={reasonFor(request.accountId)}
                              now={now}
                              onChoose={() => setChosen(toggleChoice(chosen, request, requests, capOf))}
                              onAnswer={action => answer(action, [request.id])}
                              onUndo={() => network.undo(request.id)}
                           />
                        )
                     })}
                  </ul>
               </>
            ) : reads.some(({ reading }) => reading) && !everRead ? (
               <Skeletons />
            ) : (
               <EmptyState
                  icon={emptyIcon(filter, searching, everRead)}
                  title={view.title}
                  text={view.text}
                  action={
                     view.read ? (
                        <Button size="sm" variant="outline" onClick={readAll} disabled={reading}>
                           {reading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                           {many ? 'Read the requests of these accounts' : 'Read requests from LinkedIn'}
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

const messageFor = (accounts: Account[], anyUsable: boolean) =>
   accounts.length === 0
      ? {
           title: 'No LinkedIn account yet',
           text: 'Add an account first. Its connection requests show up here.',
        }
      : anyUsable
        ? {
             title: 'None of those accounts can be read',
             text: 'Pick other accounts, or fix these on the accounts page.',
          }
        : {
             title: 'No account is signed in',
             text: 'Requests can only be read for an account that is signed in. Fix one on the accounts page.',
          }

// "My network": the connection requests of the owner's accounts, all of them in one list or the ones picked, to read from LinkedIn and
// to accept or ignore one by one or several at once.
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

   const usableIds = accounts.data.filter(({ status }) => ineligibleReason(status) === undefined).map(({ id }) => id)
   const picked = accountId ? [accountId] : pickedFrom(params.get('accounts'))
   const shownIds = shownAccounts(usableIds, picked)
   const shown = accounts.data.filter(({ id }) => shownIds.includes(id))
   const nothing = messageFor(accounts.data, usableIds.length > 0)
   const withParams = (change: (copy: URLSearchParams) => void) => {
      const copy = new URLSearchParams(params)

      change(copy)

      return copy
   }
   const chooseScenario = (next: Scenario | undefined) =>
      setParams(
         withParams(copy => (next ? copy.set('sample', next) : copy.delete('sample'))),
         { replace: true }
      )
   // The accounts the owner narrowed it to go in the address; none means all of them.
   const pickAccounts = (next: string[]) =>
      void navigate({
         pathname: '/network',
         search: withParams(copy =>
            next.length > 0 ? copy.set('accounts', next.join(',')) : copy.delete('accounts')
         ).toString(),
      })

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <h2 className="sr-only">Connection requests</h2>
         {scenario ? <SampleBanner scenario={scenario} onScenario={chooseScenario} /> : null}
         {shown.length > 0 ? (
            <Requests
               key={source.key}
               source={source}
               accounts={shown}
               picker={
                  <AccountPicker
                     accounts={accounts.data}
                     shown={shownIds}
                     waiting={waiting.data ?? {}}
                     onChange={pickAccounts}
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
