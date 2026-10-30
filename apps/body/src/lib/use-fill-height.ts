import { type RefObject, useLayoutEffect, useState } from 'react'

// Space kept under the element: the page's bottom padding and the inset frame around it.
const BOTTOM_GAP_PX = 32
const MIN_PX = 256

// The height that makes an element reach the bottom of the screen from where it starts; kept up to date when the window
// or anything above it changes size.
export const useFillHeight = (ref: RefObject<HTMLElement | null>) => {
   const [height, setHeight] = useState<number>()

   useLayoutEffect(() => {
      const element = ref.current

      if (!element) {
         return undefined
      }

      const measure = () => {
         const top = element.getBoundingClientRect().top + window.scrollY

         setHeight(Math.max(MIN_PX, Math.floor(window.innerHeight - top - BOTTOM_GAP_PX)))
      }
      const observer = new ResizeObserver(measure)

      measure()
      observer.observe(document.body)
      window.addEventListener('resize', measure)

      return () => {
         observer.disconnect()
         window.removeEventListener('resize', measure)
      }
   }, [ref])

   return height
}
