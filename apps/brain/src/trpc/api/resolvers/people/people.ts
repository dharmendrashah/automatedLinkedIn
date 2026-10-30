import { z } from 'zod'

import { ClientService, PEOPLE_TABS, PeopleService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { readLinks, tags, text } from '../linkedInRecord'
import { orConflict, present } from '../owned'

const id = z.string().min(1).max(100)
const NO_CLIENT = 'Client not found'
const NO_PERSON = 'Person not found'
const status = z.enum(['NEW', 'CONTACTED', 'REPLIED', 'NOT_INTERESTED', 'DONE'])

const view = z.object({
   clientId: id,
   tab: z.enum(PEOPLE_TABS),
   accountId: id.optional(),
   search: z.string().trim().max(200).optional(),
   foundBy: z.string().max(120).optional(),
   fit: z.enum(['STRONG', 'MAYBE', 'NONE']).optional(),
   label: z.string().trim().toLowerCase().max(30).optional(),
   onlyNew: z.boolean().optional(),
})

const clientName = z.string().trim().min(1).max(80)

// My network (.plan/network-hub.md): one client's people, the Today line, and the client's own changes to them. Every call is
// scoped to ctx.user.id; a foreign client or person answers like a missing one. LinkedIn actions stay on their own routers
// (network.answer, unibox, connections, workflowList).
export const people = router({
   clients: ownerProcedure.query(({ ctx }) => ClientService.list(ctx.user.id)),

   createClient: ownerProcedure
      .input(z.object({ name: clientName }))
      .mutation(({ ctx, input }) => orConflict(ClientService.create(ctx.user.id, input.name))),

   renameClient: ownerProcedure
      .input(
         z.object({
            id,
            name: clientName,
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(ClientService.rename(ctx.user.id, input.id, input.name)), NO_CLIENT)
      ),

   // Moves an account to a client; its people follow within a minute (the index job).
   assignAccount: ownerProcedure
      .input(
         z.object({
            accountId: id,
            clientId: id,
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(await ClientService.assignAccount(ctx.user.id, input.accountId, input.clientId), 'Account or client not found')
      ),

   today: ownerProcedure.query(({ ctx }) => PeopleService.today(ctx.user.id)),

   list: ownerProcedure
      .input(
         view.extend({
            cursor: id.optional(),
            limit: z.number().int().min(1).max(100).default(50),
         })
      )
      .query(async ({ ctx, input }) => present(await PeopleService.list(ctx.user.id, input), NO_CLIENT)),

   counts: ownerProcedure
      .input(z.object({ clientId: id }))
      .query(async ({ ctx, input }) => present(await PeopleService.counts(ctx.user.id, input.clientId), NO_CLIENT)),

   results: ownerProcedure
      .input(z.object({ clientId: id }))
      .query(async ({ ctx, input }) => present(await PeopleService.results(ctx.user.id, input.clientId), NO_CLIENT)),

   seen: ownerProcedure
      .input(z.object({ clientId: id }))
      .mutation(async ({ ctx, input }) => present(await PeopleService.seen(ctx.user.id, input.clientId), NO_CLIENT)),

   get: ownerProcedure
      .input(z.object({ id }))
      .query(async ({ ctx, input }) => present(await PeopleService.get(ctx.user.id, input.id), NO_PERSON)),

   update: ownerProcedure
      .input(
         z.object({
            id,
            status: status.optional(),
            labels: tags.optional(),
            notes: text(5000).nullish(),
            doNotContact: z.boolean().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const { id: personId, ...changes } = input

         return present(await PeopleService.update(ctx.user.id, personId, changes), NO_PERSON)
      }),

   // The same change to up to 100 people of one client (a page selection).
   updateMany: ownerProcedure
      .input(
         z.object({
            clientId: id,
            ids: z.array(id).min(1).max(100),
            status: status.optional(),
            labels: tags.optional(),
            doNotContact: z.boolean().optional(),
         })
      )
      .mutation(({ ctx, input }) => {
         const { clientId, ids, ...changes } = input

         return PeopleService.updateMany(ctx.user.id, clientId, ids, changes)
      }),

   doNotContactEverywhere: ownerProcedure
      .input(z.object({ id }))
      .mutation(async ({ ctx, input }) => present(await PeopleService.doNotContactEverywhere(ctx.user.id, input.id), NO_PERSON)),

   erase: ownerProcedure
      .input(z.object({ id }))
      .mutation(async ({ ctx, input }) => present(await PeopleService.erase(ctx.user.id, input.id), NO_PERSON)),

   // Pasted profile links into a list of the client (picked, or made with `listName`). Nothing is read or charged.
   add: ownerProcedure
      .input(
         z
            .object({
               clientId: id,
               urls: z.string().max(40_000),
               listId: id.optional(),
               listName: z.string().trim().min(1).max(80).optional(),
            })
            .refine(input => Boolean(input.listId) !== Boolean(input.listName), { message: 'Pick a list or name a new one.' })
      )
      .mutation(async ({ ctx, input }) => {
         const { links, invalid } = readLinks(input.urls, 'profile')
         const result = await orConflict(
            PeopleService.add(ctx.user.id, input.clientId, links, input.listId ? { id: input.listId } : { name: input.listName ?? '' })
         )

         return {
            ...present(result, 'Client or list not found'),
            invalid: invalid.length,
         }
      }),

   export: ownerProcedure
      .input(view)
      .mutation(async ({ ctx, input }) => present(await orConflict(PeopleService.export(ctx.user.id, input)), NO_CLIENT)),
})
