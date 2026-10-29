import { type IncomingMessage } from 'node:http'
import { Readable, Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CdnFetchError, type RemoteFile } from './cdnFetch'
import { CdnFiles } from './cdnFiles'

const mocks = vi.hoisted(() => ({
   written: [] as Buffer[],
   bucket: vi.fn(),
   file: vi.fn(),
   createWriteStream: vi.fn(),
}))

vi.mock('env', () => ({ CDN_GCS_BUCKET: 'cdn-bucket' }))

vi.mock('@google-cloud/storage', () => ({
   Storage: class {
      public bucket = mocks.bucket
   },
}))

const remoteOf = (chunks: Buffer[], headers: Record<string, string>): RemoteFile => ({
   response: Object.assign(Readable.from(chunks), { headers }) as unknown as IncomingMessage,
   deadline: vi.fn(),
   finish: vi.fn(),
   abort: vi.fn(),
})

const url = new URL('https://media.licdn.com/dms/image/v2/abc?e=1')

describe('CdnFiles.store', () => {
   beforeEach(() => {
      vi.clearAllMocks()
      mocks.written = []
      mocks.bucket.mockReturnValue({ file: mocks.file })
      mocks.file.mockReturnValue({ createWriteStream: mocks.createWriteStream })
      mocks.createWriteStream.mockImplementation(
         () =>
            new Writable({
               write(chunk: Buffer, _encoding, done) {
                  mocks.written.push(chunk)
                  done()
               },
            })
      )
   })

   it('should stream a picture into a dated key with its type and a year of caching', async () => {
      const remote = remoteOf([Buffer.from('abc')], { 'content-type': 'image/jpeg' })

      const stored = await CdnFiles.store(url, 'h', null, async () => remote)

      expect(stored).toEqual({
         bucketUrl: expect.stringMatching(
            /^gs:\/\/cdn-bucket\/cache\/media\.licdn\.com\/jpg\/\d{4}\/\d{2}\/\d{2}\/h\.jpg$/
         ),
         contentType: 'image/jpeg',
         size: 3,
      })
      expect(Buffer.concat(mocks.written).toString()).toBe('abc')
      expect(mocks.createWriteStream).toHaveBeenCalledWith({
         resumable: false,
         contentType: 'image/jpeg',
         metadata: {
            cacheControl: 'public, max-age=31536000, immutable',
            contentDisposition: undefined,
         },
      })
      expect(remote.deadline).toHaveBeenCalledWith(60_000)
   })

   it('should keep the key a file had before', async () => {
      const stored = await CdnFiles.store(url, 'h', 'gs://old-bucket/cache/a/png/2026/01/01/h.png', async () =>
         remoteOf([Buffer.from('x')], { 'content-type': 'image/jpeg' })
      )

      expect(stored.bucketUrl).toBe('gs://old-bucket/cache/a/png/2026/01/01/h.png')
      expect(mocks.bucket).toHaveBeenCalledWith('old-bucket')
      expect(mocks.file).toHaveBeenCalledWith('cache/a/png/2026/01/01/h.png')
   })

   it('should store a page as a download', async () => {
      await CdnFiles.store(url, 'h', null, async () => remoteOf([Buffer.from('<p>')], { 'content-type': 'text/html' }))

      expect(mocks.createWriteStream).toHaveBeenCalledWith(
         expect.objectContaining({
            contentType: 'application/octet-stream',
            metadata: expect.objectContaining({ contentDisposition: 'attachment' }) as unknown,
         })
      )
   })

   it('should refuse a file that says it is too big before reading it', async () => {
      const remote = remoteOf([], {
         'content-type': 'image/png',
         'content-length': String(26 * 1024 * 1024),
      })

      await expect(CdnFiles.store(url, 'h', null, async () => remote)).rejects.toEqual(new CdnFetchError('TOO_BIG'))
      expect(remote.abort).toHaveBeenCalled()
      expect(mocks.createWriteStream).not.toHaveBeenCalled()
   })

   it('should stop a file that grows past the cap without saying its size', async () => {
      const chunk = Buffer.alloc(1024 * 1024)
      const remote = remoteOf(
         Array.from({ length: 26 }, () => chunk),
         { 'content-type': 'image/png' }
      )

      await expect(CdnFiles.store(url, 'h', null, async () => remote)).rejects.toEqual(new CdnFetchError('TOO_BIG'))
      expect(remote.abort).toHaveBeenCalled()
   })
})

describe('CdnFiles.reachable', () => {
   it('should list at most one object under cache/ in the cache bucket', async () => {
      const getFiles = vi.fn().mockResolvedValue([[]])

      mocks.bucket.mockReturnValue({ getFiles })

      await expect(CdnFiles.reachable()).resolves.toBe(true)
      expect(mocks.bucket).toHaveBeenCalledWith('cdn-bucket')
      expect(getFiles).toHaveBeenCalledWith({
         prefix: 'cache/',
         maxResults: 1,
      })
   })

   it('should fail when the bucket refuses brain', async () => {
      mocks.bucket.mockReturnValue({ getFiles: vi.fn().mockRejectedValue(new Error('denied')) })

      await expect(CdnFiles.reachable()).rejects.toThrow('denied')
   })
})
