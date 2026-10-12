import { describe, expect, it } from 'vitest'

import {
   ARTIFACT_KINDS,
   RUNNER_VERDICTS,
   RUN_PREFIX_PATTERN,
   TASK_CATALOG_QUEUE,
   TASK_DEAD_QUEUE,
   TASK_DONE_KEY,
   TASK_DONE_QUEUE,
   TASK_KEY,
   TASK_QUEUE,
   artifactPathUnder,
   assertAccountTopology,
   runPrefix,
   taskCatalogEntrySchema,
   taskCatalogSchema,
   taskCommandSchema,
   taskResultSchema,
} from './index'

const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'
const USER_ID = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

const command = {
   contract: 1,
   task_id: TASK_ID,
   user_id: USER_ID,
   task: 'browser-detection',
   task_version: 1,
   requested_at: '2026-10-13T23:59:59.000Z',
   trigger: 'manual',
   proxy: { server: 'http://proxy.example.net:8080' },
   input: {},
}

const artifact = {
   kind: 'screenshot',
   name: '01-goto.png',
   path: `runs/browser-detection/${USER_ID}/2026/10/13/${TASK_ID}/screenshots/01-goto.png`,
   content_type: 'image/png',
   bytes: 1234,
   step: 1,
}

const result = {
   contract: 1,
   task_id: TASK_ID,
   task: 'browser-detection',
   task_version: 1,
   status: 'SUCCEEDED',
   verdict: 'NOT_DETECTED',
   message: 'Every detection page took this browser for a person.',
   report: {
      headline: 'Not detected',
      sections: [
         {
            title: 'Pixelscan',
            items: [
               {
                  label: 'Automation',
                  value: 'clear',
                  status: 'ok',
               },
            ],
         },
      ],
   },
   artifacts: [artifact],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: '2026-10-13T23:59:59.000Z',
   finished_at: '2026-10-14T00:00:30.000Z',
}

const catalogEntry = {
   contract: 1,
   task: 'browser-detection',
   version: 1,
   title: 'Browser test',
   description: 'Checks whether bot detection pages take the browser for a person.',
   input_schema: {
      type: 'object',
      properties: {},
   },
   needs: {
      proxy: 'required',
      account: false,
   },
   verdicts: {
      NOT_DETECTED: {
         label: 'Not detected',
         tone: 'success',
      },
      DETECTED: {
         label: 'Detected as a bot',
         tone: 'failure',
      },
   },
   policy: {
      cooldown_ms: 300_000,
      one_at_a_time: 'proxy',
      automatic: [
         {
            on: 'proxy.active',
            every_ms: 86_400_000,
         },
      ],
   },
   hosts: ['deviceandbrowserinfo.com', 'pixelscan.net'],
}

describe('taskCommandSchema', () => {
   it('should accept a command as brain sends it', () => {
      expect(taskCommandSchema.parse(command)).toEqual(command)
   })

   it('should accept an account task with sealed credentials', () => {
      const withAccount = {
         ...command,
         task: 'linkedin-login',
         account_id: 'acc-1',
         account_email: 'ada@work.com',
         credentials: {
            ciphertext: 'Y2lwaGVy',
            iv: 'aXY=',
            tag: 'dGFn',
            key_version: 1,
         },
      }

      expect(taskCommandSchema.parse(withAccount)).toEqual(withAccount)
   })

   it.each([
      ['an unknown contract version', { contract: 2 }],
      ['a task name with upper case', { task: 'Browser-Detection' }],
      ['a task name that climbs out of its folder', { task: '../x' }],
      ['a user id that is a path', { user_id: '../../other' }],
      ['a task id that is not a uuid', { task_id: 'nope' }],
      ['an unknown trigger', { trigger: 'cron' }],
      ['an input that is not an object', { input: 'text' }],
      ['an input over 8 KB', { input: { text: 'x'.repeat(9000) } }],
      ['a field it does not know', { extra: true }],
   ])('should refuse %s', (_name, patch) => {
      expect(
         taskCommandSchema.safeParse({
            ...command,
            ...patch,
         }).success
      ).toBe(false)
   })
})

