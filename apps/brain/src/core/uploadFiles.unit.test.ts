import { Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_ATTACHMENT_BYTES } from '@automatedLinkedIn/contracts'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getFiles: vi.fn(),
   deleteFiles: vi.fn(),
   remove: vi.fn(),
   file: vi.fn(),
}))

vi.mock('env', () => ({
   get SPIDER_GCS_BUCKET() {
      return mocks.bucketName
   },
}))

vi.mock('@google-cloud/storage', () => ({
   Storage: class {
      public bucket() {
         return {
            file: mocks.file,
            getFiles: mocks.getFiles,
            deleteFiles: mocks.deleteFiles,
         }
      }
   },
}))

const USER = 'user-1'
const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const PDF = Buffer.from('%PDF-1.7 and the rest of a document')

async function* body(...chunks: Buffer[]) {
   for (const chunk of chunks) {
      yield chunk
   }
}

describe('UploadFiles', () => {
   let written: Buffer[]
   let created: string[]

   const stored = (names: Array<[string, number]>, prefix = `uploads/${USER}/${UPLOAD}/`) =>
      names.map(([name, size]) => ({
         name: `${prefix}${name}`,
         metadata: { size: String(size) },
      }))

   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      written = []
      created = []
      mocks.getFiles.mockResolvedValue([[]])
      mocks.file.mockImplementation((path: string) => {
         created.push(path)

         return {
            createWriteStream: () =>
               new Writable({
                  write(chunk: Buffer, _encoding, done) {
                     written.push(chunk)
                     done()
                  },
               }),
            delete: mocks.remove,
         }
      })
      mocks.remove.mockResolvedValue(undefined)
   })

   const load = async () => (await import('./uploadFiles')).UploadFiles

   it('should store a file under the folder of the user and the upload, and say its name and size', async () => {
      const files = await load()

      await expect(files.save(USER, UPLOAD, 'cv.pdf', body(PDF.subarray(0, 8), PDF.subarray(8)))).resolves.toEqual({
         name: 'cv.pdf',
         bytes: PDF.length,
      })

      expect(created).toEqual([`uploads/${USER}/${UPLOAD}/cv.pdf`])
      expect(Buffer.concat(written).equals(PDF)).toBe(true)
   })

   it('should give a second file of the same name another name', async () => {
      mocks.getFiles.mockResolvedValueOnce([stored([['cv.pdf', 10]])])
      mocks.getFiles.mockResolvedValueOnce([[]])

      const saved = await (await load()).save(USER, UPLOAD, 'cv.pdf', body(PDF))

      expect(saved.name).toBe('cv (2).pdf')
      expect(created).toEqual([`uploads/${USER}/${UPLOAD}/cv (2).pdf`])
   })

   it('should take a file shorter than the bytes it looks at, such as a short note', async () => {
      const saved = await (await load()).save(USER, UPLOAD, 'note.txt', body(Buffer.from('hi')))

      expect(saved.bytes).toBe(2)
      expect(Buffer.concat(written).toString()).toBe('hi')
   })

   it('should refuse, and leave nothing, a file that is not what its name says', async () => {
      const files = await load()

      await expect(
         files.save(USER, UPLOAD, 'cv.pdf', body(Buffer.from('MZ and a program of some length')))
      ).rejects.toMatchObject({ status: 415 })
      expect(written).toEqual([])
      expect(mocks.remove).toHaveBeenCalled()
   })

   it('should refuse an empty file', async () => {
      await expect((await load()).save(USER, UPLOAD, 'cv.pdf', body())).rejects.toMatchObject({ status: 400 })
   })

   it('should stop reading a file that grows past the limit, and delete what it began', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(MAX_ATTACHMENT_BYTES)])

      await expect((await load()).save(USER, UPLOAD, 'cv.pdf', body(big))).rejects.toMatchObject({ status: 413 })
      expect(mocks.remove).toHaveBeenCalledWith({ ignoreNotFound: true })
   })

   it('should refuse an eleventh file of a reply, and a user who has too many files waiting', async () => {
      const full = Array.from({ length: 10 }, (_, index): [string, number] => [`f${index}.pdf`, 1])

      mocks.getFiles.mockResolvedValueOnce([stored(full)])
      mocks.getFiles.mockResolvedValueOnce([[]])

      await expect((await load()).save(USER, UPLOAD, 'x.pdf', body(PDF))).rejects.toMatchObject({ status: 409 })

      mocks.getFiles.mockResolvedValueOnce([[]])
      mocks.getFiles.mockResolvedValueOnce([stored([['big.pdf', 10 * MAX_ATTACHMENT_BYTES]], `uploads/${USER}/other/`)])

      await expect((await load()).save(USER, UPLOAD, 'x.pdf', body(PDF))).rejects.toMatchObject({ status: 429 })
      expect(created).toEqual([])
   })

   it('should list the files of an upload by their names and sizes', async () => {
      mocks.getFiles.mockResolvedValue([
         stored([
            ['a.pdf', 5],
            ['b.png', 7],
         ]),
      ])

      await expect((await load()).list(USER, UPLOAD)).resolves.toEqual([
         {
            name: 'a.pdf',
            bytes: 5,
         },
         {
            name: 'b.png',
            bytes: 7,
         },
      ])
   })

   it('should say files cannot be sent where there is no bucket', async () => {
      mocks.bucketName = ''

      await expect((await load()).list(USER, UPLOAD)).rejects.toMatchObject({ status: 503 })
   })
})
