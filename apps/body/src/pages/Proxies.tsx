import { AddProxyDialog } from '@/components/proxies/add-proxy-dialog'
import { DeleteProxyDialog } from '@/components/proxies/delete-proxy-dialog'
import { EditProxyDialog } from '@/components/proxies/edit-proxy-dialog'
import { ProxiesTable } from '@/components/proxies/proxies-table'
import { TestHistoryDrawer } from '@/components/proxies/test-history-drawer'
import { useState } from 'react'
import { Link } from 'react-router'

import { type Proxy } from '@/components/proxies/types'
import { runnableOnProxy } from '@/components/sessions/artifacts'
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
   // Any task that works through a proxy and asks for nothing shows in the row menu, so a new task needs no change here.
   const tasks = catalog?.tasks.filter(runnableOnProxy) ?? []
   const remove = trpc.proxyServer.delete.useMutation({
      onSuccess: () => {
         setToDelete(null)
         refresh()
      },
   })

   const busyId = test.isPending
      ? test.variables?.id
      : runTask.isPending
        ? runTask.variables?.proxyId
        : remove.isPending
          ? remove.variables?.id
          : undefined
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
            onEdit={setToEdit}
            onTest={proxy => test.mutate({ id: proxy.id })}
            tasks={tasks}
            onRunTask={(proxy, task) => runTask.mutate({ task, proxyId: proxy.id })}
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
