import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { readSignals, toCsv } from 'core'

import { INBOX_VIEWS, InboxService, WorkflowListService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { labelFilter, labelInput, readLinks, tags, text } from '../linkedInRecord'
import { orConflict, present } from '../owned'

const LIST_MISSING = 'List not found'
const MEMBER_MISSING = 'Person not found in your lists'

const byId = z.object({ id: z.string().min(1) })
const listName = z.string().trim().min(1).max(100)
const state = z.enum(['QUALIFIED', 'MAYBE'])
const viewState = z.enum(['QUALIFIED', 'MAYBE', 'UNSCORED'])
const label = z.string().trim().toLowerCase().min(1).max(30)
const status = z.enum(['NEW', 'CONTACTED', 'REPLIED', 'NOT_A_FIT'])
const ids = z.array(z.string().min(1)).min(1).max(200)
const optionalText = (max: number) => z.string().max(max).nullable()
const when = z.coerce.date().nullable()

const statusInput = z.object({
   ids,
   status,
})

const moveInput = z.object({
   ids,
   listId: z.string().min(1),
})

const inboxInput = z.object({
   view: z.enum(INBOX_VIEWS).default('TODO'),
   listId: z.string().min(1).optional(),
   fit: viewState.optional(),
   untouched: z.boolean().optional(),
   search: z.string().trim().max(100).optional(),
   ...labelFilter,
   sort: z.enum(['fit', 'newest']).default('fit'),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(50),
})

// What `remove` handed back, sent again by an undo. Only the owner's lists take it back (see InboxService.restore).
const removedInput = z.object({
   id: z.string().min(1),
   listId: z.string().min(1),
   slug: z.string().min(1).max(200),
   url: z.string().min(1).max(500),
   name: optionalText(200),
   headline: optionalText(300),
   location: optionalText(200),
   state: viewState,
   status: z.enum(['NEW', 'IN_REVIEW', 'DONE', 'NOT_A_FIT', 'CONTACTED', 'REPLIED']),
   postUrl: optionalText(500),
   score: z.number().int().min(0).max(100).nullable(),
   // Re-read on the server, so only well-formed signals come back.
   signals: z.unknown(),
   addedByRunId: optionalText(100),
   title: optionalText(300),
   company: optionalText(300),
   followers: z.number().int().min(0).nullable(),
   matched: z.array(z.string().max(200)).max(30),
   notes: optionalText(2_000),
   tags: z.array(z.string().max(30)).max(20),
   reviewAt: when,
   contactedAt: when,
   createdAt: z.coerce.date(),
})

// No state shows everyone in the list.
const membersInput = z.object({
   listId: z.string().min(1),
   state: viewState.optional(),
   label: label.optional(),
   status: status.optional(),
   search: z.string().trim().max(100).optional(),
   needsReview: z.boolean().optional(),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(25),
})

const addInput = z.object({
   listId: z.string().min(1),
   url: z.string().trim().min(1).max(500),
   name: text(200).optional(),
   headline: text(300).optional(),
   location: text(200).optional(),
   state: state.default('QUALIFIED'),
})

const updateInput = z.object({
   id: z.string().min(1),
   name: text(200).nullish(),
   headline: text(300).nullish(),
   location: text(200).nullish(),
   state: state.optional(),
   status: status.optional(),
   notes: text(2_000).nullish(),
   tags: tags.optional(),
})

const CSV_HEADER = ['Name', 'Headline', 'Location', 'Profile', 'State', 'Status', 'Labels', 'Found via', 'Date found']

const profileLink = (url: string) => {
   const [link] = readLinks(url, 'profile').links

   if (!link) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: 'Paste one LinkedIn profile link, such as linkedin.com/in/ada-lovelace.',
      })
   }

   return link
}

const fileName = (name: string) => `${name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'list'}.csv`

