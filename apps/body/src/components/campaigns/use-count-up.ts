import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from './campaign-insights'

const DEFAULT_DURATION_MS = 600

// The value between `from` and `to` after `progress` (0 to 1) of the animation.
export const countUpValue = (from: number, to: number, progress: number) =>
   Math.round(from + (to - from) * Math.min(1, Math.max(0, progress)))

// Counts from the last shown value to `target`. Reduced motion, or a target that is not a finite number, shows it at once.
export const useCountUp = (target: number, durationMs = DEFAULT_DURATION_MS) => {
   const [shown, setShown] = useState(target)
   const shownRef = useRef(target)
   const instant = !Number.isFinite(target) || prefersReducedMotion()

   useEffect(() => {
      if (instant) {
         shownRef.current = target
         return
      }
      const from = shownRef.current
      const start = performance.now()
      let frame = 0
      const tick = (now: number) => {
         const progress = (now - start) / durationMs
         shownRef.current = countUpValue(from, target, progress)
         setShown(shownRef.current)
         if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(frame)
   }, [target, durationMs, instant])

   return instant ? target : shown
}
