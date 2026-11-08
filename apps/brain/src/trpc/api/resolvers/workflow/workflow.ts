import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { CSV_MAX_ROWS, handoffInputOf, itemsCsv } from 'core'

import {
   ConflictError,
   EventDispatchService,
   EventToolsService,
   HandoffService,
   HookService,
   InputPickService,
   MessagePreviewService,
   MessageTemplateService,
   PersonStateService,
   WorkflowOutputLinkService,
   WorkflowRunService,
   WorkflowService,
   WorkflowTriggerService,
   readGraph,
} from 'database'

import {
   BLOCK_TYPES,
   EVENT_PHASES,
   GOALS,
   MESSAGE_SAMPLES,
   MESSAGE_USES,
   TEMPLATE_NUMBERS,
   TEMPLATE_VARIABLES,
   apiWorkflowOf,
   blankGraph,
   catalog,
   graphSchema,
   inputPickSchema,
   nextScheduledRuns,
   sampleEvent,
   scheduleSchema,
   stepErrorCatalog,
   templateCatalog,
   templateGraph,
} from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const MISSING = 'Workflow not found'
const RUN_MISSING = 'Run not found'
// How many names (the block's, then with a number) an API workflow tries before it gives up.
const NAME_TRIES = 10

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

// The settings of a "Get our chat with them" block that the digest reads.
const chatSettings = z.object({
   accountMode: z.string().default('any'),
   account: z.string().default(''),
   latest: z.number().int().default(10),
   redact: z.boolean().default(true),
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

   // What happened to the task events this workflow listens to, for its trigger block.
   events: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => present(await EventDispatchService.activity(ctx.user.id, input.id), MISSING)),

   // The newest events the workflow's triggers look at, and what became of each.
   eventsRecent: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => present(await EventToolsService.recent(ctx.user.id, input.id), MISSING)),

   // Which trigger filters pass or fail for one event.
   eventCheck: ownerProcedure
      .input(byId.extend({ eventId: z.string().min(1) }))
      .query(async ({ ctx, input }) =>
         present(await EventToolsService.check(ctx.user.id, input.id, input.eventId), 'Event not found.')
      ),

   // Runs the workflow on a real event: a preview, or a replay (a real run, confirmed in the browser).
   eventRun: ownerProcedure
      .input(
         byId.extend({
            eventId: z.string().min(1),
            mode: z.enum(['preview', 'replay']),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(
            await orConflict(EventToolsService.runOn(ctx.user.id, input.id, input.eventId, input.mode)),
            'Event not found.'
         )
      ),

   // The variables, the built-in sample texts and the owner's own, for the composer of a note, a message or a reply.
   messageLibrary: ownerProcedure.query(async ({ ctx }) => ({
      variables: TEMPLATE_VARIABLES,
      samples: MESSAGE_SAMPLES,
      mine: await MessageTemplateService.list(ctx.user.id),
   })),

   // A few of the owner's people to see a text on.
   messagePeople: ownerProcedure
      .input(z.object({ search: z.string().trim().max(60) }))
      .query(({ ctx, input }) => MessagePreviewService.people(ctx.user.id, input.search)),

   // The text as one person would get it: a few random versions, every version, and what is missing or wrong. Sends nothing.
   messagePreview: ownerProcedure
      .input(
         z.object({
            use: z.enum(MESSAGE_USES),
            text: z.string().max(12_000),
            slug: z.string().trim().min(1).max(200).optional(),
         })
      )
      .query(({ ctx, input }) => MessagePreviewService.preview(ctx.user.id, input)),

   messageTemplateSave: ownerProcedure
      .input(
         z.object({
            use: z.enum(MESSAGE_USES),
            name: z.string().trim().min(1).max(60),
            text: z.string().trim().min(1).max(12_000),
         })
      )
      .mutation(({ ctx, input }) => orConflict(MessageTemplateService.save(ctx.user.id, input))),

   messageTemplateDelete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await MessageTemplateService.remove(ctx.user.id, input.id), 'Template not found.')
   }),

   // A made-up event for a task and moment, so the trigger shows what its JSON looks like before one has happened.
   eventSample: ownerProcedure
      .input(
         z.object({
            task: z.string().trim().max(60),
            phase: z.enum(EVENT_PHASES),
         })
      )
      .query(({ input }) => sampleEvent(input.task || 'linkedin-invite', input.phase)),

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
               until: null,
            }
         }

         const filter = await InputPickService.filter(ctx.user.id, pick.data, input.workflowId, input.type)

         return {
            count: await InputPickService.count(ctx.user.id, input.type, filter),
            since: filter.since?.toISOString() ?? null,
            until: filter.until?.toISOString() ?? null,
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

   // The workflow of the "Create an API workflow for this block" button: the API trigger, the block and Give back, named after the
   // block (a number is added when the name is taken).
   createForBlock: ownerProcedure.input(z.object({ type: z.enum(BLOCK_TYPES) })).mutation(async ({ ctx, input }) => {
      const made = present(apiWorkflowOf(input.type), 'This block has no API workflow')

      for (let attempt = 1; attempt < NAME_TRIES; attempt += 1) {
         try {
            return {
               id: (
                  await WorkflowService.create(ctx.user.id, {
                     name: attempt === 1 ? made.name : `${made.name} ${attempt}`,
                     goal: null,
                     graph: made.graph,
                  })
               ).id,
            }
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }
         }
      }

      const { id } = await orConflict(
         WorkflowService.create(ctx.user.id, {
            name: `${made.name} ${NAME_TRIES}`,
            goal: null,
            graph: made.graph,
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
      .input(
         z.object({
            workflowId: z.string().min(1),
            includeHooks: z.boolean().optional(),
         })
      )
      .query(({ ctx, input }) => WorkflowService.runs(ctx.user.id, input.workflowId, input.includeHooks)),

   runDetail: ownerProcedure.input(z.object({ runId: z.string().min(1) })).query(async ({ ctx, input }) => {
      const run = present(await WorkflowService.run(ctx.user.id, input.runId), RUN_MISSING)
      const [links, progress, hooks] = await Promise.all([
         WorkflowService.runLinks(ctx.user.id, [run.parentRunId, ...run.steps.map(({ childRunId }) => childRunId)]),
         WorkflowRunService.progress(run.id),
         HookService.summaryOf(ctx.user.id, run.id),
      ])
      const linkOf = (id: string | null) => (id ? (links.get(id) ?? null) : null)

      return {
         ...run,
         graph: readGraph(run.graph),
         parent: linkOf(run.parentRunId),
         hooks,
         steps: run.steps.map(step => ({
            ...step,
            child: linkOf(step.childRunId),
            progress: progress.get(step.id) ?? null,
         })),
      }
   }),

   // The saved versions of a workflow, and putting one back.
   history: ownerProcedure
      .input(byId)
      .query(async ({ ctx, input }) => present(await WorkflowService.history(ctx.user.id, input.id), MISSING)),

   restore: ownerProcedure.input(byId.extend({ versionId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      present(await orConflict(WorkflowService.restore(ctx.user.id, input.id, input.versionId)), MISSING)
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

         const found = present(
            await WorkflowService.output(ctx.user.id, {
               ...query,
               skip: (page - 1) * pageSize,
               take: pageSize,
            }),
            RUN_MISSING
         )

         return {
            ...found,
            items: await WorkflowOutputLinkService.addLinks(ctx.user.id, found.items),
         }
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

         const found = present(
            await WorkflowService.input(ctx.user.id, {
               ...query,
               skip: (page - 1) * pageSize,
               take: pageSize,
            }),
            RUN_MISSING
         )

         return {
            ...found,
            items: await WorkflowOutputLinkService.addLinks(ctx.user.id, found.items),
         }
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

   // When each of the owner's accounts last read its connections and its messages: the freshness line of "If person state". A read older
   // than `maxAgeHours` is old.
   accountReads: ownerProcedure
      .input(z.object({ maxAgeHours: z.number().int().min(1).max(720).default(36) }))
      .query(async ({ ctx, input }) => {
         const limit = Date.now() - input.maxAgeHours * 60 * 60 * 1000
         const old = (at: Date | null) => at === null || at.getTime() < limit

         return (await PersonStateService.reads(ctx.user.id)).map(read => ({
            ...read,
            connectionsOld: old(read.connectionsReadAt),
            messagesOld: old(read.messagesReadAt),
         }))
      }),

   // The newest stored messages of the owner's chat with one person of a "Get our chat with them" step, cut and cleaned, read now for the
   // owner and kept nowhere.
   chatDigest: ownerProcedure
      .input(outputInput.extend({ slug: z.string().min(1).max(200) }))
      .query(async ({ ctx, input }) => {
         const node = present(await WorkflowService.nodeOf(ctx.user.id, input.runId, input.nodeId), RUN_MISSING)
         const config = chatSettings.parse(node.config)
         const accountIds =
            config.accountMode === 'one'
               ? [config.account]
               : (await PersonStateService.reads(ctx.user.id)).map(({ accountId }) => accountId)

         return PersonStateService.digest(ctx.user.id, input.slug, {
            accountIds,
            latest: config.latest,
            redact: config.redact,
         })
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

         if ((await WorkflowService.csvColumns(ctx.user.id, input.runId, input.nodeId)) === 'handoff') {
            const people = new Map(
               items.flatMap(({ item }) =>
                  item.kind === 'profile' ? [[item.slug, handoffInputOf(item)] as const] : []
               )
            )

            return {
               fileName: `${base}.csv`,
               csv: await HandoffService.csv(ctx.user.id, [...people.values()]),
            }
         }

         return {
            fileName: `${base}.csv`,
            csv: itemsCsv(items, total),
         }
      }),
})
