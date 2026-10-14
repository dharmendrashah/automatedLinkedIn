import { useEffect, useState } from 'react'

import { secondsUntilNextCode, totpCode } from './totp-code'

// The code for a revealed two-step key, recomputed only when the 30 second window actually rolls over, with the
// seconds left in the current window for a countdown. `secret` is held only in memory by the caller; this hook
// never fetches or caches it.
export const useRotatingCode = (secret: string | undefined) => {
   const [code, setCode] = useState<string>()
   const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilNextCode(Date.now()))

   useEffect(() => {
      if (!secret) return

      let cancelled = false

      const tick = () => {
         setSecondsLeft(secondsUntilNextCode(Date.now()))
      }

      const refresh = () => {
         totpCode(secret, Date.now())
            .then(value => {
               if (!cancelled) setCode(value)
            })
            .catch(() => {
               if (!cancelled) setCode(undefined)
            })
      }

      refresh()
      tick()

      const interval = setInterval(() => {
         tick()

         // Only the first second of a new window needs a fresh code.
         if (secondsUntilNextCode(Date.now()) === 30) refresh()
      }, 1000)

      return () => {
         cancelled = true
         clearInterval(interval)
      }
   }, [secret])

   // Derived rather than reset by the effect: a hidden key has no code to show, whatever was last computed.
   return {
      code: secret ? code : undefined,
      secondsLeft,
   }
}
