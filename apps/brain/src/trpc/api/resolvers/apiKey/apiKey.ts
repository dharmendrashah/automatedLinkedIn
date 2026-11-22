import { z } from 'zod'

import { ApiKeyService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'

const EXPIRY_DAYS = z
   .union([z.literal(30), z.literal(90), z.literal(365)])
   .nullable()
   .describe('Days until the key expires, or null for a key that never expires.')

const createInput = z.object({
   name: z.string().trim().min(1).max(60).describe('A label to tell this key apart from the owner\u2019s other keys.'),
   expiresInDays: EXPIRY_DAYS,
})

const byId = z.object({ id: z.string().describe('The id of one of the owner\u2019s own API keys.') })

// Lets the signed-in user generate, list and revoke their own API keys (.plan/api-authentication-and-openapi-
// docs.md). Every procedure is scoped to ctx.user.id, so a foreign key id is answered as a missing one.
export const apiKey = router({
   // The owner's keys, newest first. Never the key itself or its hash.
   list: ownerProcedure.query(({ ctx }) => ApiKeyService.list(ctx.user.id)),

   // A new key, shown once; the owner must copy it now.
   create: ownerProcedure
      .input(createInput)
      .mutation(async ({ ctx, input }) =>
         orConflict(ApiKeyService.create(ctx.user.id, input.name, input.expiresInDays))
      ),

   // Revokes one of the owner's keys. It stops authenticating at once.
   revoke: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      present(await ApiKeyService.revoke(ctx.user.id, input.id), "That key wasn't found.")
   }),
})
