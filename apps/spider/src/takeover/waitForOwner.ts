import { TAKEOVER_LIMIT_MS, type TakeoverFrame, type TakeoverInput } from '@automatedLinkedIn/contracts'

import { type SessionControl } from '../scraping/driver'

export type TakeoverChannel = {
   publishFrame: (frame: TakeoverFrame) => Promise<void>
   // Takes the owner's inputs for this run until `stop` is called.
   listen: (taskId: string, onInput: (input: TakeoverInput) => void) => Promise<{ stop: () => Promise<void> }>
}

export type Handover = 'done' | 'gave_up' | 'timed_out'

type Options = {
   limitMs?: number
   // One picture is a lot of bytes: at most this often while the owner only looks...
   frameEveryMs?: number
   // ...and this often for a few seconds after they did something, which is when they wait for the page to answer.
   activeEveryMs?: number
   activeForMs?: number
   // A picture identical to the last one is not sent again, except this often, so brain keeps listing the run.
   keepAliveMs?: number
   tickMs?: number
   now?: () => number
   pause?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const apply = (control: SessionControl, input: TakeoverInput) => {
   switch (input.kind) {
      case 'click':
         return control.click(input.x, input.y)
      case 'type':
         return control.type(input.text)
      case 'key':
         return control.press(input.key)
      case 'scroll':
         return control.scroll(input.dy)
      default:
         return Promise.resolve()
   }
}

// Holds the browser for the owner: shows them the page and does what they ask, until they say done, give up, or the time is
// up. What they type is never written down here; it goes from the owner to the page and nowhere else. A picture or an input
// that fails is skipped, because the page may be loading and the next one will do.
export const waitForOwner = async (
   taskId: string,
   control: SessionControl,
   channel: TakeoverChannel,
   {
      limitMs = TAKEOVER_LIMIT_MS,
      frameEveryMs = 700,
      activeEveryMs = 250,
      activeForMs = 4000,
      keepAliveMs = 5000,
      tickMs = 100,
      now = Date.now,
      pause = wait,
   }: Options = {}
): Promise<Handover> => {
   const pending: TakeoverInput[] = []
   const listener = await channel.listen(taskId, input => pending.push(input))
   const deadline = now() + limitMs
   let seq = 0
   let lastFrame = Number.NEGATIVE_INFINITY
   let lastInput = Number.NEGATIVE_INFINITY
   let lastSent = Number.NEGATIVE_INFINITY
   let lastJpeg: Buffer | undefined

   const sendFrame = async () => {
      lastFrame = now()

      try {
         const { jpeg, width, height } = await control.frame()

         if (lastJpeg?.equals(jpeg) && now() - lastSent < keepAliveMs) {
            return
         }

         await channel.publishFrame({
            contract: 1,
            task_id: taskId,
            seq,
            width,
            height,
            jpeg: jpeg.toString('base64'),
            taken_at: new Date(now()).toISOString(),
            expires_at: new Date(deadline).toISOString(),
         })
         lastJpeg = jpeg
         lastSent = now()
         seq += 1
      } catch {
         // The next picture replaces it.
      }
   }

   try {
      while (now() < deadline) {
         let acted = false

         for (const input of pending.splice(0)) {
            if (input.kind === 'done') {
               return 'done'
            }

            if (input.kind === 'give_up') {
               return 'gave_up'
            }

            await apply(control, input).catch(() => undefined)
            acted = true
            lastInput = now()
         }

         if (acted) {
            // Gives the page a moment to react before it is shown.
            await pause(tickMs)
         }

         const gap = now() - lastInput < activeForMs ? activeEveryMs : frameEveryMs

         if (acted || now() - lastFrame >= gap) {
            await sendFrame()
         }

         await pause(tickMs)
      }

      return 'timed_out'
   } finally {
      await listener.stop().catch(() => undefined)
   }
}
