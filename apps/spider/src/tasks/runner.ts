import {
   type Artifact,
   type RUNNER_VERDICTS,
   TASK_CONTRACT_VERSION,
   type TaskCommand,
   type TaskResult,
   runPrefix,
   taskResultSchema,
} from '@automatedLinkedIn/contracts'

import { type ProxyConfig } from '../types'

import { type DeviceIdentity } from '../identity/deviceIdentity'
import { type IdentityStore } from '../identity/identityStore'
import { type ExitRegion, regionToKeep } from '../identity/region'
import { RecordedDetectionSession } from '../recording/recordedDetectionSession'
import { type Recorder } from '../recording/recorder'
import { type AccountLock } from '../scraping/accountLock'
import { type DetectionDriver, type DetectionSession, type SessionControl, type StorageState } from '../scraping/driver'
import { AccountBusyError, TaskError } from '../scraping/errors'
import { type HostPolicy } from '../scraping/policy'
import { type HostRateLimiter } from '../scraping/rateLimiter'
import { type RobotsGuard } from '../scraping/robots'
import { type SessionVault } from '../sessions/sessionVault'
import { type ObjectStore } from '../storage/store'
import { type Handover } from '../takeover/waitForOwner'
import { type Credentials } from './credentials'
import { type TaskContext, type TaskDefinition, type TaskOutcome, VisitError } from './defineTask'

const MAX_ARTIFACTS = 300

export type RecordingRequest = {
   task: string
   id: string
   prefix: string
   // The task keeps its run whatever SPIDER_RECORDING says.
   always: boolean
   videoSize?: { width: number; height: number }
}

export type RunnerDeps = {
   tasks: TaskDefinition[]
   driver: DetectionDriver
   policy: Pick<HostPolicy, 'allowsUrl' | 'allowsCookieDomain'>
   robots: Pick<RobotsGuard, 'check'>
   limiter: Pick<HostRateLimiter, 'wait'>
   store: Pick<ObjectStore, 'put'>
   // Only needed by tasks that need an account.
   accountLock?: Pick<AccountLock, 'acquire'>
   openCredentials?: (sealed: NonNullable<TaskCommand['credentials']>) => Credentials
   // The device an account signs in from. Without it every run is a new device (the local devtools).
   identities?: Pick<IdentityStore, 'forAccount' | 'pin'>
   // Where a proxy's traffic leaves. With `identities` it keeps the account's timezone and language true to the proxy.
   exitGeo?: (proxy: ProxyConfig) => Promise<ExitRegion>
   // The cookies an account keeps between runs. Without it nothing is restored or kept (the local devtools).
   sessions?: Pick<SessionVault, 'load' | 'save'>
   // Keeps the run's browser for its owner while they finish a check; resolves when they are done, leave, or time is up.
   handover?: (taskId: string, control: SessionControl) => Promise<Handover>
   // Resolves to nothing when the run is not to be kept; the task still runs.
   startRecording: (request: RecordingRequest) => Promise<Recorder | undefined>
   publishResult: (result: TaskResult) => Promise<void>
   // The git sha of this worker, so a run can be reproduced.
   workerBuild: string
   pause?: (ms: number) => Promise<void>
   now?: () => number
}

class TimedOut extends Error {}

const HANDOVER_LOG: Record<Handover, string> = {
   done: 'The owner says the check is done; looking again',
   gave_up: 'The owner left it',
   timed_out: 'The owner did not come in time',
}

// The answer for a command the broker delivered for the last time without the task ever finishing.
export const exhaustedResult = (command: TaskCommand, workerBuild: string, now = Date.now): TaskResult => {
   const time = new Date(now()).toISOString()

   return taskResultSchema.parse({
      contract: TASK_CONTRACT_VERSION,
      task_id: command.task_id,
      task: command.task,
      task_version: command.task_version,
      status: 'FAILED',
      verdict: 'CRASHED',
      message: 'The task could not run. Try again later.',
      artifacts: [],
      artifacts_truncated: false,
      worker: { build: workerBuild },
      started_at: time,
      finished_at: time,
   })
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const withLimit = <T>(work: Promise<T>, ms: number) => {
   let timer: NodeJS.Timeout | undefined

   // The work is left to fail on its own once the browser is closed; its late error must not crash the worker.
   work.catch(() => undefined)

   return Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
         timer = setTimeout(() => reject(new TimedOut()), ms)
      }),
   ]).finally(() => clearTimeout(timer))
}