// Every procedure scopes to ctx.user.id, so one user can never reach another's lists by id.
export const workflowList = router({
   lists: ownerProcedure.query(({ ctx }) => WorkflowListService.lists(ctx.user.id)),

   createList: ownerProcedure
      .input(z.object({ name: listName }))
      .mutation(({ ctx, input }) => orConflict(WorkflowListService.createList(ctx.user.id, input.name))),

   renameList: ownerProcedure
      .input(byId.extend({ name: listName }))
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(WorkflowListService.renameList(ctx.user.id, input.id, input.name)), LIST_MISSING)
      ),

   deleteList: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await WorkflowListService.deleteList(ctx.user.id, input.id), LIST_MISSING)
   }),

   members: ownerProcedure
      .input(membersInput)
      .query(({ ctx, input }) => WorkflowListService.members(ctx.user.id, input)),

   // The leads inbox across all the owner's lists.
   inbox: ownerProcedure.input(inboxInput).query(({ ctx, input }) => InboxService.inbox(ctx.user.id, input)),

   doNotContactList: ownerProcedure.query(({ ctx }) => InboxService.suppressed(ctx.user.id)),

   // When the owner leaves the inbox; people added after it show as new next time.
   markSeen: ownerProcedure.mutation(async ({ ctx }) => {
      await InboxService.markSeen(ctx.user.id)
   }),

   setStatus: ownerProcedure.input(statusInput).mutation(async ({ ctx, input }) => {
      const changed = await InboxService.setStatus(ctx.user.id, input.ids, input.status)

      return { changed }
   }),

   moveMany: ownerProcedure.input(moveInput).mutation(async ({ ctx, input }) => {
      const moved = present(await InboxService.move(ctx.user.id, input.ids, input.listId), LIST_MISSING)

      return { moved }
   }),

   removeMany: ownerProcedure
      .input(z.object({ ids }))
      .mutation(({ ctx, input }) => InboxService.remove(ctx.user.id, input.ids)),

   labelMany: ownerProcedure
      .input(labelInput)
      .mutation(({ ctx, input }) => InboxService.labelMany(ctx.user.id, input.ids, input)),

   restore: ownerProcedure
      .input(z.object({ people: z.array(removedInput).min(1).max(200) }))
      .mutation(async ({ ctx, input }) => ({
         restored: await InboxService.restore(
            ctx.user.id,
            input.people.map(person => ({
               ...person,
               signals: readSignals(person.signals),
            }))
         ),
      })),

   addMember: ownerProcedure.input(addInput).mutation(async ({ ctx, input }) => {
      const { listId, url, name, headline, location } = input
      const link = profileLink(url)
      const member = await orConflict(
         WorkflowListService.addMember(ctx.user.id, listId, {
            ...link,
            name: name ?? null,
            headline: headline ?? null,
            location: location ?? null,
            state: input.state,
         })
      )

      return present(member, LIST_MISSING)
   }),

   updateMember: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input

      return present(await WorkflowListService.updateMember(ctx.user.id, id, changes), MEMBER_MISSING)
   }),

   // Keeps a person marked for review, so the 30-day delete does not take them.
   keepMember: ownerProcedure
      .input(byId)
      .mutation(async ({ ctx, input }) =>
         present(await WorkflowListService.keepMember(ctx.user.id, input.id), MEMBER_MISSING)
      ),

   moveMember: ownerProcedure
      .input(byId.extend({ listId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(WorkflowListService.moveMember(ctx.user.id, input.id, input.listId)), MEMBER_MISSING)
      ),

   deleteMember: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await WorkflowListService.deleteMember(ctx.user.id, input.id), MEMBER_MISSING)
   }),

   doNotContact: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const removed = present(await WorkflowListService.doNotContact(ctx.user.id, input.id), MEMBER_MISSING)

      return { removed }
   }),

   // A mutation so the download is only built when asked for and never cached. Exports the view on screen.
   exportCsv: ownerProcedure
      .input(
         byId.extend({
            state: viewState.optional(),
            label: label.optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const { id, ...view } = input
         const list = present(await WorkflowListService.exportList(ctx.user.id, id, view), LIST_MISSING)
         const rows = list.members.map(member => [
            member.name,
            member.headline,
            member.location,
            member.url,
            member.state,
            member.status,
            member.tags.join(', '),
            member.postUrl,
            member.createdAt.toISOString(),
         ])

         return {
            fileName: fileName(list.name),
            csv: toCsv(CSV_HEADER, rows),
         }
      }),
})
