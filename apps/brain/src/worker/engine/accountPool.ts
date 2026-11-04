import { VisitPoolService } from 'database'

import { MAX_POOL, accountSettingsOf, nodeBefore } from '@automatedLinkedIn/contracts'

import { type Context, StepError, configOf, wordsIn } from './context'

const HOUR_MS = 60 * 60 * 1000

// The accounts a "Select accounts" block stands for: the ones picked, or every account of the owner that is signed in now (at most
// MAX_POOL). A block saved before the setting existed has no scope and reads as the ones picked.
export const poolOf = async (userId: string, pool: Context['node']) => {
   if (configOf(pool).scope !== 'all') {
      return {
         ids: wordsIn(configOf(pool), 'accounts'),
         notSignedIn: 0,
         leftOut: 0,
      }
   }

   return VisitPoolService.everySignedIn(userId, MAX_POOL)
}

// The accounts an Account Actions block uses (.plan/account-action-blocks.md): the nearest "Select accounts" before it, or the one
// account named on the block. A saved block has neither setting and reads as the first.
export const accountIdsOf = async (ctx: Context): Promise<string[]> => {
   const { accountMode, account } = accountSettingsOf(ctx.node.type, ctx.node.config)

   if (accountMode === 'event') {
      const fromEvent = (ctx.run.input as { account?: unknown } | null)?.account

      if (typeof fromEvent !== 'string' || fromEvent === '') {
         throw new StepError(
            'This block uses the account of the event, and this run did not start from one.',
            'ACCOUNTS_MISSING'
         )
      }

      return [fromEvent]
   }

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

   return (await poolOf(ctx.run.userId, pool)).ids
}

// How long the block waits, from its own start, before it leaves the rest for the next run.
export const timeLimitMs = (ctx: Context) => accountSettingsOf(ctx.node.type, ctx.node.config).timeLimitHours * HOUR_MS
