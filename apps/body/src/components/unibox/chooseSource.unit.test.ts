import { describe, expect, it, vi } from 'vitest'

import { withDevFile } from './chooseSource'
import { type UniboxSource } from './source'

const source = (name: string): UniboxSource => ({
   load: vi.fn(async () => ({
      accounts: [],
      conversations: [],
      sample: name === 'file',
      canSend: true,
      canStart: name === 'file',
      canRefresh: name === 'real',
   })),
   mark: vi.fn(async () => undefined),
   open: vi.fn(async () => undefined),
   refresh: vi.fn(async () => ({ started: 0, skipped: [] })),
   send: vi.fn(async () => ({ ok: true as const })),
   recipients: vi.fn(async () => ({ people: [], total: 0 })),
   recipient: vi.fn(async () => null),
   start: vi.fn(async () => ({ ok: true as const, conversationId: 'c9' })),
})

describe('withDevFile', () => {
   it('should show the file when there is one, and send everything after to the source that showed it', async () => {
      const file = source('file')
      const real = source('real')
      const chosen = withDevFile(file, real, async () => true)

      await expect(chosen.load()).resolves.toMatchObject({ sample: true })
      await chosen.mark(['c1'], { unread: false })
      await chosen.open('c1')

      expect(file.mark).toHaveBeenCalledWith(['c1'], { unread: false })
      expect(file.open).toHaveBeenCalledWith('c1')
      expect(real.load).not.toHaveBeenCalled()
      expect(real.mark).not.toHaveBeenCalled()
   })

   it('should show the real messages when there is no file, or the check fails', async () => {
      const real = source('real')

      await expect(withDevFile(source('file'), real, async () => false).load()).resolves.toMatchObject({
         sample: false,
      })
      await expect(
         withDevFile(source('file'), real, async () => {
            throw new Error('no network')
         }).load()
      ).resolves.toMatchObject({ sample: false })

      const chosen = withDevFile(source('file'), real, async () => false)

      await chosen.load()
      await chosen.refresh(['a1'])
      await chosen.send({} as never, 'Hi', [], 'c1')

      expect(real.refresh).toHaveBeenCalledWith(['a1'])
      expect(real.send).toHaveBeenCalled()
   })

   it('should send a first message and the search for a person to the source that showed the data, and refuse when it cannot', async () => {
      const file = source('file')
      const chosen = withDevFile(file, source('real'), async () => true)

      await chosen.load()
      await chosen.recipients?.({ query: 'gra' })
      await chosen.recipient?.('a1', 'grace')

      await expect(chosen.start?.({} as never, 'grace', 'Hi')).resolves.toEqual({ ok: true, conversationId: 'c9' })
      expect(file.recipients).toHaveBeenCalledWith({ query: 'gra' })
      expect(file.recipient).toHaveBeenCalledWith('a1', 'grace')

      const bare: UniboxSource = { ...source('real'), recipients: undefined, recipient: undefined, start: undefined }
      const plain = withDevFile(source('file'), bare, async () => false)

      await plain.load()

      await expect(plain.recipients?.({ query: '' })).resolves.toEqual({ people: [], total: 0 })
      await expect(plain.recipient?.('a1', 'grace')).resolves.toBeNull()
      await expect(plain.start?.({} as never, 'grace', 'Hi')).resolves.toMatchObject({ ok: false })
   })
})
