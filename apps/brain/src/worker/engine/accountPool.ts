import { accountSettingsOf, nodeBefore } from '@automatedLinkedIn/contracts'

import { type Context, StepError, configOf, wordsIn } from './context'

const HOUR_MS = 60 * 60 * 1000

// The accounts an Account Actions block uses (.plan/account-action-blocks.md): the nearest "Select accounts" before it, or the one
// account named on the block. A saved block has neither setting and reads as the first.
export const accountIdsOf = (ctx: Context): string[] => {
   const { accountMode, account } = accountSettingsOf(ctx.node.type, ctx.node.config)

   if (accountMode === 'one') {
      if (account === '') {
         throw new StepError('Pick the account this block uses.', 'ACCOUNTS_MISSING')
      }

      return [account]
   }

   const pool = nodeBefore(ctx.graph, ctx.node.id, 'account.select')

   if (!pool) {
      throw new StepError(
         'This block needs "Select accounts" before it, or one account picked on the block.',
         'NEEDS_SELECT_ACCOUNTS'
      )
   }

   return wordsIn(configOf(pool), 'accounts')
}

// How long the block waits, from its own start, before it leaves the rest for the next run.
export const timeLimitMs = (ctx: Context) => accountSettingsOf(ctx.node.type, ctx.node.config).timeLimitHours * HOUR_MS
