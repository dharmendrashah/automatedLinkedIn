import { z } from 'zod'

import { EXCHANGE, type TopologyChannel } from './topology'

// Human takeover (.plan/foxprofile-adoption.md, phase 4): while a run waits for its owner, the worker sends a small picture of
// the page and takes the owner's clicks and keys back, both through brain, so no browser is ever reached directly.
export const TAKEOVER_FRAME_QUEUE = 'takeover.frames'
export const TAKEOVER_FRAME_KEY = 'takeover.frame'
// A direct exchange: the routing key is the task id, and only the worker waiting on that run has a queue bound to it.
export const TAKEOVER_INPUT_EXCHANGE = 'takeover.input'

// How long a run holds its browser and the account for the owner.
export const TAKEOVER_LIMIT_MS = 10 * 60 * 1000

// A picture older than this is a worker that stopped waiting.
export const TAKEOVER_FRAME_TTL_MS = 15_000

export const TAKEOVER_KEYS = [
   'Enter',
   'Tab',
   'Backspace',
   'Delete',
   'Escape',
   'ArrowUp',
   'ArrowDown',
   'ArrowLeft',
   'ArrowRight',
] as const

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

export const takeoverFrameSchema = z.strictObject({
   contract: z.literal(1),
   task_id: z.uuid(),
   seq: z.number().int().min(0),
   // The size of the page the picture shows, so a click can be sent as a fraction of it.
   width: z.number().int().min(1).max(4000),
   height: z.number().int().min(1).max(4000),
   jpeg: z.string().max(600_000).regex(BASE64_PATTERN),
   // When the worker stops waiting for the owner.
   expires_at: z.iso.datetime(),
})

// What the owner can do. Nothing here runs code in the page: a click, text, a key from a short list, a scroll.
export const takeoverInputSchema = z.discriminatedUnion('kind', [
   z.strictObject({
      kind: z.literal('click'),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
   }),
   z.strictObject({
      kind: z.literal('type'),
      text: z.string().min(1).max(200),
   }),
   z.strictObject({
      kind: z.literal('key'),
      key: z.enum(TAKEOVER_KEYS),
   }),
   z.strictObject({
      kind: z.literal('scroll'),
      dy: z.number().int().min(-1500).max(1500),
   }),
   // The owner finished the check; the run looks again whether it passed.
   z.strictObject({ kind: z.literal('done') }),
   // The owner leaves it; the run ends with the answer it had.
   z.strictObject({ kind: z.literal('give_up') }),
])

export type TakeoverFrame = z.infer<typeof takeoverFrameSchema>
export type TakeoverInput = z.infer<typeof takeoverInputSchema>

// Idempotent: both apps declare it, so either can start first. The queue is durable because RabbitMQ 4 no longer permits
// transient queues that are not exclusive; its messages are not, and expire in seconds, so a restart loses only pictures.
// The input exchange keeps nothing: an input with nobody waiting is dropped.
export const assertTakeoverTopology = async (channel: TopologyChannel) => {
   await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
   await channel.assertQueue(TAKEOVER_FRAME_QUEUE, {
      durable: true,
      arguments: {
         'x-message-ttl': TAKEOVER_FRAME_TTL_MS,
         'x-max-length': 50,
         'x-overflow': 'drop-head',
      },
   })
   await channel.bindQueue(TAKEOVER_FRAME_QUEUE, EXCHANGE, TAKEOVER_FRAME_KEY)
   await channel.assertExchange(TAKEOVER_INPUT_EXCHANGE, 'direct', { durable: false })
}
