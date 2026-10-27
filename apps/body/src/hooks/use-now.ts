import { useEffect, useState } from 'react'

// The time, looked at again every so often, so "waiting to start" and "read 20 min ago" stay true on a page left open.
export const useNow = (everyMs: number) => {
   const [now, setNow] = useState(() => new Date())

   useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), everyMs)

      return () => clearInterval(timer)
   }, [everyMs])

   return now
}
