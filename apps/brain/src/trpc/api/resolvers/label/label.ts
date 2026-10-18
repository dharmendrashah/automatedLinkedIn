import { LabelService } from 'database'

import { ownerProcedure, router } from 'trpc'

export const label = router({
   // The owner's labels across profiles, companies, posts and lists, for suggestions and filters.
   list: ownerProcedure.query(({ ctx }) => LabelService.list(ctx.user.id)),
})
