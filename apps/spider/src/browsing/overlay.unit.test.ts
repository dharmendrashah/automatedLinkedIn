import { describe, expect, it, vi } from 'vitest'

import { type InspectedElement } from '../scraping/driver'
import { StepFailed } from './errors'
import { type Hands } from './hands'
import { createOverlay } from './overlay'

const trigger = {
   href: 'https://example.test/feed/',
   box: {
      x: 300,
      y: 400,
      width: 480,
      height: 300,
   },
} as InspectedElement

const spec = {
   open: 'dialog[open]',
   dismiss: 'dialog > button',
   avoid: 'button',
   says: {
      notClicked: 'not clicked',
      notOpened: 'not opened',
      notClosed: 'not closed',
   },
}

// A page whose window opens on a click and closes on the keys or buttons it answers to.
const setup = (page: { opens?: boolean; closesOn?: Array<'Escape' | 'dismiss'>; clicks?: boolean } = {}) => {
   const { opens = true, closesOn = ['Escape', 'dismiss'], clicks = true } = page
   let windowOpen = false
   const hands = {
      clickInside: vi.fn(async () => {
         windowOpen = opens

         return clicks
      }),
      inspect: vi.fn(async () => ({
         blocks: windowOpen ? [{}] : [],
         links: [],
      })),
      press: vi.fn(async () => {
         windowOpen = !closesOn.includes('Escape')
      }),
      clickSelector: vi.fn(async () => {
         windowOpen = !closesOn.includes('dismiss')

         return true
      }),
   }
   const overlay = createOverlay({
      hands: hands as unknown as Hands,
      reader: { wait: async () => undefined },
      spec,
   })

   return {
      hands,
      overlay,
   }
}

describe('createOverlay', () => {
   it('should click the trigger where nothing it must avoid is, and see the window open', async () => {
      const { hands, overlay } = setup()

      await overlay.open(trigger)

      expect(hands.clickInside).toHaveBeenCalledWith(trigger.box, 'button')
      expect(hands.inspect).toHaveBeenCalledWith('dialog[open]')
   })

   it('should say when the trigger could not be clicked or nothing opened', async () => {
      await expect(setup({ clicks: false }).overlay.open(trigger)).rejects.toThrow(new StepFailed('not clicked'))
      await expect(setup({ opens: false }).overlay.open(trigger)).rejects.toThrow(new StepFailed('not opened'))
   })

   it('should take the trigger covered by something as a window that is open', async () => {
      const { hands, overlay } = setup({ opens: false })

      hands.inspect.mockResolvedValue({
         blocks: [],
         links: [
            {
               ...trigger,
               covered: true,
            },
         ] as never,
      })

      await expect(overlay.isOpen(trigger)).resolves.toBe(true)
   })

   it('should close with Escape and leave the button alone', async () => {
      const { hands, overlay } = setup()

      await overlay.open(trigger)
      await overlay.close(trigger)

      expect(hands.press).toHaveBeenCalledWith('Escape')
      expect(hands.clickSelector).not.toHaveBeenCalled()
   })

   it('should press the button of the window when Escape does nothing', async () => {
      const { hands, overlay } = setup({ closesOn: ['dismiss'] })

      await overlay.open(trigger)
      await overlay.close(trigger)

      expect(hands.clickSelector).toHaveBeenCalledWith('dialog > button')
   })

   it('should say when the window will not close, and do nothing when none is open', async () => {
      const stuck = setup({ closesOn: [] })

      await stuck.overlay.open(trigger)
      await expect(stuck.overlay.close(trigger)).rejects.toThrow(new StepFailed('not closed'))

      const closed = setup()

      await closed.overlay.close(trigger)

      expect(closed.hands.press).not.toHaveBeenCalled()
   })
})