describe('taskResultSchema', () => {
   it('should accept a result as the spider publishes it', () => {
      expect(taskResultSchema.parse(result)).toEqual(result)
   })

   it('should know the kinds of file a run can have', () => {
      expect(ARTIFACT_KINDS).toEqual(['log', 'network', 'timeline', 'video', 'screenshot', 'report', 'session', 'file'])
   })

   it.each([
      ['a verdict that is not a code', { verdict: 'not detected' }],
      ['a message over 200 characters', { message: 'x'.repeat(201) }],
      ['a status it does not know', { status: 'DONE' }],
      ['more than 300 artifacts', { artifacts: Array.from({ length: 301 }, () => artifact) }],
      [
         'an artifact of an unknown kind',
         {
            artifacts: [
               {
                  ...artifact,
                  kind: 'movie',
               },
            ],
         },
      ],
      [
         'an artifact name that is a path',
         {
            artifacts: [
               {
                  ...artifact,
                  name: '../a.png',
               },
            ],
         },
      ],
      ['a worker build that is missing', { worker: {} }],
   ])('should refuse %s', (_name, patch) => {
      expect(
         taskResultSchema.safeParse({
            ...result,
            ...patch,
         }).success
      ).toBe(false)
   })

   it('should leave the report out when a task has none', () => {
      const { report: _report, ...without } = result

      expect(taskResultSchema.safeParse(without).success).toBe(true)
   })
})

describe('taskCatalogEntrySchema', () => {
   it('should accept the entry a worker announces', () => {
      expect(taskCatalogEntrySchema.parse(catalogEntry)).toEqual(catalogEntry)
   })

   it.each([
      [
         'a verdict code in lower case',
         {
            verdicts: {
               detected: {
                  label: 'x',
                  tone: 'failure',
               },
            },
         },
      ],
      [
         'a tone it does not know',
         {
            verdicts: {
               DETECTED: {
                  label: 'x',
                  tone: 'red',
               },
            },
         },
      ],
      [
         'a proxy rule it does not know',
         {
            needs: {
               proxy: 'maybe',
               account: false,
            },
         },
      ],
      [
         'a negative cooldown',
         {
            policy: {
               cooldown_ms: -1,
               one_at_a_time: 'none',
            },
         },
      ],
      ['more than 20 hosts', { hosts: Array.from({ length: 21 }, (_, index) => `h${index}.example.com`) }],
   ])('should refuse %s', (_name, patch) => {
      expect(
         taskCatalogEntrySchema.safeParse({
            ...catalogEntry,
            ...patch,
         }).success
      ).toBe(false)
   })
})

describe('taskCatalogSchema', () => {
   it('should carry every task of a worker in one message, because the queue keeps only the latest', () => {
      const catalog = {
         contract: 1,
         announced_at: '2026-10-13T10:00:00.000Z',
         worker: { build: 'abc1234' },
         tasks: [catalogEntry],
      }

      expect(taskCatalogSchema.parse(catalog)).toEqual(catalog)
      expect(
         taskCatalogSchema.safeParse({
            ...catalog,
            tasks: [
               {
                  ...catalogEntry,
                  task: '../x',
               },
            ],
         }).success
      ).toBe(false)
   })
})

describe('RUNNER_VERDICTS', () => {
   it('should label the answers the runner gives itself, so a task never has to', () => {
      expect(Object.keys(RUNNER_VERDICTS).sort()).toEqual(
         [
            'CRASHED',
            'INVALID_INPUT',
            'NEEDS_ACCOUNT',
            'NEEDS_PROXY',
            'NOT_ALLOWED',
            'NOT_QUEUED',
            'PROXY_FAILED',
            'TIMED_OUT',
            'UNKNOWN_TASK',
         ].sort()
      )
      expect(RUNNER_VERDICTS.UNKNOWN_TASK).toEqual({
         label: expect.any(String),
         tone: 'failure',
      })
   })
})

