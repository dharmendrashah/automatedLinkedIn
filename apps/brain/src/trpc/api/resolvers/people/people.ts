import { z } from 'zod'

import {
   COUNT_CAP,
   ClientService,
   IMPORT_BATCH,
   IMPORT_CAP,
   LinkedInInviteService,
   PEOPLE_SORTS,
   PEOPLE_TABS,
   PeopleService,
   PersonService,
} from 'database'

import { INVITE_LIMITS, peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { asTrpcError } from '../asTrpcError'
import { tags, text } from '../linkedInRecord'
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
   filters: peopleFiltersSchema.optional(),
   sort: z
      .object({
         by: z.enum(PEOPLE_SORTS),
         desc: z.boolean(),
      })
      .optional(),
})

const clientName = z.string().trim().min(1).max(80)
const profileUrl = z.string().trim().min(1).max(500)
const PICK_A_LIST = { message: 'Pick a list or name a new one.' }
const invitees = z.object({
   clientId: id,
   personIds: z.array(id).min(1).max(100),
   accountId: id.optional(),
})

// A refusal of the invite service is a sentence for the owner.
const refused = <T>(work: Promise<T>) =>
   work.catch((error: unknown) => {
      throw asTrpcError(error)
   })

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
         present(
            await ClientService.assignAccount(ctx.user.id, input.accountId, input.clientId),
            'Account or client not found'
         )
      ),

   today: ownerProcedure.query(({ ctx }) => PeopleService.today(ctx.user.id)),

   list: ownerProcedure
      .input(
         view.extend({
            // How many rows come before the page (`next` of the page before).
            cursor: z.number().int().min(0).max(COUNT_CAP).optional(),
            limit: z.number().int().min(1).max(100).default(50),
         })
      )
      .query(async ({ ctx, input }) => present(await PeopleService.list(ctx.user.id, input), NO_CLIENT)),

   filterOptions: ownerProcedure
      .input(z.object({ clientId: id }))
      .query(async ({ ctx, input }) =>
         present(await PeopleService.filterOptions(ctx.user.id, input.clientId), NO_CLIENT)
      ),

   counts: ownerProcedure
      .input(
         view.omit({
            tab: true,
            sort: true,
         })
      )
      .query(async ({ ctx, input }) => present(await PeopleService.counts(ctx.user.id, input), NO_CLIENT)),

   results: ownerProcedure
      .input(
         z.object({
            clientId: id,
            days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
         })
      )
      .query(async ({ ctx, input }) =>
         present(await PeopleService.results(ctx.user.id, input.clientId, input.days), NO_CLIENT)
      ),

   // What inviting these people would do (the account, the sentence), without doing it.
   invitePlan: ownerProcedure
      .input(invitees)
      .query(async ({ ctx, input }) =>
         present(await refused(LinkedInInviteService.plan(ctx.user.id, input)), NO_CLIENT)
      ),

   // Reads the profiles of the picked people with no name yet, so their invite notes get a first name.
   readUnnamed: ownerProcedure
      .input(invitees.omit({ accountId: true }))
      .mutation(({ ctx, input }) => PersonService.readUnnamed(ctx.user.id, input.clientId, input.personIds)),

   // Queues invites to up to 100 people of one client, planned over the days within the account's limits.
   invite: ownerProcedure
      .input(
         invitees.extend({
            note: z.string().trim().max(INVITE_LIMITS.noteChars).optional(),
            source: z.string().max(120).optional(),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(await refused(LinkedInInviteService.invite(ctx.user.id, input)), NO_CLIENT)
      ),

   cancelInvite: ownerProcedure
      .input(z.object({ id }))
      .mutation(async ({ ctx, input }) =>
         present(await LinkedInInviteService.cancel(ctx.user.id, input.id), 'Invite not found or already sent')
      ),

   invites: ownerProcedure
      .input(z.object({ id }))
      .query(async ({ ctx, input }) => present(await LinkedInInviteService.ofPerson(ctx.user.id, input.id), NO_PERSON)),

   seen: ownerProcedure
      .input(z.object({ clientId: id }))
      .mutation(async ({ ctx, input }) => present(await PeopleService.seen(ctx.user.id, input.clientId), NO_CLIENT)),

   get: ownerProcedure
      .input(z.object({ id }))
      .query(async ({ ctx, input }) => present(await PeopleService.get(ctx.user.id, input.id), NO_PERSON)),

   // The person of a profile on My network, so any page opens the same drawer; null when they are not on it.
   find: ownerProcedure
      .input(z.object({ slug: z.string().trim().toLowerCase().min(1).max(200) }))
      .query(({ ctx, input }) => PeopleService.find(ctx.user.id, input.slug)),

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
      .mutation(async ({ ctx, input }) =>
         present(await PeopleService.doNotContactEverywhere(ctx.user.id, input.id), NO_PERSON)
      ),

   erase: ownerProcedure
      .input(z.object({ id }))
      .mutation(async ({ ctx, input }) => present(await PeopleService.erase(ctx.user.id, input.id), NO_PERSON)),

   // What an import would do with each link (read only; a mutation so up to IMPORT_CAP links fit in the request).
   preview: ownerProcedure
      .input(
         z.object({
            clientId: id,
            urls: z.array(profileUrl).min(1).max(IMPORT_CAP),
         })
      )
      .mutation(async ({ ctx, input }) =>
         present(await PeopleService.preview(ctx.user.id, input.clientId, input.urls), NO_CLIENT)
      ),

   // Imported profiles into a list of the client (picked, or made with `listName`), in batches; `read` reads each profile (paid).
   add: ownerProcedure
      .input(
         z
            .object({
               clientId: id,
               people: z
                  .array(
                     z.object({
                        url: profileUrl,
                        labels: tags.optional(),
                        notes: z.string().trim().max(1_000).optional(),
                     })
                  )
                  .min(1)
                  .max(IMPORT_BATCH),
               listId: id.optional(),
               listName: z.string().trim().min(1).max(80).optional(),
               read: z.boolean().default(false),
            })
            .refine(input => Boolean(input.listId) !== Boolean(input.listName), PICK_A_LIST)
      )
      .mutation(async ({ ctx, input }) =>
         present(
            await orConflict(
               PeopleService.add(
                  ctx.user.id,
                  input.clientId,
                  input.people,
                  input.listId ? { id: input.listId } : { name: input.listName ?? '' },
                  input.read
               )
            ),
            'Client or list not found'
         )
      ),

   // Owner only: erasures and exports, for the Usage page.
   audit: ownerProcedure.query(({ ctx }) => PeopleService.audit(ctx.user.id)),

   export: ownerProcedure
      .input(view)
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(PeopleService.export(ctx.user.id, input)), NO_CLIENT)
      ),
})
