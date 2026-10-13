import { AccountSection } from '@/components/proxies/account-section'
import { AddProxyDialog, type AddRequest } from '@/components/proxies/add-proxy-dialog'
import { BROWSER_TEST_TASK } from '@/components/proxies/browser-test'
import { DeleteProxyDialog } from '@/components/proxies/delete-proxy-dialog'
import { EditProxyDialog } from '@/components/proxies/edit-proxy-dialog'
import { Explainer } from '@/components/proxies/explainer'
import { type LevelFilter, countByLevel, groupByAccount } from '@/components/proxies/grouping'
import { OverviewStrip } from '@/components/proxies/overview-strip'
import { ProxiesTable } from '@/components/proxies/proxies-table'
import { ProxyDetailsDrawer } from '@/components/proxies/proxy-details-drawer'
import { useTaskCatalog } from '@/components/sessions/use-task-catalog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LayoutGrid, Plus, Rows3 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { SCORE_POLL_MS, awaitingScore } from '@/components/proxies/score'

import { type Proxy, type ProxyHandlers } from '@/components/proxies/types'

import { trpc } from '../trpc'

type View = 'cards' | 'table'

const VIEW_KEY = 'proxies.view'

const readView = (): View => {
   try {
      return window.localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'
   } catch {
      return 'cards'
   }
}

