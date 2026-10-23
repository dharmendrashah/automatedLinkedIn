import { describe, expect, it, vi } from 'vitest'

import { type ReadMessage } from '../../linkedin/messageReader'
import { keepPictures } from './keepPictures'

const message = (id: string, ...attachments: ReadMessage['attachments']): ReadMessage => ({
   id,
   sender: { name: 'Ada' },
   direction: 'THEM',
   when: '',
   text: '',
   attachments,
})

const picture = (name: string | undefined, url: string | undefined = 'https://media.licdn.com/dms/image/a') => ({
   kind: 'IMAGE' as const,
   ...(name && { name }),
   ...(url && { url }),
})

type Fetch = (url: string, maxBytes: number) => Promise<{ body: Buffer; contentType: string } | undefined>

const setup = (overrides: { has?: (key: string) => Promise<boolean>; fetchFile?: Fetch } = {}) => {
   const save = vi.fn(async () => undefined)
   const warn = vi.fn()
   const fetchFile: Fetch =
      overrides.fetchFile ??
      vi.fn(async () => ({
         body: Buffer.from('12345'),
         contentType: 'image/png',
      }))
   const kept = {
      keyOf: (messageId: string, index: number, name: string) => `kept/${messageId}/${index}-${name}`,
      has: overrides.has ?? (async () => false),
      save,
   }

   return {
      save,
      warn,
      fetchFile,
      keep: (messages: ReadMessage[], budget = { left: 10 }) =>
         keepPictures(
            messages,
            {
               kept,
               fetchFile,
               warn,
            },
            budget
         ),
   }
}

describe('keepPictures', () => {
   it('should download each picture once, keep it under its place, and hand the message back with the place and size but no address', async () => {
      const { keep, save, fetchFile } = setup()

      const [kept] = await keep([
         message('m1', picture('plan.png'), {
            kind: 'IMAGE',
            name: 'no-address.png',
         }),
      ])

      expect(fetchFile).toHaveBeenCalledTimes(1)
      expect(fetchFile).toHaveBeenCalledWith('https://media.licdn.com/dms/image/a', 20 * 1024 * 1024)
      expect(save).toHaveBeenCalledWith('kept/m1/0-plan.png', Buffer.from('12345'), 'image/png')
      expect(kept?.attachments).toEqual([
         {
            kind: 'IMAGE',
            name: 'plan.png',
            key: 'kept/m1/0-plan.png',
            bytes: 5,
         },
         {
            kind: 'IMAGE',
            name: 'no-address.png',
         },
      ])
   })

   it('should not download a picture that is already kept, and still point to it', async () => {
      const { keep, fetchFile, save } = setup({ has: async () => true })

      const [kept] = await keep([message('m1', picture('plan.png'))])

      expect(fetchFile).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(kept?.attachments).toEqual([
         {
            kind: 'IMAGE',
            name: 'plan.png',
            key: 'kept/m1/0-plan.png',
         },
      ])
   })

   it('should name a picture with no name after what it is, and give an extension to a name that has none', async () => {
      const { keep } = setup({
         fetchFile: vi.fn(async () => ({
            body: Buffer.from('1'),
            contentType: 'image/jpeg',
         })),
      })

      const [kept] = await keep([message('m1', picture(undefined), picture('Photo'))])

      expect(kept?.attachments.map(({ name }) => name)).toEqual(['Picture.jpg', 'Photo.jpg'])
      expect(kept?.attachments.map(({ key }) => key)).toEqual(['kept/m1/0-Picture', 'kept/m1/1-Photo'])
   })

   it('should keep only pictures: a page, a script or a file of another type is not kept, and neither is an empty one', async () => {
      const answers = [
         {
            body: Buffer.from('<html>'),
            contentType: 'text/html',
         },
         {
            body: Buffer.from('<svg>'),
            contentType: 'image/svg+xml',
         },
         {
            body: Buffer.alloc(0),
            contentType: 'image/png',
         },
      ]
      const { keep, save } = setup({ fetchFile: vi.fn(async () => answers.shift()) })

      const [kept] = await keep([message('m1', picture('a.png'), picture('b.png'), picture('c.png'))])

      expect(save).not.toHaveBeenCalled()
      expect(kept?.attachments).toEqual([
         {
            kind: 'IMAGE',
            name: 'a.png',
         },
         {
            kind: 'IMAGE',
            name: 'b.png',
         },
         {
            kind: 'IMAGE',
            name: 'c.png',
         },
      ])
   })

   it('should go on, and say so without the name or the address, when one picture cannot be downloaded or saved', async () => {
      const { keep, warn, save } = setup({
         fetchFile: vi
            .fn(async () => ({
               body: Buffer.from('12345'),
               contentType: 'image/png',
            }))
            .mockRejectedValueOnce(new Error('https://media.licdn.com/secret failed')),
      })

      save.mockRejectedValueOnce(new Error('bucket down'))

      const [kept] = await keep([message('m1', picture('a.png'), picture('b.png'), picture('c.png'))])

      expect(kept?.attachments.map(({ key }) => key)).toEqual([undefined, undefined, 'kept/m1/2-c.png'])
      expect(warn).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/licdn|secret|a\.png/)
   })

   it('should stop downloading when the budget of the run is used, and still hand every message back', async () => {
      const { keep, fetchFile } = setup()
      const budget = { left: 1 }

      const kept = await keep([message('m1', picture('a.png')), message('m2', picture('b.png'))], budget)

      expect(fetchFile).toHaveBeenCalledTimes(1)
      expect(budget.left).toBe(0)
      expect(kept.map(({ attachments }) => attachments[0]?.key)).toEqual(['kept/m1/0-a.png', undefined])
   })

   it('should only strip the addresses when nothing can be kept', async () => {
      const [plain] = await keepPictures([message('m1', picture('a.png'))], { warn: vi.fn() }, { left: 10 })

      expect(plain?.attachments).toEqual([
         {
            kind: 'IMAGE',
            name: 'a.png',
         },
      ])
   })
})
