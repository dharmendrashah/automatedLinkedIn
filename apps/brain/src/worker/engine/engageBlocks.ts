import { type ItemResult, type PostItem, type WorkflowItemData, parseLinkedInUrl } from 'core'

import {
   AccountActionService,
   type EngageAccounts,
   type EngageCandidate,
   type EngageWish,
   LinkedInEngageService,
   WorkflowRunService,
} from 'database'

import {
   DRAFT_LIMITS,
   REACTIONS,
   type Reaction,
   WRITE_REASONS,
   checkWords,
   renderTemplate,
} from '@automatedLinkedIn/contracts'

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

// "React to post" and "Comment on post" (.plan/lead-pipeline-p3-engage.md, .plan/lead-pipeline-p4-ai-drafts.md): plan one act per post through
// the act queue, inside each account's daily limit. The posts they plan go on; the rest go to an Else with one fixed sentence each, so
// nothing is lost. In a preview, or while "Act for real" is off, they decide the same and queue nothing.

const NO_AUTHOR = 'The author of the post is not known.'

const isReaction = (value: string): value is Reaction => REACTIONS.some(reaction => reaction === value)

// Who wrote the post: the person Get posts of people asked for, else the author's link the post came with.
export const authorOf = (post: PostItem) => {
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

export const firstNameOf = (post: PostItem) => post.preview?.author.name?.trim().split(/\s+/)[0] || undefined

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

type Prepared = { words: string; mode: 'TEMPLATE' | 'AI' } | { skip: string }

type Engage = {
   action: string
   // "reacts to", for "A preview reacts to nothing."
   verb: string
   past: string
   wish: EngageWish
   // The words for one post (a comment), or why it has none.
   prepare?: (post: PostItem) => Prepared
}

const engage = async (ctx: Context, spec: Engage): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const held = {
      preview: `A preview ${spec.verb} nothing.`,
      off: 'Act for real is off.',
   }
   const { items: posts, result } = actFrame(
      ctx,
      spec.action,
      {
         verb: spec.verb,
         past: spec.past,
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
      const prepared = spec.prepare?.(post)

      if (!author) {
         results.set(post.slug, result('SKIPPED', NO_AUTHOR))
      } else if (prepared && 'skip' in prepared) {
         results.set(post.slug, result('SKIPPED', prepared.skip))
      } else {
         candidates.set(post.slug, {
            ...candidateOf(post, author),
            ...prepared,
         })
      }
   }

   const outcomes = await LinkedInEngageService.plan(run.userId, {
      accounts,
      candidates: [...candidates.values()],
      wish: spec.wish,
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
         results.set(slug, result('NOT_ASKED', ctx.preview ? held.preview : held.off, outcome.accountId))
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
      }.${armed ? '' : ` ${ctx.preview ? held.preview : `${held.off} Switch it on after a preview.`}`}`,
   }
}

export const reactToPosts = (ctx: Context) =>
   engage(ctx, {
      action: 'reactToPost',
      verb: 'reacts to',
      past: 'reacted to',
      wish: {
         act: 'REACT',
         reactions: wordsIn(configOf(ctx.node), 'reactions').filter(isReaction),
      },
   })

// A brace in the words of another block is a brace, not a variable.
const literal = (text: string) => text.replaceAll('{', '\\{').replaceAll('}', '\\}')

export const commentOnPosts = (ctx: Context) => {
   const template = textIn(configOf(ctx.node), 'words')

   return engage(ctx, {
      action: 'commentOnPost',
      verb: 'comments on',
      past: 'commented on',
      wish: {
         act: 'COMMENT',
         words: '',
      },
      prepare: post => {
         const written = post.written?.trim() ?? ''
         const filled = template.replaceAll('{written}', literal(written))
         const words = renderTemplate(filled, { author_first_name: firstNameOf(post) }).text.trim()

         if ((template.includes('{written}') && written === '') || words === '') {
            return { skip: WRITE_REASONS.EMPTY }
         }

         const failed = checkWords({
            text: words,
            maxChars: DRAFT_LIMITS.commentChars,
         }).some(({ ok }) => !ok)

         return failed
            ? { skip: WRITE_REASONS.UNSUITABLE }
            : {
                 words,
                 mode: post.writtenMode === 'AI' ? 'AI' : 'TEMPLATE',
              }
      },
   })
}
