import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HostPolicy } from '../scraping/policy'
import { buildApp } from './app'

const request = {
   task_type: 'demo.posts',
   auth_session_key: '',
   target_url: 'http://localhost:8080/feed',
   actions: [
      {
         step: 1,
         action: 'navigate',
         params: { url: 'http://localhost:8080/feed' },
      },
      {
         step: 2,
         action: 'extract',
         params: {
            selectors: {
               wrapper: '.p',
               author: '.a',
               text: '.t',
            },
         },
      },
   ],
}

const setup = () => {
   const publish = vi.fn().mockResolvedValue(undefined)
   const isBrokerHealthy = vi.fn().mockResolvedValue(true)
   const app = buildApp({
      policy: HostPolicy.fromList('localhost'),
      publish,
      isBrokerHealthy,
      info: {
         commit: 'abc123',
         builtAt: '2026-10-11T10:00:00Z',
      },
      newTaskId: () => '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
      now: () => new Date('2026-10-11T12:00:00.000Z'),
   })

   return {
      app,
      publish,
      isBrokerHealthy,
   }
}

const post = (app: ReturnType<typeof setup>['app'], payload: unknown) =>
   app.inject({
      method: 'POST',
      url: '/tasks',
      payload: payload as never,
   })

describe('POST /tasks', () => {
   let ctx: ReturnType<typeof setup>

   beforeEach(() => {
      ctx = setup()
   })

   it('should accept a valid task, add the id and timestamp itself, publish it and answer 202', async () => {
      const response = await post(ctx.app, request)

      expect(response.statusCode).toBe(202)
      expect(response.json()).toEqual({ task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11' })
      expect(ctx.publish).toHaveBeenCalledWith({
         ...request,
         task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
         timestamp: '2026-10-11T12:00:00.000Z',
      })
   })

   it('should queue the account and the proxy of a task as they were sent', async () => {
      const extra = {
         account_id: 'acc1',
         proxy: {
            server: 'socks5://proxy.example.net:1080',
            username: 'user',
            password: 'pw',
         },
      }

      const response = await post(ctx.app, {
         ...request,
         ...extra,
      })

      expect(response.statusCode).toBe(202)
      expect(ctx.publish).toHaveBeenCalledWith(expect.objectContaining(extra))
   })

   it('should answer 400 for a bad proxy without echoing its password', async () => {
      const response = await post(ctx.app, {
         ...request,
         proxy: {
            server: 'ftp://proxy.example.net',
            password: 'TOPSECRETPROXY',
         },
      })

      expect(response.statusCode).toBe(400)
      expect(response.body).not.toContain('TOPSECRETPROXY')
      expect(ctx.publish).not.toHaveBeenCalled()
   })

   it('should not let a client choose the task id or timestamp', async () => {
      const response = await post(ctx.app, {
         ...request,
         task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a99',
      })

      expect(response.statusCode).toBe(400)
      expect(ctx.publish).not.toHaveBeenCalled()
   })

   it.each([
      ['an empty body', {}],
      [
         'no actions',
         {
            ...request,
            actions: [],
         },
      ],
      [
         'an unknown action',
         {
            ...request,
            actions: [
               {
                  step: 1,
                  action: 'scroll',
                  params: {},
               },
            ],
         },
      ],
      [
         'an unknown field',
         {
            ...request,
            proxy: 'http://p',
         },
      ],
   ])('should answer 400 with the problem for %s', async (_name, payload) => {
      const response = await post(ctx.app, payload)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
         error: expect.any(String),
         issues: expect.any(Array),
      })
      expect(ctx.publish).not.toHaveBeenCalled()
   })

   it('should answer 400 when session cookies are requested with a key outside sessions/', async () => {
      const response = await post(ctx.app, {
         ...request,
         auth_session_key: '../x.json',
         actions: [
            {
               step: 1,
               action: 'login',
               params: { use_session_cookies: true },
            },
         ],
      })

      expect(response.statusCode).toBe(400)
   })

   it('should answer 422 for a target host that is not allowed, without publishing', async () => {
      const response = await post(ctx.app, {
         ...request,
         target_url: 'https://www.linkedin.com/feed/',
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().error).toMatch(/not allowed/)
      expect(ctx.publish).not.toHaveBeenCalled()
   })

   it('should answer 422 for a navigate url that is not allowed', async () => {
      const response = await post(ctx.app, {
         ...request,
         actions: [
            {
               step: 1,
               action: 'navigate',
               params: { url: 'https://evil.org/' },
            },
         ],
      })

      expect(response.statusCode).toBe(422)
      expect(ctx.publish).not.toHaveBeenCalled()
   })

   it('should answer 503 and not drop the task silently when the queue is unavailable', async () => {
      ctx.publish.mockRejectedValue(new Error('broker down'))

      const response = await post(ctx.app, request)

      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ error: 'The task queue is not available' })
   })

   it('should refuse a body that is too large', async () => {
      const response = await post(ctx.app, {
         ...request,
         task_type: 'x'.repeat(200_000),
      })

      expect(response.statusCode).toBe(413)
   })

   it('should not echo what the client sent back in an error', async () => {
      const response = await post(ctx.app, {
         ...request,
         auth_session_key: 'sessions/TOPSECRET.json',
         proxy: 'x',
      })

      expect(response.body).not.toContain('TOPSECRET')
   })
})

describe('GET /health', () => {
   it('should report ok with build info when the broker answers', async () => {
      const { app } = setup()

      const response = await app.inject({
         method: 'GET',
         url: '/health',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.json()).toEqual({
         status: 'ok',
         service: 'spider-api',
         commit: 'abc123',
         builtAt: '2026-10-11T10:00:00Z',
         broker: 'up',
      })
   })

   it('should answer 503 when the broker is down, because the API cannot queue tasks without it', async () => {
      const { app, isBrokerHealthy } = setup()

      isBrokerHealthy.mockResolvedValue(false)

      const response = await app.inject({
         method: 'GET',
         url: '/health',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({
         status: 'error',
         broker: 'down',
      })
   })
})
