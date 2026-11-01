import { useState } from 'react'

// Column id to false for each column the owner hid.
export type HiddenColumns = Record<string, boolean>

const readHidden = (key: string, initial: HiddenColumns): HiddenColumns => {
   try {
      const stored = localStorage.getItem(key)

      if (stored === null) {
         return initial
      }

      const parsed: unknown = JSON.parse(stored)

      return parsed && typeof parsed === 'object'
         ? Object.fromEntries(Object.entries(parsed).filter(([, shown]) => shown === false))
         : {}
   } catch {
      return {}
   }
}

// The columns of one table the owner hid, kept in this browser under `key`; `initial` until they choose.
export const useHiddenColumns = (key: string, initial: HiddenColumns = {}) => {
   const [hidden, setHidden] = useState<HiddenColumns>(() => readHidden(key, initial))

   const change = (next: HiddenColumns) => {
      localStorage.setItem(key, JSON.stringify(next))
      setHidden(next)
   }

   return [hidden, change] as const
}
