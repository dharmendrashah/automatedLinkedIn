import { useEffect, useState } from 'react'

// The value once it has stopped changing for `ms`, so a picker asks the server once per pause in typing, not per key.
export const useDebounced = <T,>(value: T, ms = 250) => {
   const [settled, setSettled] = useState(value)

   useEffect(() => {
      const timer = setTimeout(() => setSettled(value), ms)

      return () => clearTimeout(timer)
   }, [value, ms])

   return settled
}
