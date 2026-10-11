import { type ScrapeTaskCommand, type ScrapeTaskResult } from '../types'

import { type ObjectStore, resultKey, sessionKey } from '../storage/store'
import { type AccountLock } from './accountLock'
import { type ScrapeEngine } from './engine'
import { AccountBusyError, TaskError } from './errors'

export type ProcessDeps = {
   engine: Pick<ScrapeEngine, 'run'>
   store: Pick<ObjectStore, 'put'>
   accountLock: Pick<AccountLock, 'acquire'>
   publishResult: (result: ScrapeTaskResult) => Promise<void>
   now?: () => number
}

// One task from start to finish. It resolves once the outcome is safely recorded: the raw data is in storage,
// the account's session is saved and the result has been published. It rejects for infrastructure problems,
// which makes the broker retry, and with AccountBusyError when another task holds the account.
export const processTask = async (command: ScrapeTaskCommand, deps: ProcessDeps) => {
   const { account_id: account } = command

   // One task per account: two at once would fight over the same logged-in session.
   const lease = account ? await deps.accountLock.acquire(account, command.task_id) : undefined

   if (account && !lease) {
      throw new AccountBusyError()
   }

   try {
      await run(command, deps)
   } finally {
      // A lease that cannot be released expires on its own, and the outcome is already recorded.
      await lease?.release().catch(() => undefined)
   }
}

const run = async (
   command: ScrapeTaskCommand,
   { engine, store, publishResult, now = Date.now }: Omit<ProcessDeps, 'accountLock'>
) => {
   const started = now()
   const elapsed = () => Math.round(now() - started) / 1000

   const result = (
      outcome: Pick<ScrapeTaskResult, 'status' | 'result_storage_path' | 'error'> &
         Partial<Pick<ScrapeTaskResult, 'session_storage_path'>>
   ): ScrapeTaskResult => ({
      task_id: command.task_id,
      task_type: command.task_type,
      timestamp: new Date(now()).toISOString(),
      execution_time_seconds: elapsed(),
      ...outcome,
   })

   try {
      const { records, cookies } = await engine.run(command)
      const key = resultKey(command)

      await store.put(
         key,
         JSON.stringify({
            task_id: command.task_id,
            task_type: command.task_type,
            extracted_at: new Date(now()).toISOString(),
            record_count: records.length,
            records,
         }),
         'application/json'
      )

      // Only a successful task with cookies left replaces the stored session, so a failed or logged-out run cannot.
      const saved = command.account_id && cookies.length > 0 ? sessionKey(command.account_id) : undefined

      if (saved) {
         await store.put(saved, JSON.stringify({ cookies }), 'application/json')
      }

      await publishResult(
         result({
            status: 'SUCCESS',
            result_storage_path: key,
            error: null,
            ...(saved && { session_storage_path: saved }),
         })
      )
   } catch (error) {
      if (!(error instanceof TaskError)) {
         throw error
      }

      await publishResult(
         result({
            status: 'FAILED',
            result_storage_path: null,
            error: error.message,
         })
      )
   }
}
