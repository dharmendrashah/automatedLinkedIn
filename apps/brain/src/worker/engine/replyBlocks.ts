import { LinkedInReplyService, ReplyActService, WorkflowListService } from 'database'

import { missingSentence } from '@automatedLinkedIn/contracts'

import { actFrame } from './actFrame'
import { type Context, type StepResult, configOf, conversationsOf, numberIn, peopleOf, textIn } from './context'
import { type Driver, type Plan, runQueued } from './queuedActs'
import { wordsWriter } from './words'

// "Send message" and "Reply in a conversation" (.plan/account-action-blocks.md): both write through the owner's reply queue, which keeps
// the daily limits of each account (limits.ts: replies and first messages, 5 waiting at a time) and sends one by one with a quiet gap.
// So the step asks as many as the queue takes, waits for them to go, and asks the rest on its next tick. A message that may have gone
// ends as UNKNOWN and is never asked again. Nothing goes in a preview, or until "Act for real" is switched on.

const MESSAGES: Driver = {
   standing: (userId, refs) => ReplyActService.standing(userId, refs),
   done: 'SENT',
   past: 'sent',
   limit: /in 24 hours/,
   limitReason: 'The account reached its limit for today. Left for the next run.',
}

export const sendMessages = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const text = textIn(config, 'text')
   const hours = numberIn(config, 'notAgainHours')

   return runQueued(
      ctx,
      actFrame(
         ctx,
         'sendMessage',
         {
            verb: 'sends',
            past: 'sent',
            needsArm: true,
         },
         peopleOf
      ),
      MESSAGES,
      async (people, usable) => {
         const slugs = people.map(({ slug }) => slug)
         const [blocked, via, recent, companies] = await Promise.all([
            WorkflowListService.seenAmong(run.userId, slugs, {
               lists: false,
               profiles: false,
            }),
            ReplyActService.connectedVia(run.userId, usable, slugs),
            hours > 0
               ? ReplyActService.recent(run.userId, hours, {
                    conversationIds: [],
                    accountIds: usable,
                    slugs,
                 })
               : Promise.resolve(new Set<string>()),
            ReplyActService.companies(run.userId, slugs),
         ])
         const plan: Plan = {
            skips: new Map(),
            targets: [],
         }
         const write = await wordsWriter(run.userId, text, people, usable)

         for (const person of people) {
            const accountId = via.get(person.slug)

            if (blocked.has(person.slug)) {
               plan.skips.set(person.slug, 'On your do-not-contact list.')
            } else if (!accountId) {
               plan.skips.set(person.slug, 'Not connected to any of the chosen accounts.')
            } else if (recent.has(`${accountId}:${person.slug}`)) {
               plan.skips.set(person.slug, `Written to in the last ${hours} hours.`)
            } else {
               const words = write(
                  {
                     ...person,
                     company: person.company ?? companies.get(person.slug) ?? null,
                  },
                  accountId
               )

               if (words.text === '') {
                  plan.skips.set(person.slug, 'The message came out empty.')
               } else if (config.skipMissing === true && words.missing.length > 0) {
                  plan.skips.set(person.slug, missingSentence(words.missing))
               } else {
                  plan.targets.push({
                     slug: person.slug,
                     accountId,
                     ask: () => LinkedInReplyService.start(run.userId, accountId, person.slug, words.text),
                  })
               }
            }
         }

         return plan
      }
   )
}

export const replyToConversations = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const text = textIn(config, 'text')
   const hours = numberIn(config, 'notAgainHours')

   return runQueued(
      ctx,
      actFrame(
         ctx,
         'replyToConversation',
         {
            verb: 'replies',
            past: 'sent',
            needsArm: true,
         },
         conversationsOf
      ),
      MESSAGES,
      async (conversations, usable) => {
         const ids = conversations.map(({ slug }) => slug)
         const personSlugs = conversations.flatMap(({ personSlug }) => (personSlug ? [personSlug] : []))
         const [rows, blocked, recent, companies] = await Promise.all([
            ReplyActService.conversations(run.userId, ids),
            WorkflowListService.seenAmong(run.userId, personSlugs, {
               lists: false,
               profiles: false,
            }),
            hours > 0
               ? ReplyActService.recent(run.userId, hours, {
                    conversationIds: ids,
                    accountIds: [],
                    slugs: [],
                 })
               : Promise.resolve(new Set<string>()),
            ReplyActService.companies(run.userId, personSlugs),
         ])
         const rowOf = new Map(rows.map(row => [row.id, row]))
         const plan: Plan = {
            skips: new Map(),
            targets: [],
         }
         const write = await wordsWriter(
            run.userId,
            text,
            conversations.map(({ slug, personSlug }) => ({ slug: personSlug ?? slug })),
            usable
         )

         for (const conversation of conversations) {
            const row = rowOf.get(conversation.slug)

            if (!row) {
               plan.skips.set(conversation.slug, 'Not one of your conversations.')
            } else if (!usable.includes(row.accountId)) {
               plan.skips.set(conversation.slug, 'Not in the chosen accounts.')
            } else if (conversation.personSlug && blocked.has(conversation.personSlug)) {
               plan.skips.set(conversation.slug, 'On your do-not-contact list.')
            } else if (config.onlyIfTheyWroteLast !== false && row.lastDirection !== 'THEM') {
               plan.skips.set(conversation.slug, 'They did not write last.')
            } else if (recent.has(conversation.slug)) {
               plan.skips.set(conversation.slug, `Written in the last ${hours} hours.`)
            } else {
               const words = write(
                  {
                     slug: conversation.personSlug ?? conversation.slug,
                     name: conversation.name,
                     headline: conversation.headline,
                     company: conversation.personSlug ? (companies.get(conversation.personSlug) ?? null) : null,
                  },
                  row.accountId
               )

               if (words.text === '') {
                  plan.skips.set(conversation.slug, 'The reply came out empty.')
               } else if (config.skipMissing === true && words.missing.length > 0) {
                  plan.skips.set(conversation.slug, missingSentence(words.missing))
               } else {
                  plan.targets.push({
                     slug: conversation.slug,
                     accountId: row.accountId,
                     ask: () => LinkedInReplyService.send(run.userId, conversation.slug, words.text),
                  })
               }
            }
         }

         return plan
      }
   )
}
