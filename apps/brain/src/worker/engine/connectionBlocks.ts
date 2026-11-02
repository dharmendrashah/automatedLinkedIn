import { ConnectionRemoveService, LinkedInConnectionService, WorkflowListService } from 'database'

import { actFrame } from './actFrame'
import { type Context, type StepResult, peopleOf } from './context'
import { type Driver, type Plan, runQueued } from './queuedActs'

// "Remove connection" (.plan/account-action-blocks.md): takes each person that reaches it off the list of connections of the account
// they are on, one at a time with a rest between two and a few a day, as the Connections page does. Nothing is removed in a preview,
// or until "Act for real" is switched on. A removal that may have gone ends as UNKNOWN and is never asked again.

const REMOVALS: Driver = {
   standing: (userId, refs) => ConnectionRemoveService.standing(userId, refs),
   done: 'REMOVED',
   past: 'removed',
   limit: /removals for today/,
   limitReason: 'The account reached its removals for today. Left for the next run.',
}

export const removeConnections = (ctx: Context): Promise<StepResult> =>
   runQueued(
      ctx,
      actFrame(
         ctx,
         'removeConnection',
         {
            verb: 'removes',
            past: 'removed',
            needsArm: true,
         },
         peopleOf
      ),
      REMOVALS,
      async (people, usable) => {
         const { userId } = ctx.run
         const slugs = people.map(({ slug }) => slug)
         const [blocked, connected] = await Promise.all([
            WorkflowListService.seenAmong(userId, slugs, {
               lists: false,
               profiles: false,
            }),
            ConnectionRemoveService.connected(userId, usable, slugs),
         ])
         const plan: Plan = {
            skips: new Map(),
            targets: [],
         }

         for (const { slug } of people) {
            const row = connected.get(slug)

            if (blocked.has(slug)) {
               plan.skips.set(slug, 'On your do-not-contact list.')
            } else if (!row) {
               plan.skips.set(slug, 'Not on the list of connections of the chosen accounts.')
            } else {
               plan.targets.push({
                  slug,
                  accountId: row.accountId,
                  ask: async () =>
                     (await LinkedInConnectionService.remove(userId, row.accountId, row.id)) ? { id: row.id } : null,
               })
            }
         }

         return plan
      }
   )
