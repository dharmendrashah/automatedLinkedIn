import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { profileKey } from '../storage/store'
import { BucketProfiles, DiskProfiles } from './profiles'

// Real tar and real folders; the bucket is a map. Needs `tar` on the PATH, as the worker image has.

const KEY = Buffer.alloc(32, 7).toString('base64')

// Like the bucket: an object is replaced only when its upload ends without an error.
const memoryStore = () => {
   const objects = new Map<string, Buffer>()

   return {
      objects,
      readStream: (key: string) => {
         const body = objects.get(key)

         return body
            ? Readable.from([body])
            : new Readable({
                 read() {
                    this.destroy(Object.assign(new Error('No such object'), { code: 404 }))
                 },
              })
      },
      writeStream: (key: string) => {
         const parts: Buffer[] = []

         return new Writable({
            write(chunk: Buffer, _encoding, done) {
               parts.push(chunk)
               done()
            },
            final(done) {
               objects.set(key, Buffer.concat(parts))
               done()
            },
         })
      },
   }
}

let root: string

beforeAll(async () => {
   root = await mkdtemp(join(tmpdir(), 'profiles-test-'))
})

afterAll(async () => {
   await rm(root, {
      recursive: true,
      force: true,
   })
})

const fill = async (dir: string, files: Record<string, string>) => {
   for (const [path, body] of Object.entries(files)) {
      await mkdir(join(dir, path, '..'), { recursive: true })
      await writeFile(join(dir, path), body)
   }
}

describe('BucketProfiles', () => {
   it('should start an account without a profile from an empty folder', async () => {
      const profiles = new BucketProfiles(memoryStore(), KEY, { root })
      const first = await profiles.checkout('acc1')

      expect(first.restored).toBe(false)
      await expect(readdir(first.dir)).resolves.toEqual([])
      await first.release()
   })

   it('should bring back a kept profile in the next run, sealed in the bucket, without locks or crash reports', async () => {
      const store = memoryStore()
      const profiles = new BucketProfiles(store, KEY, { root })
      const first = await profiles.checkout('acc1')

      await fill(first.dir, {
         'cookies.sqlite': 'li_at=SECRET-TOKEN',
         'storage/default/site/ls/data.sqlite': 'local storage',
         'cache2/entries/ABC': 'cached page',
         lock: 'held',
         'crashes/report': 'crash',
      })
      await first.keep()
      await first.release()

      expect(store.objects.get(profileKey('acc1'))?.includes(Buffer.from('SECRET-TOKEN'))).toBe(false)

      const second = await profiles.checkout('acc1')

      expect(second.restored).toBe(true)
      await expect(readFile(join(second.dir, 'cookies.sqlite'), 'utf8')).resolves.toBe('li_at=SECRET-TOKEN')
      await expect(readFile(join(second.dir, 'storage/default/site/ls/data.sqlite'), 'utf8')).resolves.toBe(
         'local storage'
      )
      await expect(readFile(join(second.dir, 'cache2/entries/ABC'), 'utf8')).resolves.toBe('cached page')
      expect(await readdir(second.dir)).not.toEqual(expect.arrayContaining(['lock', 'crashes']))
      await second.release()
      await expect(readdir(second.dir)).rejects.toThrow()
   })

   it('should leave the cache out when the profile is too large with it, and keep nothing when still too large', async () => {
      const store = memoryStore()
      const warn = vi.fn()
      const random = (bytes: number) =>
         Buffer.from(Array.from({ length: bytes }, () => Math.floor(Math.random() * 256)))
      const profiles = new BucketProfiles(store, KEY, {
         root,
         maxBytes: 20_000,
         warn,
      })
      const first = await profiles.checkout('acc2')

      await fill(first.dir, { 'cookies.sqlite': 'small' })
      await mkdir(join(first.dir, 'cache2'), { recursive: true })
      await writeFile(join(first.dir, 'cache2/big'), random(50_000))
      await first.keep()
      await first.release()

      const second = await profiles.checkout('acc2')

      expect(await readdir(second.dir)).not.toContain('cache2')
      await expect(readFile(join(second.dir, 'cookies.sqlite'), 'utf8')).resolves.toBe('small')
      await writeFile(join(second.dir, 'cookies.sqlite'), random(50_000))
      await second.keep()

      expect(warn).toHaveBeenCalledWith('The browser profile is too large to keep, even without its cache')
      await second.release()

      const third = await profiles.checkout('acc2')

      await expect(readFile(join(third.dir, 'cookies.sqlite'), 'utf8')).resolves.toBe('small')
      await third.release()
   })

   it('should start afresh, and say so, when the kept profile was changed or sealed with another key', async () => {
      const store = memoryStore()
      const warn = vi.fn()
      const first = await new BucketProfiles(store, KEY, { root }).checkout('acc3')

      await fill(first.dir, { 'cookies.sqlite': 'x' })
      await first.keep()
      await first.release()

      const other = new BucketProfiles(store, Buffer.alloc(32, 9).toString('base64'), {
         root,
         warn,
      })
      const second = await other.checkout('acc3')

      expect(second.restored).toBe(false)
      await expect(readdir(second.dir)).resolves.toEqual([])
      expect(warn).toHaveBeenCalled()
      await second.release()
   })
})

describe('DiskProfiles', () => {
   it('should use one folder per account and find it again in the next run', async () => {
      const profiles = new DiskProfiles(join(root, 'local'))
      const first = await profiles.checkout('acc1')

      expect(first.restored).toBe(false)
      await fill(first.dir, { 'cookies.sqlite': 'x' })

      const second = await profiles.checkout('acc1')

      expect(second.dir).toBe(first.dir)
      expect(second.restored).toBe(true)
   })
})
