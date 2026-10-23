import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getFiles: vi.fn(),
   deleteFiles: vi.fn(),
   file: vi.fn(),
   move: vi.fn(),
   getSignedUrl: vi.fn(),
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
const ACCOUNT = 'account-1'
const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

describe('KeptFiles', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      mocks.file.mockImplementation((name: string) => ({
         name,
         move: mocks.move,
         getSignedUrl: mocks.getSignedUrl,
      }))
      mocks.move.mockResolvedValue(undefined)
      mocks.getSignedUrl.mockResolvedValue(['https://signed.example/file'])
   })

   const load = async () => (await import('./keptFiles')).KeptFiles

   it('should move every file of an upload to the permanent place of the account, keeping the names, and delete none', async () => {
      mocks.getFiles.mockResolvedValue([
         [{ name: `uploads/${USER}/${UPLOAD}/cv.pdf` }, { name: `uploads/${USER}/${UPLOAD}/photo.png` }],
      ])

      await expect((await load()).moveUpload(USER, ACCOUNT, UPLOAD)).resolves.toBe(2)

      expect(mocks.getFiles).toHaveBeenCalledWith({ prefix: `uploads/${USER}/${UPLOAD}/` })
      expect(mocks.file).toHaveBeenCalledWith(`uploads/${USER}/${UPLOAD}/cv.pdf`)
      expect(mocks.move.mock.calls).toEqual([
         [`kept/${USER}/${ACCOUNT}/sent/${UPLOAD}/cv.pdf`],
         [`kept/${USER}/${ACCOUNT}/sent/${UPLOAD}/photo.png`],
      ])
      expect(mocks.deleteFiles).not.toHaveBeenCalled()
   })

   it('should sign a read link for a file under the folder of the owner, as a download unless it is a picture', async () => {
      const files = await load()

      await expect(files.link(USER, `kept/${USER}/${ACCOUNT}/sent/${UPLOAD}/cv.pdf`, 'cv.pdf')).resolves.toBe(
         'https://signed.example/file'
      )
      expect(mocks.getSignedUrl).toHaveBeenLastCalledWith(
         expect.objectContaining({
            version: 'v4',
            action: 'read',
            responseType: 'application/octet-stream',
            responseDisposition: "attachment; filename*=UTF-8''cv.pdf",
         })
      )

      await files.link(USER, `kept/${USER}/${ACCOUNT}/sent/${UPLOAD}/photo.png`, 'my photo.png')

      expect(mocks.getSignedUrl).toHaveBeenLastCalledWith(
         expect.objectContaining({
            responseType: 'image/png',
            responseDisposition: "inline; filename*=UTF-8''my%20photo.png",
         })
      )
   })

   it('should refuse to sign a link for a file of someone else, outside kept/, or with a way out of its folder', async () => {
      const files = await load()

      await expect(files.link(USER, `kept/other/${ACCOUNT}/sent/x/cv.pdf`, 'cv.pdf')).rejects.toThrow(/own files/)
      await expect(files.link(USER, `uploads/${USER}/${UPLOAD}/cv.pdf`, 'cv.pdf')).rejects.toThrow(/own files/)
      await expect(files.link(USER, `kept/${USER}/../other/cv.pdf`, 'cv.pdf')).rejects.toThrow(/own files/)
      expect(mocks.getSignedUrl).not.toHaveBeenCalled()
   })

   it('should delete the files of one account and only its folder, and do nothing where there is no bucket', async () => {
      mocks.deleteFiles.mockResolvedValue(undefined)

      await (await load()).removeAccount(USER, ACCOUNT)

      expect(mocks.deleteFiles).toHaveBeenCalledWith({ prefix: `kept/${USER}/${ACCOUNT}/` })

      vi.resetModules()
      mocks.deleteFiles.mockClear()
      mocks.bucketName = ''

      await expect((await load()).removeAccount(USER, ACCOUNT)).resolves.toBeUndefined()
      expect(mocks.deleteFiles).not.toHaveBeenCalled()
   })
})
