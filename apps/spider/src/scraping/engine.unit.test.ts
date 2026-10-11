import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type ScrapeTaskCommand } from '../types'

import { ObjectNotFoundError } from '../storage/store'
import { type BrowserSession } from './driver'
import { ScrapeEngine } from './engine'
import { TaskError } from './errors'
import { HostPolicy } from './policy'

const cookie = {
   name: 'sid',
   value: 'abc',
   domain: '.example.com',
   path: '/',
}

const base = (actions: ScrapeTaskCommand['actions'], over: Partial<ScrapeTaskCommand> = {}): ScrapeTaskCommand => ({
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   task_type: 'demo',
   timestamp: '2026-10-11T10:00:00.000Z',
   auth_session_key: 'sessions/demo.json',
   target_url: 'https://example.com/feed',
   actions,
   ...over,
})

const selectors = {
   wrapper: '.post',
   author: '.a',
   text: '.t',
}

const setup = (robotsExempt = '') => {
   const session = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      cookies: vi.fn().mockResolvedValue([]),
      goto: vi.fn(async (url: string) => url),
      click: vi.fn().mockResolvedValue('https://example.com/feed'),
      extract: vi.fn().mockResolvedValue([
         {
            author: 'Ada',
            text: 'Hi',
         },
      ]),
      close: vi.fn().mockResolvedValue(undefined),
   } satisfies BrowserSession

   const driver = { open: vi.fn().mockResolvedValue(session) }
   const robots = { check: vi.fn().mockResolvedValue({ allowed: true }) }
   const limiter = {
      wait: vi.fn().mockResolvedValue(undefined),
      requireAtLeast: vi.fn(),
   }
   const store = {
      get: vi.fn().mockResolvedValue(JSON.stringify([cookie])),
      put: vi.fn(),
   }

   const engine = new ScrapeEngine({
      driver,
      policy: HostPolicy.fromList('example.com', robotsExempt),
      robots,
      limiter,
      store,
      maxRecords: 3,
   })

   return {
      engine,
      session,
      driver,
      robots,
      limiter,
      store,
   }
}

