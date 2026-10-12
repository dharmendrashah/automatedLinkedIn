export type Latency = {
   text: string
   speed: 'fast' | 'ok' | 'slow'
}

const FAST_UNDER_MS = 500
const OK_UNDER_MS = 1500

// One sample from the last test, so the label is a hint, not a measurement of a whole session.
export const describeLatency = (latencyMs: number | null): Latency | null => {
   if (latencyMs === null) return null

   return {
      text: `${latencyMs} ms`,
      speed: latencyMs < FAST_UNDER_MS ? 'fast' : latencyMs < OK_UNDER_MS ? 'ok' : 'slow',
   }
}
