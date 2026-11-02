import { type ItemResult, type WorkflowItemData } from 'core'

import { type Context, type StepResult, configOf, keepItems } from './context'

// What the blocks that act on people or conversations for the owner share (.plan/account-action-blocks.md): the items that reach them
// once each, what is said on each, and the step that does nothing in a preview or while "Act for real" is off.

type Words = {
   // "answers", for "A preview answers nothing."
   verb: string
   // "answered", for "so nothing was answered".
   past: string
   // Whether the block has an "Act for real" setting that starts off.
   needsArm: boolean
}

type Acted = WorkflowItemData & { slug: string }

export const actFrame = <T extends Acted>(
   ctx: Context,
   action: string,
   words: Words,
   pick: (inputs: WorkflowItemData[]) => T[]
) => {
   const items = [...new Map(pick(ctx.inputs).map(item => [item.slug, item])).values()]
   const result = (
      status: string,
      reason: string | null = null,
      account: string | null = null,
      at: string | null = null
   ): ItemResult => ({
      action,
      status,
      account,
      at,
      reason,
   })

   // Gives the items back, each with its result; an item with none was not asked for.
   const give = async (
      results: Map<string, ItemResult>,
      status: StepResult['status'],
      message: string
   ): Promise<StepResult> => ({
      ...(await keepItems(
         ctx,
         items.map(item => ({
            ...item,
            result: results.get(item.slug) ?? result('SKIPPED', 'Nothing was asked for them.'),
         })),
         items.length
      )),
      status,
      message,
   })

   // The finished step of a block that must not act now: a preview always, and a block with "Act for real" until it is switched
   // on. Null when the block may act.
   const holdBack = () => {
      const hold = (reason: string, message: string) =>
         give(new Map(items.map(({ slug }) => [slug, result('NOT_ASKED', reason)])), 'DONE', message)

      if (ctx.preview) {
         return hold(`A preview ${words.verb} nothing.`, `A preview ${words.verb} nothing.`)
      }

      return words.needsArm && configOf(ctx.node).actForReal !== true
         ? hold(
              'Act for real is off.',
              `Act for real is off, so nothing was ${words.past}. Switch it on after a preview.`
           )
         : null
   }

   return {
      items,
      result,
      give,
      holdBack,
   }
}
