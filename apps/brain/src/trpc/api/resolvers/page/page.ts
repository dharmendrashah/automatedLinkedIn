import { z } from 'zod'

import { CompanyPageService, PostPageService } from 'database'

import { ownerProcedure, router } from 'trpc'

import { orConflict, present } from '../owned'
import { readerOf } from '../reader'

const COMPANY_MISSING = 'Company not found in your companies'
const POST_MISSING = 'Post not found in your posts'

const bySlug = z.object({ slug: z.string().trim().min(1).max(200) })

// A company or post of the owner by slug, always scoped to ctx.user.id, with the paid read the owner may ask for.
export const companyPage = router({
   detail: ownerProcedure
      .input(bySlug)
      .query(async ({ ctx, input }) =>
         present(await CompanyPageService.detail(ctx.user.id, input.slug.toLowerCase()), COMPANY_MISSING)
      ),

   readFull: ownerProcedure
      .input(bySlug)
      .mutation(async ({ ctx, input }) =>
         present(
            await orConflict(CompanyPageService.readFull(ctx.user.id, input.slug.toLowerCase(), readerOf())),
            COMPANY_MISSING
         )
      ),
})

// Post slugs keep their case (ugcPost-...).
export const postPage = router({
   detail: ownerProcedure
      .input(bySlug)
      .query(async ({ ctx, input }) => present(await PostPageService.detail(ctx.user.id, input.slug), POST_MISSING)),

   readFull: ownerProcedure
      .input(bySlug)
      .mutation(async ({ ctx, input }) =>
         present(await orConflict(PostPageService.readFull(ctx.user.id, input.slug, readerOf())), POST_MISSING)
      ),
})
