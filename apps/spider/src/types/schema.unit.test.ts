import { describe, expect, it } from 'vitest'

import { parseCommand, scrapeRequestSchema } from './schema'

const command = {
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   task_type: 'demo.posts',
   timestamp: '2026-10-11T10:00:00.000Z',
   auth_session_key: 'sessions/demo.json',
   target_url: 'http://localhost:8080/feed',
   actions: [
      {
         step: 1,
         action: 'navigate',
         params: {
            url: 'http://localhost:8080/feed',
            wait_for_selector: '.post',
         },
      },
      {
         step: 2,
         action: 'extract',
         params: {
            selectors: {
               wrapper: '.post',
               author: '.author',
               text: '.text',
            },
         },
      },
   ],
}

const request = {
   task_type: command.task_type,
   auth_session_key: command.auth_session_key,
   target_url: command.target_url,
   actions: command.actions,
}

describe('parseCommand', () => {
   it('should accept a valid command and return it typed', () => {
      expect(parseCommand(command)).toEqual(command)
   })

   it('should accept extra selector keys next to wrapper, author and text', () => {
      const withExtra = structuredClone(command)

      withExtra.actions[1].params.selectors = {
         wrapper: '.post',
         author: '.author',
         text: '.text',
         likes: '.likes',
      } as never

      expect(parseCommand(withExtra).actions[1].params.selectors).toMatchObject({ likes: '.likes' })
   })

   it.each([
      [
         'a missing task_id',
         {
            ...command,
            task_id: undefined,
         },
      ],
      [
         'a task_id that is not a uuid',
         {
            ...command,
            task_id: 'abc',
         },
      ],
      [
         'a bad timestamp',
         {
            ...command,
            timestamp: 'yesterday',
         },
      ],
      [
         'a bad target url',
         {
            ...command,
            target_url: 'not a url',
         },
      ],
      [
         'no actions',
         {
            ...command,
            actions: [],
         },
      ],
      [
         'an unknown action type',
         {
            ...command,
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
         'an unknown top-level key',
         {
            ...command,
            stealth: true,
         },
      ],
      [
         'an unknown param key',
         {
            ...command,
            actions: [
               {
                  step: 1,
                  action: 'navigate',
                  params: { stealth: true },
               },
            ],
         },
      ],
      [
         'selectors without a wrapper',
         {
            ...command,
            actions: [
               {
                  step: 1,
                  action: 'extract',
                  params: {
                     selectors: {
                        author: 'a',
                        text: 't',
                     },
                  },
               },
            ],
         },
      ],
      [
         'duplicate step numbers',
         {
            ...command,
            actions: [
               {
                  step: 1,
                  action: 'navigate',
                  params: { url: 'http://localhost:8080' },
               },
               {
                  step: 1,
                  action: 'navigate',
                  params: { url: 'http://localhost:8080' },
               },
            ],
         },
      ],
      [
         'too many actions',
         {
            ...command,
            actions: Array.from({ length: 51 }, (_, index) => ({
               step: index + 1,
               action: 'navigate',
               params: { url: 'http://localhost:8080' },
            })),
         },
      ],
   ])('should reject %s', (_name, input) => {
      expect(() => parseCommand(input)).toThrow()
   })

   it('should reject a session key outside the sessions folder when session cookies are requested', () => {
      const unsafe = structuredClone(command)

      unsafe.actions = [
         {
            step: 1,
            action: 'login',
            params: { use_session_cookies: true },
         },
      ] as never
      unsafe.auth_session_key = '../secrets/other.json'

      expect(() => parseCommand(unsafe)).toThrow(/sessions/)
   })

   it('should accept a session key under sessions when session cookies are requested', () => {
      const safe = structuredClone(command)

      safe.actions = [
         {
            step: 1,
            action: 'login',
            params: { use_session_cookies: true },
         },
      ] as never

      expect(parseCommand(safe).auth_session_key).toBe('sessions/demo.json')
   })

   describe('account_id', () => {
      const useSession = [
         {
            step: 1,
            action: 'login',
            params: { use_session_cookies: true },
         },
      ]

      it('should accept a plain account id', () => {
         expect(
            parseCommand({
               ...command,
               account_id: 'acc_42.v1-x',
            }).account_id
         ).toBe('acc_42.v1-x')
      })

      it.each(['', '.', '..', '../x', 'a/b', '-lead', 'a b', 'a'.repeat(101)])(
         'should reject the account id %j',
         id => {
            expect(() =>
               parseCommand({
                  ...command,
                  account_id: id,
               })
            ).toThrow()
         }
      )

      it('should not need auth_session_key when the account id names the session', () => {
         const { auth_session_key: _key, ...withoutKey } = command

         expect(
            parseCommand({
               ...withoutKey,
               account_id: 'acc1',
               actions: useSession,
            }).account_id
         ).toBe('acc1')
      })

      it('should reject session cookies with neither an account id nor a session key', () => {
         const { auth_session_key: _key, ...withoutKey } = command

         expect(() =>
            parseCommand({
               ...withoutKey,
               actions: useSession,
            })
         ).toThrow(/account_id/)
      })

      it('should reject an unsafe session key even when an account id is given', () => {
         expect(() =>
            parseCommand({
               ...command,
               account_id: 'acc1',
               auth_session_key: '../results/x.json',
               actions: useSession,
            })
         ).toThrow(/sessions/)
      })

      it('should reject an unsafe session key even when no action asks for session cookies', () => {
         expect(() =>
            parseCommand({
               ...command,
               auth_session_key: '../results/x.json',
            })
         ).toThrow(/sessions/)
      })
   })

   describe('proxy', () => {
      const proxy = {
         server: 'http://proxy.example.net:8080',
         username: 'user',
         password: 'pw',
         bypass: 'localhost',
      }

      it('should accept an optional proxy with credentials', () => {
         expect(
            parseCommand({
               ...command,
               proxy,
            }).proxy
         ).toEqual(proxy)
         expect(parseCommand(command).proxy).toBeUndefined()
      })

      it.each(['http://p.example:8080', 'https://p.example:8443', 'socks5://p.example:1080'])(
         'should accept the proxy scheme in %s',
         server => {
            expect(
               parseCommand({
                  ...command,
                  proxy: { server },
               }).proxy?.server
            ).toBe(server)
         }
      )

      it.each([
         ['a file url', { server: 'file:///etc/passwd' }],
         ['an ftp url', { server: 'ftp://p.example' }],
         ['text that is not a url', { server: 'proxy' }],
         [
            'an unknown key',
            {
               server: 'http://p.example:8080',
               stealth: true,
            },
         ],
         ['a string instead of an object', 'http://p.example:8080'],
         [
            'a password that is too long',
            {
               server: 'http://p.example:8080',
               password: 'x'.repeat(257),
            },
         ],
      ])('should reject %s', (_name, value) => {
         expect(() =>
            parseCommand({
               ...command,
               proxy: value,
            })
         ).toThrow()
      })

      it('should not put the proxy password in the error', () => {
         const attempt = () =>
            parseCommand({
               ...command,
               proxy: {
                  server: 'ftp://p.example',
                  password: 'TOPSECRET',
               },
            })

         expect(attempt).toThrow()

         try {
            attempt()
         } catch (error) {
            expect(JSON.stringify((error as { issues: unknown }).issues)).not.toContain('TOPSECRET')
         }
      })
   })
})

describe('scrapeRequestSchema', () => {
   it('should accept the client part of a command, without task_id and timestamp', () => {
      expect(scrapeRequestSchema.parse(request)).toEqual(request)
   })

   it('should not let a client choose the task_id or the timestamp', () => {
      expect(() =>
         scrapeRequestSchema.parse({
            ...request,
            task_id: command.task_id,
         })
      ).toThrow()
   })
})
