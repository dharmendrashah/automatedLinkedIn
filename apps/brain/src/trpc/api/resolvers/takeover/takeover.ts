import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { TakeoverRateError } from 'core'

import { TakeoverNotFoundError, TakeoverService } from 'database'

import { takeoverInputSchema } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

const byId = z.object({ id: z.uuid() })

const frameInput = byId.extend({
   // The picture the owner already has: when it is still the newest, the answer leaves the picture out.
   since: z.number().int().min(0).optional(),
})

const sendInput = byId.extend({ input: takeoverInputSchema })

// What is safe to say to the browser. Anything unexpected is logged without what was typed, and reported without details.
const asTrpcError = (error: unknown) => {
   if (error instanceof TakeoverNotFoundError) {
      return new TRPCError({
         code: 'NOT_FOUND',
         message: error.message,
      })
   }

   if (error instanceof TakeoverRateError) {
      return new TRPCError({
         code: 'TOO_MANY_REQUESTS',
         message: error.message,
      })
   }

   console.error(`Takeover: ${(error as Error).name}`)

   return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Try again in a moment.',
   })
}

// Human takeover (.plan/foxprofile-adoption.md, phase 4): the owner sees the page a worker holds for their run and finishes a
// security check themselves. Every call is scoped to ctx.user.id, so nobody can watch or steer another user's browser.
export const takeover = router({
   // The runs waiting for the user now.
   list: ownerProcedure.query(async ({ ctx }) => {
      try {
         return await TakeoverService.listForUser(ctx.user.id)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   // The newest picture of the page, as base64, or only its number when the owner already has it. The dialog asks several
   // times a second, and a picture is hundreds of KB.
   frame: ownerProcedure.input(frameInput).query(async ({ ctx, input }) => {
      try {
         const found = await TakeoverService.frameForUser(ctx.user.id, input.id)

         return {
            seq: found.seq,
            expires_at: found.expires_at,
            ...(found.taken_at && { age_ms: Math.max(0, Date.now() - Date.parse(found.taken_at)) }),
            ...(input.since !== found.seq && { jpeg: found.jpeg }),
         }
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   send: ownerProcedure.input(sendInput).mutation(async ({ ctx, input }) => {
      try {
         await TakeoverService.sendForUser(ctx.user.id, input.id, input.input)
      } catch (error) {
         throw asTrpcError(error)
      }
   }),
})
