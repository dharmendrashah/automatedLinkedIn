import { type Graph, type StepRun } from './types'

import { type RouterOutputs } from '../../trpc'
import { combineRounds } from './graph-convert'

// What a block of a workflow did in a run, for its dialog (.plan/workflow-hardening-and-block-details.md).

export type StepAdvice = RouterOutputs['workflow']['stepErrors'][number]

// The advice for a step's error code, or the generic one for a step with no code or an older code.
export const adviceOf = (catalog: StepAdvice[], code: string | null): StepAdvice | null =>
   catalog.find(advice => advice.code === code) ?? catalog.find(advice => advice.code === 'UNKNOWN') ?? null

export type BlockRunState = 'never' | 'waiting' | 'working' | 'done' | 'gaps' | 'failed'

export type BlockRun = {
   state: BlockRunState
   // The block's steps added up over every round, or null when it has none.
   step: StepRun | null
   rounds: number
   // The block was not in the copy of the workflow the run started with.
   addedAfter: boolean
   // The block's settings differ from the copy the run started with.
   changedAfter: boolean
   // The run ended more than the keep time ago, so what it passed on is gone.
   expired: boolean
   defaultTab: 'input' | 'output'
}

type RunLike = { status: string; finishedAt: string | null; graph: Graph; steps: StepRun[] }

// Items of a finished run are deleted after this many days (brain `RETENTION.itemsDays`).
const KEEP_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const sameConfig = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

const sorted = (value: unknown): unknown =>
   Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === 'object'
        ? Object.fromEntries(
             Object.entries(value)
                .filter(([, each]) => each !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, each]) => [key, sorted(each)])
          )
        : value

export const blockRunOf = (
   nodeId: string,
   config: Record<string, unknown>,
   run: RunLike | null,
   now: Date = new Date()
): BlockRun => {
   const steps = run?.steps.filter(step => step.nodeId === nodeId) ?? []
   const step = combineRounds(steps).get(nodeId) ?? null
   const inRun = run?.graph.nodes.find(({ id }) => id === nodeId)
   const finished = run?.finishedAt ? new Date(run.finishedAt) : null
   const state = ((): BlockRunState => {
      if (!step || !run) {
         return 'never'
      }

      if (step.status === 'WAITING') {
         return run.status === 'RUNNING' ? 'waiting' : 'never'
      }

      return (
         {
            RUNNING: 'working',
            DONE: 'done',
            PARTIAL: 'gaps',
            FAILED: 'failed',
         } as const
      )[step.status]
   })()

   return {
      state,
      step,
      rounds: Math.max(1, ...steps.map(({ round }) => round + 1)),
      addedAfter: run !== null && !inRun,
      changedAfter: inRun !== undefined && !sameConfig(inRun.config, config),
      expired: finished !== null && now.getTime() - finished.getTime() > KEEP_DAYS * DAY_MS,
      defaultTab: state === 'done' || state === 'gaps' || state === 'failed' ? 'output' : 'input',
   }
}
