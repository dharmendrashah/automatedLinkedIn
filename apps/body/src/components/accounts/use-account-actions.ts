import { useState } from 'react'
import { toast } from 'sonner'

import { type Account } from './types'

import { type RouterInputs, trpc } from '../../trpc'
import { isBudgetRefusal } from './budget-refusal'
import { pauseTargets, resultText } from './bulk'
import { LOGIN_TASK } from './login-test'
import { VISIT_TASK } from './visit'

type RunInput = RouterInputs['task']['run']
type Waiting = { run: RunInput; message: string }

const whoText = (accounts: Account[]) =>
   accounts.length === 1 ? (accounts[0]?.email ?? '') : `${accounts.length} accounts`

// Everything the owner can do to an account, with the dialogs that guard it, once for every page that offers it: run a task, pause
// and resume (one or many), remove, edit and show the saved details. A page renders `AccountDialogs` with what this returns.
export const useAccountActions = () => {
   const utils = trpc.useUtils()
   const refresh = () => void utils.linkedInAccount.list.invalidate()
   const [recent, setRecent] = useState<Waiting | null>(null)
   const [blocked, setBlocked] = useState<Waiting | null>(null)
   const [toDelete, setToDelete] = useState<Account | null>(null)
   const [toEdit, setToEdit] = useState<Account | null>(null)
   const [toPause, setToPause] = useState<Account[] | null>(null)
   const [pausing, setPausing] = useState<string[]>([])
   const [result, setResult] = useState<string | null>(null)

   const setPaused = trpc.linkedInAccount.setPaused.useMutation()
   const reveal = trpc.linkedInAccount.reveal.useMutation()
   // A run too soon after a good one asks the owner first; an account that may not browse now asks for a tick box.
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
         } else if (isBudgetRefusal(error)) {
            setBlocked({
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

   // Pause or resume the accounts one by one, so a failure on one never hides the rest. The result says who changed and who did not.
   const changePause = async (accounts: Account[], pause: boolean) => {
      const { change, skipped } = pauseTargets(accounts, pause)

      setPausing(change.map(({ id }) => id))

      const outcomes = await Promise.allSettled(change.map(({ id }) => setPaused.mutateAsync({ id, paused: pause })))
      const done = change.filter((_, index) => outcomes[index]?.status === 'fulfilled')
      const failed = change
         .filter((_, index) => outcomes[index]?.status === 'rejected')
         .map(({ email }) => ({ email, reason: 'could not be changed' }))

      setPausing([])
      refresh()
      setResult(
         accounts.length > 1 || skipped.length + failed.length > 0
            ? resultText(done.length, [...skipped, ...failed])
            : null
      )

      if (done.length > 0) {
         toast(`${pause ? 'Paused' : 'Resumed'} ${whoText(done)}`, {
            action: {
               label: 'Undo',
               onClick: () => void changePause(done, !pause),
            },
         })
      }
   }

   const run = (task: string, accountId: string) => runTask.mutate({ task, accountId })
   const pendingFor = (task: string) =>
      runTask.isPending && runTask.variables?.task === task ? runTask.variables.accountId : undefined

   return {
      testLogin: (account: Pick<Account, 'id'>) => run(LOGIN_TASK, account.id),
      visit: (account: Pick<Account, 'id'>) => run(VISIT_TASK, account.id),
      testingId: pendingFor(LOGIN_TASK),
      visitingId: pendingFor(VISIT_TASK),
      started: runTask.data,
      error: remove.error?.message ?? (recent || blocked ? undefined : runTask.error?.message),
      busy: (id: string) => pausing.includes(id) || (remove.isPending && remove.variables?.id === id),
      result,
      clearResult: () => setResult(null),
      askPause: (accounts: Account[]) => {
         if (accounts.some(({ status }) => status !== 'DISABLED')) {
            setToPause(accounts)
         } else if (accounts.length > 0) {
            void changePause(accounts, true)
         }
      },
      cancelPause: () => setToPause(null),
      confirmPause: () => {
         const accounts = toPause

         setToPause(null)

         if (accounts) {
            void changePause(accounts, true)
         }
      },
      resume: (accounts: Account[]) => void changePause(accounts, false),
      toPause,
      askDelete: setToDelete,
      toDelete,
      confirmDelete: (account: Account) => remove.mutate({ id: account.id }),
      askEdit: setToEdit,
      toEdit,
      showSaved: (account: Account) => reveal.mutate({ id: account.id }),
      reveal,
      recent: recent?.message ?? null,
      cancelRecent: () => setRecent(null),
      confirmRecent: () => {
         if (recent) {
            runTask.mutate({
               ...recent.run,
               confirmed: true,
            })
         }

         setRecent(null)
      },
      blocked: blocked?.message ?? null,
      cancelBlocked: () => setBlocked(null),
      confirmBlocked: () => {
         if (blocked) {
            runTask.mutate({
               ...blocked.run,
               startAnyway: true,
            })
         }

         setBlocked(null)
      },
   }
}

export type AccountActions = ReturnType<typeof useAccountActions>
