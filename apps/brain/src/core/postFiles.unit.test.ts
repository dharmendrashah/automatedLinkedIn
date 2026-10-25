import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getFiles: vi.fn(),
   file: vi.fn(),
   signPolicy: vi.fn(),
   getSignedUrl: vi.fn(),
   exists: vi.fn(),
   getMetadata: vi.fn(),
   download: vi.fn(),
   move: vi.fn(),
   remove: vi.fn(),
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
const FILE = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'
const PDF = Buffer.from('%PDF-1.7 and the rest of a document')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('PostFiles', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      mocks.getFiles.mockResolvedValue([[]])
      mocks.file.mockImplementation((name: string) => ({
         name,
         generateSignedPostPolicyV4: mocks.signPolicy,
         getSignedUrl: mocks.getSignedUrl,
         exists: () => mocks.exists(name),
         getMetadata: () => mocks.getMetadata(name),
         download: mocks.download,
         move: mocks.move,
         delete: () => mocks.remove(name),
      }))
      mocks.signPolicy.mockResolvedValue([
         {
            url: 'https://storage.googleapis.com/my-bucket/',
            fields: {
               key: 'x',
               policy: 'p',
            },
         },
      ])
      mocks.getSignedUrl.mockResolvedValue(['https://signed.example/file'])
      mocks.move.mockResolvedValue(undefined)
      mocks.remove.mockResolvedValue(undefined)
   })

   const load = async () => (await import('./postFiles')).PostFiles

   describe('form', () => {
      it('should sign a form for one temporary object of this owner, limited to the size of its kind, and say its name and kind', async () => {
         const form = await (await load()).form(USER, FILE, 'Slides.PDF', 1234)

         expect(form).toEqual({
            url: 'https://storage.googleapis.com/my-bucket/',
            fields: {
               key: 'x',
               policy: 'p',
            },
            name: 'Slides.pdf',
            kind: 'DOCUMENT',
         })
         expect(mocks.file).toHaveBeenCalledWith(`post-uploads/${USER}/${FILE}/Slides.pdf`)
         expect(mocks.signPolicy).toHaveBeenCalledWith(
            expect.objectContaining({
               fields: { 'Content-Type': 'application/octet-stream' },
               conditions: [
                  ['content-length-range', 1, 20 * 1024 * 1024],
                  ['eq', '$Content-Type', 'application/octet-stream'],
               ],
            })
         )
      })

      it('should make the name safe, and refuse a type that is not a photo, a video or a document', async () => {
         const files = await load()

         await expect(files.form(USER, FILE, '../../My photo.jpg', 10)).resolves.toMatchObject({
            name: 'My photo.jpg',
            kind: 'PHOTOS',
         })
         await expect(files.form(USER, FILE, 'setup.exe', 10)).rejects.toMatchObject({ status: 415 })
         await expect(files.form(USER, FILE, 'noextension', 10)).rejects.toMatchObject({ status: 415 })
      })

      it('should refuse an empty file and one larger than its kind, and sign nothing', async () => {
         const files = await load()

         await expect(files.form(USER, FILE, 'a.jpg', 0)).rejects.toMatchObject({ status: 400 })
         await expect(files.form(USER, FILE, 'a.jpg', 8 * 1024 * 1024 + 1)).rejects.toMatchObject({ status: 413 })
         expect(mocks.signPolicy).not.toHaveBeenCalled()
      })

      it('should refuse an owner who already holds 2 GB, counting both folders', async () => {
         mocks.getFiles.mockResolvedValueOnce([[{ metadata: { size: String(1024 * 1024 * 1024) } }]])
         mocks.getFiles.mockResolvedValueOnce([[{ metadata: { size: String(1024 * 1024 * 1024) } }]])

         await expect((await load()).form(USER, FILE, 'a.jpg', 10)).rejects.toMatchObject({ status: 429 })
         expect(mocks.getFiles).toHaveBeenCalledWith({ prefix: `posts/${USER}/` })
         expect(mocks.getFiles).toHaveBeenCalledWith({ prefix: `post-uploads/${USER}/` })
      })

      it('should say plainly when no bucket is set up', async () => {
         mocks.bucketName = ''

         await expect((await load()).form(USER, FILE, 'a.jpg', 10)).rejects.toMatchObject({ status: 503 })
      })
   })

   describe('confirm', () => {
      it('should check an uploaded file, move it to the permanent place and answer with its key', async () => {
         mocks.exists.mockResolvedValue([true])
         mocks.getMetadata.mockResolvedValue([{ size: '2048' }])
         mocks.download.mockResolvedValue([JPEG])

         await expect((await load()).confirm(USER, FILE, 'a.jpg')).resolves.toEqual({
            key: `posts/${USER}/${FILE}/a.jpg`,
            name: 'a.jpg',
            bytes: 2048,
         })
         expect(mocks.move).toHaveBeenCalledWith(expect.objectContaining({ name: `posts/${USER}/${FILE}/a.jpg` }))
      })

      it('should delete a file that is not what its name says, and say so', async () => {
         mocks.exists.mockResolvedValue([true])
         mocks.getMetadata.mockResolvedValue([{ size: '100' }])
         mocks.download.mockResolvedValue([PDF])

         await expect((await load()).confirm(USER, FILE, 'a.jpg')).rejects.toMatchObject({ status: 415 })
         expect(mocks.remove).toHaveBeenCalledWith(`post-uploads/${USER}/${FILE}/a.jpg`)
         expect(mocks.move).not.toHaveBeenCalled()
      })

      it('should delete a file over the size of its kind', async () => {
         mocks.exists.mockResolvedValue([true])
         mocks.getMetadata.mockResolvedValue([{ size: String(9 * 1024 * 1024) }])

         await expect((await load()).confirm(USER, FILE, 'a.jpg')).rejects.toMatchObject({ status: 413 })
         expect(mocks.remove).toHaveBeenCalled()
      })

      it('should answer the same key again for a file that was already confirmed', async () => {
         mocks.exists.mockImplementation(async (name: string) => [name.startsWith('posts/')])
         mocks.getMetadata.mockResolvedValue([{ size: '2048' }])

         await expect((await load()).confirm(USER, FILE, 'a.jpg')).resolves.toMatchObject({
            key: `posts/${USER}/${FILE}/a.jpg`,
            bytes: 2048,
         })
         expect(mocks.move).not.toHaveBeenCalled()
      })

      it('should say the file was not found when neither place has it', async () => {
         mocks.exists.mockResolvedValue([false])

         await expect((await load()).confirm(USER, FILE, 'a.jpg')).rejects.toMatchObject({ status: 404 })
      })
   })

   describe('link', () => {
      it('should sign a read link for a file under the folder of the owner, a picture inline', async () => {
         const files = await load()

         await expect(files.link(USER, `posts/${USER}/${FILE}/a.jpg`, 'a.jpg')).resolves.toBe(
            'https://signed.example/file'
         )
         expect(mocks.getSignedUrl).toHaveBeenLastCalledWith(
            expect.objectContaining({
               action: 'read',
               responseType: 'image/jpeg',
            })
         )
      })

      it('should refuse a key of another owner, outside posts/ or with a way up', async () => {
         const files = await load()

         await expect(files.link(USER, `posts/other/${FILE}/a.jpg`, 'a.jpg')).rejects.toMatchObject({ status: 403 })
         await expect(files.link(USER, `kept/${USER}/a/b.jpg`, 'b.jpg')).rejects.toMatchObject({ status: 403 })
         await expect(files.link(USER, `posts/${USER}/../other/a.jpg`, 'a.jpg')).rejects.toMatchObject({ status: 403 })
         expect(mocks.getSignedUrl).not.toHaveBeenCalled()
      })
   })

   describe('remove', () => {
      it('should delete each key, keep going when one fails, and say how many failed', async () => {
         mocks.remove.mockRejectedValueOnce(new Error('denied'))

         const failed = await (await load()).remove([`posts/${USER}/a/x.jpg`, `posts/${USER}/b/y.jpg`])

         expect(failed).toBe(1)
         expect(mocks.remove).toHaveBeenCalledTimes(2)
      })

      it('should do nothing without a bucket or without keys', async () => {
         const files = await load()

         await expect(files.remove([])).resolves.toBe(0)

         mocks.bucketName = ''

         await expect(files.remove([`posts/${USER}/a/x.jpg`])).resolves.toBe(0)
         expect(mocks.remove).not.toHaveBeenCalled()
      })
   })
})
