import { useState } from 'react'

// Column id to false for each column the owner hid.
export type HiddenColumns = Record<string, boolean>

const readHidden = (key: string): HiddenColumns => {
   try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')

      return parsed && typeof parsed === 'object'
         ? Object.fromEntries(Object.entries(parsed).filter(([, shown]) => shown === false))
         : {}
   } catch {
      return {}
   }
}

// The columns of one table the owner hid, kept in this browser under `key`.
export const useHiddenColumns = (key: string) => {
   const [hidden, setHidden] = useState<HiddenColumns>(() => readHidden(key))

   const change = (next: HiddenColumns) => {
      localStorage.setItem(key, JSON.stringify(next))
      setHidden(next)
   }

   return [hidden, change] as const
}
