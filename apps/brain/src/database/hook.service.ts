import { z } from 'zod'

import { type Prisma, type WorkflowTrigger } from 'generated/prisma/client'

import { HOOK_PORTS, type HookPort, graphSchema, previewGraph } from '@automatedLinkedIn/contracts'

import { isUniqueViolation } from './conflict'
import { type JobItemInput } from './jobRun.service'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'
import { WorkflowRunService } from './workflowRun.service'

// Block hooks (.plan/workflow-events-and-hooks.md). A fire writes a delivery, then starts the hook's chain as its own small run of the
// same workflow. The host run never waits for it, and nothing here throws into the engine.

export const HOOK_LIMITS = {
   firesPerRun: 200,
   livePerWorkflow: 20,
   livePerOwner: 100,
   startsPerTick: 100,
   waitHours: 6,
   maxBackoffMs: 10 * 60 * 1000,
} as const

export const HOOK_REASONS = {
   nothing: 'Nothing reached the block.',
   stopped: 'The run was stopped.',
   limit: 'Hook limit for this run.',
   paused: 'The hook is paused.',
   removed: 'The hook is no longer on this run.',
   gone: 'The run no longer exists.',
   tooOld: 'Waited too long for its turn.',
} as const

const HOUR_MS = 60 * 60 * 1000

const attachmentsSchema = z.array(
   z.object({
      host: z.string(),
      phase: z.enum(HOOK_PORTS),
      options: z.object({
         when: z.enum(['items', 'always']),
         fires: z.enum(['each', 'once']),
         off: z.boolean(),
      }),
      graph: graphSchema,
   })
)

export type StoredHook = z.infer<typeof attachmentsSchema>[number]

// The chains saved on a run; none when the run has no hooks or the value cannot be read.
export const hooksOfRun = (value: unknown): StoredHook[] => {
   const parsed = attachmentsSchema.safeParse(value)

   return parsed.success ? parsed.data : []
}

type Keys = { nodeId: string; round: number }[]

// Where the items of a delivery live in the host run.
type Targets = { keys: Keys; approximate: boolean }

const targetsOf = (value: unknown): Targets => {
   const read = value as Partial<Targets> | null

   return {
      keys: Array.isArray(read?.keys) ? read.keys : [],
      approximate: read?.approximate === true,
   }
}

export type Fire = {
   run: {
      id: string
      userId: string
      workflowId: string
      hooks: unknown
      stopRequestedAt: Date | null
      resumes: number
   }
   nodeId: string
   phase: HookPort
   round: number
   tries: number
   keys: Keys
   approximate?: boolean
}

const backoffMs = (attempts: number) => Math.min(HOOK_LIMITS.maxBackoffMs, 30_000 * 2 ** Math.max(0, attempts - 1))

const countKeys = async (runId: string, keys: Keys) => {
   let total = 0

   for (const key of keys) {
      total += await WorkflowRunService.countItems({
         runId,
         ...key,
      })
   }

   return total
}

