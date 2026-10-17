import { z } from 'zod'

import { PersonService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'
import { readerOf } from '../reader'

const MISSING = 'Person not found in your profiles or lists'

const bySlug = z.object({ slug: z.string().trim().toLowerCase().min(1).max(200) })

// One person by profile slug, always scoped to ctx.user.id.
export const person = router({
   detail: ownerProcedure
      .input(bySlug)
      .query(async ({ ctx, input }) => present(await PersonService.detail(ctx.user.id, input.slug), MISSING)),

   // Pays one full-profile read for the owner's own person and keeps it.
   readFull: ownerProcedure
      .input(bySlug)
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(PersonService.readFull(ctx.user.id, input.slug, readerOf())), MISSING)
      ),
})
