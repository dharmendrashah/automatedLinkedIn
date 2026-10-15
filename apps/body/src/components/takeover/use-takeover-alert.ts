import { useEffect, useRef, useSyncExternalStore } from 'react'

import { type AlertSettings, getSettings, installUnlock, startAlert, subscribe } from './alert'

export const useAlertSettings = (): AlertSettings => useSyncExternalStore(subscribe, getSettings)

// Alerts while runs wait that the owner has not looked at yet, and unlocks the sound from the first touch of the page.
export const useTakeoverAlert = (waiting: string[], onOpen: () => void) => {
   const latest = useRef(onOpen)
   const key = waiting.join(',')

   useEffect(() => {
      latest.current = onOpen
   })

   useEffect(() => installUnlock(), [])

   useEffect(() => (key === '' ? undefined : startAlert(() => latest.current())), [key])
}
