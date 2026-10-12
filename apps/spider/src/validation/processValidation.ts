import { type Sealed, type ValidateAccountCommand, type ValidateAccountResult } from '@automatedLinkedIn/contracts'

import { RecordedSession } from '../recording/recordedSession'
import { type Recorder } from '../recording/recorder'
import { type AccountLock } from '../scraping/accountLock'
import { type LoginDriver } from '../scraping/driver'
import { AccountBusyError } from '../scraping/errors'
import { type ObjectStore, sessionKey, validationRecordKey } from '../storage/store'
import { type AccountValidator } from './accountValidator'
import { type Credentials } from './credentials'

export type ValidationDeps = {
   driver: LoginDriver
   validator: Pick<AccountValidator, 'validate'>
   store: Pick<ObjectStore, 'put'>
   accountLock: Pick<AccountLock, 'acquire'>
   openCredentials: (sealed: Sealed) => Credentials
   publishResult: (result: ValidateAccountResult) => Promise<void>
   // Present when recording is on (.plan/spider-session-recording.md); absent runs exactly as before.
   startRecording?: (kind: 'validate', id: string) => Promise<Recorder>
   now?: () => number
}

const VALID_MESSAGE = 'Signed in to LinkedIn.'
const UNREADABLE_MESSAGE = 'The stored credentials could not be read. Save them again.'

// One validation from start to finish. It resolves once the outcome is recorded: the session is saved (when the
// account is valid), a record is in the bucket and the result is published. It rejects for infrastructure problems,
// which makes the broker retry, and with AccountBusyError when another task holds the account.
export const processValidation = async (command: ValidateAccountCommand, deps: ValidationDeps) => {
   const lease = await deps.accountLock.acquire(command.account_id, command.validation_id)

   if (!lease) {
      throw new AccountBusyError()
   }

   try {
      await run(command, deps)
   } finally {
      // A lease that cannot be released expires on its own, and the outcome is already recorded.
      await lease.release().catch(() => undefined)
   }
}

const run = async (command: ValidateAccountCommand, deps: ValidationDeps) => {
   const { account_id: accountId, validation_id: validationId } = command
   const { store, publishResult, now = Date.now } = deps

   const result = (
      outcome: ValidateAccountResult['outcome'],
      message: string,
      session?: string,
      recording?: string
   ): ValidateAccountResult => ({
      validation_id: validationId,
      account_id: accountId,
      outcome,
      message,
      ...(session && { session_storage_path: session }),
      ...(recording && { recording_prefix: recording }),
      checked_at: new Date(now()).toISOString(),
   })

   const announce = async (finished: ValidateAccountResult) => {
      await store.put(validationRecordKey(validationId), JSON.stringify(finished), 'application/json')
      await publishResult(finished)
   }

   let credentials: Credentials

   try {
      credentials = deps.openCredentials(command.sealed)
   } catch {
      // A key or format that does not match will not match on a retry either, and the reason stays out of the result.
      await announce(result('ERROR', UNREADABLE_MESSAGE))

      return
   }

   // A recording is a debugging aid: if it cannot start, the check still runs.
   const recorder = await deps.startRecording?.('validate', validationId)?.catch(() => undefined)

   for (const secret of [credentials.password, credentials.totpSecret, credentials.session]) {
      if (secret) {
         recorder?.addSecret(secret)
      }
   }

   recorder?.log('spider', 'info', `Check started${command.proxy ? ' through a proxy' : ' without a proxy'}`)

   let session: Awaited<ReturnType<ValidationDeps['driver']['open']>>

   try {
      session = await deps.driver.open({
         ...(command.proxy && { proxy: command.proxy }),
         ...(recorder && { recorder }),
      })
   } catch (error) {
      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   let verdict: Awaited<ReturnType<ValidationDeps['validator']['validate']>>

   try {
      verdict = await deps.validator.validate(recorder ? new RecordedSession(session, recorder) : session, {
         email: command.email,
         credentials,
      })
   } catch (error) {
      await session.close().catch(() => undefined)
      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   await session.close().catch(() => undefined)

   recorder?.log('spider', verdict.outcome === 'VALID' ? 'info' : 'warn', `Verdict: ${verdict.outcome}`)

   // The video is complete only now that the browser is closed. A wrong password is the owner's to fix, not a fault of
   // the spider, so it does not count as a failed run.
   const recording = await recorder?.finish({
      failed: verdict.outcome === 'NEEDS_REAUTH' || verdict.outcome === 'ERROR',
      verdict: verdict.outcome,
   })

   if (verdict.outcome !== 'VALID') {
      await announce(result(verdict.outcome, verdict.message, undefined, recording))

      return
   }

   // Only a valid login replaces the stored session, so a failed or logged-out one can never overwrite a good one.
   const saved = verdict.cookies.length > 0 ? sessionKey(accountId) : undefined

   if (saved) {
      await store.put(saved, JSON.stringify({ cookies: verdict.cookies }), 'application/json')
   }

   await announce(result('VALID', VALID_MESSAGE, saved, recording))
}
