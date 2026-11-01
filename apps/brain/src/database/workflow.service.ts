import { inputKeys } from 'core/workflowInput'

import { type Prisma, type WorkflowTrigger } from 'generated/prisma/client'

import {
   type Available,
   type Estimate,
   type Graph,
   type GraphError,
   errorsOf,
   estimateGraph,
   graphSchema,
   nextScheduledRun,
   postBlocksOfText,
   previewGraph,
   scheduleOf,
   upgradeGraph,
   validateGraph,
} from '@automatedLinkedIn/contracts'

import { ConflictError, isUniqueViolation, uniqueOr } from './conflict'
import { InputPickService } from './inputPick.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { dropFiles, keysOf, ownsKeys } from './postFileKeys'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'
import { WorkflowRunService } from './workflowRun.service'

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
   stopRequestedAt: true,
   startedAt: true,
   finishedAt: true,
} satisfies Prisma.WorkflowRunSelect

const stepSelect = {
   id: true,
   nodeId: true,
   type: true,
   round: true,
   status: true,
   itemsIn: true,
   itemsOut: true,
   costMicros: true,
   message: true,
   errorCode: true,
   childRunId: true,
   tries: true,
   waitUntil: true,
} satisfies Prisma.WorkflowStepRunSelect

const workflowTaken = (name: string) => `You already have a workflow named "${name}".`

const CHANGED_ELSEWHERE = 'This workflow was changed somewhere else since you opened it.'
const DELETE_WHILE_RUNNING = 'A run of this workflow is going. Stop it first, then delete the workflow.'
const NO_AUTOMATIC_TRIGGER = 'No schedule, API or "When another workflow finishes" trigger'
const SWITCH_ON_NEEDS_TRIGGER =
   'Add a schedule, an API or a "When another workflow finishes" trigger before switching the workflow on.'

// Why a new run cannot start; a run held by a Wait says when it goes on.
export const stillGoing = (waits: (Date | null)[]) => {
   const [next] = waits
      .filter((at): at is Date => at !== null && at > new Date())
      .sort((a, b) => a.getTime() - b.getTime())

   return next
      ? `A run of this workflow is waiting until ${next.toISOString().slice(0, 16).replace('T', ' ')} UTC. Stop it to start another.`
      : 'A run of this workflow is still going.'
}

// A live run of the workflow refuses a new start.
const refuseWhileRunning = async (workflowId: string) => {
   const running = await PrismaService.client.workflowRun.findFirst({
      where: {
         workflowId,
         status: 'RUNNING',
      },
      select: { steps: { select: { waitUntil: true } } },
   })

   if (running) {
      throw new ConflictError(stillGoing(running.steps.map(({ waitUntil }) => waitUntil)))
   }
}

const listTaken = (name: string) => `You already have a list named "${name}". Pick another workflow name.`

export const readGraph = (value: unknown): Graph => upgradeGraph(graphSchema.parse(value))

// The posts written in the "Write a post" blocks of a graph; their files belong to the graph.
const postsOf = (graph: Graph) =>
   graph.nodes.flatMap(({ type, config }) =>
      type === 'account.writePost' ? (postBlocksOfText(config.post) ?? []) : []
   )

const FOREIGN_FILE = 'A file of a post is not yours. Attach it again.'

const usesPosts = (graph: Graph) => graph.nodes.some(({ type }) => type === 'input.posts')

// Triggers that start a workflow without a person pressing Run; the on/off switch governs them.
const AUTOMATIC = new Set(['trigger.schedule', 'trigger.api', 'trigger.workflow'])

// How many workflows may start one another in a row.
export const MAX_CHAIN_DEPTH = 5

const listenedTo = (graph: Graph) => {
   const node = graph.nodes.find(({ type }) => type === 'trigger.workflow')
   const id = node?.config.workflowId

   return typeof id === 'string' ? id : null
}

// A "When another workflow finishes" block must name another of the owner's workflows, and the chain must not loop.
const chainProblems = async (userId: string, graph: Graph, selfId: string | null): Promise<GraphError[]> => {
   const node = graph.nodes.find(({ type }) => type === 'trigger.workflow')
   let next = listenedTo(graph)

   if (!node || !next) {
      return []
   }

   for (let depth = 0; next && depth <= MAX_CHAIN_DEPTH * 2; depth += 1) {
      if (next === selfId) {
         return [
            {
               nodeId: node.id,
               level: 'error',
               message: 'This chain of workflows would start itself again. Pick another workflow.',
            },
         ]
      }

      const before = await PrismaService.client.workflow.findFirst({
         where: {
            id: next,
            userId,
         },
         select: { graph: true },
      })

      if (!before) {
         return depth === 0
            ? [
                 {
                    nodeId: node.id,
                    level: 'error',
                    message: 'Pick one of your workflows to run after.',
                 },
              ]
            : []
      }

      next = listenedTo(readGraph(before.graph))
   }

   return []
}

