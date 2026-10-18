import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { type TaskCommand, type TaskResult, runPrefix } from '@automatedLinkedIn/contracts'

import { type ProxyConfig } from '../types'

import { type DeviceIdentity } from '../identity/deviceIdentity'
import { type ExitRegion, type KeptRegion } from '../identity/region'
import { Recorder } from '../recording/recorder'
import { type SessionControl } from '../scraping/driver'
import { AccountBusyError, TaskError } from '../scraping/errors'
import { type SavedState } from '../sessions/sessionVault'
import { ObjectNotFoundError } from '../storage/store'
import { type TaskDefinition, type TaskOutcome, VisitError, defineTask } from './defineTask'
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
   type: vi.fn(),
   press: vi.fn(async (_key: string) => 'https://example.com/'),
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
      get: vi.fn(async (key: string) => {
         const body = objects.get(key)

         if (body === undefined) {
            throw new ObjectNotFoundError(key)
         }

         return body
      }),
      create: vi.fn(async (key: string, body: string, _type: string) => {
         if (objects.has(key)) {
            return undefined
         }

         objects.set(key, body)

         return '1'
      }),
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
      session?: ReturnType<typeof makeSession> & { control?: SessionControl }
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
      const manifest = JSON.parse(String(store.objects.get(`${PREFIX}/manifest.json`)))

      expect(manifest).toEqual({ artifacts: published[0].artifacts })
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

   describe('the device of the account', () => {
      const device: DeviceIdentity = {
         version: 1,
         os: 'windows',
         fingerprint: {
            screen: { width: 1366 },
            navigator: { userAgent: 'Mozilla/5.0' },
         } as DeviceIdentity['fingerprint'],
         createdAt: '2026-10-15T10:00:00.000Z',
      }

      const exit: ExitRegion = {
         ip: '203.0.113.7',
         country: 'DE',
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
      }

      const withIdentities = (stored: DeviceIdentity = device, task = accountTask()) => {
         const identities = {
            forAccount: vi.fn(async () => stored),
            pin: vi.fn(async (_id: string, found: DeviceIdentity, region: KeptRegion) => ({
               ...found,
               ...region,
            })),
         }
         const exitGeo = vi.fn(async (_proxy: ProxyConfig) => exit)

         return {
            ...setup({
               task,
               overrides: {
                  identities,
                  exitGeo,
               },
            }),
            identities,
            exitGeo,
         }
      }

      it('should give the task the language of the account, so a site cannot pick another from the address', async () => {
         let seen: { language?: string } | undefined
         const { run } = withIdentities(
            device,
            accountTask({
               run: async context => {
                  seen = context

                  return {
                     status: 'SUCCEEDED',
                     verdict: 'GOOD',
                     message: 'ok',
                  }
               },
            })
         )

         await run(accountCommand)

         expect(seen?.language).toBe('de-DE')
      })

      it('should open the browser with the same device of the account, not a new one', async () => {
         const { run, deps, identities } = withIdentities()

         await run(accountCommand)

         expect(identities.forAccount).toHaveBeenCalledWith('acc1')
         expect(deps.driver.open).toHaveBeenCalledWith(
            expect.objectContaining({ identity: expect.objectContaining(device) })
         )
      })

      it('should set the language and timezone from where the proxy exits, and give the browser the address it found', async () => {
         const { run, deps, identities, exitGeo } = withIdentities()

         await run(accountCommand)

         expect(exitGeo).toHaveBeenCalledWith(command.proxy)
         expect(identities.pin).toHaveBeenCalledWith('acc1', device, {
            locale: 'de-DE',
            timezone: 'Europe/Berlin',
            country: 'DE',
         })
         expect(deps.driver.open).toHaveBeenCalledWith(
            expect.objectContaining({
               exitIp: '203.0.113.7',
               identity: expect.objectContaining({
                  locale: 'de-DE',
                  timezone: 'Europe/Berlin',
               }),
            })
         )
      })

      it('should change nothing, and not write, while the proxy exits where it did', async () => {
         const { run, identities } = withIdentities({
            ...device,
            locale: 'de-DE',
            timezone: 'Europe/Berlin',
            country: 'DE',
         })

         await run(accountCommand)

         expect(identities.pin).not.toHaveBeenCalled()
      })

      it('should move the language and timezone, not the device, when the proxy now exits in another country', async () => {
         const { run, identities, deps } = withIdentities({
            ...device,
            locale: 'en-US',
            timezone: 'America/New_York',
            country: 'US',
         })

         await run(accountCommand)

         expect(identities.pin).toHaveBeenCalledWith('acc1', expect.objectContaining(device), {
            locale: 'de-DE',
            timezone: 'Europe/Berlin',
            country: 'DE',
         })
         expect(deps.driver.open).toHaveBeenCalledWith(
            expect.objectContaining({ identity: expect.objectContaining({ fingerprint: device.fingerprint }) })
         )
      })

      it('should not look anything up without a proxy, since the host decides the language then', async () => {
         const { run, identities, exitGeo } = withIdentities()

         await run({
            ...accountCommand,
            proxy: undefined,
         })

         expect(exitGeo).not.toHaveBeenCalled()
         expect(identities.pin).not.toHaveBeenCalled()
      })

      it('should answer PROXY_FAILED, never starting with the host language, when the exit cannot be looked up', async () => {
         const { run, exitGeo, deps, published } = withIdentities()

         exitGeo.mockRejectedValueOnce(new Error('ip-api unreachable'))

         await run(accountCommand)

         expect(deps.driver.open).not.toHaveBeenCalled()
         expect(published[0]).toMatchObject({
            status: 'FAILED',
            verdict: 'PROXY_FAILED',
         })
      })

      it('should let the broker retry when the new language cannot be written', async () => {
         const { run, identities, deps } = withIdentities()

         identities.pin.mockRejectedValueOnce(new Error('bucket unavailable'))

         await expect(run(accountCommand)).rejects.toThrow('bucket unavailable')
         expect(deps.driver.open).not.toHaveBeenCalled()
      })

      it('should let the broker retry, with no new device, when the identity cannot be read', async () => {
         const { run, identities, deps } = withIdentities()

         identities.forAccount.mockRejectedValueOnce(new Error('bucket unavailable'))

         await expect(run(accountCommand)).rejects.toThrow('bucket unavailable')
         expect(deps.driver.open).not.toHaveBeenCalled()
         expect(lease.release).toHaveBeenCalledTimes(1)
      })

      it('should give a task without an account a new device, as before', async () => {
         const { identities } = withIdentities()
         const { run, deps } = setup({ overrides: { identities } })

         await run()

         expect(identities.forAccount).not.toHaveBeenCalled()
         expect(deps.driver.open).toHaveBeenCalledWith(expect.not.objectContaining({ identity: expect.anything() }))
      })
   })

   it('should not run, and not fail the task, when another task holds the account', async () => {
      const { run, deps, published } = setup({ task: accountTask() })

      vi.mocked(deps.accountLock!.acquire).mockResolvedValueOnce(undefined)

      await expect(run(accountCommand)).rejects.toBeInstanceOf(AccountBusyError)
      expect(deps.driver.open).not.toHaveBeenCalled()
      expect(published).toEqual([])
   })

   describe('a command delivered twice', () => {
      const doneKey = `${runPrefix(command)}/done.json`

      it('should write a marker after the result was published, so a second delivery is recognised', async () => {
         const { run, deps, store } = setup()

         await run()

         expect(store.objects.has(doneKey)).toBe(true)
         expect(vi.mocked(deps.publishResult).mock.invocationCallOrder[0]).toBeLessThan(
            store.create.mock.invocationCallOrder[0]
         )
      })

      it('should skip a command whose result was already published: no browser, no second result', async () => {
         const { run, deps, store, published } = setup()

         store.objects.set(doneKey, '{}')
         vi.spyOn(console, 'log').mockImplementation(() => undefined)

         await expect(run()).resolves.toBeUndefined()

         expect(deps.driver.open).not.toHaveBeenCalled()
         expect(published).toEqual([])
         expect(console.log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
      })

      it('should skip it while holding the account, release the account, and never open the credentials', async () => {
         const { run, deps, store, published } = setup({ task: accountTask() })

         store.objects.set(
            `${runPrefix({
               ...command,
               ...accountCommand,
            })}/done.json`,
            '{}'
         )
         vi.spyOn(console, 'log').mockImplementation(() => undefined)

         await run(accountCommand)

         expect(deps.accountLock?.acquire).toHaveBeenCalledTimes(1)
         expect(lease.release).toHaveBeenCalledTimes(1)
         expect(deps.openCredentials).not.toHaveBeenCalled()
         expect(deps.driver.open).not.toHaveBeenCalled()
         expect(published).toEqual([])
      })

      it('should run when the marker cannot be read for another reason than not being there, and say so', async () => {
         const { run, store, published } = setup()

         store.get.mockRejectedValueOnce(new Error('bucket unavailable'))

         await run()

         expect(published).toHaveLength(1)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bucket unavailable'))
      })

      it('should still answer when the marker cannot be written', async () => {
         const { run, store, published } = setup()

         store.create.mockRejectedValueOnce(new Error('bucket unavailable'))

         await expect(run()).resolves.toBeUndefined()

         expect(published).toHaveLength(1)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bucket unavailable'))
      })

      it('should write no marker for a run that failed for the broker to retry, so its retry is not skipped', async () => {
         const { run, deps, store } = setup()

         vi.mocked(deps.driver.open).mockRejectedValueOnce(new Error('browser crashed'))

         await expect(run()).rejects.toThrow('browser crashed')

         expect(store.objects.has(doneKey)).toBe(false)
      })

      it('should run as before with a store that keeps no markers, such as the local devtools', async () => {
         const { run, deps, published } = setup()

         deps.store = { put: deps.store.put }

         await run()

         expect(published).toHaveLength(1)
      })
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

   const committing = (verdictStatus: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED', commitSession = true) =>
      accountTask({
         run: async () => ({
            status: verdictStatus,
            verdict: verdictStatus === 'SUCCEEDED' ? 'GOOD' : 'BAD',
            message: 'ok',
            commitSession,
         }),
      })

   const withVault = (task: ReturnType<typeof demo>, saved?: SavedState) => {
      const sessions = {
         load: vi.fn(async (_id: string) => saved),
         save: vi.fn(async (_id: string, _state: unknown) => undefined),
      }

      return {
         sessions,
         ...setup({
            task,
            overrides: { sessions },
         }),
      }
   }

   it("should replace the account's saved session only when the task says its own check passed", async () => {
      const { run, sessions } = withVault(committing())

      await run(accountCommand)

      expect(sessions.save).toHaveBeenCalledTimes(1)

      const [id, state] = sessions.save.mock.calls[0] as [string, { cookies: unknown[] }]

      expect(id).toBe('acc1')
      expect(state.cookies).toHaveLength(1)
   })

   it.each([
      ['a task that did not ask for it', accountTask()],
      ['a failed run', committing('FAILED')],
   ])('should keep the saved session as it was for %s', async (_name, task) => {
      const { run, sessions } = withVault(task)

      await run(accountCommand)

      expect(sessions.save).not.toHaveBeenCalled()
   })

   it('should still answer when the session cannot be kept', async () => {
      const { run, sessions, published } = withVault(committing())

      sessions.save.mockRejectedValueOnce(new Error('bucket unavailable'))

      await run(accountCommand)

      expect(published[0]).toMatchObject({ status: 'SUCCEEDED' })
   })

   it('should start the browser from the session the account kept, for allowed sites only', async () => {
      const cookie = {
         expires: -1,
         httpOnly: true,
         secure: true,
         sameSite: 'None' as const,
         path: '/',
      }
      const { run, deps } = withVault(accountTask(), {
         cookies: [
            {
               ...cookie,
               name: 'bcookie',
               value: 'b',
               domain: '.linkedin.com',
            },
            {
               ...cookie,
               name: 'tracker',
               value: 't',
               domain: '.elsewhere.example',
            },
         ],
         origins: [
            {
               origin: 'https://elsewhere.example',
               localStorage: [],
            },
         ],
      })

      await run(accountCommand)

      const [[options]] = vi.mocked(deps.driver.open).mock.calls

      expect(options?.storageState?.cookies.map(({ name }) => name)).toEqual(['bcookie'])
      expect(options?.storageState?.origins).toEqual([])
   })

   it('should start cold when the account kept no session, and let the broker retry when it cannot be read', async () => {
      const { run, deps, sessions } = withVault(accountTask())

      await run(accountCommand)

      expect(vi.mocked(deps.driver.open).mock.calls[0]?.[0]).not.toHaveProperty('storageState')

      sessions.load.mockRejectedValueOnce(new Error('bucket unavailable'))

      // Another command: the first one is answered, so its twin would be skipped.
      const another = {
         ...accountCommand,
         task_id: '1e0a6c7f-1d69-4c5e-8e5c-0c9a6c1a7b22',
      }

      await expect(run(another)).rejects.toThrow('bucket unavailable')
   })
})

describe('a task that stops for its owner', () => {
   beforeEach(() => {
      vi.restoreAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      lease.release.mockClear()
   })

   const stopped = {
      status: 'FAILED',
      verdict: 'BAD',
      message: 'A security check.',
   } as const

   const control = {
      frame: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      press: vi.fn(),
      scroll: vi.fn(),
   }

   const stoppingTask = (resume: () => Promise<TaskOutcome>) =>
      accountTask({
         run: async () => ({
            ...stopped,
            needsPerson: { resume },
         }),
      })

   const withOwner = (resume: () => Promise<TaskOutcome>, handover: RunnerDeps['handover'], hasControl = true) =>
      setup({
         task: stoppingTask(resume),
         session: hasControl
            ? {
                 ...makeSession(),
                 control,
              }
            : makeSession(),
         overrides: { handover },
      })

   const passed: TaskOutcome = {
      status: 'SUCCEEDED',
      verdict: 'GOOD',
      message: 'ok',
      commitSession: true,
   }

   it('should hold the browser for the owner, and answer with what the task finds once they say they are done', async () => {
      const resume = vi.fn(async () => passed)
      const handover = vi.fn(async (_id: string, _control: unknown) => 'done' as const)
      const { run, published, session } = withOwner(resume, handover)

      await run(accountCommand)

      expect(handover).toHaveBeenCalledWith(TASK_ID, control)
      expect(resume).toHaveBeenCalledTimes(1)
      expect(published).toHaveLength(1)
      expect(published[0]).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'GOOD',
      })
      expect(session.close).toHaveBeenCalledTimes(1)
   })

   it.each(['gave_up', 'timed_out'] as const)(
      'should answer as the task did, and not look again, when the owner %s',
      async answer => {
         const resume = vi.fn(async () => passed)
         const { run, published } = withOwner(resume, async () => answer)

         await run(accountCommand)

         expect(resume).not.toHaveBeenCalled()
         expect(published[0]).toMatchObject({
            status: 'FAILED',
            verdict: 'BAD',
            message: 'A security check.',
         })
      }
   )

   it('should answer as the task did when looking again fails, rather than lose the run', async () => {
      const { run, published } = withOwner(
         async () => {
            throw new Error('page closed')
         },
         async () => 'done'
      )

      await run(accountCommand)

      expect(published[0]).toMatchObject({
         status: 'FAILED',
         verdict: 'BAD',
      })
   })

   it('should not wait when this worker cannot hand a browser over, such as the local devtools', async () => {
      const resume = vi.fn(async () => passed)
      const handover = vi.fn(async () => 'done' as const)
      const noControl = withOwner(resume, handover, false)

      await noControl.run(accountCommand)

      const noHandover = withOwner(resume, undefined)

      await noHandover.run(accountCommand)

      expect(handover).not.toHaveBeenCalled()
      expect(resume).not.toHaveBeenCalled()
      expect(noControl.published[0]).toMatchObject({ verdict: 'BAD' })
      expect(noHandover.published[0]).toMatchObject({ verdict: 'BAD' })
   })

   it('should keep the session of the run only when the owner got it through', async () => {
      const sessions = {
         load: vi.fn(async () => undefined),
         save: vi.fn(async (_id: string, _state: unknown) => undefined),
      }
      const withSession = (answer: 'done' | 'gave_up') =>
         setup({
            task: stoppingTask(async () => passed),
            session: {
               ...makeSession(),
               control,
            },
            overrides: {
               handover: async () => answer,
               sessions,
            },
         })

      await withSession('gave_up').run(accountCommand)

      expect(sessions.save).not.toHaveBeenCalled()

      await withSession('done').run(accountCommand)

      expect(sessions.save).toHaveBeenCalledTimes(1)
   })

   it('should not put the way to look again into the files of the run', async () => {
      const { run, store } = withOwner(
         async () => passed,
         async () => 'done'
      )

      await run(accountCommand)

      expect(String(store.objects.get(`${PREFIX}/result.json`))).not.toContain('resume')
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
