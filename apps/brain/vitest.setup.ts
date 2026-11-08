import { config } from 'dotenv'
import { afterEach, vi } from 'vitest'

config({ path: '.env.test' })

// Brain code logs through core/log; tests read those calls from this mock instead of console.
vi.mock('core/log', () => ({
   log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      flush: vi.fn(),
   },
}))

afterEach(() => {
   vi.clearAllMocks()
})
