import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (onChange: () => void) => {
   const mql = window.matchMedia(QUERY)

   mql.addEventListener('change', onChange)

   return () => mql.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches

export function useIsMobile() {
   return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