describe('runPrefix', () => {
   const request = {
      task: 'browser-detection',
      user_id: USER_ID,
      requested_at: '2026-10-13T23:59:59.000Z',
      task_id: TASK_ID,
   }

   it('should build the folder of a run from the request alone', () => {
      expect(runPrefix(request)).toBe(`runs/browser-detection/${USER_ID}/2026/10/13/${TASK_ID}`)
      expect(RUN_PREFIX_PATTERN.test(runPrefix(request))).toBe(true)
   })

   it('should use the UTC date of the request, whatever time zone the machine is in', () => {
      expect(
         runPrefix({
            ...request,
            requested_at: '2026-01-02T00:00:00.000Z',
         })
      ).toContain('/2026/01/02/')
   })

   it('should give the same folder on a redelivery, even after midnight', () => {
      expect(runPrefix(request)).toBe(runPrefix({ ...request }))
   })

   it.each([
      ['a task name that is a path', { task: '../x' }],
      ['a user id that is a path', { user_id: 'a/b' }],
      ['a task id that is not a uuid', { task_id: '../..' }],
      ['a date that is not a date', { requested_at: 'soon' }],
   ])('should refuse %s', (_name, patch) => {
      expect(() =>
         runPrefix({
            ...request,
            ...patch,
         })
      ).toThrow()
   })
})

describe('artifactPathUnder', () => {
   const prefix = `runs/browser-detection/${USER_ID}/2026/10/13/${TASK_ID}`

   it.each([
      `${prefix}/video.webm`,
      `${prefix}/manifest.json`,
      `${prefix}/screenshots/01-goto.png`,
      `${prefix}/files/page.html`,
   ])('should accept %s', path => {
      expect(artifactPathUnder(prefix, path)).toBe(true)
   })

   it.each([
      ['another user', `runs/browser-detection/someone-else/2026/10/13/${TASK_ID}/video.webm`],
      ['a sibling prefix', `${prefix}-2/video.webm`],
      ['a climb out of the folder', `${prefix}/../x/video.webm`],
      ['a folder it does not allow', `${prefix}/other/video.webm`],
      ['a nested folder', `${prefix}/files/a/b.txt`],
      ['the folder itself', prefix],
      ['an empty name', `${prefix}/`],
   ])('should refuse %s', (_name, path) => {
      expect(artifactPathUnder(prefix, path)).toBe(false)
   })
})

describe('task topology', () => {
   it('should declare the run queue with a dead letter, a results queue and a latest-wins catalog queue', async () => {
      const calls: Array<[string, string, object | undefined]> = []
      const channel = {
         assertExchange: async () => undefined,
         assertQueue: async (queue: string, options?: object) => {
            calls.push(['queue', queue, options])
         },
         bindQueue: async (queue: string, _exchange: string, key: string) => {
            calls.push(['bind', queue, { key }])
         },
      }

      await assertAccountTopology(channel)

      const queues = calls.filter(([type]) => type === 'queue').map(([, name]) => name)

      expect(queues).toEqual(expect.arrayContaining([TASK_QUEUE, TASK_DEAD_QUEUE, TASK_DONE_QUEUE, TASK_CATALOG_QUEUE]))
      expect(calls).toContainEqual(['bind', TASK_QUEUE, { key: TASK_KEY }])
      expect(calls).toContainEqual(['bind', TASK_DONE_QUEUE, { key: TASK_DONE_KEY }])
      expect(calls.find(([, name]) => name === TASK_CATALOG_QUEUE)?.[2]).toMatchObject({
         arguments: {
            'x-max-length': 1,
            'x-overflow': 'drop-head',
         },
      })
      expect(calls.find(([, name]) => name === TASK_QUEUE)?.[2]).toMatchObject({
         arguments: {
            'x-queue-type': 'quorum',
            'x-delivery-limit': 3,
         },
      })
   })
})
