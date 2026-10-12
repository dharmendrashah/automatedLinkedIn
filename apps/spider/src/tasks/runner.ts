import {
   type Artifact,
   type RUNNER_VERDICTS,
   TASK_CONTRACT_VERSION,
   type TaskCommand,
   type TaskResult,
   runPrefix,
   taskResultSchema,
} from '@automatedLinkedIn/contracts'

import { RecordedDetectionSession } from '../recording/recordedDetectionSession'
import { type Recorder } from '../recording/recorder'
import { type DetectionDriver, type DetectionSession } from '../scraping/driver'
import { TaskError } from '../scraping/errors'
import { type HostPolicy } from '../scraping/policy'
import { type HostRateLimiter } from '../scraping/rateLimiter'
import { type RobotsGuard } from '../scraping/robots'
import { type ObjectStore } from '../storage/store'
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
   policy: Pick<HostPolicy, 'allowsUrl'>
   robots: Pick<RobotsGuard, 'check'>
   limiter: Pick<HostRateLimiter, 'wait'>
   store: Pick<ObjectStore, 'put'>
   // Resolves to nothing when the run is not to be kept; the task still runs.
   startRecording: (request: RecordingRequest) => Promise<Recorder | undefined>
   publishResult: (result: TaskResult) => Promise<void>
   // The git sha of this worker, so a run can be reproduced.
   workerBuild: string
   pause?: (ms: number) => Promise<void>
   now?: () => number
}

class TimedOut extends Error {}

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
            ...outcome,
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

   if (task.needs.account && !(command.account_id && command.credentials)) {
      return refuse('NEEDS_ACCOUNT', 'This task needs a LinkedIn account.')
   }

   if (!task.hosts.every(host => deps.policy.allowsUrl(`https://${host}/`))) {
      return refuse('NOT_ALLOWED', 'A site this task needs is not on the spider allowlist.')
   }

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

   for (const secret of [command.proxy?.username, command.proxy?.password]) {
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
      await session?.close().catch(() => undefined)

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

      await publish(outcome, artifacts)
   }

   let session: DetectionSession

   try {
      session = await deps.driver.open({
         ...(command.proxy && { proxy: command.proxy }),
         ...(recorder && { recorder }),
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

   try {
      outcome = await withLimit(task.run(context, input.data), task.limits.timeoutMs)
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
