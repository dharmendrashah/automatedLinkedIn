import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskCatalogEntry, runPrefix } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { ProxyServerOwnershipError } from './proxyServer.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The broker is replaced: only what brain writes to the database is under test.
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock('core', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('core')),
   TaskQueue: { publish: mocks.publish },
}))

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const TASK = `it-${randomUUID().slice(0, 8)}`

const entry: TaskCatalogEntry = {
   contract: 1,
   task: TASK,
   version: 1,
   title: 'Integration task',
   description: 'Only for this test.',
   input_schema: { type: 'object' },
   needs: {
      proxy: 'required',
      account: false,
   },
   verdicts: {
      FINE: {
         label: 'Fine',
         tone: 'success',
      },
   },
   policy: {
      cooldown_ms: 5 * 60_000,
      one_at_a_time: 'proxy',
      automatic: [{ on: 'proxy.active', every_ms: 24 * 3600_000 }],
   },
   hosts: ['example.com'],
}

let userId: string
let otherUserId: string
let proxyId: string

describe('TaskService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id

      const sealed = CryptoService.seal('{}')
      const account = await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: 'ada@work.com',
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
         },
      })

      proxyId = (
         await PrismaService.client.proxyServer.create({
            data: {
               linkedInAccountId: account.id,
               protocol: 'HTTP',
               host: '203.0.113.5',
               port: 8080,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               status: 'ACTIVE',
            },
         })
      ).id
      mocks.publish.mockResolvedValue(undefined)
      await TaskService.applyCatalog({
         contract: 1,
         announced_at: new Date().toISOString(),
         worker: { build: 'abc1234' },
         tasks: [entry],
      })
   })

   afterAll(async () => {
      await PrismaService.client.taskDefinition.deleteMany({ where: { task: TASK } })
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should know the announced task and list it in the catalog', async () => {
      const catalog = await TaskService.catalog()

      expect(catalog.find(task => task.task === TASK)).toMatchObject({
         title: 'Integration task',
         version: 1,
      })
   })

   it('should save an in-progress session for the proxy, queue the command, then refuse a second one at once', async () => {
      const { id } = await TaskService.request({
         userId,
         task: TASK,
         proxyId,
         input: { word: 'hello' },
         trigger: 'manual',
      })
      const session = await PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })

      expect(session).toMatchObject({
         kind: 'TASK',
         status: 'IN_PROGRESS',
         task: TASK,
         taskVersion: 1,
         trigger: 'manual',
         userId,
         proxyServerId: proxyId,
         requestParams: {
            action: 'TASK',
            input: { word: 'hello' },
            proxy: 'http://203.0.113.5:8080',
         },
      })
      expect(mocks.publish).toHaveBeenCalledWith(
         expect.objectContaining({
            task: TASK,
            task_id: id,
            user_id: userId,
            // The worker writes under the folder of this time, so it must be the one stored.
            requested_at: session.startedAt.toISOString(),
         })
      )

      await expect(TaskService.request({ userId, task: TASK, proxyId, trigger: 'manual' })).rejects.toThrow(
         'already running'
      )
   })

   it('should keep the verdict, the report and only the files inside the run folder, once', async () => {
      const sealed = CryptoService.seal('{}')
      const secondProxy = (
         await PrismaService.client.proxyServer.create({
            data: {
               linkedInAccountId: (await PrismaService.client.linkedInAccount.findFirstOrThrow({ where: { userId } })).id,
               protocol: 'HTTP',
               host: '203.0.113.6',
               port: 8080,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               status: 'ACTIVE',
            },
         })
      ).id
      const { id } = await TaskService.request({ userId, task: TASK, proxyId: secondProxy, trigger: 'manual' })
      const session = await PrismaService.client.spiderSession.findUniqueOrThrow({ where: { id } })
      const folder = runPrefix({
         task: TASK,
         user_id: userId,
         requested_at: session.startedAt.toISOString(),
         task_id: id,
      })
      const result = {
         contract: 1 as const,
         task_id: id,
         task: TASK,
         task_version: 1,
         status: 'SUCCEEDED' as const,
         verdict: 'FINE',
         message: 'All good.',
         report: {
            headline: 'Fine',
            sections: [],
         },
         artifacts: [
            {
               kind: 'video' as const,
               name: 'video.webm',
               path: `${folder}/video.webm`,
               content_type: 'video/webm',
               bytes: 10,
            },
            {
               kind: 'screenshot' as const,
               name: 'stolen.png',
               path: `runs/${TASK}/${otherUserId}/2026/10/13/${id}/stolen.png`,
               content_type: 'image/png',
               bytes: 1,
            },
         ],
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: session.startedAt.toISOString(),
         finished_at: new Date().toISOString(),
      }

      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(TaskService.applyResult(result)).resolves.toBe(true)
      await expect(TaskService.applyResult(result)).resolves.toBe(false)

      const finished = await SpiderSessionService.getForUser(userId, id)

      expect(finished).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'FINE',
         outcome: 'FINE',
         workerBuild: 'abc1234',
         hasRecording: true,
         report: { headline: 'Fine' },
      })
      expect(finished.artifacts.map(file => file.name)).toEqual(['video.webm'])
      expect(JSON.stringify(finished)).not.toContain('runs/')

      const [file] = finished.artifacts

      await expect(SpiderSessionService.artifactKey(userId, id, file.id)).resolves.toBe(`${folder}/video.webm`)
      await expect(SpiderSessionService.artifactKey(otherUserId, id, file.id)).rejects.toThrow('Session not found')
   })

   it("should not test someone else's proxy", async () => {
      await expect(TaskService.request({ userId: otherUserId, task: TASK, proxyId, trigger: 'manual' })).rejects.toBeInstanceOf(
         ProxyServerOwnershipError
      )
   })

   it('should start the tasks that listen to a working proxy, but not twice in a day', async () => {
      await expect(TaskService.emit('proxy.active', { proxyId })).resolves.toBeGreaterThanOrEqual(0)
      await expect(TaskService.emit('proxy.active', { proxyId })).resolves.toBe(0)
   })
})
