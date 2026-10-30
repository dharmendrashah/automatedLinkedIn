import { StartAnywayDialog } from '@/components/accounts/start-anyway-dialog'
import { AddPeopleDialog } from '@/components/my-network/add-people-dialog'
import {
   ALL_CLIENTS,
   type Pane,
   TABS,
   type View,
   type ViewChange,
   changeView,
   clientFor,
   clientView,
   readView,
   sortParam,
} from '@/components/my-network/address'
import { BulkBar, type BulkChange } from '@/components/my-network/bulk-bar'
import { Filters, SearchBox } from '@/components/my-network/filters'
import { FilterChips } from '@/components/my-network/filters/filter-chips'
import { type FilterOptions, FiltersSheet } from '@/components/my-network/filters/filters-sheet'
import {
   type PeopleFilters,
   apiFilters,
   chipsOf,
   readFilters,
   writeFilters,
} from '@/components/my-network/filters/model'
import { InviteDialog } from '@/components/my-network/invite-dialog'
import { PeopleTable } from '@/components/my-network/people-table'
import { PersonDrawer } from '@/components/my-network/person-drawer'
import { Pickers } from '@/components/my-network/pickers'
import {
   type NextStep,
   type ResultDays,
   SELECT_MAX,
   countText,
   keyAction,
   nextAfter,
   stepFrom,
   toggleChosen,
} from '@/components/my-network/rows'
import { AllClients, FirstVisit, ResultsLine, Today } from '@/components/my-network/summary'
import { useAnswer } from '@/components/my-network/use-answer'
import { useSeenOnLeave } from '@/components/my-network/use-seen-on-leave'
import { nameOf } from '@/components/my-network/words'
import { EmptyState, ToAccounts } from '@/components/network/notices'
import { PageStatus } from '@/components/page-status'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { flagOf } from '@/lib/country-flag'
import { downloadFile } from '@/lib/download-file'
import { readableError } from '@/lib/trpc-error'
import { UserPlus, Users } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { type Client, type PersonRow } from '@/components/my-network/types'

import { trpc } from '../trpc'

const PAGE_SIZE = 50

const TAB_WORDS: Record<View['tab'], string> = {
   NEEDS_ME: 'Needs me',
   WAITING: 'Waiting',
   EVERYONE: 'Everyone',
   DO_NOT_CONTACT: 'Do not contact',
}

const EMPTY_WORDS: Record<View['tab'], string> = {
   NEEDS_ME: 'Nothing needs you right now.',
   WAITING: 'Nobody is waiting for an answer.',
   EVERYONE: 'Nobody here yet.',
   DO_NOT_CONTACT: 'Nobody is on Do not contact.',
}

const FIELDS = ['INPUT', 'TEXTAREA', 'SELECT']
const CONTROLS = ['BUTTON', 'A']

// Keys belong to a field being typed in, and Enter to a focused button or link.
const isTyping = (event: KeyboardEvent) => {
   const { target } = event

   if (!(target instanceof HTMLElement)) {
      return false
   }

   return (
      target.isContentEditable ||
      FIELDS.includes(target.tagName) ||
      (event.key === 'Enter' && CONTROLS.includes(target.tagName))
   )
}

// The drawer opens on the chat when there is one.
const paneFor = (row: PersonRow | undefined): Pane => (row?.profileRead ? 'profile' : 'chat')

type PeopleProps = {
   client: Client
   accountId: string | undefined
   view: View
   // The Filters panel, kept in the address as `filters`.
   filters: PeopleFilters
   update: (change: ViewChange) => void
   pickers: ReactNode
}

