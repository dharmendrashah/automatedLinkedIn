import { describe, expect, it, vi } from 'vitest'

import { type TakeoverFrame, type TakeoverInput } from '@automatedLinkedIn/contracts'

import { type SessionControl } from '../scraping/driver'
import { waitForOwner } from './waitForOwner'

const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

const setup = (script: Array<TakeoverInput[]> = []) => {
   let clock = Date.parse('2026-10-15T10:00:00.000Z')
   let handler: ((input: TakeoverInput) => void) | undefined
   const frames: TakeoverFrame[] = []
   let taken = 0
   const control = {
      // Each picture differs from the last, as a page that is changing would.
      frame: vi.fn(async () => {
         taken += 1

         return {
            jpeg: Buffer.from(`jpeg${taken}`),
            width: 1280,
            height: 720,
         }
      }),
      click: vi.fn(async (_x: number, _y: number) => undefined),
      type: vi.fn(async (_text: string) => undefined),
      press: vi.fn(async (_key: string) => undefined),
      scroll: vi.fn(async (_dy: number) => undefined),
   } satisfies SessionControl
   const stop = vi.fn(async () => undefined)
   const channel = {
      publishFrame: vi.fn(async (frame: TakeoverFrame) => {
         frames.push(frame)
      }),
      listen: vi.fn(async (_id: string, onInput: (input: TakeoverInput) => void) => {
         handler = onInput

         return { stop }
      }),
   }
   // Each pause is one tick of the clock; the owner's inputs for that tick arrive during it.
   const pause = vi.fn(async (ms: number) => {
      clock += ms

      for (const input of script.shift() ?? []) {
         handler?.(input)
      }
   })

   return {
      control,
      channel,
      frames,
      stop,
      pause,
      run: (limitMs = 10_000) =>
         waitForOwner(TASK_ID, control, channel, {
            limitMs,
            frameEveryMs: 700,
            tickMs: 100,
            now: () => clock,
            pause,
         }),
   }
}

describe('waitForOwner', () => {
   it('should send a picture of the page while it waits, and say when it stops waiting', async () => {
      const { run, frames } = setup()

      await run(3000)

      expect(frames.length).toBeGreaterThan(1)
      expect(frames[0]).toMatchObject({
         contract: 1,
         task_id: TASK_ID,
         seq: 0,
         width: 1280,
         height: 720,
         jpeg: Buffer.from('jpeg1').toString('base64'),
         taken_at: '2026-10-15T10:00:00.000Z',
         expires_at: '2026-10-15T10:00:03.000Z',
      })
      expect(frames[1]?.seq).toBe(1)
   })

   it('should not send a picture on every tick, since each one is a lot of bytes', async () => {
      const { run, frames } = setup()

      await run(2000)

      // 20 ticks of 100 ms, one picture every 700 ms.
      expect(frames.length).toBeLessThanOrEqual(4)
   })

   it('should answer timed_out when nobody came, and let the broker queue go', async () => {
      const { run, stop } = setup()

      await expect(run(2000)).resolves.toBe('timed_out')
      expect(stop).toHaveBeenCalledTimes(1)
   })

   it("should carry out the owner's clicks, text, keys and scrolls in the page", async () => {
      const { run, control } = setup([
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
               text: '123456',
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
      ])

      await expect(run()).resolves.toBe('done')
      expect(control.click).toHaveBeenCalledWith(0.5, 0.25)
      expect(control.type).toHaveBeenCalledWith('123456')
      expect(control.press).toHaveBeenCalledWith('Enter')
      expect(control.scroll).toHaveBeenCalledWith(300)
   })

   it('should answer gave_up when the owner leaves it', async () => {
      const { run, stop } = setup([[{ kind: 'give_up' }]])

      await expect(run()).resolves.toBe('gave_up')
      expect(stop).toHaveBeenCalledTimes(1)
   })

   it('should do what the owner asked before it looks at done, in the order it came', async () => {
      const { run, control } = setup([
         [
            {
               kind: 'type',
               text: '1',
            },
            { kind: 'done' },
            {
               kind: 'type',
               text: '2',
            },
         ],
      ])

      await expect(run()).resolves.toBe('done')
      expect(control.type).toHaveBeenCalledTimes(1)
   })

   it('should keep waiting when a click fails, because the page may be loading', async () => {
      const { run, control } = setup([
         [
            {
               kind: 'click',
               x: 0.1,
               y: 0.1,
            },
         ],
         [{ kind: 'done' }],
      ])

      control.click.mockRejectedValueOnce(new Error('page navigating'))

      await expect(run()).resolves.toBe('done')
   })

   it('should keep waiting when a picture cannot be taken or sent', async () => {
      const { run, control, channel } = setup([[], [], [{ kind: 'done' }]])

      control.frame.mockRejectedValueOnce(new Error('page navigating'))
      channel.publishFrame.mockRejectedValueOnce(new Error('broker down'))

      await expect(run()).resolves.toBe('done')
   })

   it('should send a new picture soon after something the owner did, so the owner sees the effect', async () => {
      const { run, frames } = setup([
         [],
         [
            {
               kind: 'click',
               x: 0.5,
               y: 0.5,
            },
         ],
         [{ kind: 'done' }],
      ])

      await run()

      // Tick 0 sends the first picture; the click on tick 1 must be followed by another one well before 700 ms.
      expect(frames.length).toBeGreaterThanOrEqual(2)
   })

   it('should send pictures faster for a few seconds after the owner did something, then slow down again', async () => {
      const { run, frames } = setup([
         [],
         [
            {
               kind: 'click',
               x: 0.5,
               y: 0.5,
            },
         ],
      ])

      await run(9000)

      // 100 ms ticks: the picture after the click, then one every 250 ms for 4 s, then one every 700 ms.
      expect(frames.length).toBeGreaterThan(14)
      expect(frames.length).toBeLessThan(26)
   })

   it('should not send the same picture again, except now and then so brain keeps listing the run', async () => {
      const { run, frames, control } = setup()

      control.frame.mockResolvedValue({
         jpeg: Buffer.from('still'),
         width: 1280,
         height: 720,
      })

      await run(12_000)

      // One at the start, then one every 5 s while the page does not change.
      expect(frames.length).toBe(3)
      expect(frames.map(({ seq }) => seq)).toEqual([0, 1, 2])
   })

   it('should send a picture again as soon as the page changes', async () => {
      const { run, frames, control } = setup()

      control.frame
         .mockResolvedValueOnce({
            jpeg: Buffer.from('a'),
            width: 1280,
            height: 720,
         })
         .mockResolvedValueOnce({
            jpeg: Buffer.from('a'),
            width: 1280,
            height: 720,
         })
         .mockResolvedValue({
            jpeg: Buffer.from('b'),
            width: 1280,
            height: 720,
         })

      await run(3000)

      expect(frames.map(({ jpeg }) => Buffer.from(jpeg, 'base64').toString())).toEqual(['a', 'b'])
   })
})
