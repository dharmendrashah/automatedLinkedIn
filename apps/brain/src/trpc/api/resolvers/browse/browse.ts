import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { BrowseService, BrowseSettingsError } from 'database'

import { BROWSE_MODES } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

import { present } from '../owned'

const NOT_FOUND = 'Account not found'
const accountId = z.string().min(1).max(100)
const MAX_ACCOUNTS = 200

const hoursSchema = z.object({
   days: z.array(z.number().int().min(1).max(7)).max(7),
   startMinute: z.number().int().min(0).max(1439),
   endMinute: z.number().int().min(1).max(1440),
   timeZone: z.string().min(1).max(64),
})

// Browsing time of the owner's accounts (.plan/account-browsing-ui.md). Every call is scoped to ctx.user.id; an account that is
// not the owner's is answered like a missing one, or left out of a change.
export const browse = router({
   overview: ownerProcedure.query(({ ctx }) => BrowseService.overview(ctx.user.id)),

   // `year` is a calendar year; without it, the last 12 months.
   year: ownerProcedure
      .input(
         z.object({
            accountId,
            year: z.number().int().min(2020).max(2100).optional(),
         })
      )
      .query(async ({ ctx, input }) =>
         present(await BrowseService.year(ctx.user.id, input.accountId, input.year), NOT_FOUND)
      ),

   day: ownerProcedure
      .input(
         z.object({
            accountId,
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
         })
      )
      .query(async ({ ctx, input }) =>
         present(await BrowseService.day(ctx.user.id, input.accountId, input.day), NOT_FOUND)
      ),

   mix: ownerProcedure
      .input(z.object({ accountId }))
      .query(async ({ ctx, input }) => present(await BrowseService.mix(ctx.user.id, input.accountId), NOT_FOUND)),

   // One request changes all the accounts it names; one that cannot keep the change (hours too short for the limit) refuses all.
   change: ownerProcedure
      .input(
         z.object({
            accountIds: z.array(accountId).min(1).max(MAX_ACCOUNTS),
            mode: z.enum(BROWSE_MODES).optional(),
            hours: hoursSchema.optional(),
            clientLabel: z.string().trim().max(60).nullable().optional(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const { accountIds, ...change } = input

         try {
            return await BrowseService.change(ctx.user.id, accountIds, {
               ...change,
               ...(change.clientLabel !== undefined && { clientLabel: change.clientLabel || null }),
            })
         } catch (error) {
            if (error instanceof BrowseSettingsError) {
               throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: error.message,
               })
            }

            throw error
         }
      }),
})
