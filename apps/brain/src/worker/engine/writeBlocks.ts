import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { type ItemFacts, type PostItem, type WorkflowItemData, readItem } from 'core'
import { aiConfigured, writeWithAi } from 'core/aiModel'

import { AiBudgetService, DraftService, VoiceService, WorkflowListService, WorkflowRunService } from 'database'

import {
   APPROVE_REASONS,
   DRAFT_LIMITS,
   WRITE_CHARS,
   WRITE_REASONS,
   type WriteReason,
   checkWords,
   engagePostOf,
   failedReason,
   renderTemplate,
} from '@automatedLinkedIn/contracts'

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
import { authorOf, firstNameOf } from './engageBlocks'

// "Write words", "Ask me first" and "When I approve" (.plan/lead-pipeline-p4-ai-drafts.md): words for posts (from the owner's texts or an AI),
// the inbox that holds them, and the start of a chain with what the owner approved. None of them acts on LinkedIn. Only posts get words so
// far; what is not a post goes to an Else.

const LABELS: Record<WriteReason, string> = {
   TOO_SHORT: 'too short',
   SENSITIVE: 'sensitive',
   UNSURE: 'not sure',
   ORDERS: 'gave orders',
   UNSUITABLE: 'not suitable',
   ALIKE: 'too alike',
   NOT_SET_UP: 'AI not set up',
   LIMIT: 'over the limit',
   NO_ANSWER: 'no answer',
   PAUSED: 'paused',
   DO_NOT_CONTACT: 'do not contact',
   NO_TEXT: 'no text fits',
   EMPTY: 'empty',
   NO_ITEM_KIND: 'not a post',
}

const PREVIEW_SAMPLES = 3

const result = (action: string, status: string, reason: string | null = null) => ({
   action,
   status,
   account: null,
   at: null,
   reason,
})

const unique = (posts: PostItem[]) => [...new Map(posts.map(post => [post.slug, post])).values()]

// "3 to Else (2 sensitive, 1 too short)".
const because = (reasons: string[]) => {
   const counts = new Map<string, number>()

   for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
   }

   return [...counts].map(([reason, count]) => `${count} ${reason}`).join(', ')
}

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

type Asked =
   { post: PostItem; words: string; mode: 'TEXTS' | 'AI'; facts: ItemFacts } | { post: PostItem; reason: WriteReason }

