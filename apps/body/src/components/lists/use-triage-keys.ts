import { useEffect } from 'react'

// One-letter keys for working through people. They stay off while the owner types, or while a modal dialog, menu or
// list box is open, and with any modifier held.
const busy = (target: EventTarget | null) =>
   target instanceof HTMLElement &&
   (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      Boolean(target.closest('[aria-modal="true"],[role="menu"],[role="listbox"]')))

export const useTriageKeys = (keys: Partial<Record<string, () => void>>, enabled: boolean) => {
   useEffect(() => {
      if (!enabled) {
         return undefined
      }

      const onKey = (event: KeyboardEvent) => {
         const run = keys[event.key.toLowerCase()]

         if (!run || event.metaKey || event.ctrlKey || event.altKey || busy(event.target)) {
            return
         }

         event.preventDefault()
         run()
      }

      window.addEventListener('keydown', onKey)

      return () => window.removeEventListener('keydown', onKey)
   }, [keys, enabled])
}
