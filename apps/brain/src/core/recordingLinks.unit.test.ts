import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
   bucketName: 'my-bucket',
   getSignedUrl: vi.fn(),
   file: vi.fn(),
   bucket: vi.fn(),
}))

vi.mock('env', () => ({
   get SPIDER_GCS_BUCKET() {
      return mocks.bucketName
   },
}))

vi.mock('@google-cloud/storage', () => ({
   Storage: class {
      public bucket(name: string) {
         mocks.bucket(name)

         return { file: mocks.file }
      }
   },
}))

describe('RecordingLinks', () => {
   beforeEach(async () => {
      vi.resetAllMocks()
      vi.resetModules()
      mocks.bucketName = 'my-bucket'
      mocks.file.mockImplementation(() => ({ getSignedUrl: mocks.getSignedUrl }))
   })

   const load = async () => (await import('./recordingLinks')).RecordingLinks

   it('should be configured only when a bucket is set', async () => {
      const RecordingLinks = await load()

      expect(RecordingLinks.configured()).toBe(true)

      mocks.bucketName = ''

      expect(RecordingLinks.configured()).toBe(false)
   })

   it('should sign a read-only link to one file that lasts ten minutes', async () => {
      mocks.getSignedUrl.mockResolvedValue(['https://storage.googleapis.com/my-bucket/x?sig=1'])

      const RecordingLinks = await load()
      const before = Date.now()

      await expect(RecordingLinks.urlFor('recordings/validate/a/20261012T101500Z/video.webm')).resolves.toBe(
         'https://storage.googleapis.com/my-bucket/x?sig=1'
      )

      expect(mocks.bucket).toHaveBeenCalledWith('my-bucket')
      expect(mocks.file).toHaveBeenCalledWith('recordings/validate/a/20261012T101500Z/video.webm')

      const [[options]] = mocks.getSignedUrl.mock.calls

      expect(options).toMatchObject({
         version: 'v4',
         action: 'read',
      })
      expect(options.expires).toBeGreaterThanOrEqual(before + 10 * 60 * 1000)
      expect(options.expires).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
   })

   it('should refuse to sign anything for a path outside recordings/', async () => {
      const RecordingLinks = await load()

      await expect(RecordingLinks.urlFor('sessions/acc1/state.json')).rejects.toThrow('recordings/')
      await expect(RecordingLinks.urlFor('recordings/../sessions/acc1/state.json')).rejects.toThrow('recordings/')
      expect(mocks.getSignedUrl).not.toHaveBeenCalled()
   })

   it('should say so when there is no bucket', async () => {
      mocks.bucketName = ''

      const RecordingLinks = await load()

      await expect(RecordingLinks.urlFor('recordings/validate/a/20261012T101500Z/video.webm')).rejects.toThrow(
         'not set up'
      )
   })
})