export class HookService {
   // A block reached a moment (before, on or after) that has a chain attached. Never throws.
   public static async fire(fire: Fire, now = new Date(), atEnd = false): Promise<void> {
      const { run, nodeId, phase } = fire
      const attachment = hooksOfRun(run.hooks).find(({ host, phase: at }) => host === nodeId && at === phase)

      if (!attachment) {
         return
      }

      const { options } = attachment

      // Once after is fired when the run ends (`fireOnceAfter`); once before and on only at the first round.
      if (options.fires === 'once' && !atEnd && (phase === 'after' || fire.round > 0)) {
         return
      }

      const round = options.fires === 'once' ? -1 : fire.round
      // A step taken again (waiting on its jobs, a crash) reaches the same moment again.
      const earlier = await PrismaService.client.workflowDelivery.findUnique({
         where: {
            hostRunId_hostNodeId_phase_round_tries_resumes: {
               hostRunId: run.id,
               hostNodeId: nodeId,
               phase,
               round,
               tries: fire.tries,
               resumes: run.resumes,
            },
         },
         select: { id: true },
      })

      if (earlier) {
         return
      }

      const sent = await PrismaService.client.workflowDelivery.count({
         where: {
            source: 'BLOCK',
            hostRunId: run.id,
         },
      })

      if (sent > HOOK_LIMITS.firesPerRun) {
         return
      }

      const nothing = options.when === 'items' && (await countKeys(run.id, fire.keys)) === 0
      const refusal = options.off
         ? HOOK_REASONS.paused
         : sent === HOOK_LIMITS.firesPerRun
           ? HOOK_REASONS.limit
           : run.stopRequestedAt
             ? HOOK_REASONS.stopped
             : nothing
               ? HOOK_REASONS.nothing
               : null

      try {
         const delivery = await PrismaService.client.workflowDelivery.create({
            data: {
               source: 'BLOCK',
               userId: run.userId,
               workflowId: run.workflowId,
               hostRunId: run.id,
               hostNodeId: nodeId,
               phase,
               round,
               tries: fire.tries,
               resumes: run.resumes,
               targets: {
                  keys: fire.keys,
                  approximate: fire.approximate === true,
               } satisfies Targets,
               retryAt: now,
               createdAt: now,
               ...(refusal && {
                  status: 'SKIPPED',
                  reason: refusal,
               }),
            },
            select: { id: true },
         })

         if (!refusal) {
            await this.start(delivery.id, now)
         }
      } catch (error) {
         // The same fire twice (a step taken again after a crash) is the same delivery.
         if (!isUniqueViolation(error)) {
            throw error
         }
      }
   }

   // The chains that fire once, at the end of the host run, with everything the block gave in every round.
   public static async fireOnceAfter(
      run: Fire['run'],
      steps: { nodeId: string; round: number; status: string; tries: number }[],
      now = new Date()
   ) {
      for (const { host, phase, options } of hooksOfRun(run.hooks)) {
         const own = steps.filter(
            ({ nodeId, status }) => nodeId === host && status !== 'SKIPPED' && status !== 'WAITING'
         )

         if (phase === 'after' && options.fires === 'once' && own.length > 0) {
            await this.fire(
               {
                  run,
                  nodeId: host,
                  phase,
                  round: -1,
                  tries: 0,
                  keys: own.map(({ round }) => ({
                     nodeId: host,
                     round,
                  })),
               },
               now,
               true
            )
         }
      }
   }

   private static async settle(
      id: string,
      change: { status: 'STARTED' | 'SKIPPED' | 'DROPPED'; reason?: string; runId?: string },
      now: Date
   ) {
      await PrismaService.client.workflowDelivery.update({
         where: { id },
         data: {
            status: change.status,
            reason: change.reason ?? null,
            ...(change.runId && { runId: change.runId }),
            ...(change.status === 'STARTED' && { startedAt: now }),
         },
      })
   }

   private static async wait(id: string, attempts: number, reason: string, now: Date) {
      await PrismaService.client.workflowDelivery.update({
         where: { id },
         data: {
            attempts: attempts + 1,
            reason,
            retryAt: new Date(now.getTime() + backoffMs(attempts + 1)),
         },
      })
   }

