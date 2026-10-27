import { useCallback, useState } from 'react'

// A choice kept in this browser. Storage can be blocked or full; the choice then lasts for this visit only.
export const useStoredSetting = <T>(key: string, parse: (raw: string | null) => T, write: (value: T) => string) => {
   const [value, setValue] = useState<T>(() => {
      try {
         return parse(localStorage.getItem(key))
      } catch {
         return parse(null)
      }
   })
   const set = useCallback(
      (next: T) => {
         setValue(next)

         try {
            localStorage.setItem(key, write(next))
         } catch {
            // The choice is kept for this visit only.
         }
      },
      [key, write]
   )

   return [value, set] as const
}
