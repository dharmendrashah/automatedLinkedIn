import { AccountDialogs } from '@/components/accounts/account-dialogs'
import { AccountList } from '@/components/accounts/account-list'
import { AccountsDrawers } from '@/components/accounts/accounts-drawers'
import { AccountsToolbar } from '@/components/accounts/accounts-toolbar'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { readAddress, writeAddress } from '@/components/accounts/address'
import { COLUMNS, columnsFrom, columnsToText } from '@/components/accounts/columns'
import { readyCounts } from '@/components/accounts/loading'
import { NeedsProxyNotice } from '@/components/accounts/needs-proxy-notice'
import { OverLimitNote, SummaryBanner } from '@/components/accounts/summary-banner'
import { dayProgress, progressSentence } from '@/components/accounts/today'
import { todayCsv } from '@/components/accounts/today-csv'
import {
   clientsOf,
   countChips,
   filterRows,
   groupRows,
   rowsOf,
   showTools,
   sortRows,
   summaryOf,
} from '@/components/accounts/toolbar'
import { useAccountActions } from '@/components/accounts/use-account-actions'
import { useAccountsWithProxy } from '@/components/accounts/use-accounts-with-proxy'
import { useDrawerNav } from '@/components/accounts/use-drawer-nav'
import { useToday } from '@/components/accounts/use-today'
import { visitRunning } from '@/components/accounts/visit'
import { BrowseSampleBanner } from '@/components/browsing/browse-sample-banner'
import { BulkBrowseBar } from '@/components/browsing/bulk-browse-bar'
import { useBrowsing } from '@/components/browsing/use-browse'
import { EmptyState } from '@/components/network/notices'
import { downloadCsv } from '@/components/posting/posts-csv'
import { Button } from '@/components/ui/button'
import { useStoredSetting } from '@/hooks/use-stored-setting'
import { UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { trpc } from '../trpc'

// A visit takes a few minutes; look again until the newest one has an answer.
const VISIT_POLL_MS = 3000
// While an account is getting ready its bar moves by itself; once a minute is enough to see it.
const READY_POLL_MS = 60_000
const SEARCH_WAIT_MS = 250

const groupFrom = (raw: string | null) => raw === '1'
const groupToText = (value: boolean) => (value ? '1' : '0')

// The LinkedIn accounts as one list, worst first: what needs the owner, what each account can do now, and its browsing today. A row
// opens the account's drawer; the search, chips, grouping and optional columns appear from 4 accounts
// (.plan/accounts-drawers-simplify.md).
export const Accounts = () => {
   const utils = trpc.useUtils()
   const list = trpc.linkedInAccount.list.useQuery(undefined, {
      retry: false,
      refetchInterval: query =>
         query.state.data?.some(visitRunning)
            ? VISIT_POLL_MS
            : query.state.data?.some(({ loading }) => loading !== null && loading.percent < 100)
              ? READY_POLL_MS
              : false,
   })
   const accountsWithProxy = useAccountsWithProxy()
   const actions = useAccountActions()
   const nav = useDrawerNav()
   const [params, setParams] = useSearchParams()
   const address = readAddress(params)
   const sampleAccounts = useMemo(() => list.data?.map(({ id, email, status }) => ({ id, email, status })), [list.data])
   const browsing = useBrowsing(sampleAccounts)
   const today = useToday(list.data, browsing.byId)
   const [storedGroup, setStoredGroup] = useStoredSetting('accounts.group', groupFrom, groupToText)
   const [columns, setColumns] = useStoredSetting('accounts.columns', columnsFrom, columnsToText)
   const [q, setQ] = useState(address.q)
   const [picked, setPicked] = useState<Set<string>>(new Set())

   // The search is written to the address once the typing stops.
   useEffect(() => {
      const timer = setTimeout(() => {
         if (q !== address.q) {
            setParams(writeAddress(params, { q }), { replace: true })
         }
      }, SEARCH_WAIT_MS)

      return () => clearTimeout(timer)
   }, [q, address.q, params, setParams])

   const rows = useMemo(
      () => rowsOf(list.data ?? [], browsing.byId, today.statesById),
      [list.data, browsing.byId, today.statesById]
   )
   const tools = showTools(rows.length)
   const grouped = tools && (address.group ?? storedGroup)
   // A short list shows the full chips; a long one the compact line, unless the owner asked for the details.
   const detailed = !tools || columns.includes('detail')
   const shown = sortRows(
      filterRows(rows, tools ? { q, client: address.client, chip: address.chip } : { q: '', client: '', chip: 'all' })
   )
   const selectedRows = rows.filter(({ account }) => picked.has(account.id))
   const selectedAccounts = selectedRows.map(({ account }) => account)
   const progress = progressSentence(
      dayProgress(
         rows.flatMap(({ account, states }) => (states ? [{ status: account.status, states }] : [])),
         today.now
      ),
      Intl.DateTimeFormat().resolvedOptions().timeZone
   )
   const summary = summaryOf(rows, progress)
   const ready = list.data ? readyCounts(list.data) : undefined
   const filtered = tools && (q.trim() !== '' || address.client !== '' || address.chip !== 'all')
   const columnIds = COLUMNS.map(({ id }) => id).filter(id => columns.includes(id))

   const select = (ids: string[], on: boolean) =>
      setPicked(current => {
         const next = new Set(current)

         ids.forEach(id => (on ? next.add(id) : next.delete(id)))

         return next
      })
   const change = (patch: Parameters<typeof writeAddress>[1]) =>
      setParams(writeAddress(params, patch), { replace: true })
   const clearFilters = () => {
      setQ('')
      change({ q: '', client: '', chip: 'all' })
   }
   const exportToday = () =>
      downloadCsv(
         `today-${today.now.toISOString().slice(0, 10)}.csv`,
         todayCsv(
            shown.flatMap(({ account, client, states }) => (states ? [{ email: account.email, client, states }] : []))
         )
      )

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn accounts</h2>
               <p className="text-muted-foreground text-sm">The LinkedIn logins this tool can act as.</p>
            </div>
            {list.data?.length !== 0 ? <AddAccountDialog /> : null}
         </div>

         {actions.error ? (
            <p className="text-destructive text-sm" role="alert">
               {actions.error}
            </p>
         ) : null}

         {actions.started ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${actions.started.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         <NeedsProxyNotice accounts={list.data} accountsWithProxy={accountsWithProxy} />

         {browsing.kind && browsing.byId ? <BrowseSampleBanner kind={browsing.kind} /> : null}
         {browsing.error ? (
            <p className="text-destructive text-sm" role="alert">
               Could not load browsing data. {browsing.error}{' '}
               <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => void utils.browse.overview.invalidate()}
               >
                  Retry
               </Button>
            </p>
         ) : null}

         {list.error ? (
            <p className="text-destructive text-sm" role="alert">
               {list.error.message}
            </p>
         ) : null}

         {list.data?.length === 0 ? (
            <div className="bg-card rounded-xl border">
               <EmptyState
                  icon={UserPlus}
                  title="No LinkedIn account yet"
                  text="Add the LinkedIn login this tool acts as. It browses a little each day, like you would. Nothing is posted or sent unless you set it up."
                  action={<AddAccountDialog />}
               />
            </div>
         ) : (
            <>
               {summary ? <SummaryBanner summary={summary} onFix={nav.openAccount} /> : null}
               {ready && ready.loading + ready.needsYou > 0 ? (
                  <p className="text-muted-foreground text-sm" role="status">
                     Getting your LinkedIn ready: {ready.ready} ready, {ready.loading} getting ready
                     {ready.needsYou > 0 ? `, ${ready.needsYou} need you` : ''}. We only read; nothing is posted, sent
                     or accepted.
                  </p>
               ) : null}
               {browsing.byId ? <OverLimitNote accounts={[...browsing.byId.values()]} /> : null}

               {tools ? (
                  <AccountsToolbar
                     q={q}
                     onQ={setQ}
                     client={address.client}
                     onClient={client => change({ client })}
                     clients={clientsOf(rows)}
                     chip={address.chip}
                     onChip={chip => change({ chip })}
                     counts={countChips(rows)}
                     grouped={grouped}
                     onGrouped={on => {
                        setStoredGroup(on)
                        change({ group: on })
                     }}
                     columns={columns}
                     onColumns={setColumns}
                     onExport={exportToday}
                     canExport={shown.some(({ states }) => states !== undefined)}
                  />
               ) : null}

               {actions.result ? (
                  <p className="text-sm" role="status">
                     {actions.result}{' '}
                     <Button variant="link" size="sm" className="h-auto p-0" onClick={actions.clearResult}>
                        Dismiss
                     </Button>
                  </p>
               ) : null}

               {filtered && shown.length === 0 ? (
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-6 text-sm">
                     No account matches.
                     <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear the filters
                     </Button>
                  </div>
               ) : (
                  <AccountList
                     rows={shown}
                     groups={grouped ? groupRows(shown) : null}
                     columns={columnIds}
                     detailed={detailed}
                     todayLoading={today.loading}
                     selectable={tools && browsing.byId !== undefined}
                     selected={picked}
                     loading={list.isPending}
                     busy={actions.busy}
                     onSelect={select}
                     onOpen={nav.openAccount}
                     onPause={account => actions.askPause([account])}
                     onResume={account => actions.resume([account])}
                     onClientActivity={nav.openClient}
                     onPauseGroup={actions.askPause}
                  />
               )}

               {selectedRows.length > 0 && browsing.byId ? (
                  <BulkBrowseBar
                     accounts={selectedRows.flatMap(({ browse }) => (browse ? [browse] : []))}
                     sample={browsing.kind !== null}
                     onClear={() => setPicked(new Set())}
                     onPause={() => actions.askPause(selectedAccounts)}
                     onResume={() => actions.resume(selectedAccounts)}
                  />
               ) : null}
            </>
         )}

         <AccountsDrawers accounts={list.data} browsing={browsing} actions={actions} />
         <AccountDialogs actions={actions} />
      </div>
   )
}
