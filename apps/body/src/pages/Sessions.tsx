import { SearchBox } from '@/components/my-network/filters'
import { MultiPick } from '@/components/my-network/filters/fields'
import { SessionDrawer } from '@/components/sessions/session-drawer'
import { SessionsTable } from '@/components/sessions/sessions-table'
import { type SessionSort, useSessions } from '@/components/sessions/use-sessions'
import { useTaskCatalog } from '@/components/sessions/use-task-catalog'
import { ColumnsMenu } from '@/components/table/columns-menu'
import { useHiddenColumns } from '@/components/table/use-hidden-columns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { flagOf } from '@/lib/country-flag'
import { ArrowUp, ListFilter } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import {
   RESULTS,
   RESULT_WORDS,
   type SessionFilters,
   apiFilters,
   chipsOf,
   fixed,
   only,
   readFilters,
   writeFilters,
} from '../components/sessions/filters/model'
import {
   type FilterOptions,
   type Names,
   SessionFilterChips,
   SessionFiltersSheet,
} from '../components/sessions/filters/session-filters'
import { trpc } from '../trpc'

const SORT_BY: Array<SessionSort['by']> = ['startedAt', 'durationMs']

// Result always shows, so it is not offered.
const SESSION_COLUMNS: Array<[string, string]> = [
   ['action', 'Action'],
   ['account', 'Account'],
   ['trigger', 'Started by'],
   ['proxy', 'Proxy'],
   ['detail', 'Detail'],
   ['startedAt', 'Started'],
   ['durationMs', 'Took'],
   ['files', 'Files'],
]

const readSort = (value: string | null): SessionSort | undefined => {
   const [field, direction] = (value ?? '').split('.')
   const by = SORT_BY.find(item => item === field)

   return by
      ? {
           by,
           desc: direction !== 'asc',
        }
      : undefined
}

const countsOf = (facet: Array<{ value: string; count: number }> | undefined) =>
   new Map((facet ?? []).map(({ value, count }) => [value, count]))

const hintOf = (counts: Map<string, number>, value: string) => {
   const count = counts.get(value)

   return count === undefined ? undefined : String(count)
}

