import {
   TAKEOVER_FRAME_QUEUE,
   TAKEOVER_FRAME_TTL_MS,
   TAKEOVER_INPUT_EXCHANGE,
   type TakeoverFrame,
   type TakeoverInput,
   assertTakeoverTopology,
   takeoverFrameSchema,
   takeoverInputSchema,
} from '@automatedLinkedIn/contracts'

import { MessageBroker } from './messageBroker'
import { consumeResults } from './resultConsumer'

type Log = { error: (message: string) => void }

// More than a person can do in a second; anything beyond is a script or a bug.
const MAX_INPUTS_PER_SECOND = 30

export class TakeoverRateError extends Error {
   public constructor() {
      super('Too many inputs at once. Slow down.')
      this.name = 'TakeoverRateError'
   }
}

type Held = { frame: TakeoverFrame; at: number }

// The go-between for human takeover (.plan/foxprofile-adoption.md, phase 4): the worker sends pictures of the page it holds,
// brain keeps the newest one of each run in memory and hands the owner's clicks and keys back. Nothing is stored: a picture
// is worth nothing a few seconds later, and brain runs one replica (a second one would need the pictures fanned out through
// the broker instead). Who may see a run is decided by the caller, never here.
export class TakeoverRelay {
   private static readonly held = new Map<string, Held>()

   private static readonly sent = new Map<string, number[]>()

   public static consume(log: Log = console) {
      return consumeResults(
         {
            queue: TAKEOVER_FRAME_QUEUE,
            noun: 'takeover picture',
            parse: content => takeoverFrameSchema.parse(JSON.parse(content)),
            topology: channel => assertTakeoverTopology(channel),
         },
         async frame => {
            this.hold(frame)
         },
         log
      )
   }

   public static hold(frame: TakeoverFrame, now = Date.now()) {
      const current = this.held.get(frame.task_id)

      // Pictures can overtake each other on the way; the older one must not replace a newer one.
      if (current && now - current.at < TAKEOVER_FRAME_TTL_MS && current.frame.seq > frame.seq) {
         return
      }

      this.held.set(frame.task_id, {
         frame,
         at: now,
      })
   }

   public static latest(taskId: string, now = Date.now()) {
      const found = this.held.get(taskId)

      if (!found || now - found.at > TAKEOVER_FRAME_TTL_MS) {
         return undefined
      }

      return found.frame
   }

   // The runs a worker is holding for their owner right now.
   public static heldIds(now = Date.now()) {
      return [...this.held.keys()].filter(id => this.latest(id, now))
   }

   public static release(taskId: string) {
      this.held.delete(taskId)
      this.sent.delete(taskId)
   }

   // The owner's input goes to the one worker waiting on the run; with nobody waiting the exchange drops it. What was
   // typed is never logged.
   public static async send(taskId: string, input: TakeoverInput, now = Date.now()) {
      const valid = takeoverInputSchema.parse(input)
      const recent = (this.sent.get(taskId) ?? []).filter(at => now - at < 1000)

      if (recent.length >= MAX_INPUTS_PER_SECOND) {
         throw new TakeoverRateError()
      }

      this.sent.set(taskId, [...recent, now])

      const channel = await MessageBroker.confirmChannel()

      await assertTakeoverTopology(channel)

      channel.publish(TAKEOVER_INPUT_EXCHANGE, taskId, Buffer.from(JSON.stringify(valid)), {
         persistent: false,
         contentType: 'application/json',
         expiration: String(TAKEOVER_FRAME_TTL_MS),
      })

      await channel.waitForConfirms()
   }

   public static reset() {
      this.held.clear()
      this.sent.clear()
   }
}
