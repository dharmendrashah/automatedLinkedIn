import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { CSV_MAX_ROWS, itemsCsv } from 'core'

import { WorkflowService, WorkflowTriggerService, readGraph } from 'database'

import { GOALS, blankGraph, catalog, graphSchema, templateGraph } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Workflow not found'
const RUN_MISSING = 'Run not found'

const byId = z.object({ id: z.string().min(1) })
const name = z.string().trim().min(1).max(100)
const score = z.number().int().min(1).max(100)

// Ready-made templates start with these numbers; everything else is set on the canvas.
const TEMPLATE_NUMBERS = {
   posts: 5,
   perPost: 50,
}

const createInput = z.object({
   name,
   start: z.enum(['blank', ...GOALS]),
   description: z.string().trim().max(200).optional(),
})

const outputInput = z.object({
   runId: z.string().min(1),
   nodeId: z.string().min(1).max(60),
   round: z.number().int().min(0).optional(),
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

   // A new workflow, blank or from a ready-made template; it is finished on the canvas, so problems do not stop it.
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      const { id } = await orConflict(
         WorkflowService.create(ctx.user.id, {
            name: input.name,
            goal: input.description ?? null,
            graph: input.start === 'blank' ? blankGraph() : templateGraph(input.start, TEMPLATE_NUMBERS),
         })
      )

      return { id }
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

   // The most a run can cost, for a saved workflow or a draft graph on the canvas.
   estimate: ownerProcedure
      .input(
         z.object({
            id: z.string().min(1).optional(),
            graph: graphSchema.optional(),
            preview: z.boolean().default(false),
         })
      )
      .query(async ({ ctx, input }) => {
         const saved = input.id ? await WorkflowService.get(ctx.user.id, input.id) : null
         const graph = input.graph ?? (saved ? readGraph(saved.graph) : null)
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

   // One page of what a block passed on in a run (all rounds unless one is chosen).
   output: ownerProcedure
      .input(
         outputInput.extend({
            page: z.number().int().min(1).default(1),
            pageSize: z.number().int().min(1).max(100).default(25),
         })
      )
      .query(async ({ ctx, input }) => {
         const { page, pageSize, ...query } = input

         return present(
            await WorkflowService.output(ctx.user.id, {
               ...query,
               skip: (page - 1) * pageSize,
               take: pageSize,
            }),
            RUN_MISSING
         )
      }),

   // A mutation so the file is only built when asked for and never cached.
   outputCsv: ownerProcedure
      .input(outputInput.extend({ fileName: z.string().trim().max(80).optional() }))
      .mutation(async ({ ctx, input }) => {
         const { fileName, ...query } = input
         const { items, total } = present(
            await WorkflowService.output(ctx.user.id, {
               ...query,
               skip: 0,
               take: CSV_MAX_ROWS,
            }),
            RUN_MISSING
         )
         const base = (fileName || `${input.nodeId}-output`).replace(/[^\p{L}\p{N}_-]+/gu, '-')

         return {
            fileName: `${base}.csv`,
            csv: itemsCsv(items, total),
         }
      }),
})
