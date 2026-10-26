import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type DetectionSession } from '../scraping/driver'
import { RecordedDetectionSession } from './recordedDetectionSession'
import { type StepEntry } from './recorder'

const recorder = {
   addStep: vi.fn((step: Omit<StepEntry, 'n' | 't'>): StepEntry => ({
      ...step,
      n: 1,
      t: 0,
   })),
   log: vi.fn(),
   addSecret: vi.fn(),
   saveScreenshot: vi.fn(),
   saveFailureHtml: vi.fn(),
}

describe('RecordedDetectionSession', () => {
   beforeEach(() => {
      recorder.addStep.mockClear()
   })

   it('should note a click on a selector as a step, with whether it found something to click', async () => {
      const clickSelector = vi.fn(async (_selector: string) => false)
      const session = new RecordedDetectionSession({ clickSelector } as unknown as DetectionSession, recorder)

      await expect(session.clickSelector?.('div.box')).resolves.toBe(false)

      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'clickSelector',
            selector: 'div.box',
            found: false,
            ok: true,
         })
      )
   })

   it('should note a click by place with its place, and a file given to the page with how many', async () => {
      const clickNth = vi.fn(async (_selector: string, _index: number, _avoid: string) => true)
      const attachFiles = vi.fn(async (_selector: string, _paths: string[]) => true)
      const session = new RecordedDetectionSession(
         {
            clickNth,
            attachFiles,
         } as unknown as DetectionSession,
         recorder
      )

      await session.clickNth?.('dialog button', 3, '')
      await session.attachFiles?.('input[type=file]', ['/tmp/a.png', '/tmp/b.png'])

      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'clickNth',
            selector: 'dialog button',
            index: 3,
            found: true,
         })
      )
      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'attachFiles',
            count: 2,
            found: true,
         })
      )
   })

   it('should note a file chooser opened by a click as a step with its place and how many files, and offer it only when the browser can', async () => {
      const chooseFiles = vi.fn(async (_selector: string, _index: number, _paths: string[]) => true)
      const choosing = new RecordedDetectionSession({ chooseFiles } as unknown as DetectionSession, recorder)
      const plain = new RecordedDetectionSession({} as unknown as DetectionSession, recorder)

      await expect(choosing.chooseFiles?.('dialog button', 2, ['/tmp/a.pdf'])).resolves.toBe(true)

      expect(chooseFiles).toHaveBeenCalledWith('dialog button', 2, ['/tmp/a.pdf'])
      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'chooseFiles',
            selector: 'dialog button',
            index: 2,
            count: 1,
            found: true,
         })
      )
      expect(plain.chooseFiles).toBeUndefined()
   })

   it('should note typing as a step with how much was typed and never what', async () => {
      const typeKeys = vi.fn(async (_text: string) => undefined)
      const session = new RecordedDetectionSession({ typeKeys } as unknown as DetectionSession, recorder)

      await session.typeKeys?.('my secret words')

      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'typeKeys',
            length: 15,
         })
      )
      expect(JSON.stringify(recorder.addStep.mock.calls)).not.toContain('secret')
      expect(recorder.addSecret).not.toHaveBeenCalled()
   })

   it('should note a call that fails as a failed step and let the failure through', async () => {
      const clickSelector = vi.fn(async (_selector: string): Promise<boolean> => {
         throw new Error('The page is gone')
      })
      const session = new RecordedDetectionSession({ clickSelector } as unknown as DetectionSession, recorder)

      await expect(session.clickSelector?.('button')).rejects.toThrow('The page is gone')

      expect(recorder.addStep).toHaveBeenCalledWith(
         expect.objectContaining({
            call: 'clickSelector',
            ok: false,
         })
      )
   })

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

   it('should let a task hear how the page is answered when the browser can, and not offer it when the browser cannot', () => {
      const watch = {
         statuses: () => [200],
         stop: vi.fn(),
      }
      const watchAnswers = vi.fn((_method: string, _parts: string[]) => watch)
      const watching = new RecordedDetectionSession({ watchAnswers } as unknown as DetectionSession, recorder)
      const plain = new RecordedDetectionSession({} as unknown as DetectionSession, recorder)

      expect(watching.watchAnswers?.('POST', ['createMessage'])).toBe(watch)
      expect(watchAnswers).toHaveBeenCalledWith('POST', ['createMessage'])
      expect(plain.watchAnswers).toBeUndefined()
   })
})
