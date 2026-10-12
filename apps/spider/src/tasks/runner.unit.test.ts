import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { type TaskCommand, type TaskResult, runPrefix } from '@automatedLinkedIn/contracts'

import { Recorder } from '../recording/recorder'
import { TaskError } from '../scraping/errors'
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
      policy: { allowsUrl: vi.fn(() => true) },
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
      const { run, published, deps } = setup({ overrides: { policy: { allowsUrl: vi.fn(() => false) } } })

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
