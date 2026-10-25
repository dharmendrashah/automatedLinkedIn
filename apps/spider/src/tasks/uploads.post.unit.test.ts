import { stat, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import { POST_FILES_TOTAL_BYTES } from '@automatedLinkedIn/contracts'

import { fetchPostFiles } from './uploads'

const A = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const B = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b35'

const exists = (path: string) =>
   stat(path).then(
      () => true,
      () => false
   )

describe('fetchPostFiles', () => {
   it('should fetch each file from the folder of the user of the run, in order, and remove them when asked', async () => {
      const download = vi.fn(async (_key: string, path: string) => writeFile(path, 'content'))
      const { paths, remove } = await fetchPostFiles(download, 'user-1', [
         {
            id: A,
            name: 'b.jpg',
         },
         {
            id: B,
            name: 'a.png',
         },
      ])

      expect(download.mock.calls.map(([key]) => key)).toEqual([`posts/user-1/${A}/b.jpg`, `posts/user-1/${B}/a.png`])
      expect(paths.map(path => path.split('/').at(-1))).toEqual(['b.jpg', 'a.png'])
      expect(await exists(paths[0] ?? '')).toBe(true)

      await remove()

      expect(await exists(paths[0] ?? '')).toBe(false)
   })

   it('should refuse a list, an id or a name that is not safe before fetching anything', async () => {
      const download = vi.fn(async () => undefined)
      const file = (id: string, name: string) => ({
         id,
         name,
      })

      await expect(fetchPostFiles(download, 'u', [])).rejects.toThrow('list of files')
      await expect(fetchPostFiles(download, 'u', [file(A, 'a.jpg'), file(A, 'b.jpg')])).rejects.toThrow('list of files')
      await expect(fetchPostFiles(download, 'u', [file('../x', 'a.jpg')])).rejects.toThrow('id is not valid')
      await expect(fetchPostFiles(download, 'u', [file(A, '../../etc/passwd')])).rejects.toThrow('name is not valid')
      expect(download).not.toHaveBeenCalled()
   })

   it('should remove what it fetched when a file fails, or when the files together are too large', async () => {
      const seen: string[] = []
      const failing = vi.fn(async (_key: string, path: string) => {
         seen.push(path)

         if (seen.length === 2) {
            throw new Error('gone')
         }

         await writeFile(path, 'x')
      })

      await expect(
         fetchPostFiles(failing, 'u', [
            {
               id: A,
               name: 'a.jpg',
            },
            {
               id: B,
               name: 'b.jpg',
            },
         ])
      ).rejects.toThrow('gone')
      expect(await exists(seen[0] ?? '')).toBe(false)

      const big = vi.fn(async (_key: string, path: string) => {
         seen.push(path)
         await writeFile(path, Buffer.alloc(POST_FILES_TOTAL_BYTES / 2 + 1))
      })

      await expect(
         fetchPostFiles(big, 'u', [
            {
               id: A,
               name: 'a.jpg',
            },
            {
               id: B,
               name: 'b.jpg',
            },
         ])
      ).rejects.toThrow('larger than a post')
      expect(await exists(seen.at(-1) ?? '')).toBe(false)
   })
})
