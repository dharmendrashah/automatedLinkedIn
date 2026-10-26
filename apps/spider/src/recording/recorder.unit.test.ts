import { stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Recorder } from './recorder'

const NOW = Date.parse('2026-10-12T10:15:00.000Z')

const makeStore = () => {
   const objects = new Map<string, string>()
   const files = new Map<string, string>()

   return {
      objects,
      files,
      put: vi.fn(async (key: string, body: string, _type: string) => {
         objects.set(key, body)
      }),
      upload: vi.fn(async (key: string, path: string, _type: string) => {
         files.set(key, path)
      }),
   }
}

const start = (overrides: Partial<Parameters<typeof Recorder.start>[0]> = {}) => {
   const store = makeStore()
   let clock = NOW

   return {
      store,
      tick: (ms: number) => {
         clock += ms
      },
      recorder: Recorder.start({
         kind: 'validate',
         id: 'abc-123',
         mode: 'always',
         video: true,
         store,
         now: () => clock,
         ...overrides,
      }),
   }
}

const request = {
   method: 'POST',
   url: 'https://www.linkedin.com/checkpoint?token=ABC&step=1',
   resourceType: 'xhr',
   requestHeaders: {
      cookie: 'li_at=SECRETCOOKIE',
      accept: '*/*',
   },
   status: 200,
   responseHeaders: { 'set-cookie': 'li_at=NEW; Path=/' },
   body: '{"ok":true}',
   durationMs: 40,
}

