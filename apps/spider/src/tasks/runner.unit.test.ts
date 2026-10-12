import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { type TaskCommand, type TaskResult, runPrefix } from '@automatedLinkedIn/contracts'

import { Recorder } from '../recording/recorder'
import { AccountBusyError, TaskError } from '../scraping/errors'
import { type TaskDefinition, VisitError, defineTask } from './defineTask'
import { type RunnerDeps, exhaustedResult, runTask } from './runner'

const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const command: TaskCommand = {
   contract: 1,
   task_id: TASK_ID,
   user_id: 'user-1',
   task: 'demo',
   task_version: 1,
   requested_at: '2026-10-13T10:00:00.000Z',
   trigger: 'manual',
   proxy: {
      server: 'http://proxy.example.net:8080',
      username: 'ada',
      password: 'proxy-password-1',
   },
   input: { word: 'hello' },
}

const PREFIX = runPrefix(command)

const makeSession = () => ({
   addCookies: vi.fn(),
   cookies: vi.fn(),
   goto: vi.fn(async (url: string) => url),
   click: vi.fn(),
   extract: vi.fn(),
   fill: vi.fn(),
   exists: vi.fn(async () => true),
   scrollBy: vi.fn(async () => false),
   pageText: vi.fn(async () => 'text'),
   pageHtml: vi.fn(async () => '<html></html>'),
   fullPageScreenshot: vi.fn(async () => Buffer.from('png')),
   identity: vi.fn(),
   storageState: vi.fn(async () => ({
      cookies: [
         {
            name: 'li_at',
            value: 'LIAT-TOKEN-VALUE',
            domain: '.linkedin.com',
            path: '/',
         },
         {
            name: 'tracker',
            value: 't',
            domain: '.elsewhere.example',
            path: '/',
         },
      ],
      origins: [
         {
            origin: 'https://www.linkedin.com',
            localStorage: [
               {
                  name: 'k',
                  value: 'v',
               },
            ],
         },
         {
            origin: 'https://elsewhere.example',
            localStorage: [
               {
                  name: 'k',
                  value: 'v',
               },
            ],
         },
      ],
   })),
   close: vi.fn(async () => undefined),
})

const makeStore = () => {
   const objects = new Map<string, string>()

   return {
      objects,
      put: vi.fn(async (key: string, body: string, _type: string) => {
         objects.set(key, body)
      }),
      upload: vi.fn(async (_key: string, _path: string, _type: string) => undefined),
   }
}

const demo = (overrides: Partial<TaskDefinition<{ word: string }>> = {}) =>
   defineTask<{ word: string }>({
      name: 'demo',
      version: 1,
      title: 'Demo',
      description: 'A task for the runner tests.',
      input: z.strictObject({ word: z.string() }),
      needs: {
         proxy: 'required',
         account: false,
      },
      hosts: ['example.com'],
      verdicts: {
         GOOD: {
            label: 'Good',
            tone: 'success',
         },
         BAD: {
            label: 'Bad',
            tone: 'failure',
         },
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'proxy',
      },
      limits: { timeoutMs: 2000 },
      run: async (context, input) => {
         context.log(`word is ${input.word}`)

         return {
            status: 'SUCCEEDED',
            verdict: 'GOOD',
            message: 'All good.',
            report: {
               headline: 'Good',
               sections: [],
            },
         }
      },
      ...overrides,
   })

const credentials = {
   password: 'account-password-1',
   totpSecret: 'JBSWY3DPEHPK3PXP',
}

const lease = { release: vi.fn(async () => undefined) }

