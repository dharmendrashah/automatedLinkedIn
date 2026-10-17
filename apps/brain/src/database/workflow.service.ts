import { type Prisma, type WorkflowTrigger } from 'generated/prisma/client'

import {
   type Graph,
   type GraphError,
   estimateGraph,
   graphSchema,
   nextScheduledRun,
   previewGraph,
   scheduleOf,
   validateGraph,
} from '@automatedLinkedIn/contracts'

import { ConflictError, uniqueOr } from './conflict'
import { LinkedInPostService } from './linkedInPost.service'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

export type WorkflowChanges = {
   name?: string
   graph?: Graph
   qualifyScore?: number
   maybeScore?: number
   maybeEnabled?: boolean
   enabled?: boolean
}

const workflowSelect = {
   id: true,
   name: true,
   goal: true,
   graph: true,
   outputListId: true,
   outputList: { select: { name: true } },
   qualifyScore: true,
   maybeScore: true,
   maybeEnabled: true,
   enabled: true,
   nextRunAt: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.WorkflowSelect

// What the browser may see of a run: no supplier job ids, no raw rows.
const runSelect = {
   id: true,
   workflowId: true,
   trigger: true,
   status: true,
   estimateMicros: true,
   costMicros: true,
   qualified: true,
   maybe: true,
   discarded: true,
   message: true,
   startedAt: true,
   finishedAt: true,
} satisfies Prisma.WorkflowRunSelect

const stepSelect = {
   nodeId: true,
   type: true,
   status: true,
   itemsIn: true,
   itemsOut: true,
   costMicros: true,
   message: true,
} satisfies Prisma.WorkflowStepRunSelect

const workflowTaken = (name: string) => `You already have a workflow named "${name}".`
const listTaken = (name: string) => `You already have a list named "${name}". Pick another workflow name.`

export const readGraph = (value: unknown): Graph => graphSchema.parse(value)

const usesPosts = (graph: Graph) => graph.nodes.some(({ type }) => type === 'input.posts')

export class WorkflowService {
   // The graph's own problems plus ideal customers that are not the owner's.
   public static async problems(userId: string, graph: Graph): Promise<GraphError[]> {
      const icpIds = graph.nodes.flatMap(node =>
         node.type === 'score.icp' && typeof node.config.icpId === 'string' ? [node.config.icpId] : []
      )
      const owned = await PrismaService.client.icp.findMany({
         where: {
            userId,
            id: { in: icpIds },
         },
         select: { id: true },
      })
      const ownedIds = new Set(owned.map(({ id }) => id))
      const missing = graph.nodes
         .filter(node => node.type === 'score.icp' && !ownedIds.has(String(node.config.icpId ?? '')))
         .map(node => ({
            nodeId: node.id,
            message: 'Pick one of your ideal customers to score against.',
         }))

      return [...validateGraph(graph), ...missing]
   }

   public static list(userId: string) {
      return PrismaService.client.workflow.findMany({
         where: { userId },
         orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
         select: {
            ...workflowSelect,
            runs: {
               orderBy: { startedAt: 'desc' },
               take: 1,
               select: runSelect,
            },
         },
      })
   }

   public static get(userId: string, id: string) {
      return PrismaService.client.workflow.findFirst({
         where: {
            id,
            userId,
         },
         select: workflowSelect,
      })
   }

   // The workflow and its own output list, made together.
   public static create(userId: string, input: { name: string; goal: string | null; graph: Graph }) {
      return PrismaService.client.$transaction(async tx => {
         const list = await uniqueOr(
            tx.workflowList.create({
               data: {
                  userId,
                  name: input.name,
               },
               select: { id: true },
            }),
            listTaken(input.name)
         )

         return uniqueOr(
            tx.workflow.create({
               data: {
                  userId,
                  name: input.name,
                  goal: input.goal,
                  graph: input.graph,
                  outputListId: list.id,
               },
               select: workflowSelect,
            }),
            workflowTaken(input.name)
         )
      })
   }

   public static async update(userId: string, id: string, changes: WorkflowChanges) {
      const current = await WorkflowService.get(userId, id)

      if (!current) {
         return null
      }

      const graph = changes.graph ?? readGraph(current.graph)
      const enabled = changes.enabled ?? current.enabled
      const schedule = scheduleOf(graph)

      if (enabled && !schedule) {
         throw new ConflictError('Add an "On a schedule" block before switching the workflow on.')
      }

      if (enabled && (await WorkflowService.problems(userId, graph)).length > 0) {
         throw new ConflictError('Fix the problems in the workflow before switching it on.')
      }

      const qualifyScore = changes.qualifyScore ?? current.qualifyScore
      const maybeScore = changes.maybeScore ?? current.maybeScore

      if (maybeScore >= qualifyScore) {
         throw new ConflictError('The maybe score must be lower than the qualified score.')
      }

      return uniqueOr(
         PrismaService.client.workflow.update({
            where: { id },
            data: {
               ...changes,
               enabled,
               nextRunAt: enabled && schedule ? nextScheduledRun(schedule, new Date()) : null,
            },
            select: workflowSelect,
         }),
         workflowTaken(changes.name ?? current.name)
      )
   }

   // Deletes the workflow and its runs; its list and the people in it stay.
   public static async delete(userId: string, id: string) {
      const { count } = await PrismaService.client.workflow.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count > 0
   }

   public static async estimate(userId: string, graph: Graph, preview: boolean) {
      const posts = await LinkedInPostService.countWaiting(userId)

      return {
         posts,
         ...estimateGraph(preview ? previewGraph(graph) : graph, { posts }),
      }
   }

   // Starts a run, or explains why it cannot start. null when the workflow is not the owner's.
   public static async startRun(userId: string, workflowId: string, trigger: WorkflowTrigger, runKey: string) {
      const workflow = await WorkflowService.get(userId, workflowId)

      if (!workflow) {
         return null
      }

      const graph = readGraph(workflow.graph)
      const [problem] = await WorkflowService.problems(userId, graph)

      if (problem) {
         throw new ConflictError(`Fix the workflow first: ${problem.message}`)
      }

      const running = await PrismaService.client.workflowRun.count({
         where: {
            workflowId,
            status: 'RUNNING',
         },
      })

      if (running > 0) {
         throw new ConflictError('A run of this workflow is still going.')
      }

      if (await WalletService.belowFloor()) {
         throw new ConflictError('New runs are paused for a short while. Please try again later.')
      }

      const runGraph = trigger === 'PREVIEW' ? previewGraph(graph) : graph
      const { posts, totalMicros } = await WorkflowService.estimate(userId, runGraph, false)

      if (usesPosts(graph) && posts === 0) {
         throw new ConflictError('No posts are waiting in your posts list. Add some posts first.')
      }

      return uniqueOr(
         PrismaService.client.workflowRun.create({
            data: {
               workflowId,
               userId,
               trigger,
               runKey,
               graph: runGraph,
               qualifyScore: workflow.qualifyScore,
               maybeScore: workflow.maybeScore,
               maybeEnabled: workflow.maybeEnabled,
               estimateMicros: totalMicros,
               steps: {
                  createMany: {
                     data: runGraph.nodes.map(node => ({
                        nodeId: node.id,
                        type: node.type,
                     })),
                  },
               },
            },
            select: runSelect,
         }),
         'This run has already started.'
      )
   }

   public static runs(userId: string, workflowId: string) {
      return PrismaService.client.workflowRun.findMany({
         where: {
            userId,
            workflowId,
         },
         orderBy: { startedAt: 'desc' },
         take: 50,
         select: runSelect,
      })
   }

   public static run(userId: string, runId: string) {
      return PrismaService.client.workflowRun.findFirst({
         where: {
            id: runId,
            userId,
         },
         select: {
            ...runSelect,
            graph: true,
            steps: { select: stepSelect },
         },
      })
   }

   // Scheduled workflows whose time has come.
   public static due(now: Date) {
      return PrismaService.client.workflow.findMany({
         where: {
            enabled: true,
            nextRunAt: { lte: now },
         },
         select: {
            id: true,
            userId: true,
            graph: true,
            nextRunAt: true,
         },
      })
   }

   public static setNextRun(id: string, nextRunAt: Date | null) {
      return PrismaService.client.workflow.update({
         where: { id },
         data: { nextRunAt },
      })
   }
}
