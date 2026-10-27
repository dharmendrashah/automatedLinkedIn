import { useEffect, useState } from 'react'

// The time, refreshed on an interval, so "Started 8 s ago" and "Last read 12 minutes ago" keep up with the clock.
export const useNow = (everyMs: number) => {
   const [now, setNow] = useState(() => new Date())

   useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), everyMs)

      return () => clearInterval(timer)
   }, [everyMs])

   return now
}