   // Starts the chain of one pending delivery as its own run. 'waiting' means a limit holds it back and it will be tried again.
   public static async start(
      deliveryId: string,
      now = new Date()
   ): Promise<'started' | 'skipped' | 'waiting' | 'gone'> {
      const delivery = await PrismaService.client.workflowDelivery.findFirst({
         where: {
            id: deliveryId,
            status: 'PENDING',
            source: 'BLOCK',
         },
      })

      if (!delivery?.hostRunId) {
         return 'gone'
      }

      const host = await PrismaService.client.workflowRun.findUnique({
         where: { id: delivery.hostRunId },
         select: {
            id: true,
            userId: true,
            workflowId: true,
            trigger: true,
            hooks: true,
            depth: true,
            stopRequestedAt: true,
            qualifyScore: true,
            maybeScore: true,
            maybeEnabled: true,
         },
      })
      const skip = async (reason: string) => {
         await this.settle(
            delivery.id,
            {
               status: 'SKIPPED',
               reason,
            },
            now
         )

         return 'skipped' as const
      }

      if (now.getTime() - delivery.createdAt.getTime() > HOOK_LIMITS.waitHours * HOUR_MS) {
         await this.settle(
            delivery.id,
            {
               status: 'DROPPED',
               reason: HOOK_REASONS.tooOld,
            },
            now
         )

         return 'skipped'
      }

      if (!host) {
         return skip(HOOK_REASONS.gone)
      }

      if (host.stopRequestedAt) {
         return skip(HOOK_REASONS.stopped)
      }

      const attachment = hooksOfRun(host.hooks).find(
         ({ host: at, phase }) => at === delivery.hostNodeId && phase === delivery.phase
      )

      if (!attachment) {
         return skip(HOOK_REASONS.removed)
      }

      const live = (where: Prisma.WorkflowRunWhereInput) =>
         PrismaService.client.workflowRun.count({
            where: {
               kind: 'HOOK',
               status: 'RUNNING',
               ...where,
            },
         })

      if (
         (await live({ workflowId: host.workflowId })) >= HOOK_LIMITS.livePerWorkflow ||
         (await live({ userId: host.userId })) >= HOOK_LIMITS.livePerOwner
      ) {
         await this.wait(delivery.id, delivery.attempts, 'Other hooks of this workflow are still running.', now)

         return 'waiting'
      }

      if (await WalletService.belowFloor()) {
         await this.wait(delivery.id, delivery.attempts, 'New runs are paused for a short while.', now)

         return 'waiting'
      }

      // A preview's hooks are previews: acts and `Send via API` do nothing, paid reads are capped.
      const preview = host.trigger === 'PREVIEW'
      const graph = preview ? previewGraph(attachment.graph) : attachment.graph
      const trigger: WorkflowTrigger = preview ? 'PREVIEW' : 'HOOK'
      const runKey = `hook:${delivery.id}`

      try {
         const run = await PrismaService.client.workflowRun.create({
            data: {
               workflowId: host.workflowId,
               userId: host.userId,
               kind: 'HOOK',
               trigger,
               runKey,
               status: 'RUNNING',
               engineVersion: 2,
               graph,
               input: { delivery: delivery.id },
               depth: host.depth,
               parentRunId: host.id,
               qualifyScore: host.qualifyScore,
               maybeScore: host.maybeScore,
               maybeEnabled: host.maybeEnabled,
               steps: {
                  createMany: {
                     data: graph.nodes.map(node => ({
                        nodeId: node.id,
                        type: node.type,
                     })),
                  },
               },
            },
            select: { id: true },
         })

         await this.settle(
            delivery.id,
            {
               status: 'STARTED',
               runId: run.id,
            },
            now
         )
      } catch (error) {
         if (!isUniqueViolation(error)) {
            throw error
         }

         const earlier = await WorkflowRunService.idOfKey(runKey)

         await this.settle(
            delivery.id,
            {
               status: 'STARTED',
               ...(earlier && { runId: earlier }),
            },
            now
         )
      }

      return 'started'
   }

   // Pending deliveries whose turn has come, oldest first.
   public static async startDue(now = new Date()) {
      const due = await PrismaService.client.workflowDelivery.findMany({
         where: {
            source: 'BLOCK',
            status: 'PENDING',
            retryAt: { lte: now },
         },
         orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
         take: HOOK_LIMITS.startsPerTick,
         select: {
            id: true,
            userId: true,
         },
      })
      const items: JobItemInput[] = []
      let started = 0

      for (const { id, userId } of due) {
         const outcome = await this.start(id, now)

         if (outcome === 'started') {
            started += 1
            items.push({
               userId,
               action: 'hook-run',
               result: 'ASKED',
            })
         } else if (outcome === 'skipped') {
            items.push({
               userId,
               action: 'hook-run',
               result: 'SKIPPED',
               reason: 'The hook did not start.',
            })
         }
      }

      return {
         started,
         items,
      }
   }