// One task from a command to a published result. The only code that touches the browser, the bucket and the queue for a task,
// so every task gets the same recording, masking, limits and answer. It resolves once the result is published. It rejects
// for problems the broker should retry (the browser crashing, the task throwing), and answers by itself for everything a
// retry cannot fix.
export const runTask = async (command: TaskCommand, deps: RunnerDeps) => {
   const { publishResult, now = Date.now, pause = wait } = deps
   const startedAt = now()

   const publish = (
      outcome: Pick<TaskOutcome, 'status' | 'verdict' | 'message' | 'report'>,
      artifacts: Artifact[] = []
   ) =>
      publishResult(
         taskResultSchema.parse({
            contract: TASK_CONTRACT_VERSION,
            task_id: command.task_id,
            task: command.task,
            task_version: command.task_version,
            status: outcome.status,
            verdict: outcome.verdict,
            message: outcome.message,
            ...(outcome.report && { report: outcome.report }),
            artifacts: artifacts.slice(0, MAX_ARTIFACTS),
            artifacts_truncated: artifacts.length > MAX_ARTIFACTS,
            worker: { build: deps.workerBuild },
            started_at: new Date(startedAt).toISOString(),
            finished_at: new Date(now()).toISOString(),
         })
      )

   const refuse = (verdict: keyof typeof RUNNER_VERDICTS, message: string) =>
      publish({
         status: 'FAILED',
         verdict,
         message,
      })

   const task = deps.tasks.find(({ name, version }) => name === command.task && version === command.task_version)

   if (!task) {
      return refuse('UNKNOWN_TASK', 'This task is not available on this worker.')
   }

   const input = task.input.safeParse(command.input)

   // Never echoes the input: it came from outside.
   if (!input.success) {
      return refuse('INVALID_INPUT', 'The input does not match what this task expects.')
   }

   if (task.needs.proxy === 'required' && !command.proxy) {
      return refuse('NEEDS_PROXY', 'This task only runs through a working proxy.')
   }

   if (task.needs.account && !(command.account_id && command.account_email && command.credentials)) {
      return refuse('NEEDS_ACCOUNT', 'This task needs a LinkedIn account.')
   }

   if (!task.hosts.every(host => deps.policy.allowsUrl(`https://${host}/`))) {
      return refuse('NOT_ALLOWED', 'A site this task needs is not on the spider allowlist.')
   }

   let lease: Awaited<ReturnType<AccountLock['acquire']>>
   let account: TaskContext['account']

   if (task.needs.account) {
      if (!deps.accountLock || !deps.openCredentials) {
         throw new Error('This worker cannot run a task that needs an account')
      }

      // One task per account at a time: the other one is published again after a short wait.
      lease = await deps.accountLock.acquire(command.account_id as string, command.task_id)

      if (!lease) {
         throw new AccountBusyError()
      }

      try {
         account = {
            id: command.account_id as string,
            email: command.account_email as string,
            credentials: deps.openCredentials(command.credentials as NonNullable<TaskCommand['credentials']>),
         }
      } catch {
         // A key or format that does not match will not match on a retry either, and the reason stays out of the result.
         await lease.release().catch(() => undefined)

         return refuse('NEEDS_ACCOUNT', 'The stored credentials could not be read. Save them again.')
      }
   }

   try {
      return await execute(command, task, input.data, account, deps, {
         startedAt,
         publish,
         now,
         pause,
      })
   } finally {
      // A lease that cannot be released expires on its own, and the outcome is already recorded.
      await lease?.release().catch(() => undefined)
   }
}

type Shared = {
   startedAt: number
   publish: (
      outcome: Pick<TaskOutcome, 'status' | 'verdict' | 'message' | 'report'>,
      artifacts?: Artifact[]
   ) => Promise<void>
   now: () => number
   pause: (ms: number) => Promise<void>
}

