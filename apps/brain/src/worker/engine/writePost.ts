import { type PostItem, type WorkflowItemData } from 'core'
import { parseLinkedInUrl } from 'core/linkedInUrl'

import { PostDraftService, PostPublicationService, TaskRefusedError, VisitPoolService, idleFirst } from 'database'

import { type PostBlock, postBlocksOfText } from '@automatedLinkedIn/contracts'

import { accountIdsOf, timeLimitMs } from './accountPool'
import { type Context, StepError, type StepResult, Waiting, keepItems } from './context'

// "Write a post" (.plan/write-a-post-block.md). The block holds a post, written in it or copied from a saved draft of the Posting page,
// and posts it once per run from one of the chosen accounts, the one that went longest without a post first, then waits for the post to
// end, or, when it is set to wait, plans it and ends. Everything that reached it goes on unchanged, and the post too once it has a link.
// The post is made by `PostPublicationService`, so the same limits and checks apply as on the Posting page. Messages are shown to the client.

const PENDING = new Set(['SCHEDULED', 'QUEUED', 'SENDING'])
const HOUR_MS = 60 * 60 * 1000

// Anyone unless the block says connections only.
const visibilityOf = (value: unknown) => (value === 'CONNECTIONS' ? 'CONNECTIONS' : 'ANYONE')

type Post = { blocks: PostBlock[]; audience: 'ANYONE' | 'CONNECTIONS'; comments: 'ANYONE' | 'CONNECTIONS' }

// What the block posts: the words written in it, or a copy of the saved draft as it is now (the draft itself stays).
const postOf = async (ctx: Context): Promise<Post> => {
   const { node, run } = ctx

   if (node.config.source === 'draft') {
      const draft = await PostDraftService.get(
         run.userId,
         typeof node.config.draft === 'string' ? node.config.draft : ''
      )

      if (!draft) {
         throw new StepError('The saved draft was not found. Open the block and pick it again.', 'POST_UNREADABLE')
      }

      return draft
   }

   const blocks = postBlocksOfText(node.config.post)

   if (!blocks) {
      throw new StepError('The post cannot be read. Open the block and write it again.', 'POST_UNREADABLE')
   }

   return {
      blocks,
      audience: visibilityOf(node.config.audience),
      comments: visibilityOf(node.config.comments),
   }
}

// When a block set to wait plans its post: the wait from now, 1 to 168 hours. Null for a post made now.
const plannedFor = (ctx: Context) => {
   const { config } = ctx.node

   return config.when === 'after' && typeof config.afterHours === 'number'
      ? new Date(Date.now() + config.afterHours * HOUR_MS)
      : null
}

const passOn = async (
   ctx: Context,
   status: StepResult['status'],
   message: string,
   extra: WorkflowItemData[] = []
): Promise<StepResult> => ({
   ...(await keepItems(ctx, [...ctx.inputs, ...extra], ctx.inputs.length)),
   status,
   message,
})

// The post that went, as an item a block after can use (its link); none when LinkedIn gave no link.
const postItemOf = (row: { accountId: string; link: string | null; postedAt: Date | null }): PostItem[] => {
   const link = row.link ? parseLinkedInUrl(row.link, 'post') : null

   return link
      ? [
           {
              kind: 'post',
              slug: link.slug,
              url: link.url,
              postId: null,
              result: {
                 action: 'writePost',
                 status: 'POSTED',
                 account: row.accountId,
                 at: row.postedAt?.toISOString() ?? null,
                 reason: null,
              },
           },
        ]
      : []
}

// Asks the chosen accounts in turn until one takes the post; fails with the last sentence when none can.
const makePost = async (ctx: Context, accountIds: string[], post: Post, plannedAt: Date | null) => {
   const { run, node, deps } = ctx
   const accounts = await VisitPoolService.accounts(run.userId, accountIds)
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)

   if (usable.length === 0) {
      throw new StepError('None of the chosen accounts can post now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   let refusal = ''

   for (const id of idleFirst(usable, await PostPublicationService.lastPosts(usable))) {
      try {
         const link = {
            runId: run.id,
            nodeId: node.id,
         }
         const settings = {
            audience: post.audience,
            comments: post.comments,
         }

         await (plannedAt
            ? PostPublicationService.publishFromBlock(
                 run.userId,
                 id,
                 post.blocks,
                 link,
                 settings,
                 Date.now(),
                 plannedAt
              )
            : PostPublicationService.publishFromBlock(run.userId, id, post.blocks, link, settings))
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
   const accountIds = accountIdsOf(ctx)
   const plannedAt = plannedFor(ctx)

   if (ctx.preview) {
      await postOf(ctx)

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
      if (run.stopRequestedAt !== null) {
         return passOn(ctx, 'PARTIAL', 'Stopped by you; nothing was posted.')
      }

      await makePost(ctx, accountIds, await postOf(ctx), plannedAt)

      throw new Waiting()
   }

   if (latest.state === 'POSTED') {
      return passOn(ctx, 'DONE', latest.link ? `Posted: ${latest.link}` : 'Posted.', postItemOf(latest))
   }

   if (latest.state === 'SCHEDULED' && plannedAt !== null) {
      return passOn(ctx, 'DONE', `Planned for ${latest.scheduledAt?.toISOString().slice(0, 16).replace('T', ' ')} UTC.`)
   }

   if (latest.state === 'FAILED') {
      throw new StepError(latest.failure ?? 'The post did not go. Nothing was posted.', 'POST_FAILED')
   }

   if (PENDING.has(latest.state)) {
      const stopped = run.stopRequestedAt !== null

      if (stopped || Date.now() - (step.startedAt ?? run.startedAt).getTime() > timeLimitMs(ctx)) {
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
