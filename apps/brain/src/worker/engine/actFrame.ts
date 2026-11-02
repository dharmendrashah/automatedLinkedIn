import { type ItemResult } from 'core'

import { type Context, type StepResult, configOf, keepItems, peopleOf } from './context'

// What the blocks that act on people for the owner share (.plan/account-action-blocks.md): the people that reach them once each,
// what is said on each person, and the step that does nothing in a preview or while "Act for real" is off.

type Words = {
   // "answers", for "A preview answers nothing."
   verb: string
   // "answered", for "so nothing was answered".
   past: string
   // Whether the block has an "Act for real" setting that starts off.
   needsArm: boolean
}

export const actFrame = (ctx: Context, action: string, words: Words) => {
   const people = [...new Map(peopleOf(ctx.inputs).map(person => [person.slug, person])).values()]
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

   // Gives the people back, each with its result; a person with none was not asked for.
   const give = async (
      results: Map<string, ItemResult>,
      status: StepResult['status'],
      message: string
   ): Promise<StepResult> => ({
      ...(await keepItems(
         ctx,
         people.map(person => ({
            ...person,
            result: results.get(person.slug) ?? result('SKIPPED', 'Nothing was asked for them.'),
         })),
         people.length
      )),
      status,
      message,
   })

   // The finished step of a block that must not act now: a preview always, and a block with "Act for real" until it is switched
   // on. Null when the block may act.
   const holdBack = () => {
      const hold = (reason: string, message: string) =>
         give(new Map(people.map(({ slug }) => [slug, result('NOT_ASKED', reason)])), 'DONE', message)

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
      people,
      result,
      give,
      holdBack,
   }
}