export const Proxies = () => {
   const utils = trpc.useUtils()
   const list = trpc.proxyServer.list.useQuery(undefined, {
      retry: false,
      // A score is saved a moment after the test it follows, so look again until it has arrived.
      refetchInterval: query => (awaitingScore(query.state.data) ? SCORE_POLL_MS : false),
   })
   const accounts = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
   const [view, setView] = useState<View>(readView)
   const [filter, setFilter] = useState<LevelFilter>('ALL')
   const [adding, setAdding] = useState<AddRequest | null>(null)
   const [toDelete, setToDelete] = useState<Proxy | null>(null)
   const [toEdit, setToEdit] = useState<Proxy | null>(null)
   const [inspectId, setInspectId] = useState<string | null>(null)
   const [notice, setNotice] = useState<string | null>(null)

   const refresh = () => {
      void utils.proxyServer.list.invalidate()
      void utils.proxyServer.history.invalidate()
      void utils.proxyServer.scoreHistory.invalidate()
      void utils.linkedInAccount.list.invalidate()
   }

   const test = trpc.proxyServer.test.useMutation({ onSuccess: refresh })
   const setPreferred = trpc.proxyServer.setPreferred.useMutation({
      onSuccess: proxy => {
         setNotice(`Done. ${proxy.host}:${proxy.port} is now the preferred proxy of ${proxy.linkedInAccount.email}.`)
         refresh()
      },
   })
   const acceptRisk = trpc.proxyServer.acceptRisk.useMutation({
      onSuccess: proxy => {
         setNotice(
            `Okay. We will stop pointing out the problems of ${proxy.host}:${proxy.port}. You can undo this any time, and we will tell you if something new comes up.`
         )
         refresh()
      },
   })
   const clearRisk = trpc.proxyServer.clearRisk.useMutation({ onSuccess: refresh })
   const remove = trpc.proxyServer.delete.useMutation({
      onSuccess: () => {
         setToDelete(null)
         refresh()
      },
   })
   const runTask = trpc.task.run.useMutation({
      onSuccess: () => void utils.session.list.invalidate(),
   })
   const catalog = useTaskCatalog()

   const proxies = list.data
   const inspected = proxies?.find(proxy => proxy.id === inspectId) ?? null
   const siblingsOf = (proxy: Proxy) =>
      proxies?.filter(other => other.linkedInAccountId === proxy.linkedInAccountId && other.id !== proxy.id) ?? []

   const busyId =
      (test.isPending && test.variables?.id) ||
      (acceptRisk.isPending && acceptRisk.variables?.id) ||
      (clearRisk.isPending && clearRisk.variables?.id) ||
      (setPreferred.isPending && setPreferred.variables?.id) ||
      (remove.isPending && remove.variables?.id) ||
      (runTask.isPending && runTask.variables?.proxyId) ||
      undefined

   const handlers: ProxyHandlers = {
      busyId,
      // The browser check waits for the worker to announce it: nothing else knows whether a worker is running.
      browserTestAnnounced: Boolean(catalog?.tasks.some(({ task }) => task === BROWSER_TEST_TASK)),
      onDetails: proxy => setInspectId(proxy.id),
      onTest: proxy => {
         setNotice(null)
         test.mutate({ id: proxy.id })
      },
      onBrowserTest: proxy => {
         setNotice(null)
         runTask.mutate({
            task: BROWSER_TEST_TASK,
            proxyId: proxy.id,
         })
      },
      onEdit: setToEdit,
      onDelete: setToDelete,
      onUseInstead: target => {
         setNotice(null)
         setPreferred.mutate({ id: target.id })
      },
      onReplace: proxy =>
         setAdding({
            accountId: proxy.linkedInAccountId,
            replacing: proxy,
         }),
      onAccept: proxy => {
         setNotice(null)
         acceptRisk.mutate({ id: proxy.id })
      },
      onUndoAccept: proxy => {
         setNotice(null)
         clearRisk.mutate({ id: proxy.id })
      },
   }

   const changeView = (next: string) => {
      if (next !== 'cards' && next !== 'table') return

      setView(next)

      try {
         window.localStorage.setItem(VIEW_KEY, next)
      } catch {
         // The choice is just not remembered.
      }
   }

   const groups = groupByAccount(accounts.data ?? [], proxies ?? [], filter)
   const loading = list.isPending || accounts.isPending
   const loadError = list.error?.message ?? accounts.error?.message
   const actionError =
      test.error?.message ??
      setPreferred.error?.message ??
      acceptRisk.error?.message ??
      clearRisk.error?.message ??
      runTask.error?.message ??
      remove.error?.message

   return (
      <div className="grid w-full gap-6 px-4 lg:px-6">
         <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Proxies</h2>
               <p className="text-muted-foreground text-sm">
                  The addresses LinkedIn sees when we sign in for you. Here you can see which ones are healthy, which
                  need a look, and what you could do about it.
               </p>
            </div>
            <div className="flex items-center gap-2">
               <ToggleGroup
                  type="single"
                  variant="outline"
                  value={view}
                  onValueChange={changeView}
                  aria-label="How to show the proxies"
               >
                  <ToggleGroupItem value="cards" aria-label="Cards" title="Cards">
                     <LayoutGrid />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="table" aria-label="Table" title="Table">
                     <Rows3 />
                  </ToggleGroupItem>
               </ToggleGroup>
               <Button onClick={() => setAdding({})}>
                  <Plus />
                  Add a proxy
               </Button>
            </div>
         </div>

         <Explainer />

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}
         {notice ? (
            <p className="text-sm" role="status">
               {notice}
            </p>
         ) : null}
         {runTask.data ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${runTask.data.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         {loading ? (
            <div className="grid gap-3">
               <Skeleton className="h-16 w-full rounded-xl" />
               <Skeleton className="h-64 w-full rounded-xl" />
            </div>
         ) : null}
         {loadError ? <p className="text-destructive text-sm">{loadError}</p> : null}

         {!loading && !loadError && accounts.data?.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
               <p className="text-sm font-medium">Add a LinkedIn account first</p>
               <p className="text-muted-foreground max-w-md text-sm">
                  Every proxy belongs to one LinkedIn account. Once you have added an account, come back here to give it
                  a proxy.
               </p>
               <Button asChild size="sm">
                  <Link to="/accounts">Go to LinkedIn accounts</Link>
               </Button>
            </div>
         ) : null}

         {!loading && !loadError && proxies && accounts.data && accounts.data.length > 0 ? (
            <>
               <OverviewStrip counts={countByLevel(proxies)} filter={filter} onFilter={setFilter} />

               {view === 'cards' ? (
                  <div className="grid gap-8">
                     {groups.map(group => (
                        <AccountSection
                           key={group.account.id}
                           group={group}
                           handlers={handlers}
                           onAdd={accountId => setAdding({ accountId })}
                        />
                     ))}
                  </div>
               ) : (
                  <ProxiesTable
                     proxies={groups.flatMap(group => group.proxies)}
                     loading={false}
                     error={undefined}
                     handlers={handlers}
                  />
               )}
            </>
         ) : null}

         <ProxyDetailsDrawer
            proxy={inspected}
            siblings={inspected ? siblingsOf(inspected) : []}
            handlers={handlers}
            onClose={() => setInspectId(null)}
         />
         <AddProxyDialog request={adding} onClose={() => setAdding(null)} />
         <EditProxyDialog proxy={toEdit} onClose={() => setToEdit(null)} />
         <DeleteProxyDialog
            proxy={toDelete}
            others={toDelete ? siblingsOf(toDelete).length : 0}
            onCancel={() => setToDelete(null)}
            onConfirm={proxy => remove.mutate({ id: proxy.id })}
         />
      </div>
   )
}
