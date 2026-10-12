import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CryptoService } from 'core'

import { type TaskCatalogEntry } from '@automatedLinkedIn/contracts'

import { LinkedInAccountValidationService } from './linkedInAccountValidation.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The broker is replaced: only what brain writes to the database is under test.
const mocks = vi.hoisted(() => ({ publish: vi.fn() }))

vi.mock('core', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('core')),
   TaskQueue: { publish: mocks.publish },
}))

const email = `${randomUUID()}@elitale.com`

const entry: TaskCatalogEntry = {
   contract: 1,
   task: 'linkedin-login',
   version: 1,
   title: 'LinkedIn sign-in check',
   description: 'Only for this test.',
   input_schema: { type: 'object' },
   needs: {
      proxy: 'required',
      account: true,
   },
   verdicts: {
      VALID: {
         label: 'Signed in',
         tone: 'success',
      },
   },
   policy: {
      cooldown_ms: 0,
      one_at_a_time: 'account',
   },
   hosts: ['www.linkedin.com'],
}

let userId: string
let accountId: string
let firstTaskId: string

const finished = (taskId: string, verdict: string) => ({
   contract: 1 as const,
   task_id: taskId,
   task: 'linkedin-login',
   task_version: 1,
   status: verdict === 'VALID' ? ('SUCCEEDED' as const) : ('FAILED' as const),
   verdict,
   message: verdict === 'VALID' ? 'Signed in to LinkedIn.' : 'LinkedIn did not accept the email or password.',
   artifacts: [],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: new Date().toISOString(),
   finished_at: new Date().toISOString(),
})

describe('the LinkedIn sign-in check (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{"password":"hunter2"}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: 'ada@work.com',
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
      await PrismaService.client.proxyServer.create({
         data: {
            linkedInAccountId: accountId,
            protocol: 'HTTP',
            host: '203.0.113.9',
            port: 8080,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status: 'ACTIVE',
            isPrimary: true,
         },
      })
      mocks.publish.mockResolvedValue(undefined)
      await TaskService.applyCatalog({
         contract: 1,
         announced_at: new Date().toISOString(),
         worker: { build: 'abc1234' },
         tasks: [entry],
      })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should queue the check with the account email and the sealed credentials, and wait for its own answer', async () => {
      await expect(LinkedInAccountValidationService.request(accountId)).resolves.toBe(true)

      const [[command]] = mocks.publish.mock.calls
      const account = await PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

      expect(command).toMatchObject({
         task: 'linkedin-login',
         account_id: accountId,
         account_email: 'ada@work.com',
         credentials: { key_version: 1 },
      })
      expect(account.validationId).toBe(command.task_id)

      firstTaskId = command.task_id
   })

   it('should ignore an answer to another check, then activate the account with its own, once', async () => {
      const taskId = firstTaskId

      await TaskService.applyResult(finished(randomUUID(), 'VALID'))
      await expect(
         PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })
      ).resolves.toMatchObject({ status: 'PENDING' })

      await expect(TaskService.applyResult(finished(taskId, 'VALID'))).resolves.toBe(true)
      await expect(TaskService.applyResult(finished(taskId, 'VALID'))).resolves.toBe(false)
      await expect(
         PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })
      ).resolves.toMatchObject({
         status: 'ACTIVE',
         validationId: null,
         statusMessage: null,
      })
   })

   it('should mark the account as needing attention when LinkedIn refuses the login', async () => {
      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { validationRequestedAt: new Date(Date.now() - 10 * 60_000) },
      })
      mocks.publish.mockResolvedValue(undefined)

      await expect(LinkedInAccountValidationService.verifyForUser(userId, accountId)).resolves.not.toBeNull()

      const taskId = mocks.publish.mock.calls[0][0].task_id as string

      await TaskService.applyResult(finished(taskId, 'INVALID_CREDENTIALS'))

      await expect(
         PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })
      ).resolves.toMatchObject({
         status: 'NEEDS_REAUTH',
         statusMessage: 'LinkedIn did not accept the email or password.',
      })
   })
})