export const Sessions = () => {
   // The open session, the filters and the order live in the address, so a link opens exactly what was being looked at.
   const [params, setParams] = useSearchParams()
   const openId = params.get('session')
   const filtersParam = params.get('filters')
   const legacyAccount = params.get('account')
   const legacyResult = params.get('result')
   const sortParam = params.get('sort')
   const filters = useMemo(
      () =>
         readFilters(
            new URLSearchParams({
               ...(filtersParam && { filters: filtersParam }),
               ...(legacyAccount && { account: legacyAccount }),
               ...(legacyResult && { result: legacyResult }),
            })
         ),
      [filtersParam, legacyAccount, legacyResult]
   )
   const api = useMemo(() => apiFilters(filters), [filters])
   const sort = useMemo(() => readSort(sortParam), [sortParam])
   const [atTop, setAtTop] = useState(true)
   const [sheetOpen, setSheetOpen] = useState(false)

   const { rows, list, waiting, showWaiting } = useSessions(api, sort, atTop)
   const [hidden, setHidden] = useHiddenColumns('sessions.hiddenColumns')
   const catalog = useTaskCatalog()
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const proxies = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const facets = trpc.session.facets.useQuery(api, { retry: false })

   const update = useCallback(
      (change: Record<string, string | null>) =>
         setParams(
            current => {
               const next = new URLSearchParams(current)

               for (const [name, value] of Object.entries(change)) {
                  if (value === null) {
                     next.delete(name)
                  } else {
                     next.set(name, value)
                  }
               }

               return next
            },
            { replace: true }
         ),
      [setParams]
   )

   const setFilters = (next: SessionFilters) =>
      update({
         filters: writeFilters(next),
         account: null,
         result: null,
      })
   const open = useCallback((id: string | null) => update({ session: id }), [update])

   const names: Names = useMemo(() => {
      const account = new Map(accounts.data?.map(item => [item.id, item.displayName ?? item.email]))
      const task = new Map(catalog?.tasks.map(item => [item.task, item.title]))
      const verdict = new Map(
         [catalog?.runnerVerdicts ?? {}, ...(catalog?.tasks.map(item => item.verdicts) ?? [])].flatMap(verdicts =>
            Object.entries(verdicts).map(([key, info]) => [key, info.label] as const)
         )
      )
      const proxy = new Map(proxies.data?.map(item => [item.id, `${item.host}:${item.port}`]))

      return {
         account: id => account.get(id) ?? 'Removed account',
         task: id => task.get(id) ?? id,
         verdict: id => verdict.get(id) ?? id,
         proxy: id => proxy.get(id) ?? 'Removed proxy',
      }
   }, [accounts.data, catalog, proxies.data])

   const options: FilterOptions = useMemo(() => {
      const counts = {
         accounts: countsOf(facets.data?.accounts),
         tasks: countsOf(facets.data?.tasks),
         verdicts: countsOf(facets.data?.verdicts),
         proxies: countsOf(facets.data?.proxies),
         countries: countsOf(facets.data?.proxyCountries),
      }
      // Known values first, then any the sessions hold that the lists no longer name.
      const withSeen = (known: string[], seen: Map<string, number>) => [...new Set([...known, ...seen.keys()])]
      const option = (value: string, label: string, seen: Map<string, number>) => ({
         value,
         label,
         hint: hintOf(seen, value),
      })

      return {
         accounts: withSeen(accounts.data?.map(item => item.id) ?? [], counts.accounts).map(id =>
            option(id, names.account(id), counts.accounts)
         ),
         tasks: withSeen(catalog?.tasks.map(item => item.task) ?? [], counts.tasks).map(task =>
            option(task, names.task(task), counts.tasks)
         ),
         verdicts: [...counts.verdicts.keys()].map(verdict => option(verdict, names.verdict(verdict), counts.verdicts)),
         proxies: withSeen(proxies.data?.map(item => item.id) ?? [], counts.proxies).map(id =>
            option(id, names.proxy(id), counts.proxies)
         ),
         countries: [...counts.countries.keys()].map(country => ({
            ...option(country, country, counts.countries),
            icon: flagOf(country) ?? undefined,
         })),
         hints: {
            results: countsOf(facets.data?.results),
            triggers: countsOf(facets.data?.triggers),
         },
      }
   }, [accounts.data, catalog, facets.data, names, proxies.data])

   const filtersOn = chipsOf(filters, names).length

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center gap-2">
            <SearchBox
               value={filters.q ?? ''}
               placeholder="Search account, action, verdict, message…"
               label="Search sessions"
               onSearch={q => setFilters({ ...filters, q: q || undefined })}
            />
            <MultiPick
               compact
               label="Account"
               placeholder="Any account"
               options={options.accounts}
               value={filters.accounts}
               onChange={accounts => setFilters({ ...filters, accounts })}
            />
            <MultiPick
               compact
               label="Result"
               placeholder="Any result"
               options={fixed(RESULTS, RESULT_WORDS, options.hints.results)}
               value={filters.results}
               onChange={results => setFilters({ ...filters, results: only(RESULTS, results) })}
            />
            <MultiPick
               compact
               label="Action"
               placeholder="Any action"
               options={options.tasks}
               value={filters.tasks}
               onChange={tasks => setFilters({ ...filters, tasks })}
            />
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
               <ListFilter />
               Filters
               {filtersOn > 0 ? <Badge variant="secondary">{filtersOn}</Badge> : null}
            </Button>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs" title="Refreshes every 5 seconds">
               <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
               Live
            </span>
            <div className="ml-auto flex items-center gap-2">
               {waiting > 0 ? (
                  <Button size="sm" onClick={showWaiting}>
                     <ArrowUp />
                     {waiting === 1 ? '1 new session' : `${waiting} new sessions`}
                  </Button>
               ) : null}
               <ColumnsMenu columns={SESSION_COLUMNS} hidden={hidden} onChange={setHidden} />
            </div>
         </div>

         <SessionFilterChips value={filters} names={names} onChange={setFilters} />

         <SessionsTable
            rows={rows}
            catalog={catalog}
            loading={list.isPending}
            error={list.error?.message}
            empty={filtersOn > 0 || filters.q ? 'No sessions match these filters.' : 'No sessions yet.'}
            selectedId={openId}
            sort={sort}
            hasMore={Boolean(list.hasNextPage)}
            loadingMore={list.isFetchingNextPage}
            hidden={hidden}
            onOpen={open}
            onSort={next => update({ sort: next ? `${next.by}.${next.desc ? 'desc' : 'asc'}` : null })}
            onMore={() => void list.fetchNextPage()}
            onTop={setAtTop}
         />

         <SessionFiltersSheet
            open={sheetOpen}
            value={filters}
            options={options}
            names={names}
            onOpenChange={setSheetOpen}
            onChange={setFilters}
         />

         <SessionDrawer sessionId={openId} onOpen={open} onClose={() => open(null)} />
      </div>
   )
}