export const writeWordsOnPosts = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const posts = unique(postsOf(ctx.inputs))
   const others = ctx.inputs.filter(item => item.kind !== 'post')
   const asked: Asked[] = []
   let spent = 0

   if (textIn(config, 'how') === 'ai') {
      const voice = await VoiceService.get(run.userId, textIn(config, 'voice'))
      const length =
         textIn(config, 'length') === 'long' ? 'long' : textIn(config, 'length') === 'medium' ? 'medium' : 'short'
      const maxChars = Math.min(DRAFT_LIMITS.commentChars, WRITE_CHARS.COMMENT[length] * 2)
      const stop = !aiConfigured() || !voice ? 'NOT_SET_UP' : undefined
      const room = stop ? undefined : await AiBudgetService.room(run.userId)
      const blocked: WriteReason | undefined =
         stop ?? (room === 'PAUSED' ? 'PAUSED' : room === 'LIMIT' ? 'LIMIT' : undefined)
      const { recent } = await DraftService.rules(run.userId, 'COMMENT')
      const noContact = await WorkflowListService.seenAmong(
         run.userId,
         posts.flatMap(post => authorOf(post) ?? []),
         {
            lists: false,
            profiles: false,
         }
      )
      const limit = Math.min(numberIn(config, 'atMost'), ctx.preview ? PREVIEW_SAMPLES : Infinity)
      let calls = 0

      for (const post of posts) {
         const author = authorOf(post)

         if (blocked || !voice) {
            asked.push({
               post,
               reason: blocked ?? 'NOT_SET_UP',
            })
         } else if (author && noContact.has(author)) {
            asked.push({
               post,
               reason: 'DO_NOT_CONTACT',
            })
         } else if ((post.preview?.text ?? '').length < numberIn(config, 'minChars')) {
            asked.push({
               post,
               reason: 'TOO_SHORT',
            })
         } else if (calls >= limit || (ctx.preview && !(await AiBudgetService.previewRoom(run.userId)))) {
            asked.push({
               post,
               reason: 'LIMIT',
            })
         } else if ((await AiBudgetService.room(run.userId)) !== 'OK') {
            asked.push({
               post,
               reason: 'LIMIT',
            })
         } else {
            calls += 1

            const written = await writeWithAi(
               {
                  post: post.preview?.text ?? '',
                  authorFirstName: firstNameOf(post) ?? null,
                  authorHeadline: post.preview?.author.headline ?? null,
               },
               voice,
               {
                  kind: 'COMMENT',
                  length,
                  goal: textIn(config, 'goal'),
                  language: textIn(config, 'language'),
                  extra: textIn(config, 'extra'),
                  skipSensitive: config.skipSensitive !== false,
                  maxChars,
               }
            )

            if (written.status === 'FAILED') {
               asked.push({
                  post,
                  reason: 'NO_ANSWER',
               })

               continue
            }

            spent += written.usage.costMicros
            await AiBudgetService.record(run.userId, {
               id: randomUUID(),
               workflowId: run.workflowId,
               runId: run.id,
               amountMicros: written.usage.costMicros,
               label: 'AI comments',
               preview: ctx.preview,
            })

            if (written.status === 'SKIPPED') {
               asked.push({
                  post,
                  reason: written.reason,
               })

               continue
            }

            const failed = failedReason(
               checkWords({
                  text: written.words,
                  maxChars,
                  avoid: voice.avoid,
                  recent,
               })
            )

            if (failed) {
               asked.push({
                  post,
                  reason: failed,
               })

               continue
            }

            recent.push(written.words)
            asked.push({
               post,
               words: written.words,
               mode: 'AI',
               facts: {
                  'write.model': written.usage.model,
                  'write.inputTokens': written.usage.inputTokens,
                  'write.outputTokens': written.usage.outputTokens,
                  'write.costMicros': written.usage.costMicros,
                  'write.voice': textIn(config, 'voice'),
                  'write.maxChars': maxChars,
               },
            })
         }
      }
   } else {
      const texts = wordsIn(config, 'texts')
      // The first text is picked from the run, so the same text does not start every run.
      const start = [...run.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)

      posts.forEach((post, index) => {
         const text = texts[(start + index) % Math.max(texts.length, 1)]
         const words = text ? renderTemplate(text, { author_first_name: firstNameOf(post) }).text.trim() : ''
         const failed = failedReason(
            checkWords({
               text: words,
               maxChars: DRAFT_LIMITS.commentChars,
            })
         )

         asked.push(
            failed || words === ''
               ? {
                    post,
                    reason: failed ?? 'NO_TEXT',
                 }
               : {
                    post,
                    words,
                    mode: 'TEXTS',
                    facts: { 'write.maxChars': DRAFT_LIMITS.commentChars },
                 }
         )
      })
   }

   const onward: WorkflowItemData[] = []
   const aside: WorkflowItemData[] = [
      ...others.map(item => ({
         ...item,
         result: result('write', 'SKIPPED', WRITE_REASONS.NO_ITEM_KIND),
      })),
   ]

   for (const each of asked) {
      if ('reason' in each) {
         aside.push({
            ...each.post,
            result: result('write', 'SKIPPED', WRITE_REASONS[each.reason]),
         })
      } else {
         onward.push({
            ...each.post,
            written: each.words,
            writtenMode: each.mode,
            facts: {
               ...each.post.facts,
               ...each.facts,
            },
            result: result('write', 'WRITTEN'),
         })
      }
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, node.id), aside)

   const kept = await keepItems(ctx, onward, ctx.inputs.length)
   const reasons = [
      ...others.map(() => LABELS.NO_ITEM_KIND),
      ...asked.flatMap(each => ('reason' in each ? [LABELS[each.reason]] : [])),
   ]

   return {
      ...kept,
      message: `${ctx.inputs.length} in, ${onward.length} written, ${aside.length} to Else${
         reasons.length > 0 ? ` (${because(reasons)})` : ''
      }.${spent > 0 ? ` AI cost ${dollars(spent)}.` : ''}${ctx.preview && textIn(config, 'how') === 'ai' ? ` A preview writes for up to ${PREVIEW_SAMPLES} posts.` : ''}`,
   }
}

const numberFact = (facts: ItemFacts | undefined, key: string) => {
   const value = facts?.[key]

   return typeof value === 'number' ? value : 0
}

const textFact = (facts: ItemFacts | undefined, key: string) => {
   const value = facts?.[key]

   return typeof value === 'string' && value !== '' ? value : null
}

