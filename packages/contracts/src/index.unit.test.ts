import { describe, expect, it, vi } from 'vitest'

import {
   DEAD_EXCHANGE,
   EXCHANGE,
   VALIDATED_KEY,
   VALIDATED_QUEUE,
   VALIDATE_DEAD_QUEUE,
   VALIDATE_KEY,
   VALIDATE_QUEUE,
   accountIdSchema,
   assertAccountTopology,
   validateAccountCommandSchema,
   validateAccountResultSchema,
} from './index'

const sealed = {
   ciphertext: 'Y2lwaGVy',
   iv: 'aXY=',
   tag: 'dGFn',
   key_version: 1,
}

const command = {
   validation_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   account_id: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
   email: 'ada@example.com',
   sealed,
   requested_at: '2026-10-12T10:00:00.000Z',
}

const result = {
   validation_id: command.validation_id,
   account_id: command.account_id,
   outcome: 'VALID',
   message: 'Signed in',
   checked_at: '2026-10-12T10:00:05.000Z',
}

describe('accountIdSchema', () => {
   it.each(['0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b', 'acc1', 'a.b_c-d'])('should accept %s', id => {
      expect(accountIdSchema.safeParse(id).success).toBe(true)
   })

   it.each(['', '.', '..', '../x', 'a/b', '-lead', 'a b', 'a'.repeat(101)])('should reject %j', id => {
      expect(accountIdSchema.safeParse(id).success).toBe(false)
   })
})

describe('validateAccountCommandSchema', () => {
   it('should accept a command with a sealed bundle', () => {
      expect(validateAccountCommandSchema.parse(command)).toEqual(command)
   })

   it('should accept an optional proxy, and reject a proxy with an unsupported scheme', () => {
      const proxy = {
         server: 'socks5://proxy.example.net:1080',
         username: 'alice',
         password: 'hunter2',
      }

      expect(
         validateAccountCommandSchema.parse({
            ...command,
            proxy,
         }).proxy
      ).toEqual(proxy)
      expect(validateAccountCommandSchema.parse(command).proxy).toBeUndefined()
      expect(
         validateAccountCommandSchema.safeParse({
            ...command,
            proxy: { server: 'ftp://proxy.example.net' },
         }).success
      ).toBe(false)
   })

   it.each([
      [
         'a validation id that is not a uuid',
         {
            ...command,
            validation_id: 'abc',
         },
      ],
      [
         'an unsafe account id',
         {
            ...command,
            account_id: '../x',
         },
      ],
      [
         'an empty email',
         {
            ...command,
            email: '',
         },
      ],
      [
         'a bundle without a tag',
         {
            ...command,
            sealed: {
               ...sealed,
               tag: undefined,
            },
         },
      ],
      [
         'an unknown key',
         {
            ...command,
            password: 'plaintext',
         },
      ],
      [
         'a bad timestamp',
         {
            ...command,
            requested_at: 'yesterday',
         },
      ],
   ])('should reject %s', (_name, input) => {
      expect(validateAccountCommandSchema.safeParse(input).success).toBe(false)
   })

   it('should not put the sealed bundle in the error', () => {
      const parsed = validateAccountCommandSchema.safeParse({
         ...command,
         sealed: {
            ...sealed,
            ciphertext: 'TOPSECRETBLOB',
            key_version: 'x',
         },
      })

      expect(parsed.success).toBe(false)
      expect(JSON.stringify(parsed.error?.issues)).not.toContain('TOPSECRETBLOB')
   })
})

describe('validateAccountResultSchema', () => {
   it('should accept a result, with or without a session path', () => {
      expect(validateAccountResultSchema.parse(result)).toEqual(result)
      expect(
         validateAccountResultSchema.parse({
            ...result,
            session_storage_path: 'sessions/acc1/state.json',
         }).session_storage_path
      ).toBe('sessions/acc1/state.json')
   })

   it.each(['VALID', 'INVALID_CREDENTIALS', 'NEEDS_REAUTH', 'ERROR'])('should accept the outcome %s', outcome => {
      expect(
         validateAccountResultSchema.safeParse({
            ...result,
            outcome,
         }).success
      ).toBe(true)
   })

   it.each([
      [
         'an unknown outcome',
         {
            ...result,
            outcome: 'MAYBE',
         },
      ],
      [
         'a message that is too long',
         {
            ...result,
            message: 'x'.repeat(201),
         },
      ],
      [
         'an unknown key',
         {
            ...result,
            cookies: [],
         },
      ],
      [
         'an unsafe account id',
         {
            ...result,
            account_id: 'a/b',
         },
      ],
   ])('should reject %s', (_name, input) => {
      expect(validateAccountResultSchema.safeParse(input).success).toBe(false)
   })
})

describe('assertAccountTopology', () => {
   const setup = () => ({
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
   })

   it('should declare the exchanges so either side can start first', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.assertExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true })
      expect(channel.assertExchange).toHaveBeenCalledWith(DEAD_EXCHANGE, 'direct', { durable: true })
   })

   it('should declare a dead-lettered quorum queue for tasks and a durable queue for results', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.assertQueue).toHaveBeenCalledWith(
         VALIDATE_QUEUE,
         expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({
               'x-queue-type': 'quorum',
               'x-dead-letter-exchange': DEAD_EXCHANGE,
            }),
         })
      )
      expect(channel.assertQueue).toHaveBeenCalledWith(VALIDATE_DEAD_QUEUE, { durable: true })
      expect(channel.assertQueue).toHaveBeenCalledWith(
         VALIDATED_QUEUE,
         expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({ 'x-message-ttl': expect.any(Number) }),
         })
      )
   })

   it('should bind each queue to its routing key', async () => {
      const channel = setup()

      await assertAccountTopology(channel)

      expect(channel.bindQueue).toHaveBeenCalledWith(VALIDATE_QUEUE, EXCHANGE, VALIDATE_KEY)
      expect(channel.bindQueue).toHaveBeenCalledWith(VALIDATE_DEAD_QUEUE, DEAD_EXCHANGE, VALIDATE_KEY)
      expect(channel.bindQueue).toHaveBeenCalledWith(VALIDATED_QUEUE, EXCHANGE, VALIDATED_KEY)
   })

   it('should be safe to run twice, with the same arguments both times', async () => {
      const channel = setup()

      await assertAccountTopology(channel)
      await assertAccountTopology(channel)

      const [first, second] = channel.assertQueue.mock.calls.filter(([name]) => name === VALIDATE_QUEUE)

      expect(first).toEqual(second)
   })
})
