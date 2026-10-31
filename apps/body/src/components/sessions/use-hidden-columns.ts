import { useState } from 'react'

// Column id to false for each column the owner hid.
export type HiddenColumns = Record<string, boolean>

const HIDDEN_KEY = 'sessions.hiddenColumns'

const readHidden = (): HiddenColumns => {
   try {
      const parsed: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}')

      return parsed && typeof parsed === 'object'
         ? Object.fromEntries(Object.entries(parsed).filter(([, shown]) => shown === false))
         : {}
   } catch {
      return {}
   }
}

// The Sessions columns the owner hid, kept in this browser.
export const useHiddenColumns = () => {
   const [hidden, setHidden] = useState<HiddenColumns>(readHidden)

   const change = (next: HiddenColumns) => {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
      setHidden(next)
   }

   return [hidden, change] as const
}