describe('Recorder', () => {
   beforeEach(() => {
      vi.restoreAllMocks()
   })

   it('should write the timeline, network and logs under a prefix named for the run and report it', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.network(request)
      run.log('browser', 'error', 'Uncaught TypeError')
      run.addStep({
         call: 'goto',
         durationMs: 12,
         ok: true,
         urlAfter: 'https://www.linkedin.com/login',
      })

      const prefix = await run.finish({
         failed: false,
         verdict: 'VALID',
      })

      expect(prefix).toBe('recordings/validate/abc-123/20261012T101500Z')
      expect([...store.objects.keys()].sort()).toEqual([
         `${prefix}/logs.json`,
         `${prefix}/network.json`,
         `${prefix}/timeline.json`,
      ])
      expect(JSON.parse(String(store.objects.get(`${prefix}/timeline.json`)))).toMatchObject({
         kind: 'validate',
         id: 'abc-123',
         outcome: 'ok',
         verdict: 'VALID',
         video: false,
         steps: [
            expect.objectContaining({
               n: 1,
               call: 'goto',
               ok: true,
            }),
         ],
      })
      expect(JSON.parse(String(store.objects.get(`${prefix}/logs.json`)))).toEqual([
         expect.objectContaining({
            source: 'browser',
            level: 'error',
            message: 'Uncaught TypeError',
         }),
      ])
   })

   it('should record the video at the size it was asked for', async () => {
      const { recorder } = start({
         videoSize: {
            width: 1280,
            height: 720,
         },
      })
      const run = await recorder

      expect(run.videoSize).toEqual({
         width: 1280,
         height: 720,
      })

      await run.finish({ failed: false })
   })

   it('should mask cookies, tokens and credentials before anything is written', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.network(request)
      run.log('engine', 'error', 'Could not reach socks5://bob:hunter2@10.0.0.1:1080')

      const prefix = (await run.finish({ failed: false })) as string
      const everything = [...store.objects.values()].join('\n')

      expect(everything).not.toContain('SECRETCOOKIE')
      expect(everything).not.toContain('hunter2')
      expect(everything).not.toContain('token=ABC')
      expect(JSON.parse(String(store.objects.get(`${prefix}/network.json`)))[0]).toMatchObject({
         url: 'https://www.linkedin.com/checkpoint?token=***&step=1',
         requestHeaders: {
            cookie: 'li_at=***',
            accept: '*/*',
         },
         responseHeaders: { 'set-cookie': 'li_at=***' },
      })
   })

   it('should replace every secret value it was told about, wherever it appears', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.addSecret('hunter2-password')
      run.network({
         ...request,
         body: 'echo hunter2-password back',
      })
      run.log('spider', 'info', 'typed hunter2-password')
      run.saveFailureHtml('<input value="hunter2-password">')

      await run.finish({ failed: true })

      expect([...store.objects.values()].join('\n')).not.toContain('hunter2-password')
   })

   it('should ignore a short value, which would make the record unreadable', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.addSecret('ab')
      run.log('spider', 'info', 'about a cab')

      const prefix = (await run.finish({ failed: false })) as string

      expect(String(store.objects.get(`${prefix}/logs.json`))).toContain('about a cab')
   })

   it('should cut a response body at 64 KB and say so', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.network({
         ...request,
         body: 'x'.repeat(70_000),
      })

      const prefix = (await run.finish({ failed: false })) as string
      const [entry] = JSON.parse(String(store.objects.get(`${prefix}/network.json`)))

      expect(entry.body).toHaveLength(65_536)
      expect(entry.bodyTruncated).toBe(true)
   })

   it('should keep the request, not the body, once the run has recorded enough body text', async () => {
      const { recorder, store } = start()
      const run = await recorder

      for (let index = 0; index < 60; index += 1) {
         run.network({
            ...request,
            body: 'x'.repeat(60_000),
         })
      }

      const prefix = (await run.finish({ failed: false })) as string
      const entries = JSON.parse(String(store.objects.get(`${prefix}/network.json`)))

      expect(entries).toHaveLength(60)
      expect(entries[59].body).toBeUndefined()
      expect(entries[59].bodyDropped).toBe(true)
   })

   it('should keep at most 500 requests and 2000 log lines', async () => {
      const { recorder, store } = start()
      const run = await recorder

      for (let index = 0; index < 2020; index += 1) {
         if (index < 520) {
            run.network({
               ...request,
               body: undefined,
            })
         }

         run.log('browser', 'info', `line ${index}`)
      }

      const prefix = (await run.finish({ failed: false })) as string

      expect(JSON.parse(String(store.objects.get(`${prefix}/network.json`)))).toHaveLength(500)
      expect(JSON.parse(String(store.objects.get(`${prefix}/logs.json`)))).toHaveLength(2000)
   })

   it('should upload screenshots and the page html of a failure, and the video when there is one', async () => {
      const { recorder, store } = start()
      const run = await recorder

      await writeFile(join(run.dir, 'abc.webm'), 'video-bytes')
      await run.saveScreenshot('01-goto.png', Buffer.from('png'))
      run.saveFailureHtml('<html>broken</html>')

      const prefix = (await run.finish({ failed: true })) as string

      expect(store.files.get(`${prefix}/screenshots/01-goto.png`)).toBeDefined()
      expect(store.files.has(`${prefix}/video.webm`)).toBe(true)
      expect(store.objects.get(`${prefix}/failure.html`)).toBe('<html>broken</html>')
      expect(JSON.parse(String(store.objects.get(`${prefix}/timeline.json`)))).toMatchObject({
         outcome: 'failed',
         video: true,
         screenshots: ['01-goto.png'],
      })
   })

   it('should store the failing page as plain text, never as html', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.saveFailureHtml('<script>alert(1)</script>')
      await run.finish({ failed: true })

      expect(store.put).toHaveBeenCalledWith(expect.stringMatching(/failure\.html$/), expect.any(String), 'text/plain')
   })

   it('should not record or upload a video when video is off', async () => {
      const { recorder, store } = start({ video: false })
      const run = await recorder

      expect(run.videoDir).toBeUndefined()

      await writeFile(join(run.dir, 'abc.webm'), 'video-bytes')
      await run.finish({ failed: false })

      expect([...store.files.keys()].some(key => key.endsWith('video.webm'))).toBe(false)
   })

   it('should skip a video that is too large and say so in the timeline', async () => {
      const { recorder, store } = start({ maxVideoBytes: 5 })
      const run = await recorder

      await writeFile(join(run.dir, 'big.webm'), Buffer.alloc(10))

      const prefix = (await run.finish({ failed: false })) as string

      expect(store.files.has(`${prefix}/video.webm`)).toBe(false)
      expect(JSON.parse(String(store.objects.get(`${prefix}/timeline.json`))).notes).toContain(
         'The video was left out because it is too large.'
      )
   })

   it('should keep nothing in mode failures when the run went well, and everything when it did not', async () => {
      const good = start({ mode: 'failures' })
      const goodRun = await good.recorder

      expect(await goodRun.finish({ failed: false })).toBeUndefined()
      expect(good.store.objects.size).toBe(0)

      const bad = start({ mode: 'failures' })
      const badRun = await bad.recorder

      expect(await badRun.finish({ failed: true })).toMatch(/^recordings\/validate\/abc-123\//)
      expect(bad.store.objects.size).toBeGreaterThan(0)
   })

   it('should remove its temporary folder when it is done, kept or not', async () => {
      const { recorder } = start({ mode: 'failures' })
      const run = await recorder
      const { dir } = run

      await expect(stat(dir)).resolves.toBeDefined()
      await run.finish({ failed: false })
      await expect(stat(dir)).rejects.toThrow()
   })

   it('should never fail the run when the upload fails, and still clean up', async () => {
      const { recorder, store } = start()
      const run = await recorder

      store.put.mockRejectedValue(new Error('denied'))
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(run.finish({ failed: false })).resolves.toBeUndefined()
      await expect(stat(run.dir)).rejects.toThrow()
   })

   it('should number the steps and time them from the start of the run', async () => {
      const { recorder, store, tick } = start()
      const run = await recorder

      tick(250)
      run.addStep({
         call: 'click',
         durationMs: 5,
         ok: false,
         error: 'Timeout waiting for #x',
      })
      tick(100)
      run.addStep({
         call: 'fill',
         durationMs: 1,
         ok: true,
      })

      const prefix = (await run.finish({ failed: true })) as string
      const { steps } = JSON.parse(String(store.objects.get(`${prefix}/timeline.json`)))

      expect(steps).toEqual([
         expect.objectContaining({
            n: 1,
            t: 250,
            call: 'click',
            ok: false,
            error: 'Timeout waiting for #x',
         }),
         expect.objectContaining({
            n: 2,
            t: 350,
            call: 'fill',
         }),
      ])
   })

   it('should wait for pending response captures before it writes', async () => {
      const { recorder, store } = start()
      const run = await recorder

      run.track(
         new Promise<void>(resolve => {
            setTimeout(() => {
               run.network(request)
               resolve()
            }, 10)
         })
      )

      const prefix = (await run.finish({ failed: false })) as string

      expect(JSON.parse(String(store.objects.get(`${prefix}/network.json`)))).toHaveLength(1)
   })

   it('should stop waiting for a capture that never ends, so the browser can close', async () => {
      const { recorder } = start({ settleMs: 10 })
      const run = await recorder

      run.track(new Promise(() => undefined))

      await expect(run.settle()).resolves.toBeUndefined()
      await expect(run.settle()).resolves.toBeUndefined()
   })
})

