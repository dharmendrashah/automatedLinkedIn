import { ConflictError, MAX_CHAIN_DEPTH, WorkflowRunService, WorkflowService } from 'database'

import {
   type Context,
   StepError,
   type StepResult,
   Waiting,
   companiesOf,
   configOf,
   elseKey,
   keepItems,
   peopleOf,
   postsOf,
   textIn,
} from './context'

// "Run another workflow": starts one of the owner's workflows and goes on at once, waits for a yes or no, or waits
// for the people it saved. Messages are shown to the client, so they never name the data supplier.

const MINUTE_MS = 60_000

const nonEmpty = <T>(key: string, list: T[]) => (list.length > 0 ? { [key]: list } : {})

// What reaches the block, in the shape a run's input takes. Only kinds that came are sent, so the other workflow
// reads its own lists for the rest.
const inputOf = (ctx: Context) => ({
   ...nonEmpty('people', peopleOf(ctx.inputs)),
   ...nonEmpty(
      'profiles',
      peopleOf(ctx.inputs).map(({ url }) => url)
   ),
   ...nonEmpty(
      'posts',
      postsOf(ctx.inputs).map(({ url }) => url)
   ),
   ...nonEmpty(
      'companies',
      companiesOf(ctx.inputs).map(({ url }) => url)
   ),
})

// Starts the other run once: a step taken again after a crash finds the run its key already started.
const startChild = async (ctx: Context, workflowId: string, send: string) => {
   if (ctx.run.depth + 1 > MAX_CHAIN_DEPTH) {
      throw new ConflictError(`Workflows can start each other at most ${MAX_CHAIN_DEPTH} in a row.`)
   }

   const runKey = `${workflowId}:call:${ctx.run.id}:${ctx.node.id}:${ctx.step.round}`
   const id =
      (await WorkflowRunService.idOfKey(runKey)) ??
      (
         await WorkflowService.startRun(ctx.run.userId, workflowId, 'WORKFLOW', runKey, {
            input: send === 'input' ? inputOf(ctx) : undefined,
            depth: ctx.run.depth + 1,
            parentRunId: ctx.run.id,
         })
      )?.id

   if (!id) {
      throw new ConflictError('The workflow to run was deleted.')
   }

   await WorkflowRunService.setChildRun(ctx.step.id, id)

   return id
}

const passOn = async (ctx: Context, message: string): Promise<StepResult> => ({
   ...(await keepItems(ctx, ctx.inputs, ctx.inputs.length)),
   message,
})

// "No": what reached the block goes to an Else after it.
const answerNo = async (ctx: Context, message: string): Promise<StepResult> => {
   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), ctx.inputs)
   const result = await keepItems(ctx, [], ctx.inputs.length)

   return {
      ...result,
      message,
   }
}

const answerYes = async (ctx: Context, message: string): Promise<StepResult> => {
   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), [])

   return passOn(ctx, message)
}

export const runWorkflow = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const wait = textIn(config, 'wait')

   if (ctx.preview) {
      return passOn(ctx, 'A preview starts no other workflow.')
   }

   let childId = ctx.step.childRunId

   if (ctx.run.stopRequestedAt) {
      return passOn(
         ctx,
         childId
            ? 'Stopped by you before the other workflow finished.'
            : 'Stopped by you; the other workflow was not started.'
      )
   }

   if (!childId) {
      try {
         childId = await startChild(ctx, textIn(config, 'workflowId'), textIn(config, 'send'))
      } catch (error) {
         if (!(error instanceof ConflictError)) {
            throw error
         }

         if (wait === 'status') {
            return answerNo(ctx, `Could not start it: ${error.message} So the answer is no.`)
         }

         throw new StepError(`Could not start the other workflow: ${error.message}`)
      }
   }

   const child = await WorkflowRunService.child(childId)
   const name = child ? `"${child.workflow.name}"` : 'The other workflow'
   const giveUpMs = Number(textIn(config, 'giveUpAfter')) * MINUTE_MS
   const gaveUp = child?.status === 'RUNNING' && Date.now() - child.startedAt.getTime() > giveUpMs

   if (wait === 'none') {
      return passOn(ctx, `Started ${name}; this one went on without waiting.`)
   }

   if (child?.status === 'RUNNING' && !gaveUp) {
      throw new Waiting()
   }

   const outcome = !child
      ? 'was deleted'
      : gaveUp
        ? 'took longer than the time to wait'
        : child.status === 'SUCCEEDED'
          ? 'finished'
          : child.status === 'PARTIAL'
            ? 'finished only partly'
            : child.status === 'STOPPED'
              ? 'was stopped'
              : `failed${child.message ? `: ${child.message}` : ''}`

   if (wait === 'status') {
      return child?.status === 'SUCCEEDED'
         ? answerYes(ctx, `${name} finished, so the answer is yes.`)
         : answerNo(ctx, `${name} ${outcome}, so the answer is no.`)
   }

   if (child?.status !== 'SUCCEEDED' && child?.status !== 'PARTIAL') {
      throw new StepError(`${name} ${outcome}, so it gave nothing back.`)
   }

   const people = await WorkflowRunService.listedPeople(childId)
   const result = await keepItems(ctx, people, ctx.inputs.length)

   return {
      ...result,
      message: `${people.length} people back from ${name}, which ${outcome}.`,
   }
}
