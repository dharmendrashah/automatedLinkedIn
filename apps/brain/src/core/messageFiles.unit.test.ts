import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getMetadata: vi.fn(),
   download: vi.fn(),
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
         return { file: mocks.file }
      }
   },
}))

describe('MessageFiles.read', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      mocks.file.mockImplementation(() => ({
         getMetadata: mocks.getMetadata,
         download: mocks.download,
      }))
   })

   const load = async () => (await import('./messageFiles')).MessageFiles

   it('should read the text of a file of a task run', async () => {
      mocks.getMetadata.mockResolvedValue([{ size: '12' }])
      mocks.download.mockResolvedValue([Buffer.from('{"a":1}')])

      const MessageFiles = await load()

      await expect(MessageFiles.read('runs/linkedin-messages/u/2026/10/22/t/files/messages.json')).resolves.toBe(
         '{"a":1}'
      )
      expect(mocks.file).toHaveBeenCalledWith('runs/linkedin-messages/u/2026/10/22/t/files/messages.json')
   })

   it('should refuse a path outside runs/, with a parent step, or when no bucket is set, without asking the bucket', async () => {
      const MessageFiles = await load()

      await expect(MessageFiles.read('recordings/x/messages.json')).rejects.toThrow('runs/')
      await expect(MessageFiles.read('runs/../secrets.json')).rejects.toThrow('runs/')

      mocks.bucketName = ''

      await expect(MessageFiles.read('runs/a/messages.json')).rejects.toThrow('not set up')
      expect(mocks.file).not.toHaveBeenCalled()
   })

   it('should refuse a file over the size limit before it is downloaded', async () => {
      mocks.getMetadata.mockResolvedValue([{ size: String(5 * 1024 * 1024) }])

      const MessageFiles = await load()

      await expect(MessageFiles.read('runs/a/messages.json')).rejects.toThrow('too large')
      expect(mocks.download).not.toHaveBeenCalled()
   })
})
