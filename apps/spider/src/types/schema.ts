import { z } from 'zod'

import { type ScrapeTaskCommand } from './index'

const selector = z.string().min(1).max(500)

const actionParam = z.strictObject({
   url: z.url().max(2048).optional(),
   wait_for_selector: selector.optional(),
   click_element: selector.optional(),
   selectors: z
      .strictObject({
         wrapper: selector,
         author: selector,
         text: selector,
      })
      .catchall(selector)
      .optional(),
   use_session_cookies: z.boolean().optional(),
})

const action = z.strictObject({
   step: z.number().int().min(1),
   action: z.enum(['login', 'navigate', 'interaction', 'extract']),
   params: actionParam,
})

const proxy = z.strictObject({
   server: z.url({ protocol: /^(https?|socks5)$/ }).max(2048),
   username: z.string().max(256).optional(),
   password: z.string().max(256).optional(),
   bypass: z.string().max(1000).optional(),
})

// Names the session and lock objects in the store, so the first character rules out `.` and `..`.
const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

// What a client sends. The API adds task_id and timestamp, so a client cannot choose them.
export const scrapeRequestSchema = z.strictObject({
   task_type: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/),
   auth_session_key: z.string().max(300).optional(),
   account_id: z.string().regex(ACCOUNT_ID).optional(),
   proxy: proxy.optional(),
   target_url: z.url().max(2048),
   actions: z.array(action).min(1).max(50),
})

const SESSION_KEY = /^sessions\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export const isSafeSessionKey = (key: string) => SESSION_KEY.test(key) && !key.split('/').includes('..')

export const scrapeTaskCommandSchema = scrapeRequestSchema
   .extend({
      task_id: z.uuid(),
      timestamp: z.iso.datetime(),
   })
   .refine(({ actions }) => new Set(actions.map(({ step }) => step)).size === actions.length, {
      message: 'Each action needs a different step number',
      path: ['actions'],
   })
   // The key is read from the store, so it may never point outside sessions/, used or not.
   .refine(({ auth_session_key: key }) => !key || isSafeSessionKey(key), {
      message: 'auth_session_key must point inside the sessions/ folder',
      path: ['auth_session_key'],
   })
   .refine(
      ({ actions, account_id: account, auth_session_key: key }) =>
         !actions.some(({ params }) => params.use_session_cookies) || Boolean(account) || Boolean(key),
      {
         message: 'Session cookies need an account_id or an auth_session_key inside the sessions/ folder',
         path: ['account_id'],
      }
   )

export const parseCommand = (input: unknown): ScrapeTaskCommand => scrapeTaskCommandSchema.parse(input)