const allowedState = <T extends Pick<StorageState, 'origins'> & { cookies: Array<{ domain: string }> }>(
   state: T,
   policy: RunnerDeps['policy']
): T => ({
   ...state,
   cookies: state.cookies.filter(({ domain }) => policy.allowsCookieDomain(domain)),
   origins: state.origins.filter(({ origin }) => policy.allowsUrl(origin)),
})

const execute = async (
   command: TaskCommand,
   task: TaskDefinition,
   input: unknown,
   account: TaskContext['account'],
   deps: RunnerDeps,
   { publish, pause }: Shared
) => {
   const prefix = runPrefix(command)

   // A recording is the point of most tasks, but if it cannot start the task still runs.
   const recorder = await deps
      .startRecording({
         task: task.name,
         id: command.task_id,
         prefix,
         always: task.recording?.always ?? false,
         ...(task.recording?.videoSize && { videoSize: task.recording.videoSize }),
      })
      .catch(() => undefined)

   for (const secret of [
      command.proxy?.username,
      command.proxy?.password,
      account?.credentials.password,
      account?.credentials.totpSecret,
      account?.credentials.session,
   ]) {
      if (secret) {
         recorder?.addSecret(secret)
      }
   }

   recorder?.log(
      'spider',
      'info',
      `Task ${task.name} started${command.proxy ? ' through a proxy' : ' without a proxy'}`
   )

   // Closes the browser first (the video is complete only then), saves the files, then publishes the result.
   const finish = async (outcome: TaskOutcome, session: DetectionSession | undefined) => {
      // Taken before the browser closes. Only sites the operator allowed are kept.
      const state = account
         ? await session
              ?.storageState()
              .then(found => allowedState(found, deps.policy))
              .catch(() => undefined)
         : undefined

      await session?.close().catch(() => undefined)

      if (state) {
         recorder?.attachSession(JSON.stringify(state))
      }

      const saved = await recorder?.finish({
         failed: outcome.status === 'FAILED',
         verdict: outcome.verdict,
      })
      const artifacts = saved ? (recorder?.artifacts() ?? []) : []

      if (recorder && saved) {
         try {
            await deps.store.put(
               `${saved}/result.json`,
               recorder.redact(
                  JSON.stringify({
                     ...outcome,
                     task: task.name,
                     task_id: command.task_id,
                  })
               ),
               'application/json'
            )
            await deps.store.put(`${saved}/manifest.json`, JSON.stringify({ artifacts }), 'application/json')
         } catch (error) {
            console.error(`Could not save the manifest of ${command.task_id}: ${(error as Error).message}`)
         }
      }

      // Only a run that passed its own check replaces the saved session, so a failed or logged-out one never overwrites a good one.
      if (state && account && outcome.commitSession && outcome.status === 'SUCCEEDED') {
         await deps.sessions?.save(account.id, state).catch(error => {
            console.error(`Could not keep the session of ${account.id}: ${(error as Error).message}`)
         })
      }

      await publish(outcome, artifacts)
   }

   let session: DetectionSession
   let device: DeviceIdentity | undefined
   let exitIp: string | undefined

   try {
      device = account && deps.identities ? await deps.identities.forAccount(account.id) : undefined

      // The proxy's exit decides the account's timezone, and its language while the country stays the same. A lookup that
      // fails is a proxy that does not work, never a reason to start with whatever the host would show.
      if (account && device && command.proxy && deps.identities && deps.exitGeo) {
         const exit = await deps.exitGeo(command.proxy).catch(() => {
            throw new TaskError('The exit address of the proxy could not be looked up')
         })
         const kept = regionToKeep(device, exit)

         recorder?.log('spider', 'info', `The proxy exits at ${exit.ip}, which looks up as ${exit.country}`)
         if (kept) {
            recorder?.log(
               'spider',
               'info',
               device.country && device.country !== kept.country
                  ? `The proxy now exits in ${kept.country}, not ${device.country}: language and timezone follow`
                  : `Language and timezone set to ${kept.locale} and ${kept.timezone} for this account`
            )
            device = await deps.identities.pin(account.id, device, kept)
         }

         exitIp = exit.ip
      }

      // Only sites the operator allowed are put back, the same rule as when it was kept.
      const saved = account && deps.sessions ? await deps.sessions.load(account.id) : undefined

      session = await deps.driver.open({
         ...(command.proxy && { proxy: command.proxy }),
         ...(recorder && { recorder }),
         ...(device && { identity: device }),
         ...(exitIp && { exitIp }),
         ...(saved && { storageState: allowedState(saved, deps.policy) }),
      })
   } catch (error) {
      // A proxy that does not work is an answer to this task, not a reason to retry it.
      if (error instanceof TaskError) {
         return finish(
            {
               status: 'FAILED',
               verdict: 'PROXY_FAILED',
               message: 'The browser could not start through the proxy.',
            },
            undefined
         )
      }

      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   const browser = recorder ? new RecordedDetectionSession(session, recorder) : session

   const visit = async (address: string) => {
      let url: URL

      try {
         url = new URL(address)
      } catch {
         throw new VisitError('not-allowed', 'The address is not valid.')
      }

      if (!deps.policy.allowsUrl(address)) {
         throw new VisitError('not-allowed', 'The address is not on the spider allowlist.')
      }

      try {
         if (!(await deps.robots.check(url)).allowed) {
            throw new VisitError('robots', 'The site does not allow it in robots.txt.')
         }
      } catch (error) {
         throw error instanceof VisitError
            ? error
            : new VisitError('robots-unreadable', 'robots.txt could not be checked.')
      }

      await deps.limiter.wait(url.hostname)

      try {
         return await browser.goto(address)
      } catch {
         throw new VisitError('load', 'The page did not load.')
      }
   }

   const context: TaskContext = {
      browser,
      ...(account && { account }),
      ...(device?.locale && { language: device.locale }),
      visit,
      log: message => recorder?.log('spider', 'info', message),
      warn: message => recorder?.log('spider', 'warn', message),
      screenshot: async (name, png) => {
         await recorder?.saveScreenshot(name, png)
      },
      attach: (name, content, contentType) => {
         recorder?.attach(name, content, contentType)
      },
      pause,
   }

   let outcome: TaskOutcome

   // The way to look again is not part of the answer: it must never reach the result or the files.
   const withoutPerson = (answer: TaskOutcome) => {
      const bare = { ...answer }

      delete bare.needsPerson

      return bare
   }

   // The run stopped at something only its owner can finish. The browser stays open for them; after they say they are done
   // the task looks again. Where nobody can take over (no way to reach the owner, a browser without hands), or the owner
   // does not come, the answer is the one the task gave.
   const handOver = async (stopped: TaskOutcome): Promise<TaskOutcome> => {
      const answer = withoutPerson(stopped)
      const { control } = session

      if (!stopped.needsPerson || !deps.handover || !control) {
         return answer
      }

      recorder?.log('spider', 'warn', 'The run needs its owner and keeps the browser open for them')

      try {
         const handed = await deps.handover(command.task_id, control)

         recorder?.log('spider', 'info', HANDOVER_LOG[handed])

         return handed === 'done'
            ? withoutPerson(await withLimit(stopped.needsPerson.resume(), task.limits.timeoutMs))
            : answer
      } catch {
         return answer
      }
   }

   try {
      outcome = await withLimit(task.run(context, input), task.limits.timeoutMs)
   } catch (error) {
      if (error instanceof TimedOut) {
         return finish(
            {
               status: 'FAILED',
               verdict: 'TIMED_OUT',
               message: 'The task took longer than its limit.',
            },
            session
         )
      }

      await session.close().catch(() => undefined)
      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw error
   }

   if (outcome.needsPerson) {
      outcome = await handOver(outcome)
   }

   // A verdict the task never declared would show in the web app without a label: that is a fault of the task.
   if (!(outcome.verdict in task.verdicts)) {
      await session.close().catch(() => undefined)
      await recorder?.finish({
         failed: true,
         verdict: 'CRASHED',
      })

      throw new Error(`The task ${task.name} answered ${outcome.verdict}, which it did not declare`)
   }

   recorder?.log('spider', outcome.status === 'SUCCEEDED' ? 'info' : 'warn', `Verdict: ${outcome.verdict}`)

   return finish(outcome, session)
}