const accountTask = (overrides: Partial<TaskDefinition<{ word: string }>> = {}) =>
   demo({
      needs: {
         proxy: 'required',
         account: true,
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      ...overrides,
   })

const accountCommand: Partial<TaskCommand> = {
   account_id: 'acc1',
   account_email: 'ada@work.com',
   credentials: {
      ciphertext: 'Y2lwaGVy',
      iv: 'aXY=',
      tag: 'dGFn',
      key_version: 1,
   },
}

const setup = (
   options: {
      task?: ReturnType<typeof demo>
      session?: ReturnType<typeof makeSession>
      overrides?: Partial<RunnerDeps>
   } = {}
) => {
   const session = options.session ?? makeSession()
   const store = makeStore()
   const published: TaskResult[] = []
   const task = options.task ?? demo()
   const deps: RunnerDeps = {
      tasks: [task],
      driver: { open: vi.fn(async () => session) },
      policy: {
         allowsUrl: vi.fn((url: string) => !url.includes('elsewhere')),
         allowsCookieDomain: vi.fn((domain: string) => domain.endsWith('linkedin.com')),
      },
      accountLock: { acquire: vi.fn(async () => lease) },
      openCredentials: vi.fn(() => credentials),
      robots: { check: vi.fn(async () => ({ allowed: true })) },
      limiter: { wait: vi.fn(async () => undefined) },
      store,
      startRecording: ({ id, prefix, videoSize }) =>
         Recorder.start({
            kind: 'demo',
            id,
            prefix,
            mode: 'always',
            video: false,
            ...(videoSize && { videoSize }),
            store,
         }),
      publishResult: vi.fn(async result => {
         published.push(result)
      }),
      workerBuild: 'abc1234',
      pause: vi.fn(async () => undefined),
      now: () => Date.parse('2026-10-13T10:00:30.000Z'),
      ...options.overrides,
   }

   return {
      deps,
      session,
      store,
      published,
      run: (patch: Partial<TaskCommand> = {}) =>
         runTask(
            {
               ...command,
               ...patch,
            },
            deps
         ),
   }
}

describe('runTask', () => {
   beforeEach(() => {
      vi.restoreAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should run the task through the proxy and publish its verdict, report and the files of the run', async () => {
      const { run, published, deps, store } = setup()

      await run()

      expect(deps.driver.open).toHaveBeenCalledWith(
         expect.objectContaining({
            proxy: command.proxy,
            recorder: expect.anything(),
         })
      )
      expect(published).toHaveLength(1)
      expect(published[0]).toMatchObject({
         contract: 1,
         task_id: TASK_ID,
         task: 'demo',
         task_version: 1,
         status: 'SUCCEEDED',
         verdict: 'GOOD',
         message: 'All good.',
         report: { headline: 'Good' },
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: expect.any(String),
         finished_at: expect.any(String),
      })
      expect(published[0].artifacts.map(file => file.kind).sort()).toEqual(['log', 'network', 'timeline'])
      expect(published[0].artifacts.every(file => file.path.startsWith(`${PREFIX}/`))).toBe(true)
      expect([...store.objects.keys()]).toEqual(
         expect.arrayContaining([`${PREFIX}/result.json`, `${PREFIX}/manifest.json`])
      )
      expect(JSON.parse(String(store.objects.get(`${PREFIX}/manifest.json`)))).toEqual({
         artifacts: published[0].artifacts,
      })
   })

   it('should close the browser before it saves the files, so the video is complete', async () => {
      const { run, session, store } = setup()
      const order: string[] = []

      session.close.mockImplementation(async () => {
         order.push('closed')
      })
      store.put.mockImplementation(async (key: string) => {
         order.push(key.split('/').pop() as string)
      })

      await run()

      expect(order[0]).toBe('closed')
   })

   it('should mask the proxy password in every file', async () => {
      const task = demo({
         run: async context => {
            context.log('connecting with proxy-password-1')

            return {
               status: 'SUCCEEDED',
               verdict: 'GOOD',
               message: 'ok',
            }
         },
      })
      const { run, store } = setup({ task })

      await run()

      expect(JSON.stringify([...store.objects.values()])).not.toContain('proxy-password-1')
   })

   it('should answer UNKNOWN_TASK, without opening a browser, for a task or version it does not have', async () => {
      const { run, published, deps } = setup()

      await run({ task: 'nothing' })
      await run({ task_version: 2 })

      expect(published.map(result => result.verdict)).toEqual(['UNKNOWN_TASK', 'UNKNOWN_TASK'])
      expect(published[0]).toMatchObject({
         status: 'FAILED',
         artifacts: [],
      })
      expect(deps.driver.open).not.toHaveBeenCalled()
   })

   it('should answer INVALID_INPUT when the input is not what the task expects', async () => {
      const { run, published, deps } = setup()

      await run({ input: { word: 42 } })

      expect(published[0]).toMatchObject({
         status: 'FAILED',
         verdict: 'INVALID_INPUT',
      })
      expect(JSON.stringify(published[0])).not.toContain('42')
      expect(deps.driver.open).not.toHaveBeenCalled()
   })

   it('should answer NEEDS_PROXY for a task that needs a proxy and was given none', async () => {
      const { run, published, deps } = setup()

      await run({ proxy: undefined })

      expect(published[0].verdict).toBe('NEEDS_PROXY')
      expect(deps.driver.open).not.toHaveBeenCalled()
   })

   it('should answer NEEDS_ACCOUNT for a task that needs an account and was given none', async () => {
      const task = demo({
         needs: {
            proxy: 'required',
            account: true,
         },
      })
      const { run, published } = setup({ task })

      await run()

      expect(published[0].verdict).toBe('NEEDS_ACCOUNT')
   })

   it('should answer NOT_ALLOWED when a site the task declares is not on the allowlist', async () => {
      const { run, published, deps } = setup({
         overrides: {
            policy: {
               allowsUrl: vi.fn(() => false),
               allowsCookieDomain: vi.fn(() => false),
            },
         },
      })

      await run()

      expect(published[0].verdict).toBe('NOT_ALLOWED')
      expect(deps.driver.open).not.toHaveBeenCalled()
   })

   it('should answer PROXY_FAILED, keeping the recording, when the browser cannot start through the proxy', async () => {
      const { run, published, deps, store } = setup()

      vi.mocked(deps.driver.open).mockRejectedValue(new TaskError('proxy refused'))

      await run()

      expect(published[0]).toMatchObject({
         status: 'FAILED',
         verdict: 'PROXY_FAILED',
      })
      expect(store.objects.has(`${PREFIX}/timeline.json`)).toBe(true)
   })

   it('should let an unexpected failure to start the browser reach the broker, which retries it', async () => {
      const { run, published, deps } = setup()

      vi.mocked(deps.driver.open).mockRejectedValue(new Error('browser binary missing'))

      await expect(run()).rejects.toThrow('browser binary missing')
      expect(published).toEqual([])
   })

   it('should close the browser and let the broker retry when the task throws', async () => {
      const task = demo({
         run: async () => {
            throw new Error('selector exploded')
         },
      })
      const { run, session, published, store } = setup({ task })

      await expect(run()).rejects.toThrow('selector exploded')
      expect(session.close).toHaveBeenCalled()
      expect(published).toEqual([])
      expect(store.objects.has(`${PREFIX}/timeline.json`)).toBe(true)
   })

   it('should answer TIMED_OUT, with the files so far, when the task runs longer than its limit', async () => {
      const task = demo({
         limits: { timeoutMs: 30 },
         run: () => new Promise(() => undefined),
      })
      const { run, session, published } = setup({ task })

      await run()

      expect(published[0]).toMatchObject({
         status: 'FAILED',
         verdict: 'TIMED_OUT',
      })
      expect(session.close).toHaveBeenCalled()
   })

   it('should treat a verdict the task did not declare as a fault of the task, not as an answer', async () => {
      const task = demo({
         run: async () => ({
            status: 'SUCCEEDED',
            verdict: 'SURPRISE',
            message: 'x',
         }),
      })
      const { run, session, published } = setup({ task })

      await expect(run()).rejects.toThrow('SURPRISE')
      expect(session.close).toHaveBeenCalled()
      expect(published).toEqual([])
   })

   it('should keep at most 300 files in the message and say it left some out', async () => {
      const { run, published } = setup({
         overrides: {
            startRecording: async options => {
               const recorder = await Recorder.start({
                  kind: 'demo',
                  id: options.id,
                  prefix: options.prefix,
                  mode: 'always',
                  video: false,
                  store: makeStore(),
               })

               recorder.artifacts = () =>
                  Array.from({ length: 301 }, (_, index) => ({
                     kind: 'file' as const,
                     name: `f${index}.txt`,
                     path: `${options.prefix}/files/f${index}.txt`,
                     content_type: 'text/plain',
                     bytes: 1,
                  }))

               return recorder
            },
         },
      })

      await run()

      expect(published[0].artifacts).toHaveLength(300)
      expect(published[0].artifacts_truncated).toBe(true)
   })

   it('should still run, without files, when the recording cannot start', async () => {
      const { run, published } = setup({ overrides: { startRecording: async () => undefined } })

      await run()

      expect(published[0]).toMatchObject({
         verdict: 'GOOD',
         artifacts: [],
      })
   })

   describe('what a task is given', () => {
      const visiting = (url: string, overrides: Partial<RunnerDeps> = {}) => {
         let caught: unknown
         const task = demo({
            run: async context => {
               try {
                  await context.visit(url)
               } catch (error) {
                  caught = error
               }

               return {
                  status: 'SUCCEEDED',
                  verdict: 'GOOD',
                  message: 'ok',
               }
            },
         })
         const made = setup({
            task,
            overrides,
         })

         return {
            ...made,
            caught: () => caught,
         }
      }

      it('should open a page only after the allowlist, robots.txt and the rate limit agreed', async () => {
         const { run, session, deps } = visiting('https://example.com/page')

         await run()

         expect(deps.policy.allowsUrl).toHaveBeenCalledWith('https://example.com/page')
         expect(deps.robots.check).toHaveBeenCalledWith(new URL('https://example.com/page'))
         expect(deps.limiter.wait).toHaveBeenCalledWith('example.com')
         expect(session.goto).toHaveBeenCalledWith('https://example.com/page', undefined)
      })

      it.each([
         ['not-allowed', { policy: { allowsUrl: vi.fn((url: string) => !url.includes('blocked')) } }],
         ['robots', { robots: { check: vi.fn(async () => ({ allowed: false })) } }],
         [
            'robots-unreadable',
            {
               robots: {
                  check: vi.fn(async () => {
                     throw new Error('timeout')
                  }),
               },
            },
         ],
      ] as const)('should refuse a page with the reason %s, without opening it', async (reason, overrides) => {
         const { run, session, caught } = visiting(
            reason === 'not-allowed' ? 'https://blocked.example.org/' : 'https://example.com/',
            overrides as Partial<RunnerDeps>
         )

         await run()

         expect(caught()).toBeInstanceOf(VisitError)
         expect((caught() as VisitError).reason).toBe(reason)
         expect(session.goto).not.toHaveBeenCalled()
      })

      it('should say the page did not load when the browser could not open it', async () => {
         const { run, session, caught } = visiting('https://example.com/')

         session.goto.mockRejectedValue(new Error('net::ERR'))

         await run()

         expect((caught() as VisitError).reason).toBe('load')
      })

      it('should save screenshots and attached files with the run', async () => {
         const task = demo({
            run: async context => {
               await context.screenshot('01-home.png', Buffer.from('png'))
               context.attach('notes.txt', 'hello', 'text/plain')
               context.warn('careful')

               return {
                  status: 'SUCCEEDED',
                  verdict: 'GOOD',
                  message: 'ok',
               }
            },
         })
         const { run, published } = setup({ task })

         await run()

         expect(published[0].artifacts).toEqual(
            expect.arrayContaining([
               expect.objectContaining({
                  kind: 'screenshot',
                  name: '01-home.png',
               }),
               expect.objectContaining({
                  kind: 'file',
                  name: 'notes.txt',
                  path: `${PREFIX}/files/notes.txt`,
               }),
            ])
         )
      })
   })
})

describe('a task that needs an account', () => {
   beforeEach(() => {
      vi.restoreAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      lease.release.mockClear()
   })

   it('should take the account lease, open the credentials for the task, and let go of the lease when the result is out', async () => {
      let seen: unknown
      const task = accountTask({
         run: async context => {
            seen = context.account

            return {
               status: 'SUCCEEDED',
               verdict: 'GOOD',
               message: 'ok',
            }
         },
      })
      const { run, deps, published } = setup({ task })

      await run(accountCommand)

      expect(deps.accountLock?.acquire).toHaveBeenCalledWith('acc1', TASK_ID)
      expect(deps.openCredentials).toHaveBeenCalledWith(accountCommand.credentials)
      expect(seen).toEqual({
         id: 'acc1',
         email: 'ada@work.com',
         credentials,
      })
      expect(published).toHaveLength(1)
      expect(lease.release).toHaveBeenCalledTimes(1)
   })

   it('should not run, and not fail the task, when another task holds the account', async () => {
      const { run, deps, published } = setup({ task: accountTask() })

      vi.mocked(deps.accountLock!.acquire).mockResolvedValueOnce(undefined)

      await expect(run(accountCommand)).rejects.toBeInstanceOf(AccountBusyError)
      expect(deps.driver.open).not.toHaveBeenCalled()
      expect(published).toEqual([])
   })

   it('should answer NEEDS_ACCOUNT, without opening a browser, when the credentials cannot be read', async () => {
      const { run, deps, published } = setup({ task: accountTask() })

      vi.mocked(deps.openCredentials!).mockImplementationOnce(() => {
         throw new Error('bad tag')
      })

      await run(accountCommand)

      expect(published[0]).toMatchObject({
         verdict: 'NEEDS_ACCOUNT',
         message: 'The stored credentials could not be read. Save them again.',
      })
      expect(deps.driver.open).not.toHaveBeenCalled()
      expect(lease.release).toHaveBeenCalledTimes(1)
   })

   it('should let go of the lease when the task throws', async () => {
      const { run } = setup({
         task: accountTask({
            run: async () => {
               throw new Error('selector exploded')
            },
         }),
      })

      await expect(run(accountCommand)).rejects.toThrow('selector exploded')
      expect(lease.release).toHaveBeenCalledTimes(1)
   })

   it('should answer NEEDS_ACCOUNT when the email is missing', async () => {
      const { run, published } = setup({ task: accountTask() })

      await run({
         ...accountCommand,
         account_email: undefined,
      })

      expect(published[0].verdict).toBe('NEEDS_ACCOUNT')
   })

   it('should mask the account secrets in every file', async () => {
      const task = accountTask({
         run: async context => {
            context.log('typed account-password-1 and JBSWY3DPEHPK3PXP')

            return {
               status: 'SUCCEEDED',
               verdict: 'GOOD',
               message: 'ok',
            }
         },
      })
      const { run, store } = setup({ task })

      await run(accountCommand)

      const everything = JSON.stringify([...store.objects.entries()].filter(([key]) => !key.endsWith('session.json')))

      expect(everything).not.toContain('account-password-1')
      expect(everything).not.toContain('JBSWY3DPEHPK3PXP')
   })

   it('should keep the browser session of the run as a sensitive file, only for allowed sites', async () => {
      const { run, published, store } = setup({ task: accountTask() })

      await run(accountCommand)

      const file = published[0].artifacts.find(artifact => artifact.kind === 'session')

      expect(file).toMatchObject({
         name: 'session.json',
         sensitive: true,
         path: `${PREFIX}/session.json`,
      })

      const saved = JSON.parse(String(store.objects.get(`${PREFIX}/session.json`)))

      expect(saved.cookies.map((cookie: { name: string }) => cookie.name)).toEqual(['li_at'])
      expect(saved.origins.map((origin: { origin: string }) => origin.origin)).toEqual(['https://www.linkedin.com'])
      expect(saved.cookies[0].value).toBe('LIAT-TOKEN-VALUE')
   })

   it('should not keep a browser session for a task that has no account', async () => {
      const { run, published } = setup()

      await run()

      expect(published[0].artifacts.some(artifact => artifact.kind === 'session')).toBe(false)
   })

   it("should replace the account's saved session only when the task says its own check passed", async () => {
      const task = accountTask({
         run: async () => ({
            status: 'SUCCEEDED',
            verdict: 'GOOD',
            message: 'ok',
            commitSession: true,
         }),
      })
      const { run, store } = setup({ task })

      await run(accountCommand)

      expect(store.put).toHaveBeenCalledWith('sessions/acc1/state.json', expect.any(String), 'application/json')

      const state = JSON.parse(String(store.objects.get('sessions/acc1/state.json')))

      expect(state.cookies).toHaveLength(1)
   })

   it.each([
      ['a task that did not ask for it', accountTask()],
      [
         'a failed run',
         accountTask({
            run: async () => ({
               status: 'FAILED',
               verdict: 'BAD',
               message: 'no',
               commitSession: true,
            }),
         }),
      ],
   ])('should keep the saved session as it was for %s', async (_name, task) => {
      const { run, store } = setup({ task })

      await run(accountCommand)

      expect(store.objects.has('sessions/acc1/state.json')).toBe(false)
   })
})

describe('exhaustedResult', () => {
   it('should answer CRASHED for a command the worker gave up on, so the session never waits for ever', () => {
      expect(exhaustedResult(command, 'abc1234', () => Date.parse('2026-10-13T10:05:00.000Z'))).toEqual({
         contract: 1,
         task_id: TASK_ID,
         task: 'demo',
         task_version: 1,
         status: 'FAILED',
         verdict: 'CRASHED',
         message: 'The task could not run. Try again later.',
         artifacts: [],
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: '2026-10-13T10:05:00.000Z',
         finished_at: '2026-10-13T10:05:00.000Z',
      })
   })
})
