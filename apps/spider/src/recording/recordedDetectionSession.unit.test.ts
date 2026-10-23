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

   it('should let a task give files to the page when the browser can, and not offer it when the browser cannot', async () => {
      const attachFiles = vi.fn(async (_selector: string, _paths: string[]) => true)
      const attaching = new RecordedDetectionSession({ attachFiles } as unknown as DetectionSession, recorder)
      const plain = new RecordedDetectionSession({} as unknown as DetectionSession, recorder)

      await expect(attaching.attachFiles?.('input', ['/tmp/a.pdf'])).resolves.toBe(true)

      expect(attachFiles).toHaveBeenCalledWith('input', ['/tmp/a.pdf'])
      expect(plain.attachFiles).toBeUndefined()
   })

   it('should let a task download a file through the browser when it can, and not offer it when the browser cannot', async () => {
      const fetchFile = vi.fn(async (_url: string, _maxBytes: number) => ({
         body: Buffer.from('x'),
         contentType: 'image/png',
      }))
      const fetching = new RecordedDetectionSession({ fetchFile } as unknown as DetectionSession, recorder)
      const plain = new RecordedDetectionSession({} as unknown as DetectionSession, recorder)

      const fetched = await fetching.fetchFile?.('https://media.licdn.com/a', 10)

      expect(fetched?.contentType).toBe('image/png')
      expect(fetchFile).toHaveBeenCalledWith('https://media.licdn.com/a', 10)
      expect(plain.fetchFile).toBeUndefined()
   })
})
