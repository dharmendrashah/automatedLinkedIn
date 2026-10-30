// A paid read the worker does for a drawer: while it is queued or running, the drawer asks again every few seconds.

type Read = { status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' } | null | undefined

const POLL_MS = 3_000

export const isReading = (read: Read) => read?.status === 'QUEUED' || read?.status === 'RUNNING'

export const money = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

export const pollWhile = (...reads: Read[]) => (reads.some(isReading) ? POLL_MS : false)