// Puts each post with words in the inbox and stops there. Nothing goes on from here; an Else gets what was not put in.
export const askMeFirst = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const posts = unique(postsOf(ctx.inputs))
   const noContact = await WorkflowListService.seenAmong(
      run.userId,
      posts.flatMap(post => authorOf(post) ?? []),
      {
         lists: false,
         profiles: false,
      }
   )
   const aside = new Map<string, string>()
   const drafts = new Map<string, { post: PostItem; author: string; key: string }>()

   for (const post of posts) {
      const author = authorOf(post)
      const key = engagePostOf(post.url)?.key

      if (!post.written?.trim()) {
         aside.set(post.slug, APPROVE_REASONS.NO_WORDS)
      } else if (!author || !key) {
         aside.set(post.slug, 'Not a post link that can be opened.')
      } else if (noContact.has(author)) {
         aside.set(post.slug, APPROVE_REASONS.DO_NOT_CONTACT)
      } else {
         drafts.set(key, {
            post,
            author,
            key,
         })
      }
   }

   const outcomes = await DraftService.queue(
      run.userId,
      {
         workflowId: run.workflowId,
         runId: run.id,
         nodeId: node.id,
      },
      {
         perDay: numberIn(config, 'perDay'),
         keepWaiting: numberIn(config, 'keepWaiting'),
         expireHours: Number(textIn(config, 'expire')) || DRAFT_LIMITS.expireDefault,
      },
      'COMMENT',
      [...drafts.values()].map(({ post, author, key }) => ({
         slug: author,
         targetKey: key,
         item: {
            kind: 'post',
            slug: post.slug,
            url: post.url,
            postId: post.postId,
            author: post.author ?? null,
            authorSlug: author,
            authorScore: post.authorScore ?? null,
            preview: post.preview ?? null,
         },
         card: {
            postUrl: post.url,
            excerpt: post.preview?.text?.slice(0, 500) ?? null,
            authorName: post.preview?.author.name ?? null,
            authorHeadline: post.preview?.author.headline?.slice(0, 300) ?? null,
         },
         words: post.written?.trim() ?? '',
         mode: post.writtenMode === 'AI' ? 'AI' : 'TEXTS',
         maxChars: numberFact(post.facts, 'write.maxChars') || DRAFT_LIMITS.commentChars,
         voiceId: textFact(post.facts, 'write.voice'),
         model: textFact(post.facts, 'write.model'),
         inputTokens: numberFact(post.facts, 'write.inputTokens'),
         outputTokens: numberFact(post.facts, 'write.outputTokens'),
         costMicros: numberFact(post.facts, 'write.costMicros'),
      })),
      new Date(),
      ctx.preview
   )
   const OUTCOME_REASONS = {
      WAITING: APPROVE_REASONS.WAITING,
      OVER_DAY: APPROVE_REASONS.OVER_DAY,
      TOO_MANY: APPROVE_REASONS.TOO_MANY,
   } as const
   let queued = 0

   for (const [key, { post }] of drafts) {
      const outcome = outcomes.get(key)

      if (outcome === 'QUEUED') {
         queued += 1
      } else if (outcome) {
         aside.set(post.slug, OUTCOME_REASONS[outcome])
      }
   }

   await WorkflowRunService.replaceItems(
      elseKey(ctx, node.id),
      posts.flatMap(post => {
         const reason = aside.get(post.slug)

         return reason
            ? [
                 {
                    ...post,
                    result: result('approve', 'SKIPPED', reason),
                 },
              ]
            : []
      })
   )

   const kept = await keepItems(ctx, [], posts.length)

   return {
      ...kept,
      message: `${ctx.preview ? `A preview puts nothing in your inbox: ${queued} would go in` : `${queued} in your inbox`}, ${
         aside.size
      } to Else${aside.size > 0 ? ` (${because([...aside.values()])})` : ''}.`,
   }
}

const approvedInput = z.object({ drafts: z.array(z.string()).max(500).optional() })

// A run an approval started works on the drafts it names, rebuilt from the drafts by id with their final words.
export const approvedTrigger = async (ctx: Context): Promise<StepResult> => {
   const ids = approvedInput.safeParse(ctx.run.input).data?.drafts ?? []
   const rows = ids.length > 0 ? await DraftService.itemsOf(ctx.run.userId, ids) : []
   const items = rows.flatMap(({ item, words, mode }): WorkflowItemData[] => {
      const read = readItem(item)

      return read?.kind === 'post'
         ? [
              {
                 ...read,
                 written: words,
                 writtenMode: mode === 'AI' ? 'AI' : 'TEXTS',
                 result: result('approve', 'APPROVED'),
              },
           ]
         : []
   })
   const kept = await keepItems(ctx, items, 0)

   return items.length > 0
      ? kept
      : {
           ...kept,
           message: 'No approved words started this run, so there was nothing to take.',
        }
}
