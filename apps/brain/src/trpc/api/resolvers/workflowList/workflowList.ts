import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { toCsv } from 'core'

import { WorkflowListService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { readLinks, text } from '../linkedInRecord'
import { orConflict, present } from '../owned'

const LIST_MISSING = 'List not found'
const MEMBER_MISSING = 'Person not found in your lists'

const byId = z.object({ id: z.string().min(1) })
const listName = z.string().trim().min(1).max(100)
const state = z.enum(['QUALIFIED', 'MAYBE'])
const status = z.enum(['NEW', 'IN_REVIEW', 'DONE', 'NOT_A_FIT'])

const membersInput = z.object({
   listId: z.string().min(1),
   state,
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
})

const CSV_HEADER = ['Name', 'Headline', 'Location', 'Profile', 'State', 'Status', 'Found via', 'Date found']

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

   // A mutation so the download is only built when asked for and never cached.
   exportCsv: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const list = present(await WorkflowListService.exportList(ctx.user.id, input.id), LIST_MISSING)
      const rows = list.members.map(member => [
         member.name,
         member.headline,
         member.location,
         member.url,
         member.state,
         member.status,
         member.postUrl,
         member.createdAt.toISOString(),
      ])

      return {
         fileName: fileName(list.name),
         csv: toCsv(CSV_HEADER, rows),
      }
   }),
})
