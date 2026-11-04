import { type ItemResult, type PostItem, type WorkflowItemData, parseLinkedInUrl } from 'core'

import {
   AccountActionService,
   type EngageAccounts,
   type EngageCandidate,
   LinkedInEngageService,
   WorkflowRunService,
} from 'database'

import { REACTIONS, type Reaction } from '@automatedLinkedIn/contracts'

import { accountIdsOf } from './accountPool'
import { actFrame } from './actFrame'
import {
   type Context,
   type StepResult,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   postsOf,
   textIn,
   wordsIn,
} from './context'

// "React to post" (.plan/lead-pipeline-p3-engage.md): plans one reaction per post through the act queue, inside each account's daily
// limit. The posts it plans go on; the rest go to an Else with one fixed sentence each, so nothing is lost. In a preview, or while
// "Act for real" is off, it decides the same and queues nothing.

const NO_AUTHOR = 'The author of the post is not known.'
const HELD = {
   preview: 'A preview reacts to nothing.',
   off: 'Act for real is off.',
} as const

const isReaction = (value: string): value is Reaction => REACTIONS.some(reaction => reaction === value)

// Who wrote the post: the person Get posts of people asked for, else the author's link the post came with.
const authorOf = (post: PostItem) => {
   if (post.authorSlug) {
      return post.authorSlug
   }

   for (const link of [post.author, post.preview?.author.url]) {
      const slug = link ? parseLinkedInUrl(link, 'profile')?.slug : undefined

      if (slug) {
         return slug
      }
   }

   return undefined
}

const momentOf = (value: string | null | undefined) => {
   const time = value ? Date.parse(value) : Number.NaN

   return Number.isNaN(time) ? null : new Date(time)
}

const candidateOf = (post: PostItem, slug: string): EngageCandidate => ({
   slug,
   postUrl: post.url,
   authorName: post.preview?.author.name ?? null,
   authorHeadline: post.preview?.author.headline ?? null,
   excerpt: post.preview?.text ?? null,
   postedAt: momentOf(post.preview?.postedAt),
})

export const reactToPosts = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const reactions = wordsIn(config, 'reactions').filter(isReaction)
   const { items: posts, result } = actFrame(
      ctx,
      'reactToPost',
      {
         verb: 'reacts to',
         past: 'reacted to',
         needsArm: true,
      },
      postsOf
   )
   const armed = !ctx.preview && config.actForReal === true
   const accounts: EngageAccounts =
      textIn(config, 'accountMode') === 'inviter'
         ? { mode: 'inviter' }
         : {
              mode: 'chosen',
              ids: await accountIdsOf(ctx),
           }
   const results = new Map<string, ItemResult>()

   // What an earlier pass of this step already planned is not planned again.
   if (armed) {
      for (const call of await AccountActionService.ofStep(run.id, node.id)) {
         results.set(
            call.slug,
            result(call.result.status ?? 'PLANNED', call.result.reason ?? null, call.accountId, call.result.at)
         )
      }
   }

   const candidates = new Map<string, EngageCandidate>()

   for (const post of posts.filter(({ slug }) => !results.has(slug))) {
      const author = authorOf(post)

      if (author) {
         candidates.set(post.slug, candidateOf(post, author))
      } else {
         results.set(post.slug, result('SKIPPED', NO_AUTHOR))
      }
   }

   const outcomes = await LinkedInEngageService.plan(run.userId, {
      accounts,
      candidates: [...candidates.values()],
      wish: {
         act: 'REACT',
         reactions,
      },
      daysApart: numberIn(config, 'daysApart'),
      dryRun: !armed,
      ...(armed && {
         origin: {
            workflowId: run.workflowId,
            runId: run.id,
            nodeId: node.id,
         },
      }),
   })

   for (const [slug, candidate] of candidates) {
      const outcome = outcomes.get(candidate.postUrl)

      if (outcome?.status !== 'PLANNED') {
         results.set(slug, result('SKIPPED', outcome?.reason ?? NO_AUTHOR))
      } else if (armed) {
         const planned = result('PLANNED', null, outcome.accountId)

         results.set(slug, planned)
         await AccountActionService.ask(run.id, node.id, slug, outcome.accountId ?? '', 'DONE', {
            status: planned.status,
            reason: null,
            at: null,
         })
      } else {
         results.set(slug, result('NOT_ASKED', ctx.preview ? HELD.preview : HELD.off, outcome.accountId))
      }
   }

   const onward: WorkflowItemData[] = []
   const aside: WorkflowItemData[] = []

   for (const post of posts) {
      const done = results.get(post.slug) ?? result('SKIPPED', NO_AUTHOR)

      const item = {
         ...post,
         result: done,
      }

      if (done.status === 'SKIPPED') {
         aside.push(item)
      } else {
         onward.push(item)
      }
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, node.id), aside)

   const kept = await keepItems(ctx, onward, posts.length)

   return {
      ...kept,
      message: `${posts.length} in, ${onward.length} ${armed ? 'planned' : 'would be planned'}, ${aside.length} to Else${
         aside.length > 0 ? ' (see each post\u2019s reason)' : ''
      }.${armed ? '' : ` ${ctx.preview ? HELD.preview : `${HELD.off} Switch it on after a preview.`}`}`,
   }
}
