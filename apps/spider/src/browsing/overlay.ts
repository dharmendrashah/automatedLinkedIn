import { type InspectedElement } from '../scraping/driver'
import { StepFailed } from './errors'
import { type Hands } from './hands'
import { type Reader } from './reader'

export type OverlaySpec = {
   // Matches a window that is open over the page.
   open: string
   // Closes that window, for a page that ignores Escape.
   dismiss: string
   // What a click must never land on while opening it.
   avoid: string
   // The sentences of a failure, which name what the site calls the thing.
   says: {
      notClicked: string
      notOpened: string
      notClosed: string
   }
}

type Deps = {
   hands: Hands
   reader: Pick<Reader, 'wait'>
   spec: OverlaySpec
}

// How near a link's place must be to the place it was listed at to be that link again.
const SAME_PLACE_PX = 8

// A window that opens over a page when a link is clicked, without the address changing (the image of a post opens the post in
// one). It knows how to open it, tell that it opened, and close it as a person does: Escape first, then its own button.
export const createOverlay = ({ hands, reader, spec }: Deps) => {
   // Open when the page holds a window that is, or the link that was clicked has something over it now.
   const isOpen = async (trigger: InspectedElement) => {
      const { blocks, links } = await hands.inspect(spec.open)

      return (
         blocks.length > 0 ||
         links.some(
            link =>
               link.href === trigger.href &&
               Math.abs(link.box.x - trigger.box.x) <= SAME_PLACE_PX &&
               Math.abs(link.box.y - trigger.box.y) <= SAME_PLACE_PX &&
               link.covered
         )
      )
   }

   const open = async (trigger: InspectedElement) => {
      if (!(await hands.clickInside(trigger.box, spec.avoid))) {
         throw new StepFailed(spec.says.notClicked)
      }

      await reader.wait([1200, 2500])

      if (!(await isOpen(trigger))) {
         throw new StepFailed(spec.says.notOpened)
      }
   }

   const close = async (trigger: InspectedElement) => {
      for (const press of [() => hands.press('Escape'), () => hands.clickSelector(spec.dismiss)]) {
         if (!(await isOpen(trigger))) {
            return
         }

         await press()
         await reader.wait([800, 1500])
      }

      if (await isOpen(trigger)) {
         throw new StepFailed(spec.says.notClosed)
      }
   }

   return {
      isOpen,
      open,
      close,
   }
}

export type Overlay = ReturnType<typeof createOverlay>
