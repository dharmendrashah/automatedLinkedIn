import { createIdGate, createLogger, withCorrelation } from '@automatedLinkedIn/logger'

const log = createLogger({ service: 'brain' })
const resolveId = createIdGate(log)

// Runs the rest of the request inside its correlation ID, so every log line of the request carries it.
export const inCorrelation = (incoming: string | undefined, source: string, next: () => void): void => {
   withCorrelation(resolveId(incoming, source), next)
}