describe('ScrapeEngine', () => {
   let ctx: ReturnType<typeof setup>

   beforeEach(() => {
      ctx = setup()
   })

   it('should refuse a target host that is not allowed before opening a browser', async () => {
      await expect(
         ctx.engine.run(
            base(
               [
                  {
                     step: 1,
                     action: 'navigate',
                     params: {},
                  },
               ],
               { target_url: 'https://evil.org/' }
            )
         )
      ).rejects.toThrow(TaskError)
      expect(ctx.driver.open).not.toHaveBeenCalled()
   })

   it('should navigate to target_url when the step has no url, wait for the rate limit, and extract', async () => {
      const { records } = await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'navigate',
               params: { wait_for_selector: '.post' },
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(ctx.limiter.wait).toHaveBeenCalledWith('example.com')
      expect(ctx.session.goto).toHaveBeenCalledWith('https://example.com/feed', '.post')
      expect(ctx.session.extract).toHaveBeenCalledWith(selectors, 3)
      expect(records).toEqual([
         {
            author: 'Ada',
            text: 'Hi',
         },
      ])
   })

   it('should run steps in step order, whatever order they were sent in', async () => {
      await ctx.engine.run(
         base([
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
         ])
      )

      expect(ctx.session.goto.mock.invocationCallOrder[0]).toBeLessThan(ctx.session.extract.mock.invocationCallOrder[0])
   })

   it('should not visit a page robots.txt disallows, and say so', async () => {
      ctx.robots.check.mockResolvedValue({ allowed: false })

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/robots\.txt/)
      expect(ctx.session.goto).not.toHaveBeenCalled()
   })

   it('should apply a crawl delay the site asks for', async () => {
      ctx.robots.check.mockResolvedValue({
         allowed: true,
         crawlDelayMs: 9000,
      })

      await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
         ])
      )

      expect(ctx.limiter.requireAtLeast).toHaveBeenCalledWith('example.com', 9000)
   })

   it('should refuse a navigate url on another host', async () => {
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: { url: 'https://evil.org/x' },
               },
            ])
         )
      ).rejects.toThrow(/not allowed/)
      expect(ctx.session.goto).not.toHaveBeenCalled()
   })

   it('should fail when a redirect lands on a host that is not allowed', async () => {
      ctx.session.goto.mockResolvedValue('https://evil.org/landing')

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/not allowed/)
   })

   it('should click, wait, and check where the click led', async () => {
      await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
            {
               step: 2,
               action: 'interaction',
               params: {
                  click_element: '.next',
                  wait_for_selector: '.post',
               },
            },
         ])
      )

      expect(ctx.session.click).toHaveBeenCalledWith('.next', '.post')
      expect(ctx.limiter.wait).toHaveBeenCalledTimes(2)
   })

   it('should apply robots.txt to a page a click navigates to', async () => {
      ctx.session.click.mockResolvedValue('https://example.com/private')
      ctx.robots.check.mockImplementation(async (url: URL) => ({ allowed: url.pathname !== '/private' }))

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
               {
                  step: 2,
                  action: 'interaction',
                  params: { click_element: '.next' },
               },
            ])
         )
      ).rejects.toThrow(/robots\.txt/)
   })

   it('should fail when a click leads to a host that is not allowed', async () => {
      ctx.session.click.mockResolvedValue('https://evil.org/')

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
               {
                  step: 2,
                  action: 'interaction',
                  params: { click_element: '.next' },
               },
            ])
         )
      ).rejects.toThrow(/not allowed/)
   })

   it('should need a page before interacting or extracting', async () => {
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'interaction',
                  params: { click_element: '.x' },
               },
            ])
         )
      ).rejects.toThrow(/navigate/)
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'extract',
                  params: { selectors },
               },
            ])
         )
      ).rejects.toThrow(/navigate/)
   })

   it('should need the right params for each action', async () => {
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
               {
                  step: 2,
                  action: 'interaction',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/click_element/)
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
               {
                  step: 2,
                  action: 'extract',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/selectors/)
   })

   it('should stop at the record limit across extract steps', async () => {
      ctx.session.extract
         .mockResolvedValueOnce([{ text: '1' }, { text: '2' }])
         .mockResolvedValueOnce([{ text: '3' }, { text: '4' }])

      const { records } = await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
            {
               step: 3,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(ctx.session.extract).toHaveBeenNthCalledWith(2, selectors, 1)
      expect(records).toHaveLength(3)
   })

   it('should load session cookies for the allowed host on login, from the stored key', async () => {
      await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'login',
               params: { use_session_cookies: true },
            },
            {
               step: 2,
               action: 'navigate',
               params: {},
            },
         ])
      )

      expect(ctx.store.get).toHaveBeenCalledWith('sessions/demo.json')
      expect(ctx.session.addCookies).toHaveBeenCalledWith([cookie])
      expect(ctx.session.addCookies.mock.invocationCallOrder[0]).toBeLessThan(
         ctx.session.goto.mock.invocationCallOrder[0]
      )
   })

   it('should drop cookies for hosts that are not allowed and fail if none are left', async () => {
      ctx.store.get.mockResolvedValue(
         JSON.stringify([
            cookie,
            {
               ...cookie,
               domain: '.evil.org',
            },
         ])
      )

      await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'login',
               params: { use_session_cookies: true },
            },
         ])
      )

      expect(ctx.session.addCookies).toHaveBeenCalledWith([cookie])

      ctx.store.get.mockResolvedValue(
         JSON.stringify([
            {
               ...cookie,
               domain: '.evil.org',
            },
         ])
      )

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'login',
                  params: { use_session_cookies: true },
               },
            ])
         )
      ).rejects.toThrow(/no cookies/i)
   })

   it('should not type credentials: login without session cookies is refused', async () => {
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'login',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/session cookies/)
      expect(ctx.session.goto).not.toHaveBeenCalled()
   })

   it('should report a missing stored session as a task failure', async () => {
      const { ObjectNotFoundError } = await import('../storage/store')

      ctx.store.get.mockRejectedValue(new ObjectNotFoundError('sessions/demo.json'))

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'login',
                  params: { use_session_cookies: true },
               },
            ])
         )
      ).rejects.toThrow(/session/)
   })

   it('should let storage errors through so the message is retried', async () => {
      ctx.store.get.mockRejectedValue(new Error('storage unavailable'))

      const failure = ctx.engine.run(
         base([
            {
               step: 1,
               action: 'login',
               params: { use_session_cookies: true },
            },
         ])
      )

      await expect(failure).rejects.toThrow('storage unavailable')
      await expect(failure).rejects.not.toBeInstanceOf(TaskError)
   })

   it('should turn a browser error into a task failure that names the step', async () => {
      ctx.session.goto.mockRejectedValue(new Error('Timeout 30000ms exceeded'))

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/Step 1 \(navigate\) failed: Timeout/)
   })

   it('should always close the browser, on success and on failure', async () => {
      await ctx.engine.run(
         base([
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
         ])
      )

      expect(ctx.session.close).toHaveBeenCalledTimes(1)

      ctx.session.goto.mockRejectedValue(new Error('boom'))
      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow()

      expect(ctx.session.close).toHaveBeenCalledTimes(2)
   })

   it('should not let a failing close hide the real outcome', async () => {
      ctx.session.close.mockRejectedValue(new Error('already closed'))

      await expect(
         ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).resolves.toMatchObject({ records: [] })
   })

   describe('account session', () => {
      const navigate = [
         {
            step: 1,
            action: 'navigate' as const,
            params: {},
         },
      ]

      const storeWith = (objects: Record<string, string>) =>
         ctx.store.get.mockImplementation(async (key: string) => {
            if (key in objects) {
               return objects[key]
            }

            throw new ObjectNotFoundError(key)
         })

      it('should load the previous session of the account before the first action, then continue', async () => {
         storeWith({ 'sessions/acc1/state.json': JSON.stringify({ cookies: [cookie] }) })

         await ctx.engine.run(base(navigate, { account_id: 'acc1' }))

         expect(ctx.store.get).toHaveBeenCalledWith('sessions/acc1/state.json')
         expect(ctx.session.addCookies).toHaveBeenCalledWith([cookie])
         expect(ctx.session.addCookies.mock.invocationCallOrder[0]).toBeLessThan(
            ctx.session.goto.mock.invocationCallOrder[0]
         )
      })

      it('should load the session once, even when an action asks for it again', async () => {
         storeWith({ 'sessions/acc1/state.json': JSON.stringify({ cookies: [cookie] }) })

         await ctx.engine.run(
            base(
               [
                  {
                     step: 1,
                     action: 'login',
                     params: { use_session_cookies: true },
                  },
                  {
                     step: 2,
                     action: 'navigate',
                     params: { use_session_cookies: true },
                  },
               ],
               { account_id: 'acc1' }
            )
         )

         expect(ctx.session.addCookies).toHaveBeenCalledTimes(1)
      })

      it('should seed a new account from auth_session_key when it has no stored session yet', async () => {
         storeWith({ 'sessions/demo.json': JSON.stringify([cookie]) })

         await ctx.engine.run(base(navigate, { account_id: 'acc1' }))

         expect(ctx.session.addCookies).toHaveBeenCalledWith([cookie])
      })

      it('should prefer the stored session of the account over the seed key', async () => {
         const mine = {
            ...cookie,
            value: 'mine',
         }

         storeWith({
            'sessions/acc1/state.json': JSON.stringify({ cookies: [mine] }),
            'sessions/demo.json': JSON.stringify([cookie]),
         })

         await ctx.engine.run(base(navigate, { account_id: 'acc1' }))

         expect(ctx.session.addCookies).toHaveBeenCalledWith([mine])
      })

      it('should start without a session when the account has none and no action needs one', async () => {
         storeWith({})

         await expect(
            ctx.engine.run(
               base(navigate, {
                  account_id: 'acc1',
                  auth_session_key: '',
               })
            )
         ).resolves.toMatchObject({ records: [] })
         expect(ctx.session.addCookies).not.toHaveBeenCalled()
      })

      it('should fail a task that needs a session when the account has none', async () => {
         storeWith({})

         await expect(
            ctx.engine.run(
               base(
                  [
                     {
                        step: 1,
                        action: 'login',
                        params: { use_session_cookies: true },
                     },
                  ],
                  { account_id: 'acc1' }
               )
            )
         ).rejects.toThrow(/session was not found/)
      })

      it('should fail, and close the browser, when the stored session has no cookie for an allowed host', async () => {
         storeWith({
            'sessions/acc1/state.json': JSON.stringify({
               cookies: [
                  {
                     ...cookie,
                     domain: '.evil.org',
                  },
               ],
            }),
         })

         await expect(ctx.engine.run(base(navigate, { account_id: 'acc1' }))).rejects.toThrow(/no cookies/i)
         expect(ctx.session.close).toHaveBeenCalledTimes(1)
      })

      it('should not read the store for a task without an account or a session action', async () => {
         await ctx.engine.run(base(navigate))

         expect(ctx.store.get).not.toHaveBeenCalled()
      })

      it('should hand back the cookies of allowed hosts after the actions, for an account', async () => {
         storeWith({})
         ctx.session.cookies.mockResolvedValue([
            cookie,
            {
               ...cookie,
               domain: '.evil.org',
            },
            {
               ...cookie,
               name: 'other',
               domain: 'www.example.com',
            },
         ])

         const { cookies } = await ctx.engine.run(base(navigate, { account_id: 'acc1' }))

         expect(cookies.map(({ name }) => name)).toEqual(['sid', 'other'])
      })

      it('should not read the cookies when there is no account, so a session is never kept by accident', async () => {
         const { cookies } = await ctx.engine.run(base(navigate))

         expect(cookies).toEqual([])
         expect(ctx.session.cookies).not.toHaveBeenCalled()
      })

      it('should hand back no cookies when the task fails', async () => {
         storeWith({})
         ctx.session.goto.mockRejectedValue(new Error('boom'))

         await expect(ctx.engine.run(base(navigate, { account_id: 'acc1' }))).rejects.toThrow()
         expect(ctx.session.cookies).not.toHaveBeenCalled()
      })
   })

   describe('proxy', () => {
      const proxy = {
         server: 'http://proxy.example.net:8080',
         username: 'user',
         password: 'TOPSECRET',
      }

      it('should open the browser through the proxy of the task', async () => {
         await ctx.engine.run(
            base(
               [
                  {
                     step: 1,
                     action: 'navigate',
                     params: {},
                  },
               ],
               { proxy }
            )
         )

         expect(ctx.driver.open).toHaveBeenCalledWith({ proxy })
      })

      it('should open the browser directly when the task has no proxy', async () => {
         await ctx.engine.run(
            base([
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )

         expect(ctx.driver.open).toHaveBeenCalledWith({})
      })

      it('should not put the proxy in the error of a failed step', async () => {
         ctx.session.goto.mockRejectedValue(new Error('Timeout 30000ms exceeded'))

         const failure = ctx.engine.run(
            base(
               [
                  {
                     step: 1,
                     action: 'navigate',
                     params: {},
                  },
               ],
               { proxy }
            )
         )

         await expect(failure).rejects.toThrow(/Step 1/)
         await expect(failure).rejects.not.toThrow(/TOPSECRET/)
      })
   })

   describe('robots exemption', () => {
      const navigate = [
         {
            step: 1,
            action: 'navigate' as const,
            params: {},
         },
      ]

      it('should skip the robots check for an exempt host, but keep the rate limit', async () => {
         const exempt = setup('example.com')

         exempt.robots.check.mockResolvedValue({ allowed: false })

         await expect(exempt.engine.run(base(navigate))).resolves.toBeDefined()
         expect(exempt.robots.check).not.toHaveBeenCalled()
         expect(exempt.limiter.wait).toHaveBeenCalledWith('example.com')
      })

      it('should still refuse a host that is not exempt when robots.txt forbids it', async () => {
         ctx.robots.check.mockResolvedValue({ allowed: false })

         await expect(ctx.engine.run(base(navigate))).rejects.toThrow(/robots\.txt/)
      })
   })
})
