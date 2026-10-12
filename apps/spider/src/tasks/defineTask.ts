import { type z } from 'zod'

import { type TaskReport } from '@automatedLinkedIn/contracts'

import { type DetectionSession } from '../scraping/driver'

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
}

// A page that could not be opened for a reason the task can describe in its own words.
export class VisitError extends Error {
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
