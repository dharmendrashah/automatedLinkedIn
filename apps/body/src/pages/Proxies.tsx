import { AddProxyDialog } from '@/components/proxies/add-proxy-dialog'
import { DeleteProxyDialog } from '@/components/proxies/delete-proxy-dialog'
import { EditProxyDialog } from '@/components/proxies/edit-proxy-dialog'
import { ProxiesTable } from '@/components/proxies/proxies-table'
import { TestHistoryDrawer } from '@/components/proxies/test-history-drawer'
import { useState } from 'react'
import { Link } from 'react-router'

import { BROWSER_TEST_TASK } from '@/components/proxies/browser-test'
import { type Proxy } from '@/components/proxies/types'
import { useTaskCatalog } from '@/components/sessions/use-task-catalog'

import { trpc } from '../trpc'

export const Proxies = () => {
   const utils = trpc.useUtils()
   const list = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const [toDelete, setToDelete] = useState<Proxy | null>(null)
   const [toEdit, setToEdit] = useState<Proxy | null>(null)
   const [toInspect, setToInspect] = useState<Proxy | null>(null)

   const refresh = () => {
      void utils.proxyServer.list.invalidate()
      void utils.proxyServer.history.invalidate()
      void utils.linkedInAccount.list.invalidate()
   }

   const test = trpc.proxyServer.test.useMutation({ onSuccess: refresh })
   const catalog = useTaskCatalog()
   const runTask = trpc.task.run.useMutation({
      onSuccess: () => void utils.session.list.invalidate(),
   })
   // The button waits for the worker to announce the task: nothing else knows whether a worker is running.
   const browserTestAnnounced = Boolean(catalog?.tasks.some(({ task }) => task === BROWSER_TEST_TASK))
   const remove = trpc.proxyServer.delete.useMutation({
      onSuccess: () => {
         setToDelete(null)
         refresh()
      },
   })

   const busyId = test.isPending ? test.variables?.id : remove.isPending ? remove.variables?.id : undefined
   const testingId = runTask.isPending ? runTask.variables?.proxyId : undefined
   const actionError = test.error?.message ?? runTask.error?.message ?? remove.error?.message

   return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">Proxies</h2>
               <p className="text-muted-foreground text-sm">
                  Every LinkedIn account automates through one of its own proxies, never directly — so it always looks
                  like it is signing in from a safe, familiar location.
               </p>
            </div>
            <AddProxyDialog />
         </div>

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         {runTask.data ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${runTask.data.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         <ProxiesTable
            proxies={list.data}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            testingId={testingId}
            onEdit={setToEdit}
            onTest={proxy => test.mutate({ id: proxy.id })}
            browserTestAnnounced={browserTestAnnounced}
            onBrowserTest={proxy => runTask.mutate({ task: BROWSER_TEST_TASK, proxyId: proxy.id })}
            onHistory={setToInspect}
            onDelete={setToDelete}
         />

         <TestHistoryDrawer
            proxy={toInspect}
            testing={test.isPending && test.variables?.id === toInspect?.id}
            onTest={proxy => test.mutate({ id: proxy.id })}
            onClose={() => setToInspect(null)}
         />
         <EditProxyDialog proxy={toEdit} onClose={() => setToEdit(null)} />
         <DeleteProxyDialog
            proxy={toDelete}
            onCancel={() => setToDelete(null)}
            onConfirm={proxy => remove.mutate({ id: proxy.id })}
         />
      </div>
   )
}
