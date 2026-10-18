import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ObjectNotFoundError } from '../storage/store'
import { LocalStore } from './localStore'

describe('LocalStore', () => {
   let root: string

   beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'local-store-'))
   })

   afterEach(async () => {
      await rm(root, {
         recursive: true,
         force: true,
      })
   })

   it('should write an object under nested folders', async () => {
      await new LocalStore(root).put('runs/a/b/result.json', '{"ok":true}')

      expect(await readFile(join(root, 'runs/a/b/result.json'), 'utf8')).toBe('{"ok":true}')
   })

   it('should copy a file for an upload', async () => {
      const source = join(root, 'source.webm')

      await writeFile(source, 'video')
      await new LocalStore(join(root, 'out')).upload('runs/video.webm', source)

      expect(await readFile(join(root, 'out/runs/video.webm'), 'utf8')).toBe('video')
   })

   it('should refuse a key that leaves the folder', async () => {
      await expect(new LocalStore(join(root, 'out')).put('../escape.txt', 'x')).rejects.toThrow(/outside/)
      await expect(new LocalStore(join(root, 'out')).put('/etc/escape.txt', 'x')).rejects.toThrow(/outside/)
   })

   it('should create an object only once and read it back, and say when there is none', async () => {
      const store = new LocalStore(root)

      await expect(store.get('identities/acc1/identity.json')).rejects.toBeInstanceOf(ObjectNotFoundError)
      await expect(store.create('identities/acc1/identity.json', 'first')).resolves.toBe('1')
      await expect(store.create('identities/acc1/identity.json', 'second')).resolves.toBeUndefined()
      await expect(store.get('identities/acc1/identity.json')).resolves.toBe('first')
   })
})
