import { randomInt } from 'node:crypto'

import { type WorkflowItemData } from 'core'

import { VisitPoolService, WorkflowRunService } from 'database'

import { STOP_MESSAGE, VISIT_BLOCKS, blockOf, toSeconds, workingBlockBefore } from '@automatedLinkedIn/contracts'

import {
   type Context,
   StepError,
   type StepResult,
   Waiting,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   textIn,
} from './context'

// Wait, Task result and Retry (.plan/logic-wait-result-retry.md). They work with every block: the block a Task result or a
// Retry looks at is the nearest one before it that does work, whatever its type, so blocks added later need nothing here.
// Messages are shown to the client, so they never name the data supplier.

const SECOND_MS = 1_000

const passOn = (ctx: Context, items: WorkflowItemData[], message?: string): Promise<StepResult> =>
   keepItems(ctx, items, ctx.inputs.length).then(result => ({
      ...result,
      message,
   }))

export const wait = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)

   if (ctx.preview) {
      return passOn(ctx, ctx.inputs, 'A preview does not wait.')
   }

   if (ctx.run.stopRequestedAt) {
      return passOn(ctx, ctx.inputs, 'Stopped by you; the wait ended.')
   }

   const { waitUntil } = ctx.step

   if (!waitUntil) {
      const unit = textIn(config, 'unit')
      const seconds =
         textIn(config, 'mode') === 'between'
            ? randomInt(
                 toSeconds(numberIn(config, 'minAmount'), unit),
                 toSeconds(numberIn(config, 'maxAmount'), unit) + 1
              )
            : toSeconds(numberIn(config, 'amount'), unit)

      // Saved at once, so a restart waits for the same time and a random wait is never picked again.
      await WorkflowRunService.setWaitUntil(ctx.step.id, new Date(Date.now() + seconds * SECOND_MS))

      throw new Waiting()
   }

   if (waitUntil > new Date()) {
      throw new Waiting()
   }

   return passOn(ctx, ctx.inputs)
}

// The block this one looks at, and how its step in this round ended.
const lookedAt = (ctx: Context) => {
   const block = workingBlockBefore(ctx.graph, ctx.node.id)

   if (!block) {
      throw new StepError(`${blockOf(ctx.node.type).label} needs a block before it to look at.`, 'NO_BLOCK_BEFORE')
   }

   const step =
      ctx.run.steps.find(({ nodeId, round }) => nodeId === block.id && round === ctx.step.round) ??
      ctx.run.steps.find(({ nodeId, round }) => nodeId === block.id && round === 0)

   return {
      block,
      step,
      label: blockOf(block.type).label,
   }
}

// A failed block: what reached it goes to the Else side, nothing goes on.
const failedSide = async (ctx: Context, block: { id: string }, round: number, message: string): Promise<StepResult> => {
   const reached = await WorkflowRunService.items(ctx.run.id, [
      {
         nodeId: `${block.id}~failed`,
         round,
      },
   ])

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), reached)

   return {
      ...(await passOn(ctx, [], message)),
      emit: ['else'],
   }
}

export const taskResult = async (ctx: Context): Promise<StepResult> => {
   const { block, step, label } = lookedAt(ctx)

   if (step?.status === 'FAILED') {
      return failedSide(ctx, block, step.round, `${label} failed, so the answer is no.`)
   }

   let yes = ctx.inputs
   let no: WorkflowItemData[] = []

   // A visit block asks for one visit per person, so each person has a result of their own.
   if (VISIT_BLOCKS.has(block.type)) {
      const visited = new Set(
         (await VisitPoolService.ofStep(ctx.run.id, block.id))
            .filter(({ status }) => status === 'DONE')
            .map(({ slug }) => slug)
      )

      yes = ctx.inputs.filter(({ slug }) => visited.has(slug))
      no = ctx.inputs.filter(({ slug }) => !visited.has(slug))
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), no)

   return {
      ...(await passOn(ctx, yes, `${yes.length} yes, ${no.length} no.`)),
      emit: no.length > 0 ? ['main', 'else'] : ['main'],
   }
}

export const retry = async (ctx: Context): Promise<StepResult> => {
   const { block, step, label } = lookedAt(ctx)

   if (step?.status === 'FAILED') {
      return failedSide(ctx, block, step.round, `${label} failed after ${step.tries + 1} tries.`)
   }

   return {
      ...(await passOn(
         ctx,
         ctx.inputs,
         step && step.tries > 0 ? `${label} worked on try ${step.tries + 1}.` : undefined
      )),
      emit: ['main'],
   }
}

// Ends the run as failed with the owner's words. A preview ends here too, so the owner sees it.
export const stop = (ctx: Context): Promise<StepResult> => {
   throw new StepError(textIn(configOf(ctx.node), 'message') || STOP_MESSAGE, 'STOPPED_BY_BLOCK')
}
