import { describe, expect, it, vi } from 'vitest'

import { type DetectionSession } from '../scraping/driver'
import { RecordedDetectionSession } from './recordedDetectionSession'

const recorder = {
   addStep: vi.fn(),
   log: vi.fn(),
   addSecret: vi.fn(),
   saveScreenshot: vi.fn(),
   saveFailureHtml: vi.fn(),
}

describe('RecordedDetectionSession', () => {
   it('should let a task type into the page when the browser can, and not offer it when the browser cannot', async () => {
      const typeKeys = vi.fn(async (_text: string) => undefined)
      const typing = new RecordedDetectionSession({ typeKeys } as unknown as DetectionSession, recorder)
      const plain = new RecordedDetectionSession({} as unknown as DetectionSession, recorder)

      await typing.typeKeys?.('hello')

      expect(typeKeys).toHaveBeenCalledWith('hello')
      expect(plain.typeKeys).toBeUndefined()
   })
})
