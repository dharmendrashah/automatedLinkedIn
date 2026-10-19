import { describe, expect, it, vi } from 'vitest'

import { type InspectedElement } from '../scraping/driver'
import { type Hands } from './hands'
import { type Pace, createReader } from './reader'

const pace: Pace = {
   down: [300, 300],
   up: [100, 100],
   read: [1000, 1000],
   glance: [2000, 2000],
   linger: [4000, 4000],
}

const setup = (random: () => number = () => 0, advance = true) => {
   let time = 0
   const hands = {
      scrollBy: vi.fn(async (_pixels: number) => true),
      clickSelector: vi.fn(async (_selector: string) => true),
      hover: vi.fn(async (_x: number, _y: number) => undefined),
      drift: vi.fn(async () => undefined),
   }
   const reader = createReader({
      hands: hands as unknown as Hands,
      pause: async ms => {
         time += advance ? ms : 0
      },
      random,
      now: () => time,
      pace,
   })

   return {
      hands,
      reader,
   }
}

const at = (y: number) =>
   ({
      box: {
         x: 100,
         y,
         width: 80,
         height: 20,
      },
   }) as InspectedElement

describe('createReader', () => {
   it('should stay about as long as asked, in small moves', async () => {
      const { hands, reader } = setup()

      await reader.dwell([10_000, 10_000])

      expect(reader.elapsed()).toBeGreaterThanOrEqual(10_000)
      expect(hands.scrollBy).toHaveBeenCalledWith(300)
   })

   it('should open the "more" of a text once and not again', async () => {
      const { hands, reader } = setup()

      await reader.dwell([60_000, 60_000], '.more')

      expect(hands.clickSelector).toHaveBeenCalledTimes(1)
      expect(hands.clickSelector).toHaveBeenCalledWith('.more')
   })

   it('should not click anything when no "more" control was named', async () => {
      const { hands, reader } = setup()

      await reader.dwell([20_000, 20_000])

      expect(hands.clickSelector).not.toHaveBeenCalled()
   })

   it('should stop after a bounded number of moves when time does not pass', async () => {
      const { hands, reader } = setup(() => 0, false)

      await reader.dwell([10_000, 10_000])

      expect(hands.scrollBy).toHaveBeenCalledTimes(120)
   })

   it('should scroll toward the nearest element, at least 150 and at most 900 px, up or down', async () => {
      const { hands, reader } = setup()

      // The goal is 35% of a window 720 px high: 252.
      await reader.scrollToward([at(300), at(5000)], 720)
      await reader.scrollToward([at(5000)], 720)
      await reader.scrollToward([at(-2000), at(5000)], 720)
      await reader.scrollToward([at(-100)], 720)

      expect(hands.scrollBy.mock.calls.map(([pixels]) => pixels)).toEqual([150, 900, -900, -352])
   })

   it('should go on down the page when there is nothing to scroll toward', async () => {
      const { hands, reader } = setup()

      await reader.scrollToward([undefined], 720)

      expect(hands.scrollBy).toHaveBeenCalledWith(500)
   })

   it('should scroll one reading step up or down', async () => {
      const { hands, reader } = setup()

      await reader.scrollPage('up')
      await reader.scrollPage('down')

      expect(hands.scrollBy.mock.calls.map(([pixels]) => pixels)).toEqual([-300, 300])
   })

   it('should rest the pointer on the middle of an element', async () => {
      const { hands, reader } = setup()

      await reader.rest(at(200))

      expect(hands.hover).toHaveBeenCalledWith(140, 210)
   })
})