// One client's people: Today, results, the four tabs, filters, the table and the drawer.
const ClientPeople = ({ client, accountId, view, filters, update, pickers }: PeopleProps) => {
   useSeenOnLeave(client.id)

   const [days, setDays] = useState<ResultDays>(7)
   const [inviting, setInviting] = useState<string[]>([])
   const utils = trpc.useUtils()
   const today = trpc.people.today.useQuery()
   const counts = trpc.people.counts.useQuery({ clientId: client.id })
   const results = trpc.people.results.useQuery({
      clientId: client.id,
      days,
   })
   const labels = trpc.label.list.useQuery()
   const [filtering, setFiltering] = useState(false)
   const filtersOn = chipsOf(filters).length
   const options = trpc.people.filterOptions.useQuery({ clientId: client.id }, { enabled: filtering })
   const query = {
      clientId: client.id,
      tab: view.tab,
      accountId,
      search: view.q,
      foundBy: view.found,
      fit: view.fit,
      label: view.label,
      onlyNew: view.onlyNew || undefined,
      filters: filtersOn > 0 ? apiFilters(filters) : undefined,
      sort: view.sort,
   }
   const people = trpc.people.list.useInfiniteQuery(
      {
         ...query,
         limit: PAGE_SIZE,
      },
      { getNextPageParam: last => last.next ?? undefined }
   )
   const rows = useMemo(() => people.data?.pages.flatMap(page => page.items) ?? [], [people.data])
   const ids = useMemo(() => rows.map(({ id }) => id), [rows])
   const [selectedId, setSelectedId] = useState<string | null>(null)
   const [chosen, setChosen] = useState<string[]>([])
   const [pane, setPane] = useState<Pane>('chat')
   const saveLabels = trpc.people.update.useMutation({ onSuccess: () => utils.people.invalidate() })
   const [adding, setAdding] = useState(false)
   const { answer, refusal, goAnyway, stopAsking } = useAnswer()
   const shownChosen = chosen.filter(id => ids.includes(id))
   const bulk = trpc.people.updateMany.useMutation({
      onSuccess: async changed => {
         toast.success(`${changed} ${changed === 1 ? 'person' : 'people'} changed.`)
         setChosen([])
         await utils.people.invalidate()
      },
      onError: error => toast.error(readableError(error)),
   })
   const exporting = trpc.people.export.useMutation({
      onSuccess: ({ fileName, csv }) => downloadFile(fileName, csv, 'text/csv;charset=utf-8'),
      onError: error => toast.error(readableError(error)),
   })

   const open = useCallback(
      (id: string, next?: Pane) => {
         setSelectedId(id)
         setPane(next ?? paneFor(rows.find(row => row.id === id)))
         update({ open: id })
      },
      [rows, update]
   )

   const act = (row: PersonRow, step: NonNullable<NextStep>) => {
      if (step.kind === 'REPLY') {
         open(row.id, 'chat')

         return
      }

      if (step.kind === 'INVITE') {
         setInviting([row.id])

         return
      }

      answer({
         accountId: step.accountId,
         requestId: step.requestId,
         action: 'ACCEPT',
         name: nameOf(row),
      })
      setSelectedId(nextAfter(ids, row.id))
   }

   useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
         const action = keyAction({
            key: event.key,
            typing: isTyping(event) || view.open !== null || adding,
            modified: event.metaKey || event.ctrlKey || event.altKey,
         })

         if (action === 'open' && selectedId) {
            event.preventDefault()
            open(selectedId)
         } else if (action === 'next' || action === 'previous') {
            event.preventDefault()
            setSelectedId(stepFrom(ids, selectedId, action === 'next' ? 1 : -1))
         }
      }

      window.addEventListener('keydown', onKey)

      return () => window.removeEventListener('keydown', onKey)
   }, [ids, selectedId, view.open, adding, open])

   const line = today.data?.find(({ clientId }) => clientId === client.id)
   const invitesLive = line?.invitesLive ?? false
   const stopped = (line?.stopped ?? []).map(({ accountId: id }) => id)
   const nobody = counts.data !== undefined && counts.data.EVERYONE === 0 && counts.data.DO_NOT_CONTACT === 0
   const filtered = Boolean(
      view.q || view.found || view.fit || view.label || view.onlyNew || accountId || filtersOn > 0
   )
   const setFilters = (next: PeopleFilters) =>
      update({
         filters: writeFilters(next),
         open: null,
      })
   const accountName = (id: string) => {
      const account = client.accounts.find(other => other.id === id)

      return account ? (account.displayName ?? account.email) : 'an account'
   }
   const filterOptions: FilterOptions = {
      countries: (options.data?.countries ?? []).map(({ value, count }) => ({
         value,
         label: value,
         icon: flagOf(value) ? <span aria-hidden>{flagOf(value)}</span> : undefined,
         hint: count.toLocaleString('en'),
      })),
      companies: (options.data?.companies ?? []).map(({ value, count }) => ({
         value,
         label: value,
         hint: count.toLocaleString('en'),
      })),
      labels: (options.data?.labels ?? []).map(({ value, count }) => ({
         value,
         label: value,
         hint: count.toLocaleString('en'),
      })),
      accounts: client.accounts.map(({ id }) => ({
         value: id,
         label: accountName(id),
      })),
   }

   return (
      <>
         {line ? <Today line={line} onGo={change => update({ ...change, open: null })} /> : null}
         {nobody ? <FirstVisit /> : null}
         <Tabs
            value={view.tab}
            onValueChange={tab =>
               update({
                  tab: TABS.find(item => item === tab) ?? null,
                  open: null,
               })
            }
         >
            <TabsList>
               {TABS.map(tab => (
                  <TabsTrigger key={tab} value={tab}>
                     {TAB_WORDS[tab]}
                     {counts.data ? (
                        <span className="text-muted-foreground tabular-nums">
                           {countText(counts.data[tab], counts.data.cap)}
                        </span>
                     ) : null}
                  </TabsTrigger>
               ))}
            </TabsList>
         </Tabs>
         <Filters
            view={view}
            lists={client.lists}
            labels={(labels.data ?? []).map(({ label }) => label)}
            exporting={exporting.isPending}
            filtersOn={filtersOn}
            search={<SearchBox key={client.id} value={view.q ?? ''} onSearch={q => update({ q, open: null })} />}
            onFilters={() => setFiltering(true)}
            onChange={update}
            onExport={() => exporting.mutate(query)}
            onAdd={() => setAdding(true)}
         />
         <FilterChips
            value={filters}
            accountName={accountName}
            onChange={setFilters}
            onClearAll={() =>
               update({
                  filters: null,
                  open: null,
               })
            }
         />
         {shownChosen.length > 0 ? (
            <BulkBar
               count={shownChosen.length}
               busy={bulk.isPending}
               onChange={(change: BulkChange) =>
                  bulk.mutate({
                     clientId: client.id,
                     ids: shownChosen,
                     ...change,
                  })
               }
               onClear={() => setChosen([])}
            />
         ) : null}
         <div className="bg-card overflow-hidden rounded-xl border" aria-busy={people.isFetching}>
            {people.error ? (
               <p className="text-destructive p-4 text-sm">{readableError(people.error)}</p>
            ) : people.isPending ? (
               <p className="text-muted-foreground p-4 text-sm">Loading people…</p>
            ) : rows.length > 0 ? (
               <PeopleTable
                  rows={rows}
                  accounts={client.accounts}
                  stopped={stopped}
                  invitesLive={invitesLive}
                  selectedId={selectedId}
                  chosen={shownChosen}
                  onOpen={id => open(id)}
                  onChoose={id => setChosen(toggleChosen(shownChosen, id))}
                  onChooseAll={() => setChosen(shownChosen.length > 0 ? [] : ids.slice(0, SELECT_MAX))}
                  onStep={act}
                  onInvite={row => setInviting([row.id])}
                  onLabels={(row, labels) =>
                     saveLabels.mutateAsync({
                        id: row.id,
                        labels,
                     })
                  }
                  sort={view.sort}
                  onSort={sort => update({ sort: sortParam(sort) })}
                  hasMore={people.hasNextPage}
                  loadingMore={people.isFetchingNextPage}
                  onMore={() => void people.fetchNextPage()}
               />
            ) : (
               <EmptyState
                  icon={Users}
                  title={filtered ? 'No one matches these filters.' : EMPTY_WORDS[view.tab]}
                  text={
                     filtered
                        ? 'Clear the search or a filter to see more people.'
                        : 'People show here as your accounts meet them.'
                  }
               />
            )}
         </div>
         <FiltersSheet
            open={filtering}
            value={filters}
            options={filterOptions}
            count={people.isFetching && !people.isFetchingNextPage ? null : (people.data?.pages[0]?.total ?? 0)}
            cap={counts.data?.cap ?? 10_000}
            scope={pickers}
            results={
               results.data && invitesLive ? <ResultsLine results={results.data} days={days} onDays={setDays} /> : null
            }
            onOpenChange={setFiltering}
            onChange={setFilters}
         />
         {view.open ? (
            <PersonDrawer
               id={view.open}
               order={ids}
               pane={pane}
               onPane={setPane}
               onMove={id => open(id, pane)}
               onClose={() => update({ open: null })}
               onGone={next => {
                  setSelectedId(next)
                  update({ open: next })
               }}
               onAnswer={ask => {
                  answer(ask)
                  setSelectedId(view.open ? nextAfter(ids, view.open) : null)
               }}
               {...(invitesLive && { onInvite: (id: string) => setInviting([id]) })}
            />
         ) : null}
         <AddPeopleDialog key={client.id} client={client} open={adding} onOpenChange={setAdding} />
         <InviteDialog
            key={inviting.join()}
            clientId={client.id}
            personIds={inviting}
            source={view.found ?? undefined}
            onClose={() => setInviting([])}
            onDone={() => {
               setInviting([])
               setChosen([])
            }}
         />
         <StartAnywayDialog message={refusal} onConfirm={goAnyway} onCancel={stopAsking} />
      </>
   )
}

