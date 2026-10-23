import { stat, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { MAX_ATTACHMENT_BYTES } from '@automatedLinkedIn/contracts'

import { fetchUploads } from './uploads'

const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

const exists = (path: string) =>
   stat(path).then(
      () => true,
      () => false
   )

describe('fetchUploads', () => {
   it('should fetch each file from the folder of the user of the run into one folder, in order, and remove it when asked', async () => {
      const download = vi.fn(async (_key: string, path: string) => writeFile(path, 'content'))
      const { paths, remove } = await fetchUploads(download, 'user-1', UPLOAD, ['b.pdf', 'a.png'])

      expect(download.mock.calls.map(([key]) => key)).toEqual([
         `uploads/user-1/${UPLOAD}/b.pdf`,
         `uploads/user-1/${UPLOAD}/a.png`,
      ])
      expect(paths.map(path => path.split('/').at(-1))).toEqual(['b.pdf', 'a.png'])
      expect(await exists(paths[0] ?? '')).toBe(true)

      await remove()

      expect(await exists(paths[0] ?? '')).toBe(false)
   })

   it('should refuse an upload id, a list or a name that is not safe before fetching anything', async () => {
      const download = vi.fn(async () => undefined)

      await expect(fetchUploads(download, 'u', '../other', ['a.pdf'])).rejects.toThrow('upload is not valid')
      await expect(fetchUploads(download, 'u', UPLOAD, [])).rejects.toThrow('list of files')
      await expect(fetchUploads(download, 'u', UPLOAD, ['a.pdf', 'a.pdf'])).rejects.toThrow('list of files')
      await expect(
         fetchUploads(
            download,
            'u',
            UPLOAD,
            Array.from({ length: 11 }, (_, i) => `f${i}.pdf`)
         )
      ).rejects.toThrow('list of files')
      await expect(fetchUploads(download, 'u', UPLOAD, ['../../etc/passwd'])).rejects.toThrow('name is not valid')
      await expect(fetchUploads(download, 'u', UPLOAD, ['sub/a.pdf'])).rejects.toThrow('name is not valid')
      expect(download).not.toHaveBeenCalled()
   })

   it('should remove what it fetched when a file fails or is too large', async () => {
      const seen: string[] = []
      const failing = vi.fn(async (_key: string, path: string) => {
         seen.push(path)

         if (seen.length === 2) {
            throw new Error('gone')
         }

         await writeFile(path, 'x')
      })

      await expect(fetchUploads(failing, 'u', UPLOAD, ['a.pdf', 'b.pdf'])).rejects.toThrow('gone')
      expect(await exists(seen[0] ?? '')).toBe(false)

      const big = vi.fn(async (_key: string, path: string) => {
         seen.push(path)
         await writeFile(path, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))
      })

      await expect(fetchUploads(big, 'u', UPLOAD, ['big.pdf'])).rejects.toThrow('larger')
      expect(await exists(seen.at(-1) ?? '')).toBe(false)
   })
})