   // What a hook run starts from: the host's items, found again from the delivery that started the run.
   public static async itemsOf(run: { input: unknown; userId: string }) {
      const { delivery } = z.object({ delivery: z.string() }).safeParse(run.input).data ?? {}
      const row = delivery
         ? await PrismaService.client.workflowDelivery.findFirst({
              where: {
                 id: delivery,
                 userId: run.userId,
                 source: 'BLOCK',
              },
              select: {
                 hostRunId: true,
                 targets: true,
              },
           })
         : null

      return row?.hostRunId ? WorkflowRunService.items(row.hostRunId, targetsOf(row.targets).keys) : []
   }

   // What the hooks of one run did, one line for each hook: how many fired, how many of those runs failed or still go, and why the
   // others did not start. Ids and fixed sentences only.
   public static async summaryOf(userId: string, hostRunId: string) {
      const rows = await PrismaService.client.workflowDelivery.findMany({
         where: {
            userId,
            hostRunId,
            source: 'BLOCK',
         },
         orderBy: { createdAt: 'asc' },
         take: HOOK_LIMITS.firesPerRun + 1,
         select: {
            hostNodeId: true,
            phase: true,
            status: true,
            reason: true,
            runId: true,
         },
      })
      const runs = await PrismaService.client.workflowRun.findMany({
         where: {
            userId,
            id: { in: rows.flatMap(({ runId }) => (runId ? [runId] : [])) },
         },
         select: {
            id: true,
            status: true,
            message: true,
         },
      })
      const statusOf = new Map(
         runs.map(({ id, status, message }) => [
            id,
            {
               status,
               message,
            },
         ])
      )
      const lines = new Map<
         string,
         {
            nodeId: string
            phase: string
            fired: number
            running: number
            failed: number
            skipped: number
            reason: string | null
            firstRunId: string | null
         }
      >()

      for (const row of rows) {
         const key = `${row.hostNodeId}:${row.phase}`
         const line = lines.get(key) ?? {
            nodeId: row.hostNodeId ?? '',
            phase: row.phase,
            fired: 0,
            running: 0,
            failed: 0,
            skipped: 0,
            reason: null,
            firstRunId: null,
         }
         const run = row.runId ? statusOf.get(row.runId) : undefined

         if (row.status === 'STARTED') {
            line.fired += 1
            line.firstRunId ??= row.runId
            line.running += run?.status === 'RUNNING' ? 1 : 0
            line.failed += run?.status === 'FAILED' ? 1 : 0
            line.reason = run?.status === 'FAILED' ? (run.message ?? line.reason) : line.reason
         } else if (row.status !== 'PENDING') {
            line.skipped += 1
            line.reason = row.reason ?? line.reason
         }

         lines.set(key, line)
      }

      return [...lines.values()]
   }

   // The owner's Stop on a run reaches the hook runs it started that are still live.
   public static async stopOf(hostRunId: string) {
      await PrismaService.client.workflowRun.updateMany({
         where: {
            parentRunId: hostRunId,
            kind: 'HOOK',
            status: 'RUNNING',
            stopRequestedAt: null,
         },
         data: { stopRequestedAt: new Date() },
      })
   }

   // A Stop block in a chain stops the host run too, with the Stop's sentence. Nothing happens when the host already ended.
   public static async stopHost(hostRunId: string, message: string) {
      await PrismaService.client.workflowRun.updateMany({
         where: {
            id: hostRunId,
            status: 'RUNNING',
            stopRequestedAt: null,
         },
         data: {
            stopRequestedAt: new Date(),
            message,
         },
      })
   }
}
