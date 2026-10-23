import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_ATTACHMENT_BYTES } from '@automatedLinkedIn/contracts'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getFiles: vi.fn(),
   file: vi.fn(),
   signPolicy: vi.fn(),
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
         }
      }
   },
}))

const USER = 'user-1'
const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const PDF = Buffer.from('%PDF-1.7 and the rest of a document')

describe('UploadFiles', () => {
   const stored = (names: Array<[string, number]>, prefix = `uploads/${USER}/${UPLOAD}/`) =>
      names.map(([name, size]) => ({
         name: `${prefix}${name}`,
         metadata: { size: String(size) },
         download: vi.fn(async () => [PDF]),
         delete: vi.fn(async () => undefined),
      }))

   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      mocks.getFiles.mockResolvedValue([[]])
      mocks.file.mockImplementation(() => ({ generateSignedPostPolicyV4: mocks.signPolicy }))
      mocks.signPolicy.mockResolvedValue([
         {
            url: 'https://storage.googleapis.com/my-bucket/',
            fields: {
               key: 'x',
               policy: 'p',
            },
         },
      ])
   })

   const load = async () => (await import('./uploadFiles')).UploadFiles

   describe('form', () => {
      it('should sign a form for exactly one object of this user and upload, limited in size and type, and say its name', async () => {
         const form = await (await load()).form(USER, UPLOAD, 'cv.pdf', 1234)

         expect(form).toEqual({
            url: 'https://storage.googleapis.com/my-bucket/',
            fields: {
               key: 'x',
               policy: 'p',
            },
            name: 'cv.pdf',
         })
         expect(mocks.file).toHaveBeenCalledWith(`uploads/${USER}/${UPLOAD}/cv.pdf`)
         expect(mocks.signPolicy).toHaveBeenCalledWith(
            expect.objectContaining({
               fields: { 'Content-Type': 'application/octet-stream' },
               conditions: [
                  ['content-length-range', 1, MAX_ATTACHMENT_BYTES],
                  ['eq', '$Content-Type', 'application/octet-stream'],
               ],
            })
         )
         expect((mocks.signPolicy.mock.calls[0]?.[0] as { expires: number }).expires).toBeGreaterThan(Date.now())
      })

      it('should give a second file of the same name another name', async () => {
         mocks.getFiles.mockResolvedValueOnce([stored([['cv.pdf', 10]])])
         mocks.getFiles.mockResolvedValueOnce([[]])

         const form = await (await load()).form(USER, UPLOAD, 'cv.pdf', 5)

         expect(form.name).toBe('cv (2).pdf')
         expect(mocks.file).toHaveBeenCalledWith(`uploads/${USER}/${UPLOAD}/cv (2).pdf`)
      })

      it('should refuse an empty file, a file larger than a reply may carry, and sign nothing', async () => {
         const files = await load()

         const tooLarge = files.form(USER, UPLOAD, 'cv.pdf', MAX_ATTACHMENT_BYTES + 1)

         await expect(files.form(USER, UPLOAD, 'cv.pdf', 0)).rejects.toMatchObject({ status: 400 })
         await expect(tooLarge).rejects.toMatchObject({ status: 413 })
         expect(mocks.signPolicy).not.toHaveBeenCalled()
      })

      it('should refuse an eleventh file of a reply, and a user who has too many files waiting', async () => {
         const full = Array.from({ length: 10 }, (_, index): [string, number] => [`f${index}.pdf`, 1])

         mocks.getFiles.mockResolvedValueOnce([stored(full)])
         mocks.getFiles.mockResolvedValueOnce([[]])

         await expect((await load()).form(USER, UPLOAD, 'x.pdf', 5)).rejects.toMatchObject({ status: 409 })

         mocks.getFiles.mockResolvedValueOnce([[]])
         mocks.getFiles.mockResolvedValueOnce([
            stored([['big.pdf', 10 * MAX_ATTACHMENT_BYTES]], `uploads/${USER}/other/`),
         ])

         await expect((await load()).form(USER, UPLOAD, 'x.pdf', 5)).rejects.toMatchObject({ status: 429 })
         expect(mocks.signPolicy).not.toHaveBeenCalled()
      })

      it('should say files cannot be sent where there is no bucket', async () => {
         mocks.bucketName = ''

         await expect((await load()).form(USER, UPLOAD, 'cv.pdf', 5)).rejects.toMatchObject({ status: 503 })
      })
   })

   describe('verify', () => {
      it('should give the names and sizes of the files of an upload that are what their names say', async () => {
         mocks.getFiles.mockResolvedValue([
            stored([
               ['a.pdf', 5],
               ['b.pdf', 7],
            ]),
         ])

         await expect((await load()).verify(USER, UPLOAD)).resolves.toEqual([
            {
               name: 'a.pdf',
               bytes: 5,
            },
            {
               name: 'b.pdf',
               bytes: 7,
            },
         ])
      })

      it('should delete, and refuse, a file that is not what its name says it is', async () => {
         const [liar] = stored([['cv.pdf', 5]])

         liar?.download.mockResolvedValue([Buffer.from('MZ and a program of some length')])
         mocks.getFiles.mockResolvedValue([[liar]])

         await expect((await load()).verify(USER, UPLOAD)).rejects.toMatchObject({ status: 415 })
         expect(liar?.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
      })

      it('should delete, and refuse, an empty file or one larger than a reply may carry', async () => {
         const [empty] = stored([['a.pdf', 0]])
         const [big] = stored([['b.pdf', MAX_ATTACHMENT_BYTES + 1]])

         mocks.getFiles.mockResolvedValueOnce([[empty]])
         mocks.getFiles.mockResolvedValueOnce([[big]])

         const files = await load()

         await expect(files.verify(USER, UPLOAD)).rejects.toMatchObject({ status: 400 })
         await expect(files.verify(USER, UPLOAD)).rejects.toMatchObject({ status: 413 })
         expect(empty?.delete).toHaveBeenCalled()
         expect(big?.delete).toHaveBeenCalled()
      })

      it('should read only the first bytes of a file to tell its type', async () => {
         const [file] = stored([['a.pdf', 5]])

         mocks.getFiles.mockResolvedValue([[file]])

         await (await load()).verify(USER, UPLOAD)

         expect(file?.download).toHaveBeenCalledWith({
            start: 0,
            end: 15,
         })
      })
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
})
