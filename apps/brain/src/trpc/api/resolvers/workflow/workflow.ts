import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { CSV_MAX_ROWS, itemsCsv } from 'core'

import { InputPickService, WorkflowRunService, WorkflowService, WorkflowTriggerService, readGraph } from 'database'

import {
   GOALS,
   TEMPLATE_NUMBERS,
   blankGraph,
   catalog,
   graphSchema,
   inputPickSchema,
   nextScheduledRuns,
   scheduleSchema,
   stepErrorCatalog,
   templateCatalog,
   templateGraph,
} from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Workflow not found'
const RUN_MISSING = 'Run not found'

const byId = z.object({ id: z.string().min(1) })
const name = z.string().trim().min(1).max(100)
const score = z.number().int().min(1).max(100)

const createInput = z.object({
   name,
   start: z.enum(['blank', ...GOALS]),
   description: z.string().trim().max(200).optional(),
   // The browser's time zone, for a template that runs on a schedule.
   timeZone: z.string().trim().max(64).optional(),
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
   // The `updatedAt` the editor loaded: a workflow changed since then is not overwritten. Leave it out to save anyway.
   expectedUpdatedAt: z.string().datetime().optional(),
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

   templates: ownerProcedure.query(() => templateCatalog()),

   // What each step error code means and what to do about it, for the block dialog.
   stepErrors: ownerProcedure.query(() => stepErrorCatalog()),

   // The next three starts of a schedule being edited, so the owner sees what it means. Invalid settings give none.
   nextRuns: ownerProcedure.input(z.object({ schedule: z.record(z.string(), z.unknown()) })).query(({ input }) => {
      const schedule = scheduleSchema.safeParse(input.schedule)

      return schedule.success ? nextScheduledRuns(schedule.data, new Date(), 3).map(date => date.toISOString()) : []
   }),

   // How many items an input block with these settings would take now, and from when, so the owner sees an empty slice
   // before running. Invalid settings count as none.
   inputMatches: ownerProcedure
      .input(
         z.object({
            workflowId: z.string().min(1).nullable(),
            type: z.enum(['input.posts', 'input.profiles', 'input.companies']),
            config: z.record(z.string(), z.unknown()),
         })
      )
      .query(async ({ ctx, input }) => {
         const pick = inputPickSchema.safeParse({
            order: input.type === 'input.posts' ? 'oldest' : 'newest',
            ...input.config,
         })

         if (!pick.success) {
            return {
               count: 0,
               since: null,
            }
         }

         const filter = await InputPickService.filter(ctx.user.id, pick.data, input.workflowId)

         return {
            count: await InputPickService.count(ctx.user.id, input.type, filter),
            since: filter.since?.toISOString() ?? null,
         }
      }),

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
            graph:
               input.start === 'blank'
                  ? blankGraph()
                  : templateGraph(input.start, {
                       ...TEMPLATE_NUMBERS,
                       timeZone: input.timeZone,
                    }),
         })
      )

      return { id }
   }),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, ...changes } = input
      const options = { expectedUpdatedAt: expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined }
      const updated = present(await orConflict(WorkflowService.update(ctx.user.id, id, changes, options)), MISSING)

      return withProblems(ctx.user.id, updated)
   }),

   delete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await orConflict(WorkflowService.delete(ctx.user.id, input.id)), MISSING)
   }),

   // A new token for the workflow's API address. Shown once; the old one stops working.
   rotateToken: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const token = present(await WorkflowTriggerService.rotateToken(ctx.user.id, input.id), MISSING)

      return { token }
   }),

   apiStatus: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => present(await WorkflowTriggerService.apiStatus(ctx.user.id, input.id), MISSING)),

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
            WorkflowService.estimate(ctx.user.id, draft, input.preview, saved?.id ?? null),
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
      const [links, progress] = await Promise.all([
         WorkflowService.runLinks(ctx.user.id, [run.parentRunId, ...run.steps.map(({ childRunId }) => childRunId)]),
         WorkflowRunService.progress(run.id),
      ])
      const linkOf = (id: string | null) => (id ? (links.get(id) ?? null) : null)

      return {
         ...run,
         graph: readGraph(run.graph),
         parent: linkOf(run.parentRunId),
         steps: run.steps.map(step => ({
            ...step,
            child: linkOf(step.childRunId),
            progress: progress.get(step.id) ?? null,
         })),
      }
   }),

   // Takes the newest run up again from the block that failed.
   resumeRun: ownerProcedure
      .input(z.object({ runId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(WorkflowService.resume(ctx.user.id, input.runId)), RUN_MISSING)
      ),

   // Runs of the owner that failed lately and were not dismissed.
   alerts: ownerProcedure.query(({ ctx }) => WorkflowService.alerts(ctx.user.id)),

   dismissAlert: ownerProcedure.input(z.object({ runId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      present(await WorkflowService.dismissAlert(ctx.user.id, input.runId), RUN_MISSING)
   }),

   // Nothing new starts; the worker ends the run as Stopped once the jobs already paid for have finished.
   stopRun: ownerProcedure.input(z.object({ runId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      present(await WorkflowService.requestStop(ctx.user.id, input.runId), RUN_MISSING)
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

   // One page of what reached a block in a run: the output of the blocks before it, with the block each item came from.
   input: ownerProcedure
      .input(
         outputInput.extend({
            page: z.number().int().min(1).default(1),
            pageSize: z.number().int().min(1).max(100).default(25),
         })
      )
      .query(async ({ ctx, input }) => {
         const { page, pageSize, ...query } = input

         return present(
            await WorkflowService.input(ctx.user.id, {
               ...query,
               skip: (page - 1) * pageSize,
               take: pageSize,
            }),
            RUN_MISSING
         )
      }),

   inputCsv: ownerProcedure
      .input(outputInput.extend({ fileName: z.string().trim().max(80).optional() }))
      .mutation(async ({ ctx, input }) => {
         const { fileName, ...query } = input
         const { items, total } = present(
            await WorkflowService.input(ctx.user.id, {
               ...query,
               skip: 0,
               take: CSV_MAX_ROWS,
            }),
            RUN_MISSING
         )
         const base = (fileName || `${input.nodeId}-input`).replace(/[^\p{L}\p{N}_-]+/gu, '-')

         return {
            fileName: `${base}.csv`,
            csv: itemsCsv(items, total),
         }
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