describe('Recorder in the task layout', () => {
   const PREFIX = 'runs/browser-detection/user-1/2026/10/12/0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

   beforeEach(() => {
      vi.restoreAllMocks()
   })

   it('should keep the final picture of a run even when the pictures of the steps filled the allowance', async () => {
      const { recorder } = start({
         kind: 'browser-detection',
         prefix: PREFIX,
      })
      const run = await recorder

      for (let n = 1; n <= 40; n += 1) {
         await run.saveScreenshot(`${String(n).padStart(2, '0')}-goto.png`, Buffer.from('png'))
      }

      await expect(run.saveScreenshot('41-goto.png', Buffer.from('png'))).resolves.toBe(false)
      await expect(run.saveScreenshot('final.png', Buffer.from('png'), true)).resolves.toBe(true)

      await run.finish({ failed: false })

      expect(run.artifacts().map(file => file.name)).toContain('final.png')
      expect(run.artifacts().map(file => file.name)).not.toContain('41-goto.png')
   })

   it('should write under the prefix it was given and list every file it saved, with its kind and size', async () => {
      const { recorder, store } = start({
         kind: 'browser-detection',
         prefix: PREFIX,
      })
      const run = await recorder

      run.addStep({
         call: 'goto',
         durationMs: 5,
         ok: true,
      })
      await run.saveScreenshot('01-goto.png', Buffer.from('png'))
      await run.saveScreenshot('90-fullpage-pixelscan.png', Buffer.from('big'))
      await writeFile(join(run.dir, 'abc.webm'), 'video-bytes')

      await expect(run.finish({ failed: false })).resolves.toBe(PREFIX)

      expect(run.artifacts()).toEqual(
         expect.arrayContaining([
            {
               kind: 'timeline',
               name: 'timeline.json',
               path: `${PREFIX}/timeline.json`,
               content_type: 'application/json',
               bytes: expect.any(Number),
            },
            {
               kind: 'network',
               name: 'network.json',
               path: `${PREFIX}/network.json`,
               content_type: 'application/json',
               bytes: 2,
            },
            {
               kind: 'log',
               name: 'logs.json',
               path: `${PREFIX}/logs.json`,
               content_type: 'application/json',
               bytes: 2,
            },
            {
               kind: 'screenshot',
               name: '01-goto.png',
               path: `${PREFIX}/screenshots/01-goto.png`,
               content_type: 'image/png',
               bytes: 3,
               step: 1,
            },
            {
               kind: 'screenshot',
               name: '90-fullpage-pixelscan.png',
               path: `${PREFIX}/screenshots/90-fullpage-pixelscan.png`,
               content_type: 'image/png',
               bytes: 3,
            },
            {
               kind: 'video',
               name: 'video.webm',
               path: `${PREFIX}/video.webm`,
               content_type: 'video/webm',
               bytes: 11,
            },
         ])
      )
      expect(store.objects.has(`${PREFIX}/timeline.json`)).toBe(true)
   })

   it('should keep files a task attached under files/ and mask the secrets of the run in their text', async () => {
      const { recorder, store } = start({ prefix: PREFIX })
      const run = await recorder

      run.addSecret('hunter2-password')
      run.attach('page.html', '<p>hunter2-password</p>', 'text/html')

      await run.finish({ failed: false })

      expect(store.objects.get(`${PREFIX}/files/page.html`)).toBe('<p>[redacted]</p>')
      expect(run.artifacts()).toContainEqual({
         kind: 'file',
         name: 'page.html',
         path: `${PREFIX}/files/page.html`,
         content_type: 'text/html',
         bytes: expect.any(Number),
      })
   })

   it('should save the browser session as a sensitive file, untouched by masking, only when asked', async () => {
      const { recorder, store } = start({ prefix: PREFIX })
      const run = await recorder

      run.addSecret('LIAT-TOKEN-VALUE')
      run.attachSession('{"cookies":[{"name":"li_at","value":"LIAT-TOKEN-VALUE"}]}')

      await run.finish({ failed: false })

      expect(store.objects.get(`${PREFIX}/session.json`)).toContain('LIAT-TOKEN-VALUE')
      expect(run.artifacts()).toContainEqual(
         expect.objectContaining({
            kind: 'session',
            name: 'session.json',
            sensitive: true,
         })
      )
   })

   it('should offer its masking to the code that writes the result and the manifest', async () => {
      const { recorder } = start({ prefix: PREFIX })
      const run = await recorder

      run.addSecret('hunter2-password')

      expect(run.redact('typed hunter2-password')).toBe('typed [redacted]')

      await run.finish({ failed: false })
   })

   it('should list nothing when nothing was kept', async () => {
      const { recorder } = start({
         prefix: PREFIX,
         mode: 'failures',
      })
      const run = await recorder

      await run.finish({ failed: false })

      expect(run.artifacts()).toEqual([])
   })
})
