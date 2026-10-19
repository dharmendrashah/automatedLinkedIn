import { AccountsTable } from '@/components/accounts/accounts-table'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { ConfirmRunDialog } from '@/components/accounts/confirm-run-dialog'
import { DeleteAccountDialog } from '@/components/accounts/delete-account-dialog'
import { EditAccountDialog } from '@/components/accounts/edit-account-dialog'
import { LOGIN_TASK } from '@/components/accounts/login-test'
import { NeedsProxyNotice } from '@/components/accounts/needs-proxy-notice'
import { RevealDialog } from '@/components/accounts/reveal-dialog'
import { VISIT_TASK, visitRunning } from '@/components/accounts/visit'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { type Account } from '@/components/accounts/types'

import { type RouterInputs, trpc } from '../trpc'

type RunInput = RouterInputs['task']['run']

// A visit takes a few minutes; look again until the newest one has an answer.
const VISIT_POLL_MS = 3000

export const Accounts = () => {
   const utils = trpc.useUtils()
   const list = trpc.linkedInAccount.list.useQuery(undefined, {
      retry: false,
      refetchInterval: query => (query.state.data?.some(visitRunning) ? VISIT_POLL_MS : false),
   })
   const proxies = trpc.proxyServer.list.useQuery(undefined, { retry: false })
   const [toDelete, setToDelete] = useState<Account | null>(null)
   const [toEdit, setToEdit] = useState<Account | null>(null)
   // The owner's own two-step keys, revealed one account at a time, kept only in this page's memory.
   const [totpCodes, setTotpCodes] = useState<Record<string, string>>({})

   const accountsWithProxy = useMemo(
      () =>
         proxies.data
            ? new Set(
                 proxies.data
                    .filter(proxy => proxy.status === 'ACTIVE' || proxy.status === 'GEO_MISMATCH')
                    .map(proxy => proxy.linkedInAccountId)
              )
            : undefined,
      [proxies.data]
   )

   const refresh = () => void utils.linkedInAccount.list.invalidate()

   const reveal = trpc.linkedInAccount.reveal.useMutation()
   const revealTotp = trpc.linkedInAccount.reveal.useMutation({
      onSuccess: (data, variables) => {
         if (data.secrets.totpSecret) {
            setTotpCodes(current => ({ ...current, [variables.id]: data.secrets.totpSecret as string }))
         }
      },
   })
   const setPaused = trpc.linkedInAccount.setPaused.useMutation({ onSuccess: refresh })
   // The worker signs in or visits through the account's most reliable proxy; the server picks it and says why when it cannot.
   // A visit counts as the day's visit, so the list shows a new next time once it is asked for.
   // The server refuses a run that follows a good one too soon; the owner can confirm and send it again.
   const [recent, setRecent] = useState<{ run: RunInput; message: string } | null>(null)
   const runTask = trpc.task.run.useMutation({
      onSuccess: () => {
         refresh()
         void utils.session.list.invalidate()
      },
      onError: (error, run) => {
         if (error.data?.code === 'CONFLICT') {
            setRecent({
               run,
               message: error.message,
            })
         }
      },
   })
   const remove = trpc.linkedInAccount.delete.useMutation({
      onSuccess: () => {
         setToDelete(null)
         refresh()
      },
   })

   const busyId = setPaused.isPending ? setPaused.variables?.id : remove.isPending ? remove.variables?.id : undefined
   const pendingFor = (task: string) =>
      runTask.isPending && runTask.variables?.task === task ? runTask.variables.accountId : undefined
   const testingId = pendingFor(LOGIN_TASK)
   const visitingId = pendingFor(VISIT_TASK)
   const actionError =
      setPaused.error?.message ?? remove.error?.message ?? (recent ? undefined : runTask.error?.message)
   const startedSession = runTask.data

   return (
      <div className="grid w-full gap-4 px-4 lg:px-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
               <h2 className="text-lg font-semibold">LinkedIn accounts</h2>
               <p className="text-muted-foreground text-sm">The LinkedIn logins this tool can act as.</p>
            </div>
            <AddAccountDialog />
         </div>

         {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

         {startedSession ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${startedSession.id}`}>
                  Follow it in Sessions
               </Link>
               .
            </p>
         ) : null}

         <NeedsProxyNotice accounts={list.data} accountsWithProxy={accountsWithProxy} />

         <AccountsTable
            accounts={list.data}
            loading={list.isPending}
            error={list.error?.message}
            busyId={busyId}
            testingId={testingId}
            visitingId={visitingId}
            accountsWithProxy={accountsWithProxy}
            totpCodes={totpCodes}
            revealingTotpId={revealTotp.isPending ? revealTotp.variables?.id : undefined}
            onEdit={setToEdit}
            onTestLogin={account => runTask.mutate({ task: LOGIN_TASK, accountId: account.id })}
            onVisit={account => runTask.mutate({ task: VISIT_TASK, accountId: account.id })}
            onReveal={account => reveal.mutate({ id: account.id })}
            onShowTotpCode={account => revealTotp.mutate({ id: account.id })}
            onHideTotpCode={account =>
               setTotpCodes(current => {
                  const next = { ...current }

                  delete next[account.id]

                  return next
               })
            }
            onTogglePause={account => setPaused.mutate({ id: account.id, paused: account.status !== 'DISABLED' })}
            onDelete={setToDelete}
         />

         <RevealDialog reveal={reveal} />
         <EditAccountDialog account={toEdit} onClose={() => setToEdit(null)} />
         <DeleteAccountDialog
            account={toDelete}
            onCancel={() => setToDelete(null)}
            onConfirm={account => remove.mutate({ id: account.id })}
         />
         <ConfirmRunDialog
            message={recent?.message ?? null}
            onCancel={() => setRecent(null)}
            onConfirm={() => {
               if (recent) {
                  runTask.mutate({
                     ...recent.run,
                     confirmed: true,
                  })
               }

               setRecent(null)
            }}
         />
      </div>
   )
}
