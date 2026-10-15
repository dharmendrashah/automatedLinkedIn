import { describe, expect, it, vi } from 'vitest'

import {
   TAKEOVER_FRAME_QUEUE,
   TAKEOVER_INPUT_EXCHANGE,
   TAKEOVER_KEYS,
   assertTakeoverTopology,
   takeoverFrameSchema,
   takeoverInputSchema,
} from './takeover'

const frame = {
   contract: 1,
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   seq: 3,
   width: 1280,
   height: 720,
   jpeg: '/9j/4AAQSkZJRg==',
   expires_at: '2026-10-15T10:10:00.000Z',
}

describe('assertTakeoverTopology', () => {
   it('should declare a short-lived picture queue and an input exchange that keeps nothing', async () => {
      const channel = {
         assertExchange: vi.fn(async () => undefined),
         assertQueue: vi.fn(async () => undefined),
         bindQueue: vi.fn(async () => undefined),
      }

      await assertTakeoverTopology(channel)

      // RabbitMQ 4 refuses a transient queue that is not exclusive, so the queue is durable and its messages expire.
      expect(channel.assertQueue).toHaveBeenCalledWith(
         TAKEOVER_FRAME_QUEUE,
         expect.objectContaining({
            durable: true,
            arguments: expect.objectContaining({ 'x-message-ttl': expect.any(Number) }),
         })
      )
      expect(channel.assertExchange).toHaveBeenCalledWith(TAKEOVER_INPUT_EXCHANGE, 'direct', { durable: false })
   })
})

describe('takeoverFrameSchema', () => {
   it('should accept a picture of the page with the time the worker stops waiting', () => {
      expect(takeoverFrameSchema.safeParse(frame).success).toBe(true)
   })

   it.each([
      ['an id that is not a task id', { task_id: '../etc' }],
      ['a page of no size', { width: 0 }],
      ['a picture that is not base64', { jpeg: 'not base64!' }],
      ['a picture too large to relay', { jpeg: 'A'.repeat(700_000) }],
      ['a field it does not know', { cookie: 'x' }],
   ])('should refuse %s', (_name, patch) => {
      expect(
         takeoverFrameSchema.safeParse({
            ...frame,
            ...patch,
         }).success
      ).toBe(false)
   })
})

describe('takeoverInputSchema', () => {
   it.each([
      [
         {
            kind: 'click',
            x: 0.5,
            y: 0.25,
         },
      ],
      [
         {
            kind: 'type',
            text: 'hello',
         },
      ],
      [
         {
            kind: 'key',
            key: 'Enter',
         },
      ],
      [
         {
            kind: 'scroll',
            dy: 300,
         },
      ],
      [{ kind: 'done' }],
      [{ kind: 'give_up' }],
   ])('should accept %j', input => {
      expect(takeoverInputSchema.safeParse(input).success).toBe(true)
   })

   it.each([
      [
         'a click outside the page',
         {
            kind: 'click',
            x: 1.5,
            y: 0.5,
         },
      ],
      [
         'text longer than a person types between two sends',
         {
            kind: 'type',
            text: 'x'.repeat(201),
         },
      ],
      [
         'empty text',
         {
            kind: 'type',
            text: '',
         },
      ],
      [
         'a key that is not on the list',
         {
            kind: 'key',
            key: 'F12',
         },
      ],
      [
         'a scroll of a whole page and more',
         {
            kind: 'scroll',
            dy: 5000,
         },
      ],
      [
         'a kind it does not know',
         {
            kind: 'evaluate',
            code: 'alert(1)',
         },
      ],
   ])('should refuse %s', (_name, input) => {
      expect(takeoverInputSchema.safeParse(input).success).toBe(false)
   })

   it('should only let the keys a form needs through', () => {
      expect([...TAKEOVER_KEYS]).toEqual(expect.arrayContaining(['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowDown']))
      expect(TAKEOVER_KEYS).not.toContain('F12')
   })
})
