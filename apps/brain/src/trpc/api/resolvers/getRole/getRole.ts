import { userProcedure } from 'trpc'

export const getRole = userProcedure.query(({ ctx }) => ({ role: ctx.user?.role ?? ('USER' as const) }))
