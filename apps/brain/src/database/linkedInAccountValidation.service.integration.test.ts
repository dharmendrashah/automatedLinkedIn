import { type Channel } from 'amqplib'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AccountValidationQueue, MessageBroker } from 'core'

import {
   EXCHANGE,
   VALIDATED_KEY,
   VALIDATED_QUEUE,
   VALIDATE_QUEUE,
   type ValidateAccountCommand,
   assertAccountTopology,
} from '@automatedLinkedIn/contracts'

import { LinkedInAccountService } from './linkedInAccount.service'
import { LinkedInAccountValidationService } from './linkedInAccountValidation.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL and a RabbitMQ with no spider worker running (the worker would take the tasks).

const email = `${randomUUID()}@elitale.com`

let channel: Channel
let userId: string

const accountRow = (id: string) => PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id } })

const newAccount = async (linkedInEmail: string) => {
   const { id } = await LinkedInAccountService.create(userId, linkedInEmail, { password: 'hunter2' })

   return id
}

const nextValidation = async () => {
   const deadline = Date.now() + 10_000

   while (Date.now() < deadline) {
      const message = await channel.get(VALIDATE_QUEUE, { noAck: true })

      if (message) {
         return JSON.parse(message.content.toString()) as ValidateAccountCommand
      }

      await new Promise(resolve => setTimeout(resolve, 100))
   }

   throw new Error(`Nothing arrived in ${VALIDATE_QUEUE}`)
}

const resultFor = (accountId: string, validationId: string, outcome: 'VALID' | 'ERROR' = 'VALID') => ({
   validation_id: validationId,
   account_id: accountId,
   outcome,
   message: outcome === 'VALID' ? 'Signed in' : 'Verification could not run, try again',
   checked_at: new Date().toISOString(),
})

describe('LinkedInAccountValidationService (database and broker)', () => {
   beforeAll(async () => {
      channel = await MessageBroker.channel()
      await assertAccountTopology(channel)
      await channel.purgeQueue(VALIDATE_QUEUE)
      await channel.purgeQueue(VALIDATED_QUEUE)

      userId = (await UserService.create({ email })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })

      await Promise.all([PrismaService.disconnect(), MessageBroker.disconnect()])
   })

   it('should queue the sealed secrets as stored, tagged with the validation the account is now waiting for', async () => {
      const id = await newAccount('queue@work.com')

      await expect(LinkedInAccountValidationService.request(id)).resolves.toBe(true)

      const command = await nextValidation()
      const row = await accountRow(id)

      expect(command).toEqual({
         validation_id: row.validationId,
         account_id: id,
         email: 'queue@work.com',
         sealed: {
            ciphertext: row.secret,
            iv: row.secretIv,
            tag: row.secretTag,
            key_version: row.keyVersion,
         },
         requested_at: row.validationRequestedAt?.toISOString(),
      })
      expect(JSON.stringify(command)).not.toContain('hunter2')
   })

   it('should apply a result once, make the account ACTIVE, and ignore a repeat or a result for another validation', async () => {
      const id = await newAccount('apply@work.com')

      await LinkedInAccountValidationService.request(id)

      const { validation_id: validationId } = await nextValidation()

      await expect(LinkedInAccountValidationService.applyResult(resultFor(id, randomUUID()))).resolves.toBe(false)
      expect((await accountRow(id)).status).toBe('PENDING')

      await expect(LinkedInAccountValidationService.applyResult(resultFor(id, validationId))).resolves.toBe(true)

      const row = await accountRow(id)

      expect(row).toMatchObject({
         status: 'ACTIVE',
         statusMessage: null,
         validationId: null,
      })
      expect(row.lastVerifiedAt).toBeInstanceOf(Date)

      await expect(LinkedInAccountValidationService.applyResult(resultFor(id, validationId, 'ERROR'))).resolves.toBe(
         false
      )
      expect((await accountRow(id)).status).toBe('ACTIVE')
   })

   it('should record a failed validation with its message', async () => {
      const id = await newAccount('failed@work.com')

      await LinkedInAccountValidationService.request(id)

      const { validation_id: validationId } = await nextValidation()

      await LinkedInAccountValidationService.applyResult(resultFor(id, validationId, 'ERROR'))

      expect(await accountRow(id)).toMatchObject({
         status: 'ERROR',
         statusMessage: 'Verification could not run, try again',
      })
   })

   it('should not queue anything for a paused account, and never let a result un-pause it', async () => {
      const id = await newAccount('paused@work.com')

      await LinkedInAccountService.setPausedForUser(userId, id, true)

      await expect(LinkedInAccountValidationService.request(id)).resolves.toBe(false)

      // A result that raced with the pause: the account has to be waiting for it and not be paused.
      await PrismaService.client.linkedInAccount.update({
         where: { id },
         data: { validationId: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11' },
      })

      await expect(
         LinkedInAccountValidationService.applyResult(resultFor(id, '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'))
      ).resolves.toBe(false)
      expect((await accountRow(id)).status).toBe('DISABLED')
   })

   it('should apply a result that arrives on the queue, through the consumer', async () => {
      const id = await newAccount('consumed@work.com')

      await LinkedInAccountValidationService.request(id)

      const { validation_id: validationId } = await nextValidation()
      const consumer = await AccountValidationQueue.consume(async result => {
         await LinkedInAccountValidationService.applyResult(result)
      })

      const body = Buffer.from(JSON.stringify(resultFor(id, validationId)))

      channel.publish(EXCHANGE, VALIDATED_KEY, body, { persistent: true })

      const deadline = Date.now() + 10_000

      while (Date.now() < deadline && (await accountRow(id)).status !== 'ACTIVE') {
         await new Promise(resolve => setTimeout(resolve, 100))
      }

      await consumer.stop()

      expect((await accountRow(id)).status).toBe('ACTIVE')
   })
})