// The "Run another workflow" blocks of a graph and the workflow each one runs.
const callsOf = (graph: Graph) =>
   graph.nodes.flatMap(node =>
      node.type === 'logic.runWorkflow' && typeof node.config.workflowId === 'string'
         ? [
              {
                 nodeId: node.id,
                 workflowId: node.config.workflowId,
              },
           ]
         : []
   )

const ownedGraphs = async (userId: string, ids: string[]) =>
   (
      await PrismaService.client.workflow.findMany({
         where: {
            id: { in: ids },
            userId,
         },
         select: {
            id: true,
            graph: true,
         },
      })
   ).map(({ id, graph }) => ({
      id,
      graph: readGraph(graph),
   }))

// A "Run another workflow" block must run another of the owner's workflows, and the calls must not loop back.
const callProblems = async (userId: string, graph: Graph, selfId: string | null): Promise<GraphError[]> => {
   const problems: GraphError[] = []
   const problem = (nodeId: string, message: string) =>
      problems.push({
         nodeId,
         level: 'error',
         message,
      })

   for (const call of callsOf(graph)) {
      if (call.workflowId === selfId) {
         problem(call.nodeId, 'A workflow cannot run itself. Pick another workflow.')
         continue
      }

      const seen = new Set([call.workflowId])
      let frontier = await ownedGraphs(userId, [call.workflowId])

      if (frontier.length === 0) {
         problem(call.nodeId, 'Pick one of your workflows to run.')
         continue
      }

      for (let depth = 0; frontier.length > 0 && depth < MAX_CHAIN_DEPTH; depth += 1) {
         const next = frontier.flatMap(({ graph: called }) => callsOf(called).map(({ workflowId }) => workflowId))

         if (selfId && next.includes(selfId)) {
            problem(call.nodeId, 'These workflows would run each other in a loop. Pick another workflow.')
            break
         }

         frontier = await ownedGraphs(
            userId,
            next.filter(id => !seen.has(id))
         )
         next.forEach(id => seen.add(id))
      }
   }

   return problems
}

