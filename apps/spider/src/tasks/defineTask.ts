import { type z } from 'zod'

import { type BrowseClass, type TaskReport } from '@automatedLinkedIn/contracts'

import { StepFailed } from '../browsing/errors'
import { type DetectionSession } from '../scraping/driver'
import { type Credentials } from './credentials'
import { type Fetched } from './uploads'

// How a task shows in the web app, for one of its own verdict codes.
export type VerdictLabel = {
   label: string
   tone: 'success' | 'failure' | 'neutral'
}

export type TaskOutcome = {
   status: 'SUCCEEDED' | 'FAILED'
   // One of the codes the task declared in `verdicts`.
   verdict: string
   // One fixed sentence, never page content or a secret.
   message: string
   report?: TaskReport
   // The run's own check passed, so its cookies and local storage replace what is saved for the account.
   commitSession?: boolean
   // The run stopped at something only its owner can finish (a security check, a code sent to them). The runner keeps the
   // browser open for them, and once they say they are done it calls `resume`, which looks again and answers for real.
   needsPerson?: { resume: () => Promise<TaskOutcome> }
}

// A page that could not be opened for a reason the task can describe in its own words.
export class VisitError extends StepFailed {
   public constructor(
      public readonly reason: 'not-allowed' | 'robots' | 'robots-unreadable' | 'load',
      message: string
   ) {
      super(message)
      this.name = 'VisitError'
   }
}

// What a task is given. It never publishes, uploads, or reaches the bucket: the runner does all of that.
export interface TaskContext {
   // Already recorded, and already behind the proxy.
   readonly browser: DetectionSession
   // For a task that needs an account: who it is and what to sign in with. Masked in every file of the run.
   readonly account?: { id: string; email: string; credentials: Credentials }
   // The language of the account's device (a locale such as en-US), when the run has one. A site that picks a language by
   // itself (from the address it sees) is told this one instead.
   readonly language?: string
   // Takes a copy of the browser's session now, for a run that has just signed in. If the browser can no longer be read when the run
   // ends, that copy is what is kept (when the task asks for its session to be kept at all). Absent for a run with no account.
   keepSession?: () => Promise<void>
   // Opens a page. The allowlist, robots.txt and the rate limit are applied here, so a task cannot skip them.
   // Throws VisitError with a sentence when the page may not or could not be opened.
   visit: (url: string) => Promise<string>
   log: (message: string) => void
   warn: (message: string) => void
   // Saved with the run's other pictures.
   screenshot: (name: string, png: Buffer) => Promise<void>
   // A file of the run that is not one of the standard ones, with the run's secrets masked.
   attach: (name: string, content: string, contentType: string) => void
   pause: (ms: number) => Promise<void>
   // For a run with an account: signs the account in again in this browser, the way the run does at its start, and waits and
   // scrolls as a person does after a sign-in. Resolves to whether it worked. A task asks at most once; absent with no account.
   signInAgain?: () => Promise<boolean>
   // For a step that must never be done twice (sending a message): resolves to true the first time it is asked for this run, and
   // to false when the same command is delivered again after the step may already have been taken. Asked just before the step.
   // Where nothing is kept between deliveries (the local devtools) it is always true.
   markAttempt: () => Promise<boolean>
   // The files of an upload brain made for this run's user, on this machine until `remove` is called; absent where files cannot be
   // fetched (the paths are built from the user of the run, never from the input).
   uploads?: { fetch: (uploadId: string, names: string[]) => Promise<Fetched> }
   // The files of a post, on this machine until `remove` is called, from the folder of this run's user; absent where files cannot be
   // fetched. Each file is told by its id and name, never by a path.
   postFiles?: { fetch: (files: Array<{ id: string; name: string }>) => Promise<Fetched> }
   // Keeps the files of messages for good, in the folder of the owner and account of this run (they are deleted only with the
   // account). The place of a received file is the same on every read, so one already kept is not downloaded again. Absent where
   // nothing can be kept (the local devtools) or for a run with no account.
   kept?: {
      keyOf: (messageId: string, index: number, name: string) => string
      has: (key: string) => Promise<boolean>
      save: (key: string, body: Buffer, contentType: string) => Promise<void>
   }
}

export type TaskDefinition<Input = unknown> = {
   // Permanent: it names the folder in the bucket and the rows brain keeps.
   name: string
   // Raised when `input` or `report` change in a way an older brain would misread.
   version: number
   title: string
   description: string
   // Validated in the spider; brain only checks that the input is a small JSON object.
   input: z.ZodType<Input>
   needs: {
      proxy: 'required' | 'optional' | 'none'
      account: boolean
   }
   // The sites the task means to visit. The operator's allowlist still decides.
   hosts: string[]
   verdicts: Record<string, VerdictLabel>
   // Verdicts that another proxy may fix.
   retryOn?: string[]
   // How long the browser usually stays open, and how a session counts against the account's browsing time: an ACTION is asked
   // by the owner or a workflow, BACKGROUND is what the system schedules, SYSTEM is a sign-in check (counted, never refused).
   budget: { estimateS: number; class: BrowseClass }
   policy: {
      cooldownMs: number
      oneAtATime: 'proxy' | 'account' | 'none'
      automatic?: Array<{ on: string; everyMs: number }>
   }
   limits: { timeoutMs: number }
   // Whether the run is kept regardless of SPIDER_RECORDING, and at what video size.
   recording?: {
      always?: boolean
      videoSize?: { width: number; height: number }
   }
   run: (context: TaskContext, input: Input) => Promise<TaskOutcome>
}

// Keeps the input type for the author of a task and erases it for the registry.
export const defineTask = <Input>(task: TaskDefinition<Input>) => task as unknown as TaskDefinition
