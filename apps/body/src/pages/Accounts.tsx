import { AccountsTable } from '@/components/accounts/accounts-table'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { DeleteAccountDialog } from '@/components/accounts/delete-account-dialog'
import { EditAccountDialog } from '@/components/accounts/edit-account-dialog'
import { LOGIN_TASK } from '@/components/accounts/login-test'
import { NeedsProxyNotice } from '@/components/accounts/needs-proxy-notice'
import { RevealDialog } from '@/components/accounts/reveal-dialog'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { type Account } from '@/components/accounts/types'

import { trpc } from '../trpc'

export const Accounts = () => {
   const utils = trpc.useUtils()
   const list = trpc.linkedInAccount.list.useQuery(undefined, { retry: false })
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
   // The worker signs in through the account's most reliable proxy; the server picks it and says why when it cannot.
   const testLogin = trpc.task.run.useMutation({
      onSuccess: () => {
         refresh()
         void utils.session.list.invalidate()
      },
   })
   const remove = trpc.linkedInAccount.delete.useMutation({
      onSuccess: () => {
         setToDelete(null)
         refresh()
      },
   })

   const busyId = setPaused.isPending ? setPaused.variables?.id : remove.isPending ? remove.variables?.id : undefined
   const testingId = testLogin.isPending ? testLogin.variables?.accountId : undefined
   const actionError = setPaused.error?.message ?? remove.error?.message ?? testLogin.error?.message

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

         {testLogin.data ? (
            <p className="text-sm" role="status">
               Started.{' '}
               <Link className="underline underline-offset-4" to={`/sessions?session=${testLogin.data.id}`}>
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
            accountsWithProxy={accountsWithProxy}
            totpCodes={totpCodes}
            revealingTotpId={revealTotp.isPending ? revealTotp.variables?.id : undefined}
            onEdit={setToEdit}
            onTestLogin={account => testLogin.mutate({ task: LOGIN_TASK, accountId: account.id })}
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
      </div>
   )
}