export class WorkflowService {
   // The graph's own problems, ideal customers that are not the owner's, and a chain that would loop.
   public static async problems(userId: string, graph: Graph, selfId: string | null = null): Promise<GraphError[]> {
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
         .filter(
            node =>
               node.type === 'score.icp' && typeof node.config.icpId === 'string' && !ownedIds.has(node.config.icpId)
         )
         .map(node => ({
            nodeId: node.id,
            level: 'error' as const,
            message: 'Pick one of your ideal customers to score against.',
         }))

      return [
         ...validateGraph(graph),
         ...missing,
         ...(await chainProblems(userId, graph, selfId)),
         ...(await callProblems(userId, graph, selfId)),
      ]
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
      if (!ownsKeys(userId, postsOf(input.graph))) {
         throw new ConflictError(FOREIGN_FILE)
      }

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

   public static async update(
      userId: string,
      id: string,
      changes: WorkflowChanges,
      // The `updatedAt` the editor loaded; a workflow changed since then is not overwritten.
      options: { expectedUpdatedAt?: Date } = {}
   ) {
      const current = await WorkflowService.get(userId, id)

      if (!current) {
         return null
      }

      if (options.expectedUpdatedAt && current.updatedAt.getTime() !== options.expectedUpdatedAt.getTime()) {
         throw new ConflictError(CHANGED_ELSEWHERE)
      }

      const graph = changes.graph ?? readGraph(current.graph)
      let enabled = changes.enabled ?? current.enabled

      if (!ownsKeys(userId, postsOf(graph))) {
         throw new ConflictError(FOREIGN_FILE)
      }
      const schedule = scheduleOf(graph)
      let switchedOff: string | null = null

      if (enabled) {
         const [firstProblem] = errorsOf(await WorkflowService.problems(userId, graph, id))
         const reason = !graph.nodes.some(({ type }) => AUTOMATIC.has(type))
            ? NO_AUTOMATIC_TRIGGER
            : firstProblem
              ? `${firstProblem.message}`
              : null

         if (reason && changes.enabled === true) {
            throw new ConflictError(
               reason === NO_AUTOMATIC_TRIGGER
                  ? SWITCH_ON_NEEDS_TRIGGER
                  : 'Fix the problems in the workflow before switching it on.'
            )
         }

         // Work in progress is kept, but a workflow with a problem must not keep running on its own.
         if (reason) {
            enabled = false
            switchedOff = reason
         }
      }

      const qualifyScore = changes.qualifyScore ?? current.qualifyScore
      const maybeScore = changes.maybeScore ?? current.maybeScore

      if (maybeScore >= qualifyScore) {
         throw new ConflictError('The maybe score must be lower than the qualified score.')
      }

      const updated = await uniqueOr(
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

      // The files the saved graph no longer holds are deleted from the bucket.
      if (changes.graph) {
         const kept = new Set(keysOf(postsOf(changes.graph)))

         await dropFiles(keysOf(postsOf(readGraph(current.graph))).filter(key => !kept.has(key)))
      }

      return {
         ...updated,
         switchedOff,
      }
   }

   // Deletes the workflow and its runs; its list and the people in it stay. A workflow with a run going is refused, so the
   // worker never loses the rows it is working on.
   public static async delete(userId: string, id: string) {
      const before = await WorkflowService.get(userId, id)

      if (
         before &&
         (await PrismaService.client.workflowRun.count({
            where: {
               workflowId: id,
               status: 'RUNNING',
            },
         })) > 0
      ) {
         throw new ConflictError(DELETE_WHILE_RUNNING)
      }

      const { count } = await PrismaService.client.workflow.deleteMany({
         where: {
            id,
            userId,
         },
      })

      if (count > 0 && before) {
         await dropFiles(keysOf(postsOf(readGraph(before.graph))))
      }

      return count > 0
   }

   public static async estimate(userId: string, graph: Graph, preview: boolean, workflowId: string | null = null) {
      const [posts, profiles, companies, byNode] = await Promise.all([
         LinkedInPostService.countWaiting(userId),
         LinkedInProfileService.countActive(userId),
         LinkedInCompanyService.countActive(userId),
         InputPickService.counts(userId, graph, workflowId),
      ])

      const available = {
         posts,
         profiles,
         companies,
         byNode,
      }

      return {
         ...available,
         ...(preview
            ? estimateGraph(previewGraph(graph), available)
            : await WorkflowService.withCalls(userId, graph, available, new Set())),
      }
   }

   // The estimate of a graph plus, on each "Run another workflow" block, what the workflow it runs costs.
   private static async withCalls(
      userId: string,
      graph: Graph,
      available: Available,
      seen: Set<string>
   ): Promise<Estimate> {
      const estimate = estimateGraph(graph, available)
      const calls = callsOf(graph).filter(({ workflowId }) => !seen.has(workflowId))
      const called = new Map(
         (
            await ownedGraphs(
               userId,
               calls.map(({ workflowId }) => workflowId)
            )
         ).map(({ id, graph: other }) => [id, other])
      )
      let { totalMicros } = estimate

      for (const { nodeId, workflowId } of calls) {
         const other = called.get(workflowId)
         const node = estimate.nodes[nodeId]

         if (other && node) {
            // The per-block counts are this graph's; the other workflow's block ids may repeat them.
            const totals = {
               posts: available.posts,
               profiles: available.profiles,
               companies: available.companies,
            }
            const cost = (await WorkflowService.withCalls(userId, other, totals, new Set([...seen, workflowId])))
               .totalMicros

            estimate.nodes[nodeId] = {
               ...node,
               costMicros: node.costMicros + cost,
            }
            totalMicros += cost
         }
      }

      return {
         ...estimate,
         totalMicros,
      }
   }

   // Starts a run, or explains why it cannot start. null when the workflow is not the owner's. An API call or a
   // finished workflow passes its items as `input`.
   public static async startRun(
      userId: string,
      workflowId: string,
      trigger: WorkflowTrigger,
      runKey: string,
      options: { input?: Prisma.InputJsonValue; depth?: number; parentRunId?: string } = {}
   ) {
      const workflow = await WorkflowService.get(userId, workflowId)

      if (!workflow) {
         return null
      }

      const graph = readGraph(workflow.graph)
      const [problem] = errorsOf(await WorkflowService.problems(userId, graph, workflowId))

      if (problem) {
         throw new ConflictError(`Fix the workflow first: ${problem.message}`)
      }

      await refuseWhileRunning(workflowId)

      if (await WalletService.belowFloor()) {
         throw new ConflictError('New runs are paused for a short while. Please try again later.')
      }

      const runGraph = trigger === 'PREVIEW' ? previewGraph(graph) : graph
      const { posts, totalMicros } = await WorkflowService.estimate(userId, runGraph, false, workflowId)
      const fromOutside = trigger === 'API' || trigger === 'WORKFLOW'

      if (usesPosts(graph) && posts === 0 && !fromOutside) {
         throw new ConflictError('No posts are waiting in your posts list. Add some posts first.')
      }

      try {
         return await PrismaService.client.workflowRun.create({
            data: {
               workflowId,
               userId,
               trigger,
               runKey,
               graph: runGraph,
               input: options.input,
               depth: options.depth ?? 0,
               parentRunId: options.parentRunId,
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
         })
      } catch (error) {
         if (!isUniqueViolation(error)) {
            throw error
         }

         // The key was used before, or another start got in after the check above: the database lets one run be live.
         if (await WorkflowRunService.idOfKey(runKey)) {
            throw new ConflictError('This run has already started.')
         }

         await refuseWhileRunning(workflowId)

         throw error
      }
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

   // Asks a live run to stop; the worker ends it once the jobs already paid for finished. False when it is not the
   // owner's live run.
   public static async requestStop(userId: string, runId: string) {
      const { count } = await PrismaService.client.workflowRun.updateMany({
         where: {
            id: runId,
            userId,
            status: 'RUNNING',
            stopRequestedAt: null,
         },
         data: { stopRequestedAt: new Date() },
      })

      return count === 1
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
            parentRunId: true,
            steps: {
               select: stepSelect,
               orderBy: [{ round: 'asc' }, { id: 'asc' }],
            },
         },
      })
   }

   // The owner's runs among these ids with their workflow, for links between a run and the runs it started.
   public static async runLinks(userId: string, ids: (string | null)[]) {
      const runs = await PrismaService.client.workflowRun.findMany({
         where: {
            userId,
            id: { in: ids.filter((id): id is string => id !== null) },
         },
         select: {
            id: true,
            workflowId: true,
            workflow: { select: { name: true } },
         },
      })

      return new Map(
         runs.map(run => [
            run.id,
            {
               runId: run.id,
               workflowId: run.workflowId,
               workflowName: run.workflow.name,
            },
         ])
      )
   }

   // One page of what a block of the owner's run passed on. null when the run is not the owner's.
   public static async output(
      userId: string,
      query: { runId: string; nodeId: string; round?: number; skip: number; take: number }
   ) {
      const run = await PrismaService.client.workflowRun.findFirst({
         where: {
            id: query.runId,
            userId,
         },
         select: { id: true },
      })

      return run ? WorkflowRunService.page(run.id, query.nodeId, query.round, query.skip, query.take) : null
   }

   // One page of what reached a block of the owner's run: the output of the blocks before it, read from the same places
   // the engine reads (`inputKeys`). null when the run is not the owner's.
   public static async input(
      userId: string,
      query: { runId: string; nodeId: string; round?: number; skip: number; take: number }
   ) {
      const run = await PrismaService.client.workflowRun.findFirst({
         where: {
            id: query.runId,
            userId,
         },
         select: {
            id: true,
            graph: true,
            steps: {
               select: {
                  nodeId: true,
                  round: true,
               },
            },
         },
      })

      if (!run) {
         return null
      }

      const parsed = graphSchema.safeParse(run.graph)
      const node = parsed.success ? parsed.data.nodes.find(({ id }) => id === query.nodeId) : undefined

      if (!parsed.success || !node) {
         return {
            total: 0,
            items: [],
         }
      }

      const has = (nodeId: string, round: number) =>
         run.steps.some(step => step.nodeId === nodeId && step.round === round)
      const rounds =
         query.round === undefined
            ? run.steps.filter(({ nodeId }) => nodeId === query.nodeId).map(({ round }) => round)
            : [query.round]
      const keys = new Map(
         rounds
            .flatMap(round => inputKeys(parsed.data, node, round, has))
            .map(source => [`${source.nodeId}#${source.round}`, source])
      )

      return WorkflowRunService.pageKeys(run.id, [...keys.values()], query.skip, query.take)
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

   // The switched-on workflows of an owner that start when `workflowId` finishes.
   public static async listeners(userId: string, workflowId: string) {
      const workflows = await PrismaService.client.workflow.findMany({
         where: {
            userId,
            enabled: true,
         },
         select: {
            id: true,
            graph: true,
         },
      })

      return workflows.filter(({ graph }) => listenedTo(readGraph(graph)) === workflowId).map(({ id }) => id)
   }
}