const AllClientsToday = ({ pickers, onPick }: { pickers: ReactNode; onPick: (clientId: string) => void }) => {
   const today = trpc.people.today.useQuery()

   return (
      <>
         {pickers}
         {today.error ? <p className="text-destructive text-sm">{readableError(today.error)}</p> : null}
         {today.data ? <AllClients lines={today.data} onPick={onPick} /> : null}
      </>
   )
}

// "My network": every person the client's accounts know, what to do today, and the drawer to do it.
export const Network = () => {
   const { accountId } = useParams()
   const navigate = useNavigate()
   const [params, setParams] = useSearchParams()
   const view = readView(params)
   const clients = trpc.people.clients.useQuery(undefined, { retry: false })
   const update = useCallback(
      (change: ViewChange) => setParams(current => changeView(current, change), { replace: true }),
      [setParams]
   )

   if (clients.isPending) {
      return <PageStatus>Loading your clients…</PageStatus>
   }

   if (clients.error) {
      return <p className="text-destructive px-4 text-sm lg:px-6">{readableError(clients.error)}</p>
   }

   const client = clientFor(clients.data, view.client, accountId)

   if (!client) {
      return (
         <div className="grid w-full gap-4 px-4 lg:px-6">
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={UserPlus}
                  title="No LinkedIn account yet"
                  text="Add an account first. The people it knows show up here."
                  action={<ToAccounts label="Open accounts" />}
               />
            </div>
         </div>
      )
   }

   const all = view.client === ALL_CLIENTS && clients.data.length > 1
   const account = client.accounts.some(({ id }) => id === accountId) ? accountId : undefined
   const pickClient = (id: string) =>
      void navigate({
         pathname: '/network',
         search: changeView(
            params,
            id === ALL_CLIENTS ? { client: ALL_CLIENTS, open: null } : clientView(id)
         ).toString(),
      })
   const pickAccount = (id: string | undefined) =>
      void navigate({
         pathname: id ? `/network/${encodeURIComponent(id)}` : '/network',
         search: changeView(params, {
            client: client.id,
            open: null,
         }).toString(),
      })
   const pickers = (
      <Pickers
         clients={clients.data}
         clientId={all ? ALL_CLIENTS : client.id}
         accountId={account}
         onClient={pickClient}
         onAccount={pickAccount}
      />
   )

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <h2 className="sr-only">My network</h2>
         {all ? (
            <AllClientsToday pickers={pickers} onPick={pickClient} />
         ) : (
            <ClientPeople
               key={client.id}
               client={client}
               filters={readFilters(params.get('filters'))}
               accountId={account}
               view={view}
               update={update}
               pickers={pickers}
            />
         )}
      </div>
   )
}
