import { createHash } from 'node:crypto'

import { DRAFT_LIMITS, type DraftKind } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { DraftService } from './draft.service'
import { PrismaService } from './prisma.service'
import { WorkflowService, readGraph } from './workflow.service'
import { WorkflowRunService } from './workflowRun.service'

// Starts the workflow's "When I approve" with what the owner approved (.plan/lead-pipeline-p4-ai-drafts.md). The inbox only decides; this
// is the only thing that starts a run from an approval. The run id written on each draft is the idempotency: a double click, a retry or a
// restart starts one run, and a start that fails leaves the drafts for the next pass.

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

type Listener = { workflowId: string; what: string; from: string; groupMinutes: number; maxPerHour: number }

const matches = (listener: Listener, kind: DraftKind) => listener.what === 'any' || listener.what === kind

// The "When I approve" blocks of the owner's switched-on workflows.
const listenersOf = async (userIds: string[]) => {
   const workflows = await PrismaService.client.workflow.findMany({
      where: {
         userId: { in: userIds },
         enabled: true,
      },
      orderBy: { createdAt: 'asc' },
      select: {
         id: true,
         userId: true,
         graph: true,
      },
   })
   const byUser = new Map<string, Listener[]>()

   for (const { id, userId, graph } of workflows) {
      try {
         for (const node of readGraph(graph).nodes.filter(({ type }) => type === 'trigger.approved')) {
            const { what, from, groupMinutes, maxPerHour } = node.config

            byUser.set(userId, [
               ...(byUser.get(userId) ?? []),
               {
                  workflowId: id,
                  what: String(what ?? 'any'),
                  from: String(from ?? 'this'),
                  groupMinutes: Number(groupMinutes ?? DRAFT_LIMITS.groupMinutes.default),
                  maxPerHour: Number(maxPerHour ?? DRAFT_LIMITS.runsPerHour.default),
               },
            ])
         }
      } catch {
         // A graph that does not read starts nothing.
      }
   }

   return byUser
}

export class ApprovalStartService {
   public static async startDue(now = new Date()) {
      const approved = await DraftService.approvedToStart()
      const listeners = await listenersOf([...new Set(approved.map(({ userId }) => userId))])
      const groups = new Map<
         string,
         { userId: string; workflowId: string; listener: Listener; ids: string[]; oldest: Date }
      >()

      for (const draft of approved) {
         const mine = (listeners.get(draft.userId) ?? []).filter(listener => matches(listener, draft.kind))
         const listener =
            mine.find(({ workflowId }) => workflowId === draft.originWorkflowId) ??
            mine.find(({ from }) => from === 'any')

         if (!listener) {
            continue
         }

         const key = `${draft.userId}:${listener.workflowId}`
         const group = groups.get(key)
         const decided = draft.decidedAt ?? now

         groups.set(key, {
            userId: draft.userId,
            workflowId: listener.workflowId,
            listener,
            ids: [...(group?.ids ?? []), draft.id],
            oldest: group && group.oldest < decided ? group.oldest : decided,
         })
      }

      let started = 0
      let held = 0
      let grouping = 0

      for (const { userId, workflowId, listener, ids, oldest } of groups.values()) {
         if (now.getTime() - oldest.getTime() < listener.groupMinutes * MINUTE_MS) {
            grouping += 1

            continue
         }

         const db = PrismaService.client
         const [lastHour, queued] = await Promise.all([
            db.workflowRun.count({
               where: {
                  workflowId,
                  trigger: 'APPROVAL',
                  startedAt: { gte: new Date(now.getTime() - HOUR_MS) },
               },
            }),
            db.workflowRun.count({
               where: {
                  workflowId,
                  trigger: 'APPROVAL',
                  status: 'QUEUED',
               },
            }),
         ])

         if (lastHour >= listener.maxPerHour || queued >= DRAFT_LIMITS.queuedRuns) {
            held += 1

            continue
         }

         const runKey = `${workflowId}:approval:${createHash('sha256')
            .update([...ids].sort().join(','))
            .digest('hex')
            .slice(0, 24)}`

         const input = { drafts: ids }

         try {
            const run = await WorkflowService.startRun(userId, workflowId, 'APPROVAL', runKey, { input })

            if (run) {
               await DraftService.markStarted(ids, run.id, now)
               started += 1
            }
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }

            // This exact group already started (the drafts were not marked): mark them. Any other refusal leaves them for the next pass.
            const earlier = await WorkflowRunService.idOfKey(runKey)

            if (earlier) {
               await DraftService.markStarted(ids, earlier, now)
            } else {
               held += 1
            }
         }
      }

      return {
         started,
         held,
         grouping,
      }
   }
}
