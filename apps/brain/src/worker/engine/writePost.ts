import { PostPublicationService, TaskRefusedError, VisitPoolService, idleFirst } from 'database'

import { type GraphNode, type PostBlock, nodeBefore, postBlocksOfText } from '@automatedLinkedIn/contracts'

import { type Context, StepError, type StepResult, Waiting, configOf, keepItems, wordsIn } from './context'

// "Write a post" (.plan/write-a-post-block.md). The block holds a post and posts it once per run from one of the chosen accounts,
// the one that went longest without a post first, then waits for the post to end. Everything that reached it goes on unchanged.
// The post is made by `PostPublicationService`, so the same limits and checks apply as on the Posting page. Messages are shown to the client.

const HOUR_MS = 60 * 60 * 1000
// The step passes on after this long; the post goes on by itself and shows on the Posting page.
const WAIT_LIMIT_MS = HOUR_MS

const PENDING = new Set(['SCHEDULED', 'QUEUED', 'SENDING'])

// Anyone unless the block says connections only.
const visibilityOf = (value: unknown) => (value === 'CONNECTIONS' ? 'CONNECTIONS' : 'ANYONE')

const passOn = async (ctx: Context, status: StepResult['status'], message: string): Promise<StepResult> => ({
   ...(await keepItems(ctx, ctx.inputs, ctx.inputs.length)),
   status,
   message,
})

// Asks the chosen accounts in turn until one takes the post; fails with the last sentence when none can.
const makePost = async (ctx: Context, pool: GraphNode, blocks: PostBlock[]) => {
   const { run, node, deps } = ctx
   const accounts = await VisitPoolService.accounts(run.userId, wordsIn(configOf(pool), 'accounts'))
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)

   if (usable.length === 0) {
      throw new StepError('None of the chosen accounts can post now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   let refusal = ''

   for (const id of idleFirst(usable, await PostPublicationService.lastPosts(usable))) {
      try {
         await PostPublicationService.publishFromBlock(
            run.userId,
            id,
            blocks,
            {
               runId: run.id,
               nodeId: node.id,
            },
            {
               audience: visibilityOf(node.config.audience),
               comments: visibilityOf(node.config.comments),
            }
         )
         deps.log.info(`workflow run=${run.id} step=${node.id} asked 1 post`)

         return
      } catch (error) {
         if (!(error instanceof TaskRefusedError)) {
            throw error
         }

         refusal = error.message
      }
   }

   throw new StepError(refusal, 'POST_REFUSED')
}

export const writePost = async (ctx: Context): Promise<StepResult> => {
   const { run, node, step } = ctx
   const pool = nodeBefore(ctx.graph, node.id, 'account.select')

   if (!pool) {
      throw new StepError('This block needs "Select accounts" before it.', 'NEEDS_SELECT_ACCOUNTS')
   }

   const blocks = postBlocksOfText(node.config.post)

   if (!blocks) {
      throw new StepError('The post cannot be read. Open the block and write it again.', 'POST_UNREADABLE')
   }

   if (ctx.preview) {
      return passOn(ctx, 'DONE', 'A preview posts nothing.')
   }

   const rows = await PostPublicationService.ofStep(run.id, node.id)
   const latest = rows.at(-1)

   // A post that may have gone is never made again, even when a Retry asks.
   const unsure = rows.find(({ state }) => state === 'UNKNOWN')

   if (unsure) {
      throw new StepError(unsure.failure ?? 'The post may have gone. Check your posts on LinkedIn.', 'POST_UNSURE')
   }

   // Each try of the step makes one post: a Retry gives the step another try after a post that did not go.
   if (!latest || rows.length <= step.tries) {
      await makePost(ctx, pool, blocks)

      throw new Waiting()
   }

   if (latest.state === 'POSTED') {
      return passOn(ctx, 'DONE', latest.link ? `Posted: ${latest.link}` : 'Posted.')
   }

   if (latest.state === 'FAILED') {
      throw new StepError(latest.failure ?? 'The post did not go. Nothing was posted.', 'POST_FAILED')
   }

   if (PENDING.has(latest.state)) {
      const stopped = run.stopRequestedAt !== null

      if (stopped || Date.now() - (step.startedAt ?? run.startedAt).getTime() > WAIT_LIMIT_MS) {
         return passOn(
            ctx,
            'PARTIAL',
            `${stopped ? 'Stopped by you. ' : ''}The post is still being posted. It goes on by itself; see the Posting page.`
         )
      }

      throw new Waiting()
   }

   throw new StepError('The post did not go. Nothing was posted.', 'POST_FAILED')
}
