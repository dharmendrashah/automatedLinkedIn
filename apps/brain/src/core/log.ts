import { createLogger } from '@automatedLinkedIn/logger'

// The brain's one logger: every event is written through it so it carries the correlation ID of its request or job.
export const log = createLogger({ service: 'brain' })
