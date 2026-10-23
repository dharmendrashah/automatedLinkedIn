import { type RefObject, useEffect, useState } from 'react'

// An address for a file chosen on this device, so a picture can be shown before it is sent; freed when it is no longer shown.
export const useObjectUrl = (file: File | undefined) => {
   const [url, setUrl] = useState<string>()

   useEffect(() => {
      if (!file) {
         return undefined
      }

      const made = URL.createObjectURL(file)

      // oxlint-disable-next-line react/set-state-in-effect -- the address is a browser resource made here and freed below, not derived data
      setUrl(made)

      return () => {
         URL.revokeObjectURL(made)
         setUrl(undefined)
      }
   }, [file])

   return url
}

// True once the element has come into view, and stays true: a picture asks for its link only when it is about to be seen.
export const useSeen = (ref: RefObject<Element | null>) => {
   const [seen, setSeen] = useState(false)

   useEffect(() => {
      const element = ref.current

      if (seen || !element) {
         return undefined
      }

      const watcher = new IntersectionObserver(entries => {
         if (entries.some(entry => entry.isIntersecting)) {
            setSeen(true)
            watcher.disconnect()
         }
      })

      watcher.observe(element)

      return () => watcher.disconnect()
   }, [ref, seen])

   return seen
}
