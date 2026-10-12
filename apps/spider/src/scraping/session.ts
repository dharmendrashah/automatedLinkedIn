import { z } from 'zod'

import { type SessionCookie } from '../types'

import { TaskError } from './errors'

const cookieSchema = z.object({
   name: z.string().min(1),
   value: z.string(),
   domain: z.string().min(1),
   path: z.string().min(1),
   expires: z.number().optional(),
   httpOnly: z.boolean().optional(),
   secure: z.boolean().optional(),
   sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
})

const sessionSchema = z.union([z.array(cookieSchema), z.object({ cookies: z.array(cookieSchema) })])

// A stored session is a cookie list or a Playwright storage state. Errors never include cookie values.
export const parseSessionCookies = (text: string): SessionCookie[] => {
   let json: unknown

   try {
      json = JSON.parse(text)
   } catch {
      throw new TaskError('The stored session is not valid json')
   }

   const parsed = sessionSchema.safeParse(json)

   if (!parsed.success) {
      throw new TaskError('The stored session is not a list of cookies')
   }

   const cookies = Array.isArray(parsed.data) ? parsed.data : parsed.data.cookies

   if (cookies.length === 0) {
      throw new TaskError('The stored session has no cookies')
   }

   return cookies
}
