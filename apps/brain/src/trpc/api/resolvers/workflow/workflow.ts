import { TRPCError } from '@trpc/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { WorkflowService, WorkflowTriggerService, readGraph } from 'database'

import { GOALS, catalog, graphSchema, templateGraph } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Workflow not found'
const RUN_MISSING = 'Run not found'

const byId = z.object({ id: z.string().min(1) })
const name = z.string().trim().min(1).max(100)
const score = z.number().int().min(1).max(100)

const templateFields = {
   goal: z.enum(GOALS).default('engagers'),
   icpId: z.string().min(1),
   posts: z.number().int().min(1).max(100),
   perPost: z.number().int().min(1).max(500),
   keywords: z.string().trim().min(1).max(200).optional(),
   customer: z.string().trim().min(1).max(500).optional(),
   titles: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
}

const template = z.object(templateFields)

const createInput = template.extend({
   name,
   description: z.string().trim().max(200).optional(),
})

const updateInput = byId.extend({
   name: name.optional(),
   graph: graphSchema.optional(),
   qualifyScore: score.optional(),
   maybeScore: score.optional(),
   maybeEnabled: z.boolean().optional(),
   enabled: z.boolean().optional(),
})

// A saved workflow with its graph parsed and what still stops it from running.
const withProblems = async <T extends { id: string; graph: unknown }>(userId: string, workflow: T) => {
   const { graph: saved, ...rest } = workflow
   const graph = readGraph(saved)

   return {
      ...rest,
      graph,
      problems: await WorkflowService.problems(userId, graph, workflow.id),
   }
}

// Every procedure scopes to ctx.user.id, so one user can never reach another's workflows or runs by id.
export const workflow = router({
   catalog: ownerProcedure.query(() => catalog()),

   list: ownerProcedure.query(async ({ ctx }) =>
      (await WorkflowService.list(ctx.user.id)).map(item => ({
         ...item,
         graph: readGraph(item.graph),
      }))
   ),

   get: ownerProcedure.input(byId).query(async ({ ctx, input }) => {
      const found = present(await WorkflowService.get(ctx.user.id, input.id), MISSING)

      return withProblems(ctx.user.id, found)
   }),

   // The guided start: the template of the chosen goal with the client's ideal customer and numbers.
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { goal, name: workflowName, description, ...options } = input
      const graph = templateGraph(goal, options)
      const [problem] = await WorkflowService.problems(ctx.user.id, graph)

      if (problem) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: problem.message,
         })
      }

      return orConflict(
         WorkflowService.create(ctx.user.id, {
            name: workflowName,
            goal: description ?? null,
            graph,
         })
      )
   }),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input
      const updated = present(await orConflict(WorkflowService.update(ctx.user.id, id, changes)), MISSING)

      return withProblems(ctx.user.id, updated)
   }),

   delete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await WorkflowService.delete(ctx.user.id, input.id), MISSING)
   }),

   // A new token for the workflow's API address. Shown once; the old one stops working.
   rotateToken: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const token = present(await WorkflowTriggerService.rotateToken(ctx.user.id, input.id), MISSING)

      return { token }
   }),

   // The most a run can cost, for a saved workflow, a draft graph on the canvas, or the guided start's template.
   estimate: ownerProcedure
      .input(
         z.object({
            id: z.string().min(1).optional(),
            graph: graphSchema.optional(),
            template: template.optional(),
            preview: z.boolean().default(false),
         })
      )
      .query(async ({ ctx, input }) => {
         const saved = input.id ? await WorkflowService.get(ctx.user.id, input.id) : null
         const fromTemplate = input.template ? templateGraph(input.template.goal, input.template) : null
         const graph = input.graph ?? fromTemplate ?? (saved ? readGraph(saved.graph) : null)
         const draft = present(graph, MISSING)
         const [estimate, problems] = await Promise.all([
            WorkflowService.estimate(ctx.user.id, draft, input.preview),
            WorkflowService.problems(ctx.user.id, draft, input.id ?? null),
         ])

         return {
            ...estimate,
            problems,
         }
      }),

   start: ownerProcedure
      .input(byId.extend({ preview: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
         const trigger = input.preview ? 'PREVIEW' : 'MANUAL'
         const run = await orConflict(
            WorkflowService.startRun(ctx.user.id, input.id, trigger, `${input.id}:${trigger}:${randomUUID()}`)
         )

         return present(run, MISSING)
      }),

   runs: ownerProcedure
      .input(z.object({ workflowId: z.string().min(1) }))
      .query(({ ctx, input }) => WorkflowService.runs(ctx.user.id, input.workflowId)),

   runDetail: ownerProcedure.input(z.object({ runId: z.string().min(1) })).query(async ({ ctx, input }) => {
      const run = present(await WorkflowService.run(ctx.user.id, input.runId), RUN_MISSING)

      return {
         ...run,
         graph: readGraph(run.graph),
      }
   }),
})
