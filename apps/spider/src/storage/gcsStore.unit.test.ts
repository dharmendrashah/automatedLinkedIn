import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GcsStore } from './gcsStore'
import { ObjectNotFoundError, lockKey, resultKey, sessionKey } from './store'

const mocks = vi.hoisted(() => ({
   save: vi.fn(),
   download: vi.fn(),
   getMetadata: vi.fn(),
   remove: vi.fn(),
   file: vi.fn(),
   upload: vi.fn(),
   bucket: vi.fn(),
}))

vi.mock('@google-cloud/storage', () => ({
   Storage: class {
      public bucket(name: string) {
         mocks.bucket(name)

         return {
            file: mocks.file,
            upload: mocks.upload,
         }
      }
   },
}))

describe('GcsStore', () => {
   let fileMetadata: { generation?: string }

   beforeEach(() => {
      vi.resetAllMocks()
      fileMetadata = {}
      mocks.file.mockImplementation(() => ({
         save: mocks.save,
         download: mocks.download,
         getMetadata: mocks.getMetadata,
         delete: mocks.remove,
         get metadata() {
            return fileMetadata
         },
      }))
   })

   it('should write an object to the bucket with its content type, without a resumable upload', async () => {
      mocks.save.mockResolvedValue(undefined)

      await new GcsStore('my-bucket').put('results/demo/1.json', '{"a":1}', 'application/json')

      expect(mocks.bucket).toHaveBeenCalledWith('my-bucket')
      expect(mocks.file).toHaveBeenCalledWith('results/demo/1.json')
      expect(mocks.save).toHaveBeenCalledWith('{"a":1}', {
         contentType: 'application/json',
         resumable: false,
      })
   })

   it('should stream a local file to the bucket with its content type', async () => {
      mocks.upload.mockResolvedValue(undefined)

      await new GcsStore('my-bucket').upload('recordings/validate/a/video.webm', '/tmp/x/video.webm', 'video/webm')

      expect(mocks.upload).toHaveBeenCalledWith('/tmp/x/video.webm', {
         destination: 'recordings/validate/a/video.webm',
         contentType: 'video/webm',
         resumable: false,
      })
   })

   it('should read an object as text', async () => {
      mocks.download.mockResolvedValue([Buffer.from('hello')])

      await expect(new GcsStore('my-bucket').get('sessions/a.json')).resolves.toBe('hello')
   })

   it('should report a missing object as ObjectNotFoundError', async () => {
      mocks.download.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }))

      await expect(new GcsStore('my-bucket').get('sessions/missing.json')).rejects.toBeInstanceOf(ObjectNotFoundError)
   })

   it('should let other storage errors through so the task is retried', async () => {
      mocks.download.mockRejectedValue(Object.assign(new Error('Service unavailable'), { code: 503 }))
      mocks.save.mockRejectedValue(new Error('socket hang up'))

      const store = new GcsStore('my-bucket')

      await expect(store.get('sessions/a.json')).rejects.toThrow('Service unavailable')
      await expect(store.put('results/x.json', '{}', 'application/json')).rejects.toThrow('socket hang up')
   })

   it('should refuse to build a store without a bucket name', () => {
      expect(() => new GcsStore('')).toThrow(/SPIDER_GCS_BUCKET/)
   })

   describe('create', () => {
      it('should write only when the object does not exist and return the version it created', async () => {
         mocks.save.mockImplementation(async () => {
            fileMetadata = { generation: '1760000000000001' }
         })

         await expect(new GcsStore('my-bucket').create('locks/a.json', '{}', 'application/json')).resolves.toBe(
            '1760000000000001'
         )
         expect(mocks.save).toHaveBeenCalledWith('{}', {
            contentType: 'application/json',
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
         })
      })

      it('should answer undefined when the object already exists', async () => {
         mocks.save.mockRejectedValue(Object.assign(new Error('Precondition Failed'), { code: 412 }))

         await expect(
            new GcsStore('my-bucket').create('locks/a.json', '{}', 'application/json')
         ).resolves.toBeUndefined()
      })

      it('should let other errors through', async () => {
         mocks.save.mockRejectedValue(Object.assign(new Error('Service unavailable'), { code: 503 }))

         await expect(new GcsStore('my-bucket').create('locks/a.json', '{}', 'application/json')).rejects.toThrow(
            'Service unavailable'
         )
      })
   })

   describe('getVersioned', () => {
      it('should read the body of the generation it reports', async () => {
         mocks.getMetadata.mockResolvedValue([{ generation: '42' }])
         mocks.download.mockResolvedValue([Buffer.from('lease')])

         await expect(new GcsStore('my-bucket').getVersioned('locks/a.json')).resolves.toEqual({
            body: 'lease',
            version: '42',
         })
         expect(mocks.file).toHaveBeenLastCalledWith('locks/a.json', { generation: '42' })
      })

      it('should report a missing object as ObjectNotFoundError', async () => {
         mocks.getMetadata.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }))

         await expect(new GcsStore('my-bucket').getVersioned('locks/a.json')).rejects.toBeInstanceOf(
            ObjectNotFoundError
         )
      })
   })

   describe('delete', () => {
      it('should delete only the version it is given', async () => {
         mocks.remove.mockResolvedValue(undefined)

         await new GcsStore('my-bucket').delete('locks/a.json', '42')

         expect(mocks.remove).toHaveBeenCalledWith({ ifGenerationMatch: 42 })
      })

      it.each([404, 412])('should treat a %s as already done', async code => {
         mocks.remove.mockRejectedValue(Object.assign(new Error('gone'), { code }))

         await expect(new GcsStore('my-bucket').delete('locks/a.json', '42')).resolves.toBeUndefined()
      })

      it('should let other errors through', async () => {
         mocks.remove.mockRejectedValue(Object.assign(new Error('Service unavailable'), { code: 503 }))

         await expect(new GcsStore('my-bucket').delete('locks/a.json', '42')).rejects.toThrow('Service unavailable')
      })
   })
})

describe('keys', () => {
   it('should keep the session and the lock of an account under their own folders', () => {
      expect(sessionKey('acc1')).toBe('sessions/acc1/state.json')
      expect(lockKey('acc1')).toBe('locks/acc1.json')
   })
})

describe('resultKey', () => {
   it('should group results by task type and name them by task id', () => {
      expect(
         resultKey({
            task_type: 'demo.posts',
            task_id: 'abc',
         } as never)
      ).toBe('results/demo.posts/abc.json')
   })
})
